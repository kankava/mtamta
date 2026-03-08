//go:build integration

package auth_test

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"github.com/kankava/mtamta/internal/auth"
	"github.com/kankava/mtamta/internal/cache"
	"github.com/kankava/mtamta/internal/db"
	"github.com/kankava/mtamta/internal/middleware"
	"github.com/kankava/mtamta/internal/user"
)

const testJWTSecret = "integration-test-secret-32bytes!"

// testEnv holds shared infrastructure for integration tests.
type testEnv struct {
	router     http.Handler
	rsaKey     *rsa.PrivateKey
	rsaKeyKid  string
	clientID   string
}

func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		t.Skip("REDIS_URL not set, skipping integration test")
	}

	ctx := context.Background()
	pool := db.New(ctx, databaseURL)
	t.Cleanup(pool.Close)

	redisClient := cache.New(redisURL)
	t.Cleanup(func() { redisClient.Close() })

	// Run migrations
	m, err := migrate.New("file://../../migrations", databaseURL)
	if err != nil {
		t.Fatalf("create migrator: %v", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		t.Fatalf("migrate up: %v", err)
	}
	t.Cleanup(func() {
		m.Down()
		m.Close()
	})

	// Generate a test RSA key pair for signing mock Google ID tokens.
	rsaKey, jwk := auth.GenerateTestRSAKey(t)
	clientID := "test-client-id"

	// Mock JWKS that returns our test key.
	mockJWKS := &staticJWKS{keys: []auth.JSONWebKey{jwk}}
	googleVerifier := auth.NewGoogleVerifierWithJWKS(clientID, mockJWKS)
	appleVerifier := auth.NewAppleVerifierWithJWKS("test-apple-id", mockJWKS)

	userRepo := user.NewRepository(pool)
	authRepo := auth.NewRepository(pool, redisClient)
	authService := auth.NewService(authRepo, userRepo, testJWTSecret, googleVerifier, appleVerifier, nil)
	authHandler := auth.NewHandler(authService, false)
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)

	r.Post("/api/v1/auth/google", authHandler.Google)
	r.Post("/api/v1/auth/refresh", authHandler.Refresh)
	r.Post("/api/v1/auth/logout", authHandler.Logout)

	jwtValidator := func(tok string) (string, string, error) {
		claims, err := auth.ValidateAccessToken(tok, testJWTSecret)
		if err != nil {
			return "", "", err
		}
		return claims.UserID, claims.Email, nil
	}
	r.Group(func(r chi.Router) {
		r.Use(middleware.Authenticate(jwtValidator))
		r.Get("/api/v1/users/me", userHandler.GetMe)
	})

	return &testEnv{
		router:    r,
		rsaKey:    rsaKey,
		rsaKeyKid: jwk.Kid,
		clientID:  clientID,
	}
}

// setupTestEnvWithAllowlist creates an environment where only allowedEmails can sign up.
func setupTestEnvWithAllowlist(t *testing.T, allowedEmails []string) *testEnv {
	t.Helper()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		t.Skip("REDIS_URL not set, skipping integration test")
	}

	ctx := context.Background()
	pool := db.New(ctx, databaseURL)
	t.Cleanup(pool.Close)

	redisClient := cache.New(redisURL)
	t.Cleanup(func() { redisClient.Close() })

	m, err := migrate.New("file://../../migrations", databaseURL)
	if err != nil {
		t.Fatalf("create migrator: %v", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		t.Fatalf("migrate up: %v", err)
	}
	t.Cleanup(func() {
		m.Down()
		m.Close()
	})

	rsaKey, jwk := auth.GenerateTestRSAKey(t)
	clientID := "test-client-id"

	mockJWKS := &staticJWKS{keys: []auth.JSONWebKey{jwk}}
	googleVerifier := auth.NewGoogleVerifierWithJWKS(clientID, mockJWKS)
	appleVerifier := auth.NewAppleVerifierWithJWKS("test-apple-id", mockJWKS)

	userRepo := user.NewRepository(pool)
	authRepo := auth.NewRepository(pool, redisClient)
	authService := auth.NewService(authRepo, userRepo, testJWTSecret, googleVerifier, appleVerifier, allowedEmails)
	authHandler := auth.NewHandler(authService, false)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Post("/api/v1/auth/google", authHandler.Google)

	return &testEnv{
		router:    r,
		rsaKey:    rsaKey,
		rsaKeyKid: jwk.Kid,
		clientID:  clientID,
	}
}

// staticJWKS returns a fixed set of keys.
type staticJWKS struct {
	keys []auth.JSONWebKey
}

func (s *staticJWKS) Keys(_ context.Context) ([]auth.JSONWebKey, error) {
	return s.keys, nil
}

func TestIntegration_FullAuthFlow(t *testing.T) {
	env := setupTestEnv(t)

	// Step 1: Sign a mock Google ID token and POST to /auth/google.
	idToken := auth.SignGoogleToken(t, env.rsaKey, env.rsaKeyKid,
		env.clientID, "accounts.google.com",
		"google-integration-sub", "inttest@example.com", "Integration Tester",
		time.Now().Add(time.Hour))

	body := `{"id_token":"` + idToken + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/google", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /auth/google: status = %d, want 200; body: %s", w.Code, w.Body.String())
	}

	// Verify response body has access_token and user.
	var authResp struct {
		AccessToken string         `json:"access_token"`
		User        map[string]any `json:"user"`
	}
	if err := json.NewDecoder(w.Body).Decode(&authResp); err != nil {
		t.Fatalf("decode auth response: %v", err)
	}
	if authResp.AccessToken == "" {
		t.Fatal("expected non-empty access_token")
	}
	if authResp.User["display_name"] != "Integration Tester" {
		t.Errorf("user.display_name = %v, want %q", authResp.User["display_name"], "Integration Tester")
	}

	// Verify Set-Cookie: refresh_token; HttpOnly.
	var refreshCookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == "refresh_token" {
			refreshCookie = c
			break
		}
	}
	if refreshCookie == nil {
		t.Fatal("expected Set-Cookie: refresh_token")
	}
	if !refreshCookie.HttpOnly {
		t.Error("refresh_token cookie should be HttpOnly")
	}
	if refreshCookie.Path != "/api/v1/auth" {
		t.Errorf("cookie Path = %q, want /api/v1/auth", refreshCookie.Path)
	}

	// Step 2: Use the access token to GET /users/me.
	t.Run("GetMe with token from Google sign-in", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me", nil)
		req.Header.Set("Authorization", "Bearer "+authResp.AccessToken)
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
		}

		var user map[string]any
		json.NewDecoder(w.Body).Decode(&user)
		if user["email"] != "inttest@example.com" {
			t.Errorf("email = %v, want %q", user["email"], "inttest@example.com")
		}
	})

	// Step 3: Refresh via cookie.
	t.Run("Refresh via cookie", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.AddCookie(refreshCookie)
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
		}

		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["access_token"] == nil || resp["access_token"] == "" {
			t.Error("expected non-empty access_token in refresh response")
		}

		// Verify new refresh cookie is set.
		found := false
		for _, c := range w.Result().Cookies() {
			if c.Name == "refresh_token" {
				found = true
			}
		}
		if !found {
			t.Error("expected Set-Cookie: refresh_token in refresh response")
		}
	})

	// Step 4: Logout clears cookie and invalidates token.
	t.Run("Logout and verify invalidation", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
		req.AddCookie(refreshCookie)
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)

		if w.Code != http.StatusNoContent {
			t.Fatalf("logout status = %d, want 204", w.Code)
		}

		// Verify cookie is cleared.
		for _, c := range w.Result().Cookies() {
			if c.Name == "refresh_token" && c.MaxAge != -1 {
				t.Error("expected MaxAge=-1 to clear the cookie")
			}
		}

		// Refresh with the same token should now fail.
		req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req2.AddCookie(refreshCookie)
		w2 := httptest.NewRecorder()
		env.router.ServeHTTP(w2, req2)

		if w2.Code != http.StatusUnauthorized {
			t.Errorf("refresh after logout: status = %d, want 401", w2.Code)
		}
	})

	// Step 5: Request ID propagation.
	t.Run("Request ID propagation", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)

		rid := w.Header().Get("X-Request-ID")
		if rid == "" {
			t.Error("expected non-empty X-Request-ID header")
		}
		if len(rid) < 32 {
			t.Errorf("X-Request-ID = %q, expected UUID-like string", rid)
		}
	})
}

func TestIntegration_AllowlistBlocks(t *testing.T) {
	env := setupTestEnvWithAllowlist(t, []string{"allowed@example.com"})

	// Blocked email → 403
	t.Run("blocked email returns 403", func(t *testing.T) {
		idToken := auth.SignGoogleToken(t, env.rsaKey, env.rsaKeyKid,
			env.clientID, "accounts.google.com",
			"blocked-sub", "stranger@example.com", "Stranger",
			time.Now().Add(time.Hour))

		body := `{"id_token":"` + idToken + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/google", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403; body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		json.NewDecoder(w.Body).Decode(&resp)
		if resp.Error.Code != "SIGNUP_DISABLED" {
			t.Errorf("code = %v, want SIGNUP_DISABLED", resp.Error.Code)
		}
	})

	// Allowed email → 200
	t.Run("allowed email returns 200", func(t *testing.T) {
		idToken := auth.SignGoogleToken(t, env.rsaKey, env.rsaKeyKid,
			env.clientID, "accounts.google.com",
			"allowed-sub", "allowed@example.com", "Allowed User",
			time.Now().Add(time.Hour))

		body := `{"id_token":"` + idToken + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/google", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
		}
	})
}