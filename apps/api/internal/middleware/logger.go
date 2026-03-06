package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

type responseWriter struct {
	http.ResponseWriter
	status  int
	written bool
	ctx     context.Context // captures the final context after downstream middleware
}

func (rw *responseWriter) WriteHeader(status int) {
	if !rw.written {
		rw.status = status
		rw.written = true
		rw.ResponseWriter.WriteHeader(status)
	}
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.written {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK, ctx: r.Context()}

		// Wrap next to capture the enriched context (e.g. after Authenticate sets user_id).
		next.ServeHTTP(rw, r)

		// Use rw.ctx which may have been updated if downstream called r.WithContext.
		// However, chi's middleware chain passes a new *Request, not mutating the old one.
		// The reliable way: read user_id from the response context captured during WriteHeader,
		// or simply accept that the request ID (set before Logger) is always available
		// and user_id is best-effort.
		//
		// For chi, the Authenticate middleware creates a new request with context via
		// r.WithContext(). The handler receives that new request. But Logger's `r` variable
		// still points to the original. To properly capture user_id, we wrap the handler
		// to save the final request's context.
		finalCtx := rw.ctx

		attrs := []slog.Attr{
			slog.String("request_id", RequestIDFromContext(finalCtx)),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", rw.status),
			slog.Int64("duration_ms", time.Since(start).Milliseconds()),
		}
		if uid := UserIDFromContext(finalCtx); uid != "" {
			attrs = append(attrs, slog.String("user_id", uid))
		}

		level := slog.LevelInfo
		if rw.status >= 500 {
			level = slog.LevelError
		}
		slog.LogAttrs(finalCtx, level, "request", attrs...)
	})
}

// ContextCapture is a middleware that should be placed AFTER Logger in the chain.
// It captures the latest request context so Logger can read user_id set by Authenticate.
// Usage in router: r.Use(Logger) then r.Use(ContextCapture(&loggerRW))
// Actually, a simpler approach: wrap the handler chain to sniff the context.

// CaptureContext wraps a handler to save the enriched context into the responseWriter.
// Place this inside the authenticated group so Logger can read user_id.
func CaptureContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rw, ok := w.(*responseWriter); ok {
			rw.ctx = r.Context()
		}
		next.ServeHTTP(w, r)
	})
}
