package auth

import (
	"context"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

const appleJWKSURL = "https://appleid.apple.com/auth/keys"

type AppleClaims struct {
	Sub   string
	Email string // may be empty on subsequent logins
}

type AppleVerifier struct {
	clientID string
	jwks     JWKSClient
}

func NewAppleVerifier(clientID string) *AppleVerifier {
	return &AppleVerifier{
		clientID: clientID,
		jwks:     NewHTTPJWKSClient(appleJWKSURL),
	}
}

func NewAppleVerifierWithJWKS(clientID string, jwks JWKSClient) *AppleVerifier {
	return &AppleVerifier{clientID: clientID, jwks: jwks}
}

func (v *AppleVerifier) Verify(ctx context.Context, idToken string) (*AppleClaims, error) {
	keys, err := v.jwks.Keys(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetching Apple JWKS: %w", err)
	}

	parsed, err := jwt.ParseWithClaims(
		idToken,
		&appleRawClaims{},
		func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			kid, _ := t.Header["kid"].(string)
			for _, k := range keys {
				if k.Kid == kid {
					return rsaPublicKeyFromJWK(k)
				}
			}
			return nil, fmt.Errorf("no matching key for kid %q", kid)
		},
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithExpirationRequired(),
		jwt.WithAudience(v.clientID),
		jwt.WithIssuer("https://appleid.apple.com"),
	)
	if err != nil {
		return nil, fmt.Errorf("verifying Apple ID token: %w", err)
	}

	raw, ok := parsed.Claims.(*appleRawClaims)
	if !ok || !parsed.Valid {
		return nil, fmt.Errorf("invalid Apple token claims")
	}

	sub, _ := raw.GetSubject()
	return &AppleClaims{
		Sub:   sub,
		Email: raw.Email,
	}, nil
}

type appleRawClaims struct {
	jwt.RegisteredClaims
	Email string `json:"email"`
}
