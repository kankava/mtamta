package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

func NewHandler(db *pgxpool.Pool, redis *redis.Client) *Handler {
	return &Handler{db: db, redis: redis}
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	services := map[string]string{}
	allOK := true

	if err := h.db.Ping(ctx); err != nil {
		services["postgres"] = "error"
		allOK = false
	} else {
		services["postgres"] = "ok"
	}

	if err := h.redis.Ping(ctx).Err(); err != nil {
		services["redis"] = "error"
		allOK = false
	} else {
		services["redis"] = "ok"
	}

	status := "ok"
	httpStatus := http.StatusOK
	if !allOK {
		status = "degraded"
		httpStatus = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":   status,
		"services": services,
	})
}
