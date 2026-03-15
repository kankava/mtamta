package tiles

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

// newTestRedis creates a Redis client for testing.
// Falls back to a no-op if Redis is not available.
func newTestRedis() *redis.Client {
	client := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15})
	if err := client.Ping(context.Background()).Err(); err != nil {
		// Return a client pointing to an invalid address — tests will handle cache misses
		return redis.NewClient(&redis.Options{Addr: "localhost:0"})
	}
	// Clean test DB
	client.FlushDB(context.Background())
	return client
}

func setupHandler(upstreamURL string) (*Handler, func()) {
	rc := newTestRedis()
	providers := map[string]*Provider{
		"test": {
			ID:          "test",
			UpstreamURL: upstreamURL + "/%d/%d/%d.png",
			FormatOrder: "zxy",
			CacheTTL:    1 * time.Minute,
			CachePrefix: "tile:test",
			Headers:     map[string]string{},
		},
	}
	h := NewHandler(providers, rc)
	return h, func() { rc.Close() }
}

func makeRequest(h *Handler, provider string, z, x, y int) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/v1/tiles/%s/%d/%d/%d", provider, z, x, y), nil)

	// Set up chi URL params
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("provider", provider)
	rctx.URLParams.Add("z", fmt.Sprintf("%d", z))
	rctx.URLParams.Add("x", fmt.Sprintf("%d", x))
	rctx.URLParams.Add("y", fmt.Sprintf("%d", y))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	h.ServeTile(rr, req)
	return rr
}

func TestServeTile_UnknownProvider(t *testing.T) {
	h, cleanup := setupHandler("http://localhost:0")
	defer cleanup()

	rr := makeRequest(h, "nonexistent", 10, 100, 200)
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestServeTile_InvalidCoords(t *testing.T) {
	h, cleanup := setupHandler("http://localhost:0")
	defer cleanup()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tiles/test/abc/1/2", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("provider", "test")
	rctx.URLParams.Add("z", "abc")
	rctx.URLParams.Add("x", "1")
	rctx.URLParams.Add("y", "2")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	h.ServeTile(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestServeTile_CacheMissThenHit(t *testing.T) {
	// Mock upstream
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("fake-png-data"))
	}))
	defer upstream.Close()

	rc := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15})
	if err := rc.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available, skipping cache test")
	}
	rc.FlushDB(context.Background())
	defer rc.Close()

	providers := map[string]*Provider{
		"test": {
			ID:          "test",
			UpstreamURL: upstream.URL + "/%d/%d/%d.png",
			FormatOrder: "zxy",
			CacheTTL:    1 * time.Minute,
			CachePrefix: "tile:test",
			Headers:     map[string]string{},
		},
	}
	h := NewHandler(providers, rc)

	// First request — cache miss
	rr1 := makeRequest(h, "test", 10, 100, 200)
	if rr1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr1.Code)
	}
	if rr1.Header().Get("X-Cache") != "MISS" {
		t.Errorf("expected X-Cache: MISS, got %s", rr1.Header().Get("X-Cache"))
	}
	if rr1.Body.String() != "fake-png-data" {
		t.Errorf("unexpected body: %s", rr1.Body.String())
	}

	// Second request — cache hit
	rr2 := makeRequest(h, "test", 10, 100, 200)
	if rr2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr2.Code)
	}
	if rr2.Header().Get("X-Cache") != "HIT" {
		t.Errorf("expected X-Cache: HIT, got %s", rr2.Header().Get("X-Cache"))
	}
}

func TestServeTile_RateLimit(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	h, cleanup := setupHandler(upstream.URL)
	defer cleanup()

	// Exhaust rate limit
	h.limiters["test"] = NewRateLimiter(1)
	_ = makeRequest(h, "test", 10, 1, 1) // uses the 1 allowed request

	rr := makeRequest(h, "test", 10, 2, 2) // should be rate limited
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", rr.Code)
	}
}

func TestServeTile_FormatOrderZXY(t *testing.T) {
	var requestedPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedPath = r.URL.Path
		w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	rc := newTestRedis()
	defer rc.Close()

	providers := map[string]*Provider{
		"topo": {
			ID:          "topo",
			UpstreamURL: upstream.URL + "/%d/%d/%d.png",
			FormatOrder: "zxy",
			CacheTTL:    1 * time.Minute,
			CachePrefix: "tile:topo",
			Headers:     map[string]string{},
		},
	}
	h := NewHandler(providers, rc)

	rr := makeRequest(h, "topo", 10, 100, 200)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	// zxy order: z=10, x=100, y=200
	if requestedPath != "/10/100/200.png" {
		t.Errorf("expected /10/100/200.png, got %s", requestedPath)
	}
}

func TestServeTile_FormatOrderZYX(t *testing.T) {
	var requestedURL string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestedURL = r.URL.String()
		w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	rc := newTestRedis()
	defer rc.Close()

	providers := map[string]*Provider{
		"ign": {
			ID:          "ign",
			UpstreamURL: upstream.URL + "?TILEMATRIX=%d&TILEROW=%d&TILECOL=%d",
			FormatOrder: "zyx",
			CacheTTL:    1 * time.Minute,
			CachePrefix: "tile:ign",
			Headers:     map[string]string{},
		},
	}
	h := NewHandler(providers, rc)

	rr := makeRequest(h, "ign", 10, 100, 200)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	// zyx order: z=10, y=200, x=100
	expected := "/?TILEMATRIX=10&TILEROW=200&TILECOL=100"
	if requestedURL != expected {
		t.Errorf("expected %s, got %s", expected, requestedURL)
	}
}

func TestServeTile_BlankTileDetection(t *testing.T) {
	// Upstream returns a small response (simulating a blank swisstopo JPEG)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write([]byte("tiny-blank")) // 10 bytes, below threshold
	}))
	defer upstream.Close()

	rc := newTestRedis()
	defer rc.Close()

	providers := map[string]*Provider{
		"blank": {
			ID:             "blank",
			UpstreamURL:    upstream.URL + "/%d/%d/%d.jpeg",
			FormatOrder:    "zxy",
			CacheTTL:       1 * time.Minute,
			CachePrefix:    "tile:blank",
			Headers:        map[string]string{},
			BlankThreshold: 1000,
		},
	}
	h := NewHandler(providers, rc)

	// Should detect blank and return 204
	rr := makeRequest(h, "blank", 10, 100, 200)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rr.Code)
	}
	if rr.Body.Len() != 0 {
		t.Errorf("expected empty body for blank tile, got %d bytes", rr.Body.Len())
	}
}

func TestServeTile_BlankTileCached(t *testing.T) {
	rc := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15})
	if err := rc.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available, skipping cache test")
	}
	rc.FlushDB(context.Background())
	defer rc.Close()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write([]byte("tiny")) // below threshold
	}))
	defer upstream.Close()

	providers := map[string]*Provider{
		"blank": {
			ID:             "blank",
			UpstreamURL:    upstream.URL + "/%d/%d/%d.jpeg",
			FormatOrder:    "zxy",
			CacheTTL:       1 * time.Minute,
			CachePrefix:    "tile:blank",
			Headers:        map[string]string{},
			BlankThreshold: 1000,
		},
	}
	h := NewHandler(providers, rc)

	// First — cache miss, detect blank
	rr1 := makeRequest(h, "blank", 10, 100, 200)
	if rr1.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rr1.Code)
	}

	// Second — blank sentinel from cache
	rr2 := makeRequest(h, "blank", 10, 100, 200)
	if rr2.Code != http.StatusNoContent {
		t.Fatalf("expected 204 from cache, got %d", rr2.Code)
	}
	if rr2.Header().Get("X-Cache") != "HIT" {
		t.Errorf("expected X-Cache: HIT, got %s", rr2.Header().Get("X-Cache"))
	}
}

func TestServeTile_BlankThresholdNotTriggered(t *testing.T) {
	// Upstream returns a large response (real tile data)
	largeData := make([]byte, 5000)
	for i := range largeData {
		largeData[i] = byte(i % 256)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(largeData)
	}))
	defer upstream.Close()

	rc := newTestRedis()
	defer rc.Close()

	providers := map[string]*Provider{
		"real": {
			ID:             "real",
			UpstreamURL:    upstream.URL + "/%d/%d/%d.jpeg",
			FormatOrder:    "zxy",
			CacheTTL:       1 * time.Minute,
			CachePrefix:    "tile:real",
			Headers:        map[string]string{},
			BlankThreshold: 1000,
		},
	}
	h := NewHandler(providers, rc)

	rr := makeRequest(h, "real", 10, 100, 200)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 for real tile, got %d", rr.Code)
	}
	if rr.Body.Len() != 5000 {
		t.Errorf("expected 5000 bytes, got %d", rr.Body.Len())
	}
}

func TestParseTileCoords_NegativeZ(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("z", "-1")
	rctx.URLParams.Add("x", "0")
	rctx.URLParams.Add("y", "0")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	_, _, _, err := parseTileCoords(req)
	if err == nil {
		t.Error("expected error for negative z")
	}
}

func TestParseTileCoords_OutOfRangeXY(t *testing.T) {
	tests := []struct {
		name    string
		z, x, y string
	}{
		{"x out of range", "2", "4", "0"}, // z=2 → max=4, x must be < 4
		{"y out of range", "2", "0", "4"}, // z=2 → max=4, y must be < 4
		{"x way out", "0", "1", "0"},      // z=0 → max=1, x must be < 1
		{"y way out", "0", "0", "1"},      // z=0 → max=1, y must be < 1
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("z", tt.z)
			rctx.URLParams.Add("x", tt.x)
			rctx.URLParams.Add("y", tt.y)
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

			_, _, _, err := parseTileCoords(req)
			if err == nil {
				t.Errorf("expected error for %s (z=%s x=%s y=%s)", tt.name, tt.z, tt.x, tt.y)
			}
		})
	}
}

func TestParseTileCoords_ValidBoundary(t *testing.T) {
	// z=2 → max coord is 3 (2^2 - 1)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("z", "2")
	rctx.URLParams.Add("x", "3")
	rctx.URLParams.Add("y", "3")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	z, x, y, err := parseTileCoords(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if z != 2 || x != 3 || y != 3 {
		t.Errorf("got z=%d x=%d y=%d, want 2 3 3", z, x, y)
	}
}
