package middleware

import (
	"encoding/json"
	"net/http"

	"github.com/getsentry/sentry-go"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				hub := sentry.CurrentHub().Clone()
				hub.Scope().SetTag("request_id", RequestIDFromContext(r.Context()))
				if uid := UserIDFromContext(r.Context()); uid != "" {
					hub.Scope().SetUser(sentry.User{ID: uid})
				}
				hub.Recover(rec)

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error": map[string]string{
						"code":    "SERVER_ERROR",
						"message": "an unexpected error occurred",
					},
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
