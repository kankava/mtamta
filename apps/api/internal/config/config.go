package config

import (
	"fmt"
	"os"
)

type Config struct {
	Env            string // "development" | "production"
	Port           string
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	GoogleClientID string
	AppleClientID  string
	WebOrigin      string
	SentryDSN      string
}

func Load() *Config {
	return &Config{
		Env:            getEnv("ENV", "development"),
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    require("DATABASE_URL"),
		RedisURL:       require("REDIS_URL"),
		JWTSecret:      require("JWT_SECRET"),
		GoogleClientID: require("GOOGLE_CLIENT_ID"),
		AppleClientID:  getEnv("APPLE_CLIENT_ID", ""),
		WebOrigin:      getEnv("WEB_ORIGIN", "http://localhost:5173"),
		SentryDSN:      getEnv("SENTRY_DSN", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func require(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %s is not set", key))
	}
	return v
}
