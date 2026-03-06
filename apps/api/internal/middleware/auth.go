package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

// TokenValidator extracts userID and email from a raw JWT string.
// Injected by main so middleware doesn't import the auth package (avoids import cycle).
type TokenValidator func(tokenString string) (userID, email string, err error)

func Authenticate(validate TokenValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				writeAuthError(w, "missing or malformed Authorization header")
				return
			}
			tokenStr := strings.TrimPrefix(header, "Bearer ")

			userID, email, err := validate(tokenStr)
			if err != nil {
				writeAuthError(w, "invalid or expired token")
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, emailKey, email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeAuthError(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{
			"code":    "UNAUTHORIZED",
			"message": message,
		},
	})
}
