package db

import (
	"context"

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
