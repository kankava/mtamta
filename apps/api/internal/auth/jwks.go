package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"
)

// JSONWebKey is a single JWK entry.
type JSONWebKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// JWKSClient fetches and caches a JSON Web Key Set.
type JWKSClient interface {
	Keys(ctx context.Context) ([]JSONWebKey, error)
}

// httpJWKSClient fetches JWKS from a URL and caches for 1 hour.
type httpJWKSClient struct {
	url    string
	client *http.Client

	mu        sync.RWMutex
	cached    []JSONWebKey
	expiresAt time.Time
}

func NewHTTPJWKSClient(url string) JWKSClient {
	return &httpJWKSClient{
		url: url,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *httpJWKSClient) Keys(ctx context.Context) ([]JSONWebKey, error) {
	// Fast path: read lock for cache hit.
	c.mu.RLock()
	if time.Now().Before(c.expiresAt) {
		keys := c.cached
		c.mu.RUnlock()
		return keys, nil
	}
	c.mu.RUnlock()

	// Slow path: fetch without holding the lock.
	keys, err := c.fetch(ctx)
	if err != nil {
		return nil, err
	}

	// Write lock only to update cache.
	c.mu.Lock()
	c.cached = keys
	c.expiresAt = time.Now().Add(time.Hour)
	c.mu.Unlock()

	return keys, nil
}

func (c *httpJWKSClient) fetch(ctx context.Context) ([]JSONWebKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching JWKS: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS request failed with status %d", resp.StatusCode)
	}

	var result struct {
		Keys []JSONWebKey `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding JWKS: %w", err)
	}

	return result.Keys, nil
}

// rsaPublicKeyFromJWK converts a JWK to an *rsa.PublicKey.
func rsaPublicKeyFromJWK(key JSONWebKey) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(key.N)
	if err != nil {
		return nil, fmt.Errorf("decoding n: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(key.E)
	if err != nil {
		return nil, fmt.Errorf("decoding e: %w", err)
	}

	e := int(new(big.Int).SetBytes(eBytes).Int64())
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: e,
	}, nil
}
