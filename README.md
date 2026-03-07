# mtamta

An outdoor adventure platform for logging, finding, and sharing extreme outdoor trips with rich map rendering, terrain analysis, and live data integrations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go (modular monolith), chi router, pgx/v5 |
| Frontend | React + TypeScript + Vite |
| Mobile | React Native (planned) |
| Maps | Mapbox GL JS |
| Database | PostgreSQL + PostGIS + TimescaleDB |
| Cache | Redis |
| Search | Meilisearch (planned) |
| Auth | Google + Apple OAuth, JWT |
| Hosting | Railway (API) + Cloudflare Pages (web) |

## Monorepo Structure

```
mtamta/
├── apps/
│   ├── api/          # Go backend
│   └── web/          # React + Vite frontend
├── packages/
│   └── shared/       # TypeScript types, API client, token storage
├── data/
│   └── seed/         # Seed SQL files
├── docs/             # Architecture & planning docs
└── .github/workflows # CI/CD
```

## Requirements

- **Go** 1.23+
- **Node.js** 22+
- **pnpm** 9+ (via corepack: `corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- **Docker** (for PostgreSQL + Redis)

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
| `SENTRY_DSN` | No | `""` | Sentry error tracking DSN |

### Web (`/apps/web/.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | API base URL (e.g. `http://localhost:8080`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (same as API) |

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
| `make lint` | Run linters (go vet + tsc) |
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

### Authenticated (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/users/me` | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Update current user profile |

## Deployment

### API (Railway)

The API deploys to Railway via the `Dockerfile` at `apps/api/Dockerfile`. Configuration is in `railway.toml`.

Railway runs migrations automatically on startup. Required secrets:
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`
- `WEB_ORIGIN` (your Cloudflare Pages URL)
- `SENTRY_DSN` (optional)
- `ENV=production`

### Web (Cloudflare Pages)

The web app builds with `pnpm build --filter=@mtamta/web` and deploys the `apps/web/dist` directory to Cloudflare Pages.

Environment variables are set in Cloudflare Pages dashboard:
- `VITE_API_URL` — your Railway API URL
- `VITE_GOOGLE_CLIENT_ID` — your Google client ID

### CI/CD

Pushes to `main` trigger the full pipeline (`.github/workflows/ci.yml`):
1. **test-api** — Go tests with Postgres + Redis service containers
2. **test-web** — TypeScript tests (shared + web)
3. **build-web** — Verify web app builds
4. **lint** — `go vet` + `tsc --noEmit`
5. **deploy** — Railway (API) + Cloudflare Pages (web)

Required GitHub secrets: `RAILWAY_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

### Database Backups

Weekly automated backups to Cloudflare R2 (`.github/workflows/backup.yml`). Runs every Sunday at 2 AM UTC.

Required GitHub secrets: `DATABASE_URL`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ACCOUNT_ID`

## Documentation

- [Architecture](docs/Architecture.md) — tech stack, system design, database schema, API conventions
- [Implementation Plan](docs/Plan.md) — 12-phase roadmap from foundation to launch
- [Phase 1 Spec](docs/Phase1.md) — detailed implementation spec for the foundation phase

## License

Private. All rights reserved.
