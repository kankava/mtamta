package tiles

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

// blankSentinel is cached in Redis for tiles detected as blank,
// so subsequent requests return a transparent tile without hitting upstream.
var blankSentinel = []byte("__blank__")

// transparentPNG is a minimal 1x1 transparent PNG (67 bytes).
// Returned for blank tiles so Mapbox GL can decode a valid image
// and the base layer shows through.
var transparentPNG = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, // RGBA, 8-bit
	0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
	0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe5, // compressed data
	0x27, 0xde, 0xfc,
	0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
	0xae, 0x42, 0x60, 0x82,
}

// Handler serves proxied tile requests.
type Handler struct {
	providers  map[string]*Provider
	redis      *redis.Client
	httpClient *http.Client
	limiters   map[string]*RateLimiter
}

const defaultRateLimit = 500

// NewHandler creates a tile proxy handler.
func NewHandler(providers map[string]*Provider, redisClient *redis.Client) *Handler {
	limiters := make(map[string]*RateLimiter, len(providers))
	for id, p := range providers {
		limit := defaultRateLimit
		if p.RateLimit > 0 {
			limit = p.RateLimit
		}
		limiters[id] = NewRateLimiter(limit)
	}
	return &Handler{
		providers: providers,
		redis:     redisClient,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		limiters: limiters,
	}
}

// ServeTile handles GET /api/v1/tiles/{provider}/{z}/{x}/{y}
func (h *Handler) ServeTile(w http.ResponseWriter, r *http.Request) {
	providerID := chi.URLParam(r, "provider")
	provider, ok := h.providers[providerID]
	if !ok {
		http.Error(w, "unknown tile provider", http.StatusNotFound)
		return
	}

	z, x, y, err := parseTileCoords(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	cacheKey := fmt.Sprintf("%s:%d:%d:%d", provider.CachePrefix, z, x, y)

	// Check Redis cache
	cached, err := h.redis.Get(ctx, cacheKey).Bytes()
	if err == nil {
		// Blank sentinel — upstream had no data for this tile
		if bytes.Equal(cached, blankSentinel) {
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Cache-Control", "public, max-age=86400")
			w.Header().Set("X-Cache", "HIT")
			w.Write(transparentPNG) //nolint:errcheck
			return
		}
		w.Header().Set("Content-Type", detectContentType(cached))
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("X-Cache", "HIT")
		w.Write(cached) //nolint:errcheck
		return
	}

	// Rate limit upstream fetches (per-provider)
	if limiter, ok := h.limiters[providerID]; ok && !limiter.Allow() {
		http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
		return
	}

	// Fetch from upstream — format order depends on provider
	var upstreamURL string
	if provider.FormatOrder == "zyx" {
		upstreamURL = fmt.Sprintf(provider.UpstreamURL, z, y, x)
	} else {
		upstreamURL = fmt.Sprintf(provider.UpstreamURL, z, x, y)
	}
	data, contentType, err := h.fetchUpstream(ctx, upstreamURL, provider.Headers)
	if err != nil {
		slog.Error("tile fetch failed", "provider", providerID, "error", err)
		http.Error(w, "upstream fetch failed", http.StatusBadGateway)
		return
	}

	// Detect blank tiles — small responses from providers that pad empty
	// areas with uniform-color JPEGs. Return a 1x1 transparent PNG so
	// Mapbox GL can decode a valid image and the base layer shows through.
	// Cache a sentinel so we don't re-fetch.
	if provider.BlankThreshold > 0 && len(data) <= provider.BlankThreshold {
		if err := h.redis.Set(ctx, cacheKey, blankSentinel, provider.CacheTTL).Err(); err != nil {
			slog.Warn("tile cache set failed", "key", cacheKey, "error", err)
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("X-Cache", "MISS")
		w.Write(transparentPNG) //nolint:errcheck
		return
	}

	// Cache in Redis
	if err := h.redis.Set(ctx, cacheKey, data, provider.CacheTTL).Err(); err != nil {
		slog.Warn("tile cache set failed", "key", cacheKey, "error", err)
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("X-Cache", "MISS")
	w.Write(data) //nolint:errcheck
}

func (h *Handler) fetchUpstream(ctx context.Context, url string, headers map[string]string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("upstream returned %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}

	return data, contentType, nil
}

// detectContentType sniffs the image format from the first bytes.
// Used for cache hits where the original Content-Type wasn't stored.
func detectContentType(data []byte) string {
	if len(data) >= 2 && data[0] == 0xFF && data[1] == 0xD8 {
		return "image/jpeg"
	}
	if len(data) >= 4 && data[0] == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G' {
		return "image/png"
	}
	return "image/png" // default fallback
}

func parseTileCoords(r *http.Request) (z, x, y int, err error) {
	z, err = strconv.Atoi(chi.URLParam(r, "z"))
	if err != nil || z < 0 || z > 22 {
		return 0, 0, 0, fmt.Errorf("invalid z: %s", chi.URLParam(r, "z"))
	}
	maxCoord := 1 << z
	x, err = strconv.Atoi(chi.URLParam(r, "x"))
	if err != nil || x < 0 || x >= maxCoord {
		return 0, 0, 0, fmt.Errorf("invalid x: %s", chi.URLParam(r, "x"))
	}
	y, err = strconv.Atoi(chi.URLParam(r, "y"))
	if err != nil || y < 0 || y >= maxCoord {
		return 0, 0, 0, fmt.Errorf("invalid y: %s", chi.URLParam(r, "y"))
	}
	return z, x, y, nil
}
