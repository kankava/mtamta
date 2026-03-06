package middleware

import (
	"net/http"

	"github.com/kankava/mtamta/internal/respond"
)

// CheckOrigin rejects requests where the Origin header is set but does not
// match any of the allowed origins. This is a defence-in-depth measure
// alongside SameSite=Lax cookies. Safe (GET/HEAD/OPTIONS) methods are
// skipped because they should not mutate state.
func CheckOrigin(allowed ...string) func(http.Handler) http.Handler {
	set := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		set[o] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
				if _, ok := set[origin]; !ok {
					respond.Error(w, http.StatusForbidden, "FORBIDDEN", "origin not allowed")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
