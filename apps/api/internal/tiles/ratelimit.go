package tiles

import (
	"sync"
	"time"
)

// RateLimiter is a simple in-memory per-minute rate limiter for upstream tile fetches.
type RateLimiter struct {
	mu        sync.Mutex
	count     int
	maxPerMin int
	windowEnd time.Time
}

// NewRateLimiter creates a rate limiter allowing maxPerMin requests per minute.
func NewRateLimiter(maxPerMin int) *RateLimiter {
	return &RateLimiter{
		maxPerMin: maxPerMin,
		windowEnd: time.Now().Add(time.Minute),
	}
}

// Allow returns true if the request is within the rate limit.
func (rl *RateLimiter) Allow() bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	if now.After(rl.windowEnd) {
		rl.count = 0
		rl.windowEnd = now.Add(time.Minute)
	}

	if rl.count >= rl.maxPerMin {
		return false
	}
	rl.count++
	return true
}
