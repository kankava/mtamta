package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"math/big"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// mockJWKSClient returns a static set of keys for testing.
type mockJWKSClient struct {
	keys []JSONWebKey
}

func (m *mockJWKSClient) Keys(_ context.Context) ([]JSONWebKey, error) {
	return m.keys, nil
}

func generateTestRSAKey(t *testing.T) (*rsa.PrivateKey, JSONWebKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	jwk := JSONWebKey{
		Kid: "test-kid-1",
		Kty: "RSA",
		Alg: "RS256",
		Use: "sig",
		N:   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
		E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
	}
	return key, jwk
}

func signGoogleToken(t *testing.T, key *rsa.PrivateKey, kid, aud, iss, sub, email, name string, exp time.Time) string {
	t.Helper()
	claims := googleRawClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    iss,
			Subject:   sub,
			Audience:  jwt.ClaimStrings{aud},
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		Email: email,
		Name:  name,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid

	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func TestGoogleVerifier_ValidToken(t *testing.T) {
	key, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	token := signGoogleToken(t, key, "test-kid-1", "test-client-id", "accounts.google.com",
		"google-sub-123", "user@gmail.com", "Test User", time.Now().Add(time.Hour))

	claims, err := verifier.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.Sub != "google-sub-123" {
		t.Errorf("Sub = %q, want %q", claims.Sub, "google-sub-123")
	}
	if claims.Email != "user@gmail.com" {
		t.Errorf("Email = %q, want %q", claims.Email, "user@gmail.com")
	}
	if claims.Name != "Test User" {
		t.Errorf("Name = %q, want %q", claims.Name, "Test User")
	}
}

func TestGoogleVerifier_AlternateIssuer(t *testing.T) {
	key, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	token := signGoogleToken(t, key, "test-kid-1", "test-client-id", "https://accounts.google.com",
		"sub-123", "user@gmail.com", "User", time.Now().Add(time.Hour))

	_, err := verifier.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("Verify with alternate issuer: %v", err)
	}
}

func TestGoogleVerifier_ExpiredToken(t *testing.T) {
	key, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	token := signGoogleToken(t, key, "test-kid-1", "test-client-id", "accounts.google.com",
		"sub-123", "user@gmail.com", "User", time.Now().Add(-time.Hour))

	_, err := verifier.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestGoogleVerifier_WrongAudience(t *testing.T) {
	key, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	token := signGoogleToken(t, key, "test-kid-1", "wrong-client-id", "accounts.google.com",
		"sub-123", "user@gmail.com", "User", time.Now().Add(time.Hour))

	_, err := verifier.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for wrong audience")
	}
}

func TestGoogleVerifier_WrongIssuer(t *testing.T) {
	key, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	token := signGoogleToken(t, key, "test-kid-1", "test-client-id", "https://evil.com",
		"sub-123", "user@gmail.com", "User", time.Now().Add(time.Hour))

	_, err := verifier.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for wrong issuer")
	}
}

func TestGoogleVerifier_UnknownKid(t *testing.T) {
	key, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	token := signGoogleToken(t, key, "unknown-kid", "test-client-id", "accounts.google.com",
		"sub-123", "user@gmail.com", "User", time.Now().Add(time.Hour))

	_, err := verifier.Verify(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for unknown kid")
	}
}

func TestGoogleVerifier_HS256Token(t *testing.T) {
	_, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	// Sign with HS256 instead of RS256.
	claims := googleRawClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "accounts.google.com",
			Subject:   "sub-123",
			Audience:  jwt.ClaimStrings{"test-client-id"},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = "test-kid-1"
	signed, _ := token.SignedString([]byte("some-secret"))

	_, err := verifier.Verify(context.Background(), signed)
	if err == nil {
		t.Fatal("expected error for HS256 token (should be rejected)")
	}
}

func TestGoogleVerifier_MalformedToken(t *testing.T) {
	_, jwk := generateTestRSAKey(t)
	verifier := NewGoogleVerifierWithJWKS("test-client-id", &mockJWKSClient{keys: []JSONWebKey{jwk}})

	_, err := verifier.Verify(context.Background(), "not.a.valid.token")
	if err == nil {
		t.Fatal("expected error for malformed token")
	}
}
