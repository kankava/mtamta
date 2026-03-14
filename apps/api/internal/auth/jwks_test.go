package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPJWKSClient_Non200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := NewHTTPJWKSClient(srv.URL)
	_, err := client.Keys(context.Background())
	if err == nil {
		t.Fatal("expected error for non-200 JWKS response")
	}
}

func TestHTTPJWKSClient_CachesKeys(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{
				{"kid": "k1", "kty": "RSA", "alg": "RS256", "use": "sig", "n": "abc", "e": "AQAB"},
			},
		})
	}))
	defer srv.Close()

	client := NewHTTPJWKSClient(srv.URL)

	keys1, err := client.Keys(context.Background())
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	if len(keys1) != 1 {
		t.Fatalf("expected 1 key, got %d", len(keys1))
	}

	keys2, err := client.Keys(context.Background())
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if len(keys2) != 1 {
		t.Fatalf("expected 1 key, got %d", len(keys2))
	}

	if calls != 1 {
		t.Errorf("expected 1 HTTP call (cached), got %d", calls)
	}
}
