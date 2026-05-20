# mtamta — Deployment Guide

> Production deployment architecture and reference for the mtamta outdoor adventure platform.

---

## Architecture Overview

```
GitHub (push to main)
    │
    ├──► GitHub Actions CI
    │       ├── test-api (Go unit + integration tests)
    │       ├── test-web (TS tests: shared, map-core, web)
    │       ├── build-web (turbo build)
    │       ├── lint (golangci-lint, ESLint, Prettier)
    │       └── deploy-web ──► Cloudflare Pages (wrangler)
    │
    └──► Railway (auto-deploy, Wait for CI)
            └── builds apps/api/Dockerfile ──► Go API
```

| Component | Service | URL |
|-----------|---------|-----|
| Web App | Cloudflare Pages | https://mtamta.pages.dev |
| Go API | Railway | https://mtamta-production.up.railway.app |
| PostgreSQL | Railway (timescale/timescaledb-ha:pg17) | internal only |
| Redis | Railway (managed) | internal only |

---

## How Deploys Work

**API (Railway):**
- Railway is connected to the GitHub repo with **auto-deploy** enabled
- **Wait for CI** is on — Railway waits for all GitHub Actions checks to pass before deploying
- Root directory: `apps/api` — Railway reads `railway.toml` and `Dockerfile` from there
- No RAILWAY_TOKEN needed in CI

**Web (Cloudflare Pages):**
- Deployed by the `deploy-web` job in GitHub Actions after all checks pass
- Uses `wrangler pages deploy` with the built `apps/web/dist` output
- `VITE_` env vars are set as GitHub Actions **variables** (not secrets) — Vite bakes them into the bundle at build time
- Cloudflare Pages auto-build is **disabled** — CI is the only deploy path
- Cloudflare Pages' GitHub connection is kept for PR preview deployments only

**Flow:** push to `main` → CI runs → if green → Railway auto-deploys API + CI deploys web to Cloudflare

---

## Services & Accounts

All services have free tiers sufficient for development:

| Service | Purpose | Account |
|---------|---------|---------|
| [Railway](https://railway.com) | API hosting, PostgreSQL, Redis | GitHub OAuth |
| [Cloudflare](https://dash.cloudflare.com) | Web hosting (Pages), DNS | Email |
| [Mapbox](https://mapbox.com) | Map tiles, styles, terrain | Email |
| [Google Cloud Console](https://console.cloud.google.com) | OAuth credentials | Personal Gmail |

---

## Railway Setup

### Project structure (3 services):

1. **timescaledb-ha** — Docker image `timescale/timescaledb-ha:pg17`
   - Env vars: `POSTGRES_DB=mtamta`, `POSTGRES_USER=mtamta`, `POSTGRES_PASSWORD=<secret>`
   - Provides PostgreSQL 17 with PostGIS + TimescaleDB extensions

2. **Redis** — Railway managed Redis plugin
   - Auto-provisioned with password

3. **mtamta** (API) — Connected to GitHub repo `kankava/mtamta`
   - Root directory: `apps/api`
   - Builder: Dockerfile
   - Auto-deploy: enabled
   - Wait for CI: enabled
   - Public networking: port 8080

### API environment variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `ENV` | `production` | |
| `DATABASE_URL` | `postgresql://mtamta:<pw>@timescaledb-ha.railway.internal:5432/mtamta?sslmode=disable` | Internal hostname |
| `REDIS_URL` | `redis://default:<pw>@redis.railway.internal:6379` | Internal URL with password |
| `JWT_SECRET` | `<generated>` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | `<from Google Cloud Console>` | |
| `WEB_ORIGIN` | `https://mtamta.pages.dev` | Used for CORS |
| `ALLOWED_EMAILS` | `<your email>` | Restricts sign-ups |
| `APPLE_CLIENT_ID` | `<from Apple Developer>` | Optional — Apple OAuth |
| `SENTRY_DSN` | `<from Sentry>` | Optional — error tracking |
| `IGN_API_KEY` | — | Deprecated — IGN now uses the public key-less PLANIGNV2 endpoint; leave unset |
| `SENTINEL_HUB_INSTANCE_ID` | `<from Sentinel Hub>` | Optional — seasonal satellite tiles |
| `SENTINEL_HUB_CLIENT_ID` | `<from Sentinel Hub>` | Optional — satellite OAuth |
| `SENTINEL_HUB_CLIENT_SECRET` | `<from Sentinel Hub>` | Optional — satellite OAuth |

---

## Cloudflare Pages Setup

Auto-build is **disabled** — web deploys are handled by the CI `deploy-web` job via `wrangler pages deploy`. Cloudflare Pages' GitHub connection is only used for PR preview deployments.

### Cloudflare Pages project settings (for reference):

| Setting | Value |
|---------|-------|
| Build command | `pnpm turbo build --filter=@mtamta/web` |
| Build output directory | `apps/web/dist` |
| Root directory | `/` (blank — needs full monorepo for Turborepo) |
| Auto-build | **Disabled** |

### Environment variables (on Cloudflare Pages):

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://mtamta-production.up.railway.app` |
| `VITE_GOOGLE_CLIENT_ID` | `<from Google Cloud Console>` |
| `VITE_MAPBOX_ACCESS_TOKEN` | `<Mapbox public token (pk.*)>` |
| `VITE_MAPTILER_API_KEY` | `<MapTiler API key>` |
| `NODE_VERSION` | `24` (must match `.nvmrc`) |

These are also set as GitHub Actions **variables** (not secrets) so CI can build the web app with the correct values. Keep both in sync.

---

## GitHub Actions Configuration

Repo → Settings → Secrets and variables → Actions:

### Secrets

| Secret | Source |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare > My Profile > API Tokens (Cloudflare Pages Edit permission) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard > Pages project sidebar |
| `BACKUP_DATABASE_URL` | Railway Postgres **public** connection URL (Postgres service → Connect → Public Network). Used by the Database Backup workflow — keep in sync if the DB ever moves |
| `R2_ACCESS_KEY`, `R2_SECRET_KEY` | Cloudflare R2 → Manage R2 API Tokens (Object Read & Write) |
| `R2_BUCKET` | R2 bucket name for database backups |
| `R2_ACCOUNT_ID` | Cloudflare account ID |

No `RAILWAY_TOKEN` needed — Railway auto-deploys via GitHub connection.

The `BACKUP_*` / `R2_*` secrets feed the **Database Backup** workflow (`.github/workflows/backup.yml`) — weekly `pg_dump` to R2. Run it manually once (Actions → Database Backup → Run workflow) to confirm all five secrets are set correctly.

### Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://mtamta-production.up.railway.app` | Baked into web bundle at build time |
| `VITE_GOOGLE_CLIENT_ID` | `<from Google Cloud Console>` | Public — visible in frontend code |
| `VITE_MAPBOX_ACCESS_TOKEN` | `<Mapbox public token (pk.*)>` | Public — visible in frontend code |
| `VITE_MAPTILER_API_KEY` | `<MapTiler API key>` | Public — visible in frontend code |

---

## Google OAuth

- **Project**: `mtamta` on Google Cloud Console (personal Gmail account, free)
- **Client type**: Web application (`mtamta web`)
- **Authorized JavaScript origins**: `http://localhost:5173`, `https://mtamta.pages.dev`
- **Authorized redirect URIs**: `http://localhost:5173`, `https://mtamta.pages.dev`
- **Consent screen**: External, testing mode (only added test users can sign in)

Add production URLs here when switching to a custom domain.

---

## Custom Domain (future)

Currently using free default URLs. When you buy a domain (e.g. `mtamta.com`):

1. Add domain to Cloudflare DNS
2. Point `mtamta.com` → Cloudflare Pages custom domain
3. Point `api.mtamta.com` → Railway custom domain
4. Update `WEB_ORIGIN` on Railway
5. Update `VITE_API_URL` on Cloudflare Pages
6. Update Google OAuth authorized origins/redirect URIs

No code changes needed — everything is env-var driven.

---

## Verification

After any deploy:

```bash
# API health check
curl https://mtamta-production.up.railway.app/api/v1/health

# Expected response:
# {"services":{"postgres":"ok","redis":"ok"},"status":"ok"}
```

- Open https://mtamta.pages.dev — map should load
- Test Google OAuth login flow end-to-end

---

## Operations Runbook

### Database migrations

The API runs `migrate.Up()` on **every startup** (`apps/api/cmd/server/main.go`), so a normal deploy auto-applies any new migrations — you do not run migrations by hand in normal operation. golang-migrate applies `apps/api/migrations/*.up.sql` in numeric order and records progress in a `schema_migrations` table inside the database itself.

**Run migrations manually** (`cmd/migrate`) only in these cases:

- **A fresh / empty database** (new environment, a region move, a wiped volume): after pointing the API at it, the simplest fix is to **redeploy the API** so startup migration runs. To apply directly instead:

  ```bash
  cd apps/api
  DATABASE_URL="<Postgres public URL>" go run ./cmd/migrate up
  ```

- **The API won't boot with a migration error** ("Dirty database version N"): a migration half-applied. Inspect `SELECT * FROM schema_migrations;`. Recover by finishing/reverting the failed SQL by hand and clearing `dirty`, or — on an otherwise-empty DB — `DROP TABLE schema_migrations` and re-apply from scratch. Then redeploy.
- **Rolling back**: `go run ./cmd/migrate down` reverses the last migration (uses the `*.down.sql` files).

**You do NOT need to migrate after restoring from a backup** — a `pg_dump` restore already includes the schema *and* the `schema_migrations` table at the version the dump was taken. The restored DB is already at that version; the next deploy of newer code applies anything newer.

> The startup log distinguishes `migrations applied` (something changed) from `migrations: already up to date`, and includes the version — so a no-op against a database you believed was fresh is visible, not silent.

### Moving a Railway service to another region

**Stateless services (the API)** — changing region is safe: Railway redeploys the container and startup migration re-runs. No data to lose.

**Stateful services (Postgres, Redis)** — ⚠️ **Railway volumes are region-locked. Changing a database service's region in place does NOT move the data — you get a fresh empty volume.** (This caused the May 2026 sign-in outage.)

Correct procedure to move Postgres to a new region:

1. Take a fresh backup (run the **Database Backup** workflow manually, or `pg_dump`).
2. Provision a **new** Postgres service in the target region — do not toggle the region on the existing one.
3. Restore the dump into the new database (see *Restoring* below).
4. Update the API's `DATABASE_URL` to reference the new Postgres service.
5. **Redeploy the API last** — only after the new DB is up and restored — so its startup migration runs against the final database.
6. Verify (`/api/v1/health`, sign-in), then delete the old Postgres.

Redis holds only cache + sessions — it can simply be recreated empty in the new region; repoint `REDIS_URL` and redeploy the API (users re-sign-in).

> **Order is critical:** settle the data services *first*, redeploy the API *last*. If the API restarts while the database is mid-swap, its startup migration runs against the *old* DB (logging a misleading success) and the new empty DB never gets the schema.

### Restoring the database from a backup

Backups live in R2 under `db-backups/` (see `.github/workflows/backup.yml`).

```bash
# download the chosen backup-YYYYMMDD-HHMMSS.sql.gz from R2, then:
gunzip -c backup-YYYYMMDD-HHMMSS.sql.gz | psql "<target Postgres URL>"
```

This recreates all tables, data, and `schema_migrations`. Afterwards, deploy the current API — it migrates any newer versions automatically. (No hypertables yet, so a plain `pg_dump`/`psql` restore is sufficient; revisit if TimescaleDB hypertables are enabled later.)

---

## Post-deploy TODO

- [ ] Sentry for error tracking (free tier)
- [ ] Mapbox token URL restrictions (lock pk.* token to production domain)
- [ ] Dedicated domain
- [ ] Staging environment (separate Railway project) if needed
