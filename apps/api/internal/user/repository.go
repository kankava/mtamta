package user

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("user not found")

type UpdateFields struct {
	DisplayName *string
	Bio         *string
	AvatarURL   *string
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindByID(ctx context.Context, id string) (*User, error) {
	const q = `
		SELECT id, display_name, email, avatar_url, bio, created_at, updated_at
		FROM users
		WHERE id = $1 AND deleted_at IS NULL`

	u := &User{}
	err := r.db.QueryRow(ctx, q, id).Scan(
		&u.ID, &u.DisplayName, &u.Email,
		&u.AvatarURL, &u.Bio, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *Repository) Create(ctx context.Context, u *User) (*User, error) {
	const q = `
		INSERT INTO users (display_name, email, avatar_url, bio)
		VALUES ($1, $2, $3, $4)
		RETURNING id, display_name, email, avatar_url, bio, created_at, updated_at`

	row := r.db.QueryRow(ctx, q, u.DisplayName, u.Email, u.AvatarURL, u.Bio)
	created := &User{}
	err := row.Scan(
		&created.ID, &created.DisplayName, &created.Email,
		&created.AvatarURL, &created.Bio, &created.CreatedAt, &created.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return created, nil
}

func (r *Repository) Update(ctx context.Context, id string, fields UpdateFields) (*User, error) {
	const q = `
		UPDATE users
		SET
			display_name = COALESCE($2, display_name),
			bio          = COALESCE($3, bio),
			avatar_url   = COALESCE($4, avatar_url),
			updated_at   = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, display_name, email, avatar_url, bio, created_at, updated_at`

	u := &User{}
	err := r.db.QueryRow(ctx, q, id, fields.DisplayName, fields.Bio, fields.AvatarURL).Scan(
		&u.ID, &u.DisplayName, &u.Email,
		&u.AvatarURL, &u.Bio, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}
