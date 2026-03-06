package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-key-32bytes-long!!"

func TestIssueAndValidateAccessToken(t *testing.T) {
	token, err := IssueAccessToken("user-123", "user@test.com", testSecret)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}

	claims, err := ValidateAccessToken(token, testSecret)
	if err != nil {
		t.Fatalf("ValidateAccessToken: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Errorf("UserID = %q, want %q", claims.UserID, "user-123")
	}
	if claims.Email != "user@test.com" {
		t.Errorf("Email = %q, want %q", claims.Email, "user@test.com")
	}
}

func TestValidateAccessToken_Expired(t *testing.T) {
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
		UserID: "user-123",
		Email:  "user@test.com",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString([]byte(testSecret))

	_, err := ValidateAccessToken(signed, testSecret)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestValidateAccessToken_WrongSecret(t *testing.T) {
	token, _ := IssueAccessToken("user-123", "user@test.com", testSecret)

	_, err := ValidateAccessToken(token, "wrong-secret")
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestValidateAccessToken_WrongAlgorithm(t *testing.T) {
	// Create a token signed with HS384 instead of HS256.
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		UserID: "user-123",
		Email:  "user@test.com",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS384, claims)
	signed, _ := token.SignedString([]byte(testSecret))

	_, err := ValidateAccessToken(signed, testSecret)
	if err == nil {
		t.Fatal("expected error for wrong algorithm (HS384)")
	}
}

func TestValidateAccessToken_Malformed(t *testing.T) {
	_, err := ValidateAccessToken("not.a.jwt", testSecret)
	if err == nil {
		t.Fatal("expected error for malformed token")
	}
}

func TestValidateAccessToken_Empty(t *testing.T) {
	_, err := ValidateAccessToken("", testSecret)
	if err == nil {
		t.Fatal("expected error for empty token")
	}
}

func TestIssueRefreshToken(t *testing.T) {
	token1, err := IssueRefreshToken()
	if err != nil {
		t.Fatalf("IssueRefreshToken: %v", err)
	}
	token2, _ := IssueRefreshToken()

	if len(token1) != 64 { // 32 bytes = 64 hex chars
		t.Errorf("refresh token length = %d, want 64", len(token1))
	}
	if token1 == token2 {
		t.Error("two refresh tokens should not be equal")
	}
}
