//go:build integration

package user_test

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"github.com/kankava/mtamta/internal/db"
	"github.com/kankava/mtamta/internal/user"
)

func setupRepo(t *testing.T) *user.Repository {
	t.Helper()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	ctx := context.Background()
	pool := db.New(ctx, databaseURL)
	t.Cleanup(pool.Close)

	m, err := migrate.New("file://../../migrations", db.MigrateURL(databaseURL))
	if err != nil {
		t.Fatalf("create migrator: %v", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		t.Fatalf("migrate up: %v", err)
	}
	t.Cleanup(func() {
		m.Down()
		m.Close()
	})

	return user.NewRepository(pool)
}

func TestRepository_CreateAndFindByID(t *testing.T) {
	repo := setupRepo(t)
	ctx := context.Background()

	email := "repo-test-" + uuid.NewString()[:8] + "@example.com"
	bio := "Test bio"
	created, err := repo.Create(ctx, &user.User{
		DisplayName: "Repo Test User",
		Email:       &email,
		Bio:         &bio,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if created.DisplayName != "Repo Test User" {
		t.Errorf("DisplayName = %q, want %q", created.DisplayName, "Repo Test User")
	}
	if *created.Email != email {
		t.Errorf("Email = %q, want %q", *created.Email, email)
	}

	found, err := repo.FindByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if found.ID != created.ID {
		t.Errorf("FindByID ID = %q, want %q", found.ID, created.ID)
	}
	if found.DisplayName != created.DisplayName {
		t.Errorf("FindByID DisplayName = %q, want %q", found.DisplayName, created.DisplayName)
	}
	if *found.Bio != bio {
		t.Errorf("FindByID Bio = %q, want %q", *found.Bio, bio)
	}
}

func TestRepository_Update(t *testing.T) {
	repo := setupRepo(t)
	ctx := context.Background()

	email := "update-test-" + uuid.NewString()[:8] + "@example.com"
	created, err := repo.Create(ctx, &user.User{
		DisplayName: "Before Update",
		Email:       &email,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	newName := "After Update"
	updated, err := repo.Update(ctx, created.ID, user.UpdateFields{
		DisplayName: &newName,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.DisplayName != "After Update" {
		t.Errorf("DisplayName = %q, want %q", updated.DisplayName, "After Update")
	}

	found, err := repo.FindByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("FindByID after update: %v", err)
	}
	if found.DisplayName != "After Update" {
		t.Errorf("DisplayName after FindByID = %q, want %q", found.DisplayName, "After Update")
	}
}

func TestRepository_FindByID_NotFound(t *testing.T) {
	repo := setupRepo(t)
	ctx := context.Background()

	_, err := repo.FindByID(ctx, uuid.NewString())
	if err == nil {
		t.Fatal("expected error for non-existent user")
	}
	if err != user.ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
