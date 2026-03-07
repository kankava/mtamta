package auth

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/kankava/mtamta/internal/user"
)

var ErrProviderNotFound = errors.New("provider identity not found")

type Repository struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

func NewRepository(db *pgxpool.Pool, redis *redis.Client) *Repository {
	return &Repository{db: db, redis: redis}
}

func (r *Repository) FindUserByProviderUID(ctx context.Context, provider, providerUID string) (*user.User, error) {
	const q = `
		SELECT u.id, u.display_name, u.email, u.avatar_url, u.bio, u.created_at, u.updated_at
		FROM users u
		JOIN auth_providers ap ON ap.user_id = u.id
		WHERE ap.provider = $1 AND ap.provider_uid = $2 AND u.deleted_at IS NULL`

	row := r.db.QueryRow(ctx, q, provider, providerUID)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProviderNotFound
	}
	return u, err
}

func (r *Repository) CreateUserWithProvider(ctx context.Context, displayName, email, provider, providerUID string) (*user.User, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op

	const insertUser = `
		INSERT INTO users (display_name, email)
		VALUES ($1, $2)
		RETURNING id, display_name, email, avatar_url, bio, created_at, updated_at`

	var emailArg *string
	if email != "" {
		emailArg = &email
	}

	row := tx.QueryRow(ctx, insertUser, displayName, emailArg)
	u, err := scanUser(row)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	const insertProvider = `
		INSERT INTO auth_providers (user_id, provider, provider_uid, email)
		VALUES ($1, $2, $3, $4)`
	if _, err := tx.Exec(ctx, insertProvider, u.ID, provider, providerUID, emailArg); err != nil {
		return nil, fmt.Errorf("insert auth_provider: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return u, nil
}

// Refresh token storage uses Redis.
// Key: "session:{sha256hex(token)}"  Value: userID  TTL: 30 days
const refreshTTL = 30 * 24 * time.Hour

func tokenKey(token string) string {
	h := sha256.Sum256([]byte(token))
	return fmt.Sprintf("session:%x", h)
}

func (r *Repository) StoreRefreshToken(ctx context.Context, token, userID string) error {
	return r.redis.Set(ctx, tokenKey(token), userID, refreshTTL).Err()
}

func (r *Repository) LookupRefreshToken(ctx context.Context, token string) (string, error) {
	userID, err := r.redis.Get(ctx, tokenKey(token)).Result()
	if err == redis.Nil {
		return "", fmt.Errorf("refresh token not found")
	}
	return userID, err
}

func (r *Repository) DeleteRefreshToken(ctx context.Context, token string) error {
	return r.redis.Del(ctx, tokenKey(token)).Err()
}

func scanUser(row pgx.Row) (*user.User, error) {
	u := &user.User{}
	err := row.Scan(
		&u.ID, &u.DisplayName, &u.Email,
		&u.AvatarURL, &u.Bio, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}
