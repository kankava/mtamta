package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/kankava/mtamta/internal/user"
)

// ErrSignUpDisabled is returned when a new user tries to sign up but their
// email is not in the allowlist.
var ErrSignUpDisabled = errors.New("sign-up is restricted")

// ErrEmailAlreadyExists is returned when a new provider sign-in attempts to
// create a user but the email is already taken by another account.
var ErrEmailAlreadyExists = errors.New("email already associated with another account")

type Service struct {
	repo           *Repository
	userRepo       *user.Repository
	jwtSecret      string
	googleVerifier *GoogleVerifier
	appleVerifier  *AppleVerifier
	allowedEmails  map[string]struct{} // if non-empty, only these emails can create accounts
}

func NewService(repo *Repository, userRepo *user.Repository, jwtSecret string, google *GoogleVerifier, apple *AppleVerifier, allowedEmails []string) *Service {
	em := make(map[string]struct{}, len(allowedEmails))
	for _, e := range allowedEmails {
		if e = strings.TrimSpace(strings.ToLower(e)); e != "" {
			em[e] = struct{}{}
		}
	}
	return &Service{
		repo:           repo,
		userRepo:       userRepo,
		jwtSecret:      jwtSecret,
		googleVerifier: google,
		appleVerifier:  apple,
		allowedEmails:  em,
	}
}

type AuthResult struct {
	AccessToken  string
	RefreshToken string
	User         *user.User
}

func (s *Service) SignInWithGoogle(ctx context.Context, idToken string) (*AuthResult, error) {
	claims, err := s.googleVerifier.Verify(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("invalid Google ID token: %w", err)
	}
	return s.signInOrCreate(ctx, "google", claims.Sub, claims.Email, claims.Name)
}

func (s *Service) SignInWithApple(ctx context.Context, idToken string) (*AuthResult, error) {
	claims, err := s.appleVerifier.Verify(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("invalid Apple ID token: %w", err)
	}
	return s.signInOrCreate(ctx, "apple", claims.Sub, claims.Email, "Apple User")
}

func (s *Service) signInOrCreate(ctx context.Context, provider, providerUID, email, displayName string) (*AuthResult, error) {
	u, err := s.repo.FindUserByProviderUID(ctx, provider, providerUID)
	if err != nil && !errors.Is(err, ErrProviderNotFound) {
		return nil, fmt.Errorf("looking up provider: %w", err)
	}
	if u == nil {
		if !s.isEmailAllowed(email) {
			return nil, ErrSignUpDisabled
		}
		u, err = s.repo.CreateUserWithProvider(ctx, displayName, email, provider, providerUID)
		if err != nil {
			if isDuplicateEmail(err) {
				return nil, ErrEmailAlreadyExists
			}
			return nil, fmt.Errorf("creating user: %w", err)
		}
	}
	return s.issueTokens(ctx, u)
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error) {
	userID, err := s.repo.LookupRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token")
	}

	u, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("user not found for refresh token")
	}

	email := ""
	if u.Email != nil {
		email = *u.Email
	}

	accessToken, err := IssueAccessToken(userID, email, s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("issuing access token: %w", err)
	}

	return &AuthResult{
		AccessToken:  accessToken,
		RefreshToken: refreshToken, // unchanged — no rotation in Phase 1
	}, nil
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.repo.DeleteRefreshToken(ctx, refreshToken)
}

// isDuplicateEmail checks if a Postgres error is a unique_violation on the
// users.email constraint (users_email_key).
func isDuplicateEmail(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "users_email_key"
}

// isEmailAllowed returns true if sign-up is unrestricted (empty allowlist)
// or if the email is in the allowlist.
func (s *Service) isEmailAllowed(email string) bool {
	if len(s.allowedEmails) == 0 {
		return true // no restriction
	}
	_, ok := s.allowedEmails[strings.ToLower(email)]
	return ok
}

func (s *Service) issueTokens(ctx context.Context, u *user.User) (*AuthResult, error) {
	email := ""
	if u.Email != nil {
		email = *u.Email
	}

	accessToken, err := IssueAccessToken(u.ID, email, s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("issuing access token: %w", err)
	}

	refreshToken, err := IssueRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("issuing refresh token: %w", err)
	}

	if err := s.repo.StoreRefreshToken(ctx, refreshToken, u.ID); err != nil {
		return nil, fmt.Errorf("storing refresh token: %w", err)
	}

	return &AuthResult{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         u,
	}, nil
}
