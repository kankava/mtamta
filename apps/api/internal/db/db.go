package db

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func New(ctx context.Context, databaseURL string) *pgxpool.Pool {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		panic("invalid DATABASE_URL: " + err.Error())
	}
	cfg.MaxConns = 10
	cfg.MinConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		panic("failed to connect to database: " + err.Error())
	}
	if err := pool.Ping(ctx); err != nil {
		panic("database ping failed: " + err.Error())
	}
	return pool
}

// MigrateURL converts a postgresql:// or postgres:// URL to pgx5:// so that
// golang-migrate can match it to the registered pgx/v5 driver.
func MigrateURL(databaseURL string) string {
	for _, prefix := range []string{"postgresql://", "postgres://"} {
		if strings.HasPrefix(databaseURL, prefix) {
			return "pgx5://" + databaseURL[len(prefix):]
		}
	}
	return databaseURL
}
