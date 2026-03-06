.PHONY: dev test db-migrate db-reset seed lint

dev: ## Start docker services + API (air) + Vite dev server
	docker compose up -d
	cd apps/api && air &
	pnpm dev --filter=@mtamta/web

test: ## Run all tests
	cd apps/api && go test ./...
	pnpm test

lint: ## Run linters
	cd apps/api && go vet ./...
	pnpm lint

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
	psql "$$DATABASE_URL" < data/seed/users.sql
