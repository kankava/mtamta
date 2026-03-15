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
| `IGN_API_KEY` | `<from IGN Géoplateforme>` | Optional — France topo tiles |
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
| `NODE_VERSION` | `22` |

These are also set as GitHub Actions **variables** (not secrets) so CI can build the web app with the correct values. Keep both in sync.

---

## GitHub Actions Configuration

Repo → Settings → Secrets and variables → Actions:

### Secrets

| Secret | Source |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare > My Profile > API Tokens (Cloudflare Pages Edit permission) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard > Pages project sidebar |

No `RAILWAY_TOKEN` needed — Railway auto-deploys via GitHub connection.

### Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://mtamta-production.up.railway.app` | Baked into web bundle at build time |
| `VITE_GOOGLE_CLIENT_ID` | `<from Google Cloud Console>` | Public — visible in frontend code |
| `VITE_MAPBOX_ACCESS_TOKEN` | `<Mapbox public token (pk.*)>` | Public — visible in frontend code |

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

## Post-deploy TODO

- [ ] Sentry for error tracking (free tier)
- [ ] Mapbox token URL restrictions (lock pk.* token to production domain)
- [ ] Dedicated domain
- [ ] Staging environment (separate Railway project) if needed