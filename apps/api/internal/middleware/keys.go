package middleware

import "context"

type contextKey string

const (
	requestIDKey contextKey = "request_id"
	userIDKey    contextKey = "user_id"
	emailKey     contextKey = "email"
)

func RequestIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(requestIDKey).(string)
	return v
}

func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func EmailFromContext(ctx context.Context) string {
	v, _ := ctx.Value(emailKey).(string)
	return v
}
