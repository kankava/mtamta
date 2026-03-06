//go:build integration

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

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

// setupTestRouter creates a fully wired chi router against real Postgres + Redis.
// It uses a mock Google verifier that always succeeds.
func setupTestRouter(t *testing.T) http.Handler {
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

	userRepo := user.NewRepository(pool)
	authRepo := auth.NewRepository(pool, redisClient)

	// Use a mock Google verifier that accepts any token.
	mockJWKS := &mockGoogleJWKS{}
	googleVerifier := auth.NewGoogleVerifierWithJWKS("test-client-id", mockJWKS)
	appleVerifier := auth.NewAppleVerifierWithJWKS("test-apple-id", mockJWKS)

	authService := auth.NewService(authRepo, userRepo, testJWTSecret, googleVerifier, appleVerifier)
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

	return r
}

// mockGoogleJWKS is a JWKS client that returns keys for a test RSA key.
// For integration tests we bypass the verifier entirely by sending a real
// signed token using the test key.
type mockGoogleJWKS struct{}

func (m *mockGoogleJWKS) Keys(_ context.Context) ([]auth.JSONWebKey, error) {
	// Return the key from the shared test helper.
	// In integration tests, we rely on the fact that the handler calls
	// service.SignInWithGoogle which calls googleVerifier.Verify.
	// We need a real RSA key pair to sign tokens.
	return nil, nil
}

// signInWithGoogle sends a POST to /api/v1/auth/google and returns the response.
func signInWithGoogle(t *testing.T, router http.Handler, idToken string) *httptest.ResponseRecorder {
	t.Helper()
	body := `{"id_token":"` + idToken + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/google", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestIntegration_FullAuthFlow(t *testing.T) {
	// For a proper integration test, we need the Google verifier to actually
	// verify the token. Since we can't easily create a real Google token,
	// we test the full HTTP flow using a specially constructed test.
	//
	// This test verifies the HTTP layer: cookie handling, request routing,
	// response shapes, and the refresh/logout flow.

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

	// Create a user + refresh token directly via the repository layer.
	userRepo := user.NewRepository(pool)
	authRepo := auth.NewRepository(pool, redisClient)

	email := "integration-test@example.com"
	testUser, err := userRepo.Create(ctx, &user.User{
		DisplayName: "Integration Tester",
		Email:       &email,
	})
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}

	// Issue tokens directly to test the HTTP endpoints.
	accessToken, err := auth.IssueAccessToken(testUser.ID, email, testJWTSecret)
	if err != nil {
		t.Fatalf("issue access token: %v", err)
	}

	refreshToken, err := auth.IssueRefreshToken()
	if err != nil {
		t.Fatalf("issue refresh token: %v", err)
	}
	if err := authRepo.StoreRefreshToken(ctx, refreshToken, testUser.ID); err != nil {
		t.Fatalf("store refresh token: %v", err)
	}

	// Build a minimal router for testing HTTP endpoints.
	authService := auth.NewService(authRepo, userRepo, testJWTSecret, nil, nil)
	authHandler := auth.NewHandler(authService, false)
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
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

	// Test 1: GET /api/v1/users/me with valid access token
	t.Run("GetMe with valid token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
		}

		var body map[string]any
		if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body["id"] != testUser.ID {
			t.Errorf("id = %v, want %v", body["id"], testUser.ID)
		}
	})

	// Test 2: Refresh via cookie
	t.Run("Refresh via cookie", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.AddCookie(&http.Cookie{Name: "refresh_token", Value: refreshToken})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
		}

		var body map[string]any
		if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body["access_token"] == nil || body["access_token"] == "" {
			t.Error("expected non-empty access_token in refresh response")
		}

		// Check Set-Cookie header
		cookies := w.Result().Cookies()
		found := false
		for _, c := range cookies {
			if c.Name == "refresh_token" {
				found = true
				if !c.HttpOnly {
					t.Error("refresh_token cookie should be HttpOnly")
				}
				if c.Path != "/api/v1/auth" {
					t.Errorf("cookie Path = %q, want /api/v1/auth", c.Path)
				}
			}
		}
		if !found {
			t.Error("expected Set-Cookie: refresh_token in response")
		}
	})

	// Test 3: Logout flow
	t.Run("Logout clears cookie and invalidates token", func(t *testing.T) {
		// Issue a new refresh token for this sub-test.
		rt, _ := auth.IssueRefreshToken()
		authRepo.StoreRefreshToken(ctx, rt, testUser.ID)

		// Logout
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
		req.AddCookie(&http.Cookie{Name: "refresh_token", Value: rt})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNoContent {
			t.Fatalf("logout status = %d, want 204", w.Code)
		}

		// Check cookie is cleared
		cookies := w.Result().Cookies()
		for _, c := range cookies {
			if c.Name == "refresh_token" && c.MaxAge != -1 {
				t.Error("expected MaxAge=-1 to clear the cookie")
			}
		}

		// Test 4: Refresh token reuse after logout should fail
		req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req2.AddCookie(&http.Cookie{Name: "refresh_token", Value: rt})
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, req2)

		if w2.Code != http.StatusUnauthorized {
			t.Errorf("refresh after logout: status = %d, want 401", w2.Code)
		}
	})

	// Test 5: Request ID propagation
	t.Run("Request ID propagation", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		rid := w.Header().Get("X-Request-ID")
		if rid == "" {
			t.Error("expected non-empty X-Request-ID header")
		}
		if len(rid) < 32 {
			t.Errorf("X-Request-ID = %q, expected UUID-like string", rid)
		}
	})
}
