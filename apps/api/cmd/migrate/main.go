package main

import (
	"fmt"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"github.com/kankava/mtamta/internal/db"
)

func main() {
	direction := "up"
	if len(os.Args) > 1 {
		direction = os.Args[1]
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	if err := runMigrations(databaseURL, direction); err != nil {
		log.Fatal(err)
	}

	log.Printf("migrations %s: done", direction)
}

func runMigrations(databaseURL, direction string) error {
	m, err := migrate.New("file://migrations", db.MigrateURL(databaseURL))
	if err != nil {
		return fmt.Errorf("failed to create migrator: %w", err)
	}
	defer m.Close() //nolint:errcheck // best-effort cleanup

	switch direction {
	case "up":
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			return fmt.Errorf("migration up failed: %w", err)
		}
	case "down":
		if err := m.Down(); err != nil && err != migrate.ErrNoChange {
			return fmt.Errorf("migration down failed: %w", err)
		}
	default:
		return fmt.Errorf("unknown direction %q: use 'up' or 'down'", direction)
	}

	return nil
}
