package tiles

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// SentinelProvider serves Sentinel-2 seasonal satellite tiles via Sentinel Hub WMS.
type SentinelProvider struct {
	instanceID   string
	clientID     string
	clientSecret string
	redis        *redis.Client
	httpClient   *http.Client
	limiter      *RateLimiter

	mu          sync.RWMutex
	accessToken string
	tokenExpiry time.Time
}

// NewSentinelProvider creates a Sentinel Hub tile provider.
func NewSentinelProvider(instanceID, clientID, clientSecret string, redisClient *redis.Client) *SentinelProvider {
	return &SentinelProvider{
		instanceID:   instanceID,
		clientID:     clientID,
		clientSecret: clientSecret,
		redis:        redisClient,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
		limiter:      NewRateLimiter(200),
	}
}

// ServeTile handles GET /api/v1/tiles/sentinel/{z}/{x}/{y}?season=winter&year=2024
func (s *SentinelProvider) ServeTile(w http.ResponseWriter, r *http.Request) {
	z, x, y, err := parseTileCoords(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	season := r.URL.Query().Get("season")
	if season != "winter" {
		season = "summer"
	}
	yearStr := r.URL.Query().Get("year")
	year, err := strconv.Atoi(yearStr)
	if err != nil || year < 2015 || year > time.Now().Year() {
		year = time.Now().Year()
	}

	ctx := r.Context()
	cacheKey := fmt.Sprintf("sentinel:%s:%d:%d:%d:%d", season, year, z, x, y)

	// Check cache
	cached, err := s.redis.Get(ctx, cacheKey).Bytes()
	if err == nil {
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "public, max-age=604800")
		w.Header().Set("X-Cache", "HIT")
		w.Write(cached) //nolint:errcheck
		return
	}

	if !s.limiter.Allow() {
		http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
		return
	}

	// Get OAuth2 token
	token, err := s.getToken(ctx)
	if err != nil {
		slog.Error("sentinel auth failed", "error", err)
		http.Error(w, "authentication failed", http.StatusBadGateway)
		return
	}

	// Build WMS request
	bbox := tileBbox(z, x, y)
	timeRange := seasonDateRange(season, year)
	wmsURL := s.buildWMSURL(bbox, timeRange)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, wmsURL, nil)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Error("sentinel fetch failed", "error", err)
		http.Error(w, "upstream fetch failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Error("sentinel non-200", "status", resp.StatusCode)
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "read error", http.StatusBadGateway)
		return
	}

	// Cache for 7 days
	if err := s.redis.Set(ctx, cacheKey, data, 7*24*time.Hour).Err(); err != nil {
		slog.Warn("sentinel cache set failed", "key", cacheKey, "error", err)
	}

	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "image/png"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=604800")
	w.Header().Set("X-Cache", "MISS")
	w.Write(data) //nolint:errcheck
}

func (s *SentinelProvider) getToken(ctx context.Context) (string, error) {
	s.mu.RLock()
	if s.accessToken != "" && time.Now().Before(s.tokenExpiry) {
		token := s.accessToken
		s.mu.RUnlock()
		return token, nil
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Double-check after lock
	if s.accessToken != "" && time.Now().Before(s.tokenExpiry) {
		return s.accessToken, nil
	}

	data := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {s.clientID},
		"client_secret": {s.clientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://services.sentinel-hub.com/oauth/token",
		strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request failed with status %d", resp.StatusCode)
	}

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	s.accessToken = result.AccessToken
	// Expire 60 seconds early to avoid edge cases
	s.tokenExpiry = time.Now().Add(time.Duration(result.ExpiresIn-60) * time.Second)

	return s.accessToken, nil
}

func (s *SentinelProvider) buildWMSURL(bbox string, timeRange string) string {
	params := url.Values{
		"SERVICE": {"WMS"},
		"REQUEST": {"GetMap"},
		"VERSION": {"1.3.0"},
		"LAYERS":  {"TRUE-COLOR"},
		"CRS":     {"EPSG:3857"},
		"BBOX":    {bbox},
		"WIDTH":   {"256"},
		"HEIGHT":  {"256"},
		"FORMAT":  {"image/png"},
		"TIME":    {timeRange},
		"MAXCC":   {"20"},
	}
	return fmt.Sprintf("https://services.sentinel-hub.com/ogc/wms/%s?%s", s.instanceID, params.Encode())
}

// tileBbox converts z/x/y tile coordinates to a Web Mercator (EPSG:3857) bounding box string.
func tileBbox(z, x, y int) string {
	n := math.Pow(2, float64(z))
	tileSize := 20037508.342789244 * 2 / n

	minX := -20037508.342789244 + float64(x)*tileSize
	maxX := minX + tileSize
	maxY := 20037508.342789244 - float64(y)*tileSize
	minY := maxY - tileSize

	return fmt.Sprintf("%.6f,%.6f,%.6f,%.6f", minX, minY, maxX, maxY)
}

// seasonDateRange returns a date range string for Sentinel Hub TIME parameter.
func seasonDateRange(season string, year int) string {
	switch season {
	case "winter":
		// Dec previous year to Feb current year
		return fmt.Sprintf("%d-12-01/%d-02-28", year-1, year)
	default: // summer
		return fmt.Sprintf("%d-06-01/%d-08-31", year, year)
	}
}
