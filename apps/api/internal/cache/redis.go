package cache

import (
	"context"

	"github.com/redis/go-redis/v9"
)

func New(redisURL string) *redis.Client {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		panic("invalid REDIS_URL: " + err.Error())
	}
	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		panic("redis ping failed: " + err.Error())
	}
	return client
}
