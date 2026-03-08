package tiles

import (
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

// Handler serves proxied tile requests.
type Handler struct {
	providers  map[string]*Provider
	redis      *redis.Client
	httpClient *http.Client
	limiter    *RateLimiter
}

// NewHandler creates a tile proxy handler.
func NewHandler(providers map[string]*Provider, redisClient *redis.Client) *Handler {
	return &Handler{
		providers: providers,
		redis:     redisClient,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		limiter: NewRateLimiter(500),
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
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("X-Cache", "HIT")
		w.Write(cached) //nolint:errcheck
		return
	}

	// Rate limit upstream fetches
	if !h.limiter.Allow() {
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
	defer resp.Body.Close()

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

func parseTileCoords(r *http.Request) (z, x, y int, err error) {
	z, err = strconv.Atoi(chi.URLParam(r, "z"))
	if err != nil || z < 0 || z > 22 {
		return 0, 0, 0, fmt.Errorf("invalid z: %s", chi.URLParam(r, "z"))
	}
	x, err = strconv.Atoi(chi.URLParam(r, "x"))
	if err != nil || x < 0 {
		return 0, 0, 0, fmt.Errorf("invalid x: %s", chi.URLParam(r, "x"))
	}
	y, err = strconv.Atoi(chi.URLParam(r, "y"))
	if err != nil || y < 0 {
		return 0, 0, 0, fmt.Errorf("invalid y: %s", chi.URLParam(r, "y"))
	}
	return z, x, y, nil
}
