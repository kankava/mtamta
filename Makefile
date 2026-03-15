.PHONY: dev test lint build check db-migrate db-reset seed

-include .env
export

dev: ## Start docker services + API (air) + Vite dev server
	docker compose up -d
	@command -v air >/dev/null 2>&1 || { echo "Error: 'air' not found. Install: go install github.com/air-verse/air@latest"; exit 1; }
	cd apps/api && air &
	pnpm dev --filter=@mtamta/web

test: ## Run all tests (unit + integration; requires docker services running)
	cd apps/api && go test ./...
	cd apps/api && go test -tags=integration ./...
	pnpm test

lint: ## Run linters
	cd apps/api && golangci-lint run ./...
	pnpm lint
	pnpm format:check

build: ## Build web app
	pnpm turbo build --filter=@mtamta/web

check: ## Run all CI checks locally (test + lint + build)
	$(MAKE) test
	$(MAKE) lint
	$(MAKE) build

db-migrate: ## Run pending migrations
	cd apps/api && DATABASE_URL="$$DATABASE_URL" go run ./cmd/migrate up

db-reset: ## Wipe database and re-run migrations + seed
	docker compose down -v
	docker compose up -d postgres redis
	@echo "Waiting for postgres..."
	@sleep 5
	$(MAKE) db-migrate
	$(MAKE) seed

seed: ## Load seed data
	@command -v psql >/dev/null 2>&1 || { echo "Error: 'psql' not found. Install postgresql-client for your OS."; exit 1; }
	psql "$$DATABASE_URL" < data/seed/users.sql
