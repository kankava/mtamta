package auth

import (
	"context"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

type GoogleClaims struct {
	Sub     string
	Email   string
	Name    string
	Picture string
}

type GoogleVerifier struct {
	clientID string
	jwks     JWKSClient
}

func NewGoogleVerifier(clientID string) *GoogleVerifier {
	return &GoogleVerifier{
		clientID: clientID,
		jwks:     NewHTTPJWKSClient(googleJWKSURL),
	}
}

func NewGoogleVerifierWithJWKS(clientID string, jwks JWKSClient) *GoogleVerifier {
	return &GoogleVerifier{clientID: clientID, jwks: jwks}
}

func (v *GoogleVerifier) Verify(ctx context.Context, idToken string) (*GoogleClaims, error) {
	keys, err := v.jwks.Keys(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetching Google JWKS: %w", err)
	}

	parsed, err := jwt.ParseWithClaims(
		idToken,
		&googleRawClaims{},
		func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			// Validate issuer — Google uses two valid values.
			if rc, ok := t.Claims.(*googleRawClaims); ok {
				iss, _ := rc.GetIssuer()
				if iss != "accounts.google.com" && iss != "https://accounts.google.com" {
					return nil, fmt.Errorf("invalid issuer: %q", iss)
				}
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
	)
	if err != nil {
		return nil, fmt.Errorf("verifying Google ID token: %w", err)
	}

	raw, ok := parsed.Claims.(*googleRawClaims)
	if !ok || !parsed.Valid {
		return nil, fmt.Errorf("invalid Google token claims")
	}

	if !raw.EmailVerified {
		return nil, fmt.Errorf("Google email is not verified")
	}

	sub, _ := raw.GetSubject()
	return &GoogleClaims{
		Sub:     sub,
		Email:   raw.Email,
		Name:    raw.Name,
		Picture: raw.Picture,
	}, nil
}

type googleRawClaims struct {
	jwt.RegisteredClaims
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}
