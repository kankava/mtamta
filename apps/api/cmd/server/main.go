package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"github.com/kankava/mtamta/internal/auth"
	"github.com/kankava/mtamta/internal/cache"
	"github.com/kankava/mtamta/internal/config"
	"github.com/kankava/mtamta/internal/db"
	"github.com/kankava/mtamta/internal/health"
	"github.com/kankava/mtamta/internal/middleware"
	"github.com/kankava/mtamta/internal/tiles"
	"github.com/kankava/mtamta/internal/user"
)

func main() {
	cfg := config.Load()

	// Logging
	var logHandler slog.Handler
	if cfg.Env == "production" {
		logHandler = slog.NewJSONHandler(os.Stdout, nil)
	} else {
		logHandler = slog.NewTextHandler(os.Stdout, nil)
	}
	slog.SetDefault(slog.New(logHandler))

	// Sentry
	if cfg.SentryDSN != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:         cfg.SentryDSN,
			Environment: cfg.Env,
		}); err != nil {
			slog.Warn("sentry init failed", "error", err)
		}
	}

	ctx := context.Background()

	// Database
	pool := db.New(ctx, cfg.DatabaseURL)
	defer pool.Close()

	// Redis
	redisClient := cache.New(cfg.RedisURL)
	defer func() { _ = redisClient.Close() }()

	// Migrations
	m, err := migrate.New("file://migrations", db.MigrateURL(cfg.DatabaseURL))
	if err != nil {
		slog.Error("failed to create migrator", "error", err)
		os.Exit(1) //nolint:gocritic // startup failure, defers not critical
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		slog.Error("migration failed", "error", err)
		os.Exit(1) //nolint:gocritic // startup failure, defers not critical
	}
	m.Close() //nolint:errcheck // best-effort cleanup after successful migration
	slog.Info("migrations applied")

	// Repositories, services, handlers
	userRepo := user.NewRepository(pool)
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService)

	authRepo := auth.NewRepository(pool, redisClient)
	googleVerifier := auth.NewGoogleVerifier(cfg.GoogleClientID)
	appleVerifier := auth.NewAppleVerifier(cfg.AppleClientID)
	authService := auth.NewService(authRepo, userRepo, cfg.JWTSecret, googleVerifier, appleVerifier, cfg.AllowedEmails)
	authHandler := auth.NewHandler(authService, cfg.Env == "production")

	healthHandler := health.NewHandler(pool, redisClient)

	// Tile proxy (Phase 3)
	tileProviders := tiles.BuildProviders(cfg)
	tileHandler := tiles.NewHandler(tileProviders, redisClient)

	// Router
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.WebOrigin, "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           86400,
	}))
	r.Use(middleware.Recovery)
	r.Use(middleware.CheckOrigin(cfg.WebOrigin, "http://localhost:5173"))
	r.Use(middleware.MaxBody(1 << 20)) // 1 MB
	r.Use(chiMiddleware.StripSlashes)

	// Public routes
	r.Get("/api/v1/health", healthHandler.Health)
	r.Post("/api/v1/auth/google", authHandler.Google)
	r.Post("/api/v1/auth/apple", authHandler.Apple)
	r.Post("/api/v1/auth/refresh", authHandler.Refresh)
	r.Post("/api/v1/auth/logout", authHandler.Logout)

	// Tile proxy (public, no auth)
	r.Get("/api/v1/tiles/{provider}/{z}/{x}/{y}", tileHandler.ServeTile)
	if cfg.SentinelHubInstanceID != "" {
		sentinelProvider := tiles.NewSentinelProvider(
			cfg.SentinelHubInstanceID, cfg.SentinelHubClientID, cfg.SentinelHubSecret, redisClient,
		)
		r.Get("/api/v1/tiles/sentinel/{z}/{x}/{y}", sentinelProvider.ServeTile)
	}

	// Authenticated routes
	jwtValidator := func(tok string) (string, string, error) {
		claims, err := auth.ValidateAccessToken(tok, cfg.JWTSecret)
		if err != nil {
			return "", "", err
		}
		return claims.UserID, claims.Email, nil
	}
	r.Group(func(r chi.Router) {
		r.Use(middleware.Authenticate(jwtValidator))
		r.Use(middleware.CaptureContext) // propagates user_id to Logger's context
		r.Get("/api/v1/users/me", userHandler.GetMe)
		r.Patch("/api/v1/users/me", userHandler.UpdateMe)
	})

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "port", cfg.Port, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down server")

	shutdownCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}
	slog.Info("server stopped")
}
