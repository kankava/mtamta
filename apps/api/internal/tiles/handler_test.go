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
	h.limiter = NewRateLimiter(1)
	_ = makeRequest(h, "test", 10, 1, 1) // uses the 1 allowed request

	rr := makeRequest(h, "test", 10, 2, 2) // should be rate limited
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", rr.Code)
	}
}

func TestParseTileCoords_NegativeZ(t *testing.T) {
	rr := httptest.NewRecorder()
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
	_ = rr
}
