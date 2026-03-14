# mtamta

An outdoor adventure platform for logging, finding, and sharing extreme outdoor trips with rich map rendering, terrain analysis, and live data integrations.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Go (modular monolith), chi router, pgx/v5 | Go 1.24 |
| Frontend | React + TypeScript + Vite | React 19, Vite 8 (Rolldown) |
| Styling | Tailwind CSS (v4, Vite plugin) | 4.2 |
| State | Zustand | 5 |
| Maps | Mapbox GL JS | 3.20 |
| Routing | React Router | 7 |
| Testing | Vitest | 4 |
| Mobile | React Native (planned) | — |
| Database | PostgreSQL + PostGIS + TimescaleDB | PG 17 |
| Cache | Redis | 7 |
| Search | Meilisearch (planned) | — |
| Auth | Google + Apple OAuth, JWT | — |
| Hosting | Railway (API) + Cloudflare Pages (web) | — |

## Monorepo Structure

```
mtamta/
├── apps/
│   ├── api/          # Go backend
│   └── web/          # React + Vite frontend
├── packages/
│   ├── shared/       # TypeScript types, API client, token storage
│   └── map-core/     # Map config, layers, styles, terrain, topo sources
├── data/
│   └── seed/         # Seed SQL files
├── docs/             # Architecture & planning docs
└── .github/workflows # CI/CD
```

## Requirements

- **Go** 1.24+
- **Node.js** 22+
- **pnpm** 9+ (via corepack: `corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- **Docker** (for PostgreSQL + Redis)
- **air** (optional, for `make dev` hot reload): `go install github.com/air-verse/air@latest`
- **psql** (optional, for `make seed`): install `postgresql-client` for your OS

## Getting Started

### 1. Clone and install dependencies

```bash
git clone https://github.com/kankava/mtamta.git
cd mtamta
corepack enable
pnpm install
cd apps/api && go mod download && cd ../..
```

### 2. Set up environment variables

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Edit both files with your values. See [Environment Variables](#environment-variables) below.

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (TimescaleDB) on port 5432 and Redis on port 6379.

### 4. Run the API

```bash
cd apps/api && go run ./cmd/server
```

The API starts on `http://localhost:8080`. Migrations run automatically on startup.

Verify it's working:
```bash
curl http://localhost:8080/api/v1/health
```

### 5. Run the web app

```bash
pnpm dev --filter=@mtamta/web
```

Opens on `http://localhost:5173`.

### Development with hot reload

```bash
make dev
```

This starts Docker services, the Go API with [air](https://github.com/air-verse/air) (hot reload), and the Vite dev server.

## Environment Variables

### API (`/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | API server port |
| `ENV` | No | `development` | `development` or `production` |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `JWT_SECRET` | Yes | — | Secret for signing access tokens (min 32 chars) |
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth client ID |
| `APPLE_CLIENT_ID` | No | `""` | Apple OAuth client ID |
| `WEB_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `ALLOWED_EMAILS` | No | `""` | Comma-separated emails allowed to sign up (empty = allow all) |
| `SENTRY_DSN` | No | `""` | Sentry error tracking DSN |
| `IGN_API_KEY` | No | `""` | IGN Géoplateforme API key for France topo tiles |
| `SENTINEL_HUB_INSTANCE_ID` | No | `""` | Sentinel Hub WMS instance ID for satellite tiles |
| `SENTINEL_HUB_CLIENT_ID` | No | `""` | Sentinel Hub OAuth client ID |
| `SENTINEL_HUB_CLIENT_SECRET` | No | `""` | Sentinel Hub OAuth client secret |

### Web (`/apps/web/.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | API base URL (e.g. `http://localhost:8080`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (same as API) |
| `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox public token (`pk.*`) |

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select existing)
3. Navigate to **APIs & Services > Credentials**
4. Create an **OAuth 2.0 Client ID** (Web application)
5. Add `http://localhost:5173` as an authorized JavaScript origin
6. Copy the client ID into both `.env` (`GOOGLE_CLIENT_ID`) and `apps/web/.env.local` (`VITE_GOOGLE_CLIENT_ID`)

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start all services (Docker + API + web) |
| `make test` | Run all tests (Go + TypeScript) |
| `make lint` | Run linters (golangci-lint + ESLint + Prettier) |
| `make build` | Build all packages |
| `make check` | Run all CI checks locally (test + lint + build) |
| `make db-migrate` | Run pending database migrations |
| `make db-reset` | Wipe DB, re-run migrations and seed data |
| `make seed` | Load seed data |

### Running tests directly

```bash
# Go unit tests
cd apps/api && go test ./...

# Go integration tests (requires Docker services running)
cd apps/api && go test -tags=integration ./...

# TypeScript tests
pnpm test

# TypeScript type checking
pnpm lint
```

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check (postgres + redis) |
| `POST` | `/api/v1/auth/google` | Sign in with Google ID token |
| `POST` | `/api/v1/auth/apple` | Sign in with Apple ID token |
| `POST` | `/api/v1/auth/refresh` | Refresh access token (cookie) |
| `POST` | `/api/v1/auth/logout` | Logout and clear refresh token |
| `GET` | `/api/v1/tiles/{provider}/{z}/{x}/{y}` | Tile proxy (opentopomap, ign) |
| `GET` | `/api/v1/tiles/sentinel/{z}/{x}/{y}` | Sentinel Hub seasonal satellite tiles |

### Authenticated (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/users/me` | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Update current user profile |

## Deployment

### API (Railway)

The API deploys to Railway via the `Dockerfile` at `apps/api/Dockerfile`. Configuration is in `apps/api/railway.toml`.

Railway auto-deploys from GitHub with **Wait for CI** enabled — deploys only happen after all CI checks pass. Migrations run automatically on startup.

### Web (Cloudflare Pages)

The web app is built and deployed by the `deploy-web` CI job using `wrangler pages deploy`. Cloudflare Pages auto-build is disabled.

`VITE_` environment variables are set as GitHub Actions **variables** (not secrets) and baked into the bundle at build time.

### CI/CD

Pushes to `main` trigger the full pipeline (`.github/workflows/ci.yml`):
1. **test-api** — Go unit + integration tests with Postgres + Redis service containers
2. **test-web** — TypeScript tests (shared, map-core, web)
3. **build-web** — Verify web app builds
4. **lint** — golangci-lint, ESLint, Prettier
5. **deploy-web** — Deploy to Cloudflare Pages (after all checks pass)

Railway auto-deploys the API separately after CI passes (Wait for CI).

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
Required GitHub variables: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_MAPBOX_ACCESS_TOKEN`

See [docs/Deployment.md](docs/Deployment.md) for full deployment reference.

### Database Backups

Weekly automated backups to Cloudflare R2 (`.github/workflows/backup.yml`). Runs every Sunday at 2 AM UTC.

Required GitHub secrets: `DATABASE_URL`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ACCOUNT_ID`

## Documentation

- [Architecture](docs/Architecture.md) — tech stack, system design, database schema, API conventions
- [Implementation Plan](docs/Plan.md) — 12-phase roadmap from foundation to launch
- [Deployment](docs/Deployment.md) — production deployment setup and reference
- [Upgrades](docs/Upgrades.md) — dependency upgrade plan and migration notes
- [Phase 1 Spec](docs/Phase1.md) — foundation phase implementation spec
- [Phase 2 Spec](docs/Phase2.md) — maps core implementation spec
- [Phase 3 Spec](docs/Phase3.md) — map sources & overlays implementation spec

## License

Private. All rights reserved.
