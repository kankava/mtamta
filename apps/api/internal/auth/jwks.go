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
	url string

	mu        sync.Mutex
	cached    []JSONWebKey
	expiresAt time.Time
}

func NewHTTPJWKSClient(url string) JWKSClient {
	return &httpJWKSClient{url: url}
}

func (c *httpJWKSClient) Keys(ctx context.Context) ([]JSONWebKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if time.Now().Before(c.expiresAt) {
		return c.cached, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching JWKS: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Keys []JSONWebKey `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding JWKS: %w", err)
	}

	c.cached = result.Keys
	c.expiresAt = time.Now().Add(time.Hour)
	return c.cached, nil
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
