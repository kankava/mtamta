# mtamta — Architecture

> An outdoor adventure platform for logging, finding, and sharing outdoor activities with rich map rendering, terrain analysis, and live data integrations.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [System Architecture](#system-architecture)
4. [Monorepo Structure](#monorepo-structure)
5. [Backend (Go)](#backend-go)
6. [Frontend — Web](#frontend--web)
7. [Frontend — Mobile](#frontend--mobile)
8. [Map & Geospatial](#map--geospatial)
9. [External Integrations](#external-integrations)
10. [Device Integrations](#device-integrations)
11. [Data Pipeline](#data-pipeline)
12. [Data Model](#data-model)
13. [Search](#search)
14. [Storage](#storage)
15. [API Endpoints](#api-endpoints)
16. [Operations & Deployment](#operations--deployment)

> Backend (Go) includes: API Design & Conventions, Security & Validation, Testing, Authentication Architecture.
>
> Companion docs: [`API.md`](API.md) (full endpoint catalogue), [`Database.md`](Database.md) (full DDL), [`Deployment.md`](Deployment.md) (runbook), [`MapProviders.md`](MapProviders.md) (dual Mapbox + MapTiler architecture).

---

## Overview

**mtamta** (working name) is a platform for outdoor enthusiasts to log, discover, and share activities across sports like backcountry skiing, resort skiing, snowboarding, trail running, rock climbing, and alpinism.

The platform combines rich interactive maps (topographic, satellite, 3D terrain) with live environmental data (weather, wind, avalanche conditions, snow depth, ski lift status) and user-generated content (GPX tracks, photos, trip reports).

### Constraints

- **Solo developer** — every architectural decision prioritizes simplicity and velocity over theoretical scalability. No premature optimization, no unnecessary abstractions.
- **Monorepo** — all code lives in one repository for fast iteration and shared types.
- **Modular monolith** — one Go binary with clean package boundaries. Split into services only when there's a concrete reason to.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Web frontend** | React + TypeScript + Vite | Fast build tooling, mature ecosystem, shares language with mobile |
| **Mobile** | React Native + `@rnmapbox/maps` | Single codebase for iOS + Android; shares types/logic with web |
| **Backend** | Go | Excellent concurrency, fast compilation, ideal for geospatial processing and data pipelines |
| **Maps** | Mapbox GL JS / MapTiler SDK (web), `@rnmapbox/maps` (mobile) | Dual-provider web map rendering with runtime selection; 3D terrain, custom styling |
| **State management** | Zustand | Lightweight, minimal boilerplate, good fit for map-heavy UIs |
| **Data visualization** | Deck.gl (optional) | Advanced visualization layers on top of Mapbox when needed |
| **Monorepo** | Turborepo | Fast task orchestration, dependency-aware builds |
| **Database** | PostgreSQL + PostGIS | Robust relational store with first-class geospatial support |
| **Time-series** | TimescaleDB | PostgreSQL extension for weather/snow/wind time-series data. Included in `timescale/timescaledb-ha` image; hypertables enabled when data volume justifies it |
| **Cache** | Redis | Map tile caching, sessions, rate limiting |
| **Search** | Meilisearch | Fast full-text search for activities, locations, resorts |
| **Object storage** | S3-compatible | GPX files, photos, user uploads |
| **Auth** | Self-built in Go | Only 2 OAuth providers (Google + Apple); ~200-300 lines of Go; full control over user model |
| **FIT parsing** | `github.com/muktihari/fit` | Parse binary FIT files from Garmin and other GPS devices |

### Libraries — Go

> These dependency tables describe the intended end-state. Libraries for later phases (FIT parsing, S3, OAuth2, and on the frontend Radix, deck.gl, turf, etc.) are installed when that phase begins — not all are in `go.mod` / `package.json` today.

| Library | Purpose |
|---|---|
| `golang.org/x/oauth2` | OAuth2 flows |
| `github.com/golang-jwt/jwt/v5` | JWT issuance and validation |
| `github.com/muktihari/fit` | FIT file decoding (binary GPS activity format) |

### Libraries — Frontend

| Library | Purpose |
|---|---|
| `mapbox-gl` | Web map rendering |
| `@maptiler/sdk` | Web map rendering (alternative provider, MapLibre-based) |
| `@rnmapbox/maps` | React Native map rendering |
| `zustand` | State management |
| `@radix-ui/react-*` | Headless accessible UI primitives (dialogs, dropdowns, toasts) — installed per-component, styled with Tailwind |
| `deck.gl` | Advanced data visualization (optional) |
| `@turf/turf` | Geodesic distance, geometry operations |
| `@openbeta/sandbag` | Climbing grade conversion/comparison across systems (YDS, French, UIAA, etc.) |
| `threebox` (`three.js` Mapbox integration) | 3D model rendering (glTF wall meshes) as custom Mapbox layers |

### External Services

Posture, not pricing — quotas and dollar figures drift and the vendor pages are canonical. The shape we care about architecturally is *commercial / community / public-data* and whether traffic can leave the free tier without our consent.

| Service | Used for | Commercial posture |
|---|---|---|
| [Mapbox](https://www.mapbox.com/pricing) | Web + mobile base maps, terrain, Directions (walking profile, proxied) | Free tier + pay-as-you-go beyond it. Overage is silent (bills accrue); set a [usage cap](https://docs.mapbox.com/help/dive-deeper/usage-cap/) |
| [MapTiler](https://www.maptiler.com/cloud/plans/) | Alternative web base maps via MapTiler SDK (MapLibre-based); terrain, geocoding, weather | Free tier + paid subscriptions. Free tier pauses rather than overages — no surprise bill, but maps stop |
| [Open-Meteo](https://open-meteo.com/en/pricing) | Weather, wind, snow depth, freezing level | Free for non-commercial; paid above a daily-call threshold. No key on the free path |
| [Copernicus Sentinel Hub](https://www.sentinel-hub.com/pricing/) | Seasonal Sentinel-2 satellite mosaics (proxied; *deferred* until pre-rendered to PMTiles on R2 — see [Seasonal Satellite Imagery](#seasonal-satellite-imagery)) | Free tier + paid; on-demand WMS is not viable for production tile traffic, hence the pre-render plan |
| [Windy](https://api.windy.com/) | Webcam thumbnails near a coordinate | Free tier (thumbnails, short URL expiry, link-back required); paid tier for full images |
| [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/) | Device sync — activity pull + course push (Phase 5) | Free with approval (~2 business days). OAuth 2.0 + PKCE |
| [Terra API](https://tryterra.co/) | Future aggregator for non-Garmin devices (COROS, Polar, Apple Health, …) | Tiered free + paid; webhooks instead of polling |
| OpenSkiData / Liftie (US) / OpenBeta | Ski pistes, lifts, climbing routes | Community / open data — free, self-hostable; license attribution required (ODbL / MIT / CC BY-SA) |
| Avalanche services (avalanche.org, SLF, ALBINA) | Avalanche danger zones + bulletins | Public data — free; CC BY 4.0 or equivalent; per-source attribution |
| National mapping agencies (swisstopo, IGN, basemap.at, BKG, Kartverket, USGS) | Country topographic base maps | Free public WMTS / XYZ endpoints; per-agency attribution. See [Country-Specific Topographic Maps](#country-specific-topographic-maps) |
| OpenTopoMap | Worldwide community topo base | Free, fair-use rate limit (~2 req/sec); we proxy and cache to respect it. CC-BY-SA |
| [Copernicus HR-WSI](https://land.copernicus.eu/en/products/snow/high-resolution-snow-and-ice-monitoring) / [NOAA NOHRSC](https://www.nohrsc.noaa.gov/) | Satellite-derived snow cover (Europe / US) | Free public data |

**Free-tier exposure to monitor**: Mapbox (the only one that silently bills), MapTiler (limit pauses maps — visible failure mode), Windy (link-back requirement is a compliance constraint, not a billing one). Everything else either bills predictably (Garmin requires onboarding before any traffic flows) or is public-data with attribution as the only cost.

---

## System Architecture

```
┌─────────────┐   ┌─────────────┐
│  React Web  │   │React Native │
│  (Vite)     │   │  (mobile)   │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                │  HTTPS
                v
        ┌───────────────┐
        │   API Gateway  │
        │   / Router     │
        └───────┬───────┘
     ┌──────────┼──────────┐
     v          v          v
┌─────────┐┌─────────┐┌─────────┐
│Core API ││ Geo/Map ││ Ingest  │
│         ││ Service ││Pipeline │
│- Auth   ││- Tiles  ││- Weather│
│- Users  ││- Routes ││- Avy    │
│- Trips  ││- Terrain││- Lifts  │
│- Social ││- Layers ││- Wind   │
└────┬────┘└────┬────┘└────┬────┘
     │          │          │
     v          v          v
┌──────────────────────────────┐
│  PostgreSQL (TimescaleDB +   │
│  PostGIS extensions)         │
└──────────────────────────────┘
     │
     v
┌─────────┐  ┌─────────────┐  ┌─────────┐
│  Redis  │  │ Meilisearch │  │S3 / R2  │
│ (cache) │  │ (Phase 11)  │  │ (files) │
└─────────┘  └─────────────┘  └─────────┘
```

All backend components run as a **single Go binary** (modular monolith). Package boundaries enforce separation. The ingest pipeline runs as background goroutines or a scheduled job within the same process.

> **Current vs. planned services.** PostgreSQL + Redis are deployed today. Meilisearch is added in Phase 11 (Search & Discovery) — the API's health check already accounts for it conditionally (reported only when `MEILI_URL` is configured). S3 / R2 storage is wired up in Phase 4 (Activity uploads).

---

## Monorepo Structure

```
mtamta/
├── apps/
│   ├── web/                  # React + Vite web application
│   │   ├── src/
│   │   │   ├── components/   # React components
│   │   │   ├── pages/        # Route-level pages
│   │   │   ├── hooks/        # Custom React hooks
│   │   │   ├── stores/       # Zustand stores
│   │   │   ├── map/          # Map-specific components and logic
│   │   │   └── lib/          # Utilities
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   # apps/mobile/ — Phase 7 (React Native)
│   │
│   └── api/                  # Go backend
│       ├── cmd/
│       │   ├── server/
│       │   │   └── main.go   # Entry point
│       │   # cmd/tilegen/ — Phase 8 (terrain analysis CLI)
│       ├── internal/
│       │   ├── auth/         # Authentication (OAuth, JWT)
│       │   ├── user/         # User management
│       │   ├── activity/     # Activity CRUD, GPX parsing
│       │   ├── social/       # Follow, likes, comments
│       │   ├── geo/          # Geospatial operations
│       │   ├── terrain/      # Terrain analysis, tile generation
│       │   ├── ingest/       # Data ingestion pipeline
│       │   ├── search/       # Search integration
│       │   ├── integration/ # Device integrations (Garmin, future providers)
│       │   ├── climbing/      # Climbing route/crag/topo management
│       │   ├── storage/      # S3/file storage
│       │   ├── middleware/    # HTTP middleware
│       │   └── config/       # Configuration
│       ├── pkg/              # Shared utilities (exported)
│       ├── migrations/       # Database migrations
│       ├── go.mod
│       ├── go.sum
│       └── railway.toml      # Railway deploy config (health check path)
│
├── packages/
│   ├── shared/               # Shared TypeScript types, API client, utils
│   │   ├── src/
│   │   │   ├── types/        # Shared type definitions
│   │   │   ├── api/          # API client (fetch wrapper)
│   │   │   └── utils/        # Shared utility functions
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── map-core/             # Map config, styles, layer definitions, provider types
│   │   ├── src/
│   │   │   ├── styles/       # Provider-neutral style definitions
│   │   │   ├── layers/       # Layer configuration
│   │   │   ├── providers.ts  # MapProvider type, FeatureId, CapabilityState
│   │   │   ├── capabilities.ts # Per-provider capability matrix
│   │   │   └── config.ts     # Map defaults, viewport config
│   │   └── package.json
│   │
│   # packages/ui/ — created when shared component logic emerges between web and mobile (Phase 7+)
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # CI/CD: test, build, lint, deploy
│       └── backup.yml          # Scheduled database backup to R2
│
├── data/                     # Seed data, migration scripts
│
├── turbo.json                # Turborepo configuration
├── package.json              # Root package.json (workspaces)
├── docker-compose.yml        # Local development services (TimescaleDB+PostGIS, Redis)
├── Architecture.md           # This file
└── Plan.md                   # Implementation plan
```

---

## Backend (Go)

### Modular Monolith Package Layout

The backend is organized as a **modular monolith**: a single binary with well-defined internal package boundaries. Each domain package owns its handlers, service logic, and repository layer.

```
apps/api/internal/
├── auth/
│   ├── handler.go        # HTTP handlers (POST /auth/google, etc.)
│   ├── service.go        # Token verification, JWT issuance
│   ├── google.go         # Google ID token verification
│   ├── apple.go          # Apple ID token verification (JWKS)
│   ├── jwt.go            # JWT creation and validation
│   └── repository.go     # auth_providers table operations
├── user/
│   ├── handler.go        # HTTP handlers (GET /users/:id, etc.)
│   ├── service.go        # User business logic
│   └── repository.go     # users table operations
├── activity/
│   ├── handler.go        # HTTP handlers (CRUD)
│   ├── service.go        # Activity logic, GPX parsing
│   ├── gpx.go            # GPX file parsing
│   └── repository.go     # activities table operations
├── social/
│   ├── handler.go        # Follow, like, comment handlers
│   ├── service.go        # Social logic
│   └── repository.go     # Social table operations
├── geo/
│   ├── handler.go        # Geospatial query handlers
│   ├── service.go        # Route/POI operations
│   └── repository.go     # PostGIS queries
├── terrain/
│   ├── handler.go        # Tile/terrain endpoints
│   ├── slope.go          # Slope angle calculation
│   ├── exposure.go       # Sun/shade analysis
│   ├── tilegen.go        # Raster tile generation
│   ├── aspect.go         # Aspect (slope direction) calculation
│   └── avy_slope.go      # Avalanche slope filter tiles
├── ingest/
│   ├── scheduler.go      # Background job scheduling
│   ├── weather.go        # Weather data fetcher
│   ├── avalanche.go      # Avalanche report fetcher
│   ├── lifts.go          # Ski lift status fetcher
│   ├── wind.go           # Wind data fetcher
│   ├── snow.go           # Snow depth fetcher
│   ├── skidata.go        # OpenSkiData daily export
│   ├── webcams.go        # Windy webcam API
│   ├── snow_cover.go     # Satellite snow cover (HR-WSI, NOHRSC)
│   └── openbeta.go       # OpenBeta climbing data monthly sync
├── search/
│   ├── handler.go        # Search endpoints
│   └── service.go        # Meilisearch integration
├── integration/
│   ├── handler.go        # HTTP handlers for /api/v1/integrations/*
│   ├── service.go        # Provider orchestration, sync logic
│   ├── repository.go     # device_providers, synced_activities tables
│   ├── provider.go       # Provider interface definition
│   ├── oauth.go          # Server-side OAuth helpers (PKCE, state)
│   ├── crypto.go         # AES-GCM token encryption
│   ├── fit.go            # FIT file parsing → trackpoints
│   ├── scheduler.go      # Sync scheduler (integrates with ingest pipeline)
│   └── garmin/
│       ├── garmin.go     # Garmin Provider implementation
│       ├── activities.go # Garmin Activity API client
│       ├── courses.go    # Garmin Courses API client
│       └── oauth.go      # Garmin OAuth 2.0 + PKCE details
├── climbing/
│   ├── handler.go        # HTTP handlers (crags, climbing routes, topos)
│   ├── service.go        # Climbing route/crag/topo business logic
│   ├── repository.go     # climbing_routes, crag_topos, activity_segments tables
│   ├── grades.go         # Grade normalization and comparison (server-side)
│   └── topo.go           # Photo topo overlay processing and validation
├── storage/
│   └── s3.go             # S3-compatible upload/download
├── middleware/
│   ├── auth.go           # JWT authentication middleware
│   ├── cors.go           # CORS configuration
│   ├── logging.go        # Request logging
│   ├── ratelimit.go      # Rate limiting
│   └── requestid.go      # Request ID generation & propagation
└── config/
    └── config.go         # Environment-based configuration
```

### Router, Middleware, Handler Pattern

```
Request → Router → Middleware Chain → Handler → Service → Repository → DB
                                                    ↑
                                              Domain logic
```

- **Router**: Standard library `net/http` mux (or chi/gorilla) maps URL patterns to handler functions.
- **Middleware**: Wraps handlers to add cross-cutting concerns (auth, logging, CORS, rate limiting). Applied per-route or globally.
- **Handler**: Parses HTTP request, calls service layer, writes HTTP response. No business logic.
- **Service**: Business logic. Coordinates between repositories, external APIs, and other services.
- **Repository**: Database access. SQL queries, PostGIS operations.

### API Design & Conventions

- **REST** with versioned URLs: `/api/v1/...`
- JSON request/response bodies
- Bearer token authentication via `Authorization` header
- All timestamps in API responses are ISO 8601 UTC. Clients convert to user's local timezone. No server-side timezone preference
- Additive changes (new optional response fields) don't require version bump. Breaking changes (field removal/rename, behavior change) require new version. v1 supported 12 months after v2

**Error Response Format**:

```json
{
  "error": {
    "code": "INVALID_GPX",
    "message": "GPX file contains no track points",
    "details": { "field": "gpx_file" }
  }
}
```

Machine-readable codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`, `CONFLICT`, `INVALID_GPX`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `SERVER_ERROR`.

**HTTP Status Codes**:

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No Content (deletes) |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 422 | Unprocessable Entity (validation) |
| 429 | Rate Limited |
| 500 | Internal Server Error |

**Pagination**:

- **Cursor-based** for time-ordered feeds: `?cursor={opaque}&limit=20`. Response: `{ "data": [...], "next_cursor": "...", "has_next": true }`
- **Offset-based** for static lists: `?offset=0&limit=20`. Response: `{ "data": [...], "total": 142 }`
- Default limit: 20. Max limit: 100

**Rate Limiting**:

- Authenticated: 100 req/min global, 10 req/min for expensive operations (search, file upload)
- Tile proxy: 500 req/min (map tile loading requires burst capacity)
- Unauthenticated: 20 req/min global
- Device sync: 1 manual sync per 5 min (already specified)
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 response with `Retry-After` header

**CORS**:

- Allowed origins: `WEB_ORIGIN` env var + `localhost:5173` in development
- Allowed methods: GET, POST, PATCH, DELETE, OPTIONS
- Allowed headers: Authorization, Content-Type, X-Request-ID
- Exposed headers: X-Request-ID, X-RateLimit-Remaining
- Credentials: true
- Max age: 86400 (24h)

**File Uploads**:

- GPX: max 50MB, validates XML structure
- Photos: max 10MB per file, max 50 per activity. Types: JPEG, PNG, WebP. Magic byte validation. EXIF GPS stripped for privacy
- FIT: max 50MB
- Avatars: max 5MB, JPEG/PNG/WebP
- Presigned upload URLs valid 1h. Download URLs valid 24h

### Security & Validation

**Input Validation**:

- Handler layer validates all inputs using struct tags (`go-playground/validator`)
- Text limits: title 200 chars, description 5000, comment 2000, bio 500, display_name 50
- Activity types validated against canonical list
- Geospatial: bbox validated (min < max, within -180/180 lng, -90/90 lat)
- All validation errors return 422 with field-level details

**SQL Injection Prevention**: Parameterized queries only. Go `database/sql` enforces this. No string interpolation for SQL.

**XSS Prevention**: All user text stored raw, escaped on output. React's JSX auto-escaping handles web. No rich text / HTML input.

**CSP Headers**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.mapbox.com *.cloudflare.com; connect-src 'self' api.mapbox.com *.sentry.io; worker-src 'self' blob:`

**File Validation**: Check magic bytes server-side (not just extension). Reject executables. Strip EXIF GPS from photos. Validate GPX XML schema. Validate FIT file header magic bytes.

### Testing

**Testing Philosophy**: Test the important parts thoroughly. Don't chase 100% coverage on HTTP handlers — focus coverage on business logic, parsing, and geospatial operations.

**Go Backend**:

- **Unit tests**: Table-driven tests for: auth token verification (valid/expired/malformed), GPX parsing (valid track, empty, multi-segment, malformed XML), FIT parsing (activity types, multi-pitch detection, corrupt files), grade normalization, distance/elevation calculation, OAuth token encryption/decryption
- **Integration tests**: Use `testcontainers-go` or CI service containers for PostGIS. Test full flows: auth → create activity → query by bbox → verify PostGIS spatial query. Test migration up/down for all migrations
- **Repository tests**: Test PostGIS spatial queries with real data (point-in-polygon, bbox intersection, nearest neighbor)
- **Coverage target**: 80% on `internal/` packages. Handler layer tested via integration tests, not unit tests
- **Mocking**: Interface-based. Each service depends on repository interfaces, injected in tests. No global mocks

**Frontend (Web)**:

- **Unit tests**: Vitest for `packages/shared` logic (API client, type validation, utility functions)
- **Component tests**: React Testing Library for key interactive components (GpxUploader, Sidebar, SearchBar)
- **No snapshot tests**: They add noise, break on every UI change, and catch nothing meaningful

**E2E Tests** (Phase 13):

- Playwright for critical user flows: sign in → create activity (GPX upload) → view on map → like → search → find activity
- Run against staging environment
- 5 core scenarios, not exhaustive

**CI Integration**:

- `go test ./...` runs on every push/PR (already configured)
- `npx vitest run` for frontend tests
- Tests must pass before merge. No coverage gate initially — add when test suite is mature
- Integration tests run in CI with PostGIS service container (already configured)

### Authentication Architecture

**Strategy**: Self-built OAuth verification + JWT issuance in Go. Only Google and Apple Sign-In for now, with a provider-agnostic user model that supports adding email+password later.

**OAuth Flow**:

```
┌──────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Client│     │Google/   │     │  Go API  │     │PostgreSQL│
│ App  │     │Apple SDK │     │          │     │          │
└──┬───┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
   │              │                │                 │
   │─── Login ───>│                │                 │
   │              │                │                 │
   │<── ID Token ─│                │                 │
   │              │                │                 │
   │──── POST /api/v1/auth/google ─>                 │
   │      { id_token: "..." }     │                  │
   │              │                │                  │
   │              │                │── Verify token ──>
   │              │                │   (Google JWKS)  │
   │              │                │                  │
   │              │                │── Find/create ──>│
   │              │                │   user + auth    │
   │              │                │   provider       │
   │              │                │<── user record ──│
   │              │                │                  │
   │<── { access_token, user } + Set-Cookie: refresh_token ─│
   │              │                │                  │
```

1. Client obtains ID token from Google/Apple native SDK
2. Client sends ID token to `POST /api/v1/auth/google` (or `/auth/apple`)
3. Backend verifies the ID token:
   - **Google**: Verify JWT signature against Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`)
   - **Apple**: Verify JWT signature against Apple's JWKS (`https://appleid.apple.com/auth/keys`)
4. Backend extracts `sub` (subject/provider UID) and `email` from the verified token
5. Backend finds or creates a `user` + `auth_providers` record
6. Backend issues a short-lived access token (JWT) in the JSON body and a long-lived refresh token in an `HttpOnly` cookie
7. Client stores the access token in memory and sends it on every request via `Authorization: Bearer <token>`. The refresh cookie is sent automatically by the browser to `/api/v1/auth/refresh` and `/api/v1/auth/logout`

**Token Details**:
- Access token: JWT, 15-minute expiry, contains `user_id` and `email`. Returned in the JSON response body. Client stores in memory only (never `localStorage`)
- Refresh token: Opaque random string, 30-day expiry, stored hashed in Redis (`user_session:{sha256(token)}`, 30-day TTL) as the sole store. Delivered to the browser as a cookie: `refresh_token; HttpOnly; Secure (prod); SameSite=Lax; Path=/api/v1/auth; Max-Age=2592000`. Scoping to `/api/v1/auth` keeps the cookie off every other request; `SameSite=Lax` blocks cross-site CSRF on POST while still allowing the user's first-party return. JavaScript cannot read the cookie. Revocation: delete the Redis entry (logout, admin action)
- Rotation: None for now — refresh-token rotation would invalidate concurrent tabs without giving meaningful security uplift while the token lives in an `HttpOnly` cookie. Revisit if a session-stealing threat model emerges
- Cross-origin: the web app calls a different subdomain (`api.mtamta.app` ↔ `mtamta.app`), so refresh/logout requests are sent with `credentials: 'include'` and the API responds with `Access-Control-Allow-Credentials: true` and a specific (non-`*`) `Access-Control-Allow-Origin`

### Database Schema — Auth

```sql
-- Extensions (required — timescaledb-ha image includes but does not auto-enable)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Core user record (provider-agnostic)
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name  TEXT NOT NULL,
    email         TEXT UNIQUE,
    avatar_url    TEXT,
    bio           TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

-- OAuth provider links (Google, Apple)
CREATE TABLE auth_providers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,  -- 'google' | 'apple'
    provider_uid  TEXT NOT NULL,  -- 'sub' claim from ID token
    email         TEXT,
    refresh_token TEXT,           -- provider's refresh token (if needed)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_uid)
);

-- Future: email + password authentication
-- CREATE TABLE credentials (
--     id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--     password_hash TEXT NOT NULL,  -- bcrypt
--     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
```

---

## Frontend — Web

### Stack

- **React 19** with TypeScript 6.0
- **Vite 8** (Rolldown) for development and builds
- **Mapbox GL JS 3.x / MapTiler SDK** for map rendering (runtime-selected)
- **Zustand 5** for state management
- **React Router 7** for routing
- **Vitest 4** for testing

### Map Integration

The web app is centered around an interactive map. **Current state (Phase 3.5 — shipped)**: a dual-provider architecture where users select Mapbox or MapTiler after login, and the app lazy-loads only the chosen provider runtime. The selection is persisted in `localStorage` so the gate only appears on first use (or after clearing). A "Change map provider" option is available in Settings.

**Provider-neutral runtime dispatch:**
- Post-login provider selection (stored in `localStorage`, surfaced via `mapStore`)
- Lazy-loaded provider runtimes: `runtime/mapbox/` or `runtime/maptiler/`
- Shared app-owned layers (activity tracks, raster overlays) target an `AppMapAdapter` type interface — not the raw vendor SDK — covering source/layer lifecycle, slot-based layer ordering (`addLayer(layer, { slot })`), viewport reads, and interaction events
- Provider-specific features (search, weather, directions) live inside each runtime module
- Capability matrix (`providerCapabilities.ts`) gates UI controls: `available`, `coming_soon`, or `unsupported`

See [`MapProviders.md`](MapProviders.md) for the detailed implementation spec (adapter interface, runtime file structure, capability matrix, testing strategy).

**Implementation requirements (apply to each provider runtime's `MapContainer.tsx`):**
- Use `useRef` + `useEffect` pattern — store map instance in a ref, initialize in `useEffect(fn, [])`. The map persists for the lifetime of `AppLayout` (not remounted on sidebar or panel changes). Return a cleanup function that calls `map.remove()` only when `AppLayout` itself unmounts to prevent WebGL context leaks
- Mapbox runtime: import `'mapbox-gl/dist/mapbox-gl.css'`; pass `accessToken` in the Map constructor (v3.x)
- MapTiler runtime: import `'@maptiler/sdk/dist/maptiler-sdk.css'`; pass API key in the Map constructor
- `VITE_MAPBOX_ACCESS_TOKEN` must be a public `pk.*` token with URL restrictions; `VITE_MAPTILER_API_KEY` is the MapTiler API key

**Layer ordering — user content must render on top:**
All app-generated layers (activity tracks, waypoints, user position) must be added after the base style loads and placed via `AppMapAdapter.addLayer(layer, { slot })` — the Mapbox runtime maps the slot to a Mapbox Standard slot (`top` for user content), the MapTiler runtime derives an equivalent `beforeId` — so they sit above POI symbols. A track line covering a café icon is acceptable; a POI icon covering a track line is not.

```
┌───────────────────────────────────────┐
│ ┌─────┐                    ┌───────┐ │
│ │Nav  │                    │Search │ │
│ │Bar  │                    │Panel  │ │
│ ├─────┤                    └───────┘ │
│ │     │                              │
│ │Side │   MAP (Mapbox / MapTiler)    │
│ │Panel│                              │
│ │     │                    ┌───────┐ │
│ │     │                    │Layer  │ │
│ │     │                    │Toggle │ │
│ └─────┘                    └───────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Bottom Bar (zoom, 3D, location)  │ │
│ └──────────────────────────────────┘ │
└───────────────────────────────────────┘
```

### State Management (Zustand)

Key stores (`mapStore` and `authStore` exist today; the rest land with their phases):
- **`mapStore`** — viewport (center, zoom, bearing, pitch), active layers, selected features, selected map provider
- **`authStore`** — current user, tokens, login/logout actions
- **`activityStore`** *(Phase 4)* — active activity, activity list, filters
- **`uiStore`** *(planned)* — panel states, modals, loading indicators

### Map Layer System

Layers are toggled via the UI and managed through the shared `map-core` package. Full layer specifications (sources, APIs, formats) are in the [Map & Geospatial](#map--geospatial) section.

| Category | Layer | Type | Source |
|---|---|---|---|
| **Base** | Topographic | Vector | Topographic base style (Mapbox Standard "Outdoors" custom style / MapTiler Outdoor v2) |
| **Base** | Satellite | Raster | Satellite base style (Mapbox Standard Satellite / MapTiler Satellite) |
| **Base** | Country Topographic | Raster (WMTS/XYZ) | National mapping agency tiles, explicitly selected via sidebar cards (swisstopo, IGN, basemap.at, BKG, Kartverket, USGS); OpenTopoMap as a worldwide topo card; Satellite Summer is the app default |
| **Base** | Satellite — Summer | Raster (WMS) | Sentinel-2 via Copernicus Sentinel Hub (Jun–Aug composite, 10m, MAXCC=20); proxied through backend — *deferred, not yet enabled* |
| **Base** | Satellite — Winter | Raster (WMS) | Sentinel-2 via Copernicus Sentinel Hub (Dec–Feb composite, 10m, MAXCC=30); proxied through backend — *deferred, not yet enabled* |
| **Base** | 3D Terrain | DEM | Provider DEM (Mapbox Terrain-DEM v1 / MapTiler Terrain RGB v2) |
| **Mode** | Winter style | Style switch | MapTiler `winter-v2` (native); Mapbox — Outdoors Winter (custom style on Mapbox Standard) |
| **Mode** | Summer style | Style switch | MapTiler `outdoor-v2`; Mapbox — Outdoors (custom style on Mapbox Standard) |
| **Overlay** | Slope angle | Raster tiles | Copernicus GLO-30 DEM (pre-generated) + Mapbox Terrain RGB (client-side fallback) |
| **Overlay** | Sun/shade exposure | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Overlay** | Steep/flat terrain | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Overlay** | Aspect (slope direction) | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Overlay** | Avalanche slope filter | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Data** | Activity tracks | GeoJSON | mtamta API (`/api/v1/map/activities`) |
| **Data** | Ski runs & lifts | GeoJSON | OpenSkiData (openskimap.org), daily export |
| **Data** | Hiking trails | GeoJSON | OSM via Overpass API |
| **Data** | Climbing areas | GeoJSON | OSM via Overpass API |
| **Data** | Ski pistes (overlay) | Raster tiles | OpenSnowMap (`tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png`), CC BY-SA |
| **Live** | Weather | JSON → markers | Open-Meteo (`api.open-meteo.com/v1/forecast`) |
| **Live** | Wind | JSON → arrows | Open-Meteo (same endpoint) |
| **Live** | Snow depth | JSON → overlay | Open-Meteo (same endpoint) |
| **Live** | Avalanche danger | GeoJSON | avalanche.org (US) / SLF (CH) / ALBINA (Tyrol) |
| **Live** | Lift status | JSON | Liftie (US) / custom scrapers (EU) |
| **Live** | Webcams | JSON | Windy API v3 |
| **Tool** | Elevation point query | Popup | Client-side Mapbox Terrain RGB decode |
| **Tool** | Distance measurement | Interactive overlay | turf.js geodesic distance |
| **Tool** | Custom terrain filter | Dynamic overlay | Client-side Mapbox Terrain RGB decode (WebGL) |
| **Tool** | Route planner | Interactive overlay | Draw waypoints → Mapbox Directions API (walking profile, proxied; Mapbox provider); MapTiler equivalent planned |

---

## Frontend — Mobile

### Stack

- **React Native** (bare or Expo)
- **`@rnmapbox/maps`** for Mapbox integration (future: MapLibre React Native as alternative — provider types in `map-core` are already mobile-compatible)
- **React Navigation** for screen routing
- Shared `packages/shared` for types, API client, and utilities
- Shared `packages/map-core` for map configuration and layer definitions

### Shared Code with Web

| Package | Contents | Used By |
|---|---|---|
| `packages/shared` | TypeScript types, API client, validation | Web + Mobile |
| `packages/map-core` | Map styles, layer configs, provider types, capability matrix | Web + Mobile |
| `packages/ui` | Platform-agnostic component logic (Phase 7+) | Web + Mobile |

### Offline Capabilities (Phase 7)

- Download map tile regions for offline use via Mapbox offline API
- Cache activity data locally (SQLite or AsyncStorage)
- Queue actions (likes, comments) for sync when back online
- GPS track recording works fully offline

### Performance Considerations

- If map performance becomes a bottleneck on React Native, specific map-heavy screens can be ejected to native code
- Lazy-load screens and heavy components
- Minimize bridge traffic between JS and native map layer

---

## Map & Geospatial

**Geographic priority**: Alps + North America + Scandinavia first, eventually worldwide. Country-specific topographic maps from national mapping agencies provide higher detail than Mapbox Outdoors for priority regions.

### Map Provider Architecture (Phase 3.5)

> **Note**: This architecture shipped in Phase 3.5. See `apps/web/src/map/runtime/` for the per-provider runtime modules and `apps/web/src/map/runtime/shared/mapAdapter.ts` for the shared `AppMapAdapter`.

The web app supports dual map providers (Mapbox and MapTiler) with runtime selection. Users choose a provider after login; the choice is persisted in `localStorage`. Each provider has its own lazy-loaded runtime module with provider-specific SDK usage. Shared app-owned layers (activity tracks, raster overlays) target a narrow `AppMapAdapter` interface so they work with both providers without duplication.

See [`MapProviders.md`](MapProviders.md) for the full implementation reference: adapter interface, runtime file structure, capability matrix, phased rollout plan, and testing strategy.

### Mapbox Tilesets Used (+ MapTiler Equivalents)

| Tileset | ID | Type | Purpose |
|---|---|---|---|
| Streets v8 | `mapbox.mapbox-streets-v8` | Vector | Roads, landuse, water, labels, POIs |
| Terrain v2 | `mapbox.mapbox-terrain-v2` | Vector | Contour lines (10m at z14+), hillshade polygons, landcover |
| Terrain-DEM v1 | `mapbox.mapbox-terrain-dem-v1` | Raster DEM | 3D terrain rendering (0.1m precision, max z14) |
| Satellite | `mapbox.satellite` | Raster | Aerial/satellite imagery (50cm global) |

### Base Map Styles

| Style | URL | Usage |
|---|---|---|
| Mapbox — Outdoors / Outdoors Winter | `mapbox://styles/kankava/…` — custom styles on Mapbox Standard | Default topo base; season-aware pair (Phase 3.5 M3) |
| Mapbox — Satellite | `mapbox://styles/mapbox/standard-satellite` | Mapbox Standard Satellite |
| MapTiler — Outdoor / Winter | `outdoor-v2` / `winter-v2` | MapTiler topo base; season-aware pair |
| MapTiler — Satellite | `hybrid` | MapTiler satellite with roads + labels |
| OpenTopoMap | `https://tile.opentopomap.org/{z}/{x}/{y}.png` | Outdoor-focused manually-selectable topo source (raster XYZ, max z17, CC-BY-SA) |
| Sentinel-2 Summer | Copernicus Sentinel Hub WMS (proxied) | Seasonal satellite composite: Jun–Aug, 10m, MAXCC ≤20% |
| Sentinel-2 Winter | Copernicus Sentinel Hub WMS (proxied) | Seasonal satellite composite: Dec–Feb, 10m, MAXCC ≤30% |

**Country-specific topo sources**: National mapping agency topo maps are available as additional base layer options for priority regions (Switzerland, France, Austria, Germany, Norway, USA). Explicitly selected via sidebar cards (not auto-selected). See [Country-Specific Topographic Maps](#country-specific-topographic-maps) in the Layer Catalog.

**Access token**: Stored in environment variables, loaded via `packages/map-core`.

### Tile Formats — Raster vs Vector

| Layer | Format | Rationale |
|---|---|---|
| Provider base styles (Mapbox Standard, MapTiler) | Vector | Crisp at any zoom, smooth, restyleable — and it is what the providers ship |
| Country topo overlays (swisstopo, IGN, BKG, Kartverket, USGS, OpenTopoMap) | Raster | Each card's value is the *official national map* of that country; the agencies' classic topo products (e.g. swisstopo's Landeskarte) are raster. Raster reproduces that cartography exactly and overlays trivially (image + opacity, slot ordering) |
| App-owned data (activity tracks, markers — Phase 4+) | Vector | GeoJSON sources + vector layers — interactive and restyleable |

**Decision — country topo stays raster.** The national agencies do publish vector tiles (e.g. swisstopo's newer "Base Map" line), but those are a separate, more streamlined product — *not* a vector rendering of the classic national map. Switching would change *which* map is shown, not just the format, and the "official national map" identity is the whole point of the country cards. Vector is used where it genuinely pays off: the provider base style and app-owned data.

### 3D Terrain Configuration

Both providers support 3D terrain with different DEM sources:

| Provider | DEM Source | Tile Size | Max Zoom | Decoding |
|---|---|---|---|---|
| Mapbox | `mapbox.mapbox-terrain-dem-v1` (Terrain-DEM v1) | 512px | 14 | `height = -10000 + ((R × 256 × 256 + G × 256 + B) × 0.1)` |
| MapTiler | MapTiler Terrain RGB v2 | 512px | 12 | Terrarium encoding: `height = (R × 256 + G + B / 256) − 32768` |

- **Default exaggeration**: 1.5 (adjustable via UI slider)
- **Atmosphere**: Mapbox Standard renders sky/atmosphere natively in 3D — the pre-3.5 custom `sky` layer was removed

Mapbox GL JS, MapTiler SDK, and `@rnmapbox/maps` all support 3D terrain natively. Combined with custom pitch/bearing controls for immersive flyover views.

### Layer Architecture

```
┌─────────────────────────────┐
│       UI Layer Controls     │  ← User toggles layers on/off
├─────────────────────────────┤
│      Live Data Layers       │  ← Weather, wind, snow, avalanche, lifts, webcams
├─────────────────────────────┤
│      Data Layers            │  ← Activities, ski runs, hiking trails, climbing areas
├─────────────────────────────┤
│      Terrain Overlays       │  ← Slope angle, sun exposure, steep/flat (custom tiles)
├─────────────────────────────┤
│      Mode                   │  ← Winter / Summer style applied on top of base
├─────────────────────────────┤
│      Base Layer             │  ← Topographic (Mapbox / MapTiler / country-specific / OpenTopoMap) OR Satellite
├─────────────────────────────┤
│      Terrain (3D)           │  ← DEM-based terrain exaggeration
└─────────────────────────────┘
```

### Layer Catalog

#### Base Layers (mutually exclusive)

| Layer | Source | Notes |
|---|---|---|
| Topographic | Mapbox Standard "Outdoors" custom style / MapTiler Outdoor v2 | Default outdoor base. Contours, hillshade, trails, peaks |
| Satellite | Mapbox Standard Satellite / MapTiler Satellite | Toggle replaces base style |

#### Country-Specific Topographic Maps

National mapping agencies provide high-detail topographic maps that significantly exceed Mapbox Outdoors quality for their respective regions. These are added as raster tile sources (WMTS/XYZ) and function as alternative base layers within the "Topographic" category. Satellite Summer is the app default basemap; Mapbox Outdoors and OpenTopoMap are manually selectable outdoor-focused topo options.

| Source | Region | Tile URL / Endpoint | Type | Max Zoom | API Key | License |
|---|---|---|---|---|---|---|
| swisstopo | Switzerland | `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg` | XYZ (JPEG) | z22 | No | Free with attribution |
| swisstopo (winter) | Switzerland | `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe-winter/default/current/3857/{z}/{x}/{y}.jpeg` | XYZ (JPEG) | z22 | No | Free with attribution |
| IGN Géoplateforme | France | WMTS via `data.geopf.fr` (`GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` layer) | WMTS | z18 | No (public endpoint) | Free with attribution |
| basemap.at | Austria | WMTS via `basemap.at` (bmaphidpi layer) | WMTS | z19 | No | CC-BY 4.0 |
| BKG TopPlusOpen | Germany | `https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png` | WMTS (PNG) | z18 | No | DL-DE-BY 2.0 |
| Kartverket | Norway | XYZ via `cache.kartverket.no` (topo layer) | XYZ (PNG) | z18 | No | CC-BY 4.0 |
| USGS National Map | USA | WMTS via `basemap.nationalmap.gov` (USGSTopo layer) | WMTS | z16 | No | Public domain |
| OpenTopoMap | Global | `https://tile.opentopomap.org/{z}/{x}/{y}.png` | XYZ (PNG) | z17 | No | CC-BY-SA 3.0 |

**Selection model**: Topo overlays load only when the user explicitly selects a topo card in the sidebar. The Global Summer/Winter cards set `topoSource: null`, showing the provider's outdoor base style without any raster overlay.

1. **Country-specific source** — user selects a country topo card (e.g. swisstopo, IGN)
2. **OpenTopoMap** — worldwide topo card (`topoSource: 'opentopomap'`), proxied through the backend; the third card in the Global topo group
3. **Provider outdoor base** — Mapbox Standard "Outdoors" / MapTiler Outdoor v2 when no topo card is selected

OpenTopoMap renders identically in both providers via the shared `AppMapAdapter` raster-overlay path.

> **Why raster?** Country topo sources are pre-rendered cartographic products from national mapping agencies. Using their raster tiles gives expert-quality cartography (contour styling, hillshading, trail symbols, local labels) with zero styling effort. Vector tile alternatives exist for some providers but would require building and maintaining per-country Mapbox GL style specs — significant effort for marginal benefit when the goal is to overlay national topo quality on the Mapbox vector basemap.

> **Future: vector tile migration.** 5 of 7 providers now offer vector tiles (PBF): swisstopo (Light Base Map via `vectortiles10.geo.admin.ch`), IGN (Plan IGN TMS via `data.geopf.fr`), basemap.at (via `maps.wien.gv.at/basemapv`), BKG (basemap.de via `sgx.geodatenzentrum.de`), Kartverket (landtopo pilot). OpenTopoMap has vector tiles coming soon (per their site). USGS has no vector tiles. Switching to vector would give retina-crisp rendering, smaller payloads, and the ability to style/theme topo layers — but requires per-provider Mapbox GL style specs. Consider migrating high-priority providers (swisstopo, IGN) first when raster quality on retina screens becomes a user complaint.

Country bounding boxes (approximate, stored in `packages/map-core`):

| Country | Bounding Box (SW → NE) |
|---|---|
| Switzerland | 45.82°N, 5.96°E → 47.81°N, 10.49°E |
| France | 41.33°N, -5.14°E → 51.09°N, 9.56°E |
| Austria | 46.37°N, 9.53°E → 49.02°N, 17.16°E |
| Germany | 47.27°N, 5.87°E → 55.06°N, 15.04°E |
| Norway | 57.96°N, 4.50°E → 71.19°N, 31.17°E |
| USA | 24.40°N, -124.85°W → 49.38°N, -66.89°W |

**Overlap handling**: When the viewport center falls within multiple countries' bounding boxes (e.g., border regions), prefer the source with the smallest bounding box (most specific/detailed source wins). User can always manually override via the sidebar basemap cards.

**Attribution**: Each source requires different attribution text. The map attribution control must dynamically update when the active topo source changes. Attribution strings are stored per-source in `packages/map-core`.

**Tile caching**: Proxied topo tiles are cached in Redis with a 24h TTL (these tiles change infrequently). swisstopo (summer + winter) and OpenTopoMap are proxied through the Go backend — swisstopo so the proxy can drop blank border tiles (it serves coverage well beyond Switzerland), OpenTopoMap to respect its fair-use rate limit. The remaining country sources — IGN (public key-less `PLANIGNV2` endpoint), basemap.at, BKG, Kartverket, USGS — load directly from the client. Monitor Redis memory usage; consider migrating topo tile cache to S3/disk if memory exceeds budget.

> **Why only proxied tiles are cached in Redis**: Redis only caches tiles that transit the backend. Non-proxied sources rely on the browser's HTTP cache (their upstreams send `Cache-Control` headers), which covers single-user repeat views for free. Redis adds a *cross-user* cache, which only pays off at meaningful traffic — and proxying everything would add backend egress, Redis memory, latency, and a single point of failure. Revisit if an upstream becomes unreliable or tile-URL versioning for cache invalidation is needed.

#### Seasonal Satellite Imagery

> **Status (Phase 3.5)**: deferred. The backend Sentinel proxy handler exists, but no Sentinel Hub Instance ID is configured, the frontend `satellite-winter` basemap card is disabled ("Coming soon"), and `applySentinel` is a no-op stub. The design below is retained as the target.

Copernicus Sentinel-2 imagery (10m resolution) provides seasonal satellite views via the Sentinel Hub WMS API hosted on the Copernicus Data Space Ecosystem. This supplements the default Mapbox Satellite (which is a fixed "best available" composite with no seasonal control).

**Provider**: Copernicus Data Space Ecosystem (dataspace.copernicus.eu)
**API**: Sentinel Hub WMS with `TIME` and `MAXCC` parameters
**Registration**: Free account → create Configuration Instance → get Instance ID
**Free tier**: 10,000 processing units/month, 10,000 requests/month

> **Cost reality — "free" has a catch.** Sentinel-2 *data* is genuinely free and open (EU Copernicus open-data policy — free for commercial use too). What is *not* unlimited is serving it as map tiles:
>
> - **On-demand API path** (the Sentinel Hub WMS above): the free tier is ~10k requests/month. That is tiny for tile serving — one map view pulls dozens of tiles, so even a few active users exhaust the quota fast. Fine for prototyping, **not viable for production traffic**.
> - **Pre-render + self-host path** (the actually-free production option): download the raw Sentinel-2 scenes (free), composite a Dec–Feb cloud-filtered winter mosaic once with GDAL, tile it, and host the tiles ourselves. Ongoing cost is then just storage + bandwidth (S3/R2/CDN); the imagery source is $0. The winter composite is static — regenerate ~once a year.
>
> **When this is built, prefer the pre-render path.** The WMS-proxy design below is kept for reference, but plan around self-hosted seasonal mosaics, not the on-demand free tier.

**Tile hosting (decision)**: pre-rendered seasonal mosaics are hosted as a **PMTiles** archive on **Cloudflare R2**, served via the Cloudflare CDN (a small Protomaps-style Worker fronts the `.pmtiles` file to expose a standard `{z}/{x}/{y}` endpoint, so both the Mapbox and MapTiler runtimes consume it as a plain raster source). Chosen over Mapbox/MapTiler hosted tilesets because R2 has zero egress fees, there is no per-tile-request billing, and there is no vendor lock-in. The composite is static — regenerate and re-upload (a new versioned filename) roughly once a year. This is separate from the Go tile *proxy*, which handles live upstreams (swisstopo, OpenTopoMap); pre-rendered tiles never pass through the app server.

**WMS URL template** (proxied through Go backend):
`GET /api/v1/tiles/sentinel/{z}/{x}/{y}?season=winter&year=2024`

Backend constructs WMS request:
```
https://sh.dataspace.copernicus.eu/ogc/wms/{INSTANCE_ID}?
  SERVICE=WMS&REQUEST=GetMap&LAYERS=TRUE_COLOR&
  WIDTH=256&HEIGHT=256&CRS=EPSG:3857&
  BBOX={bbox}&FORMAT=image/jpeg&
  TIME={start_date}/{end_date}&MAXCC={max_cloud_cover}
```

| Season | TIME parameter | MAXCC | Notes |
|---|---|---|---|
| Summer | {year}-06-01/{year}-08-31 | 20 | Green, snow-free terrain |
| Winter | {year}-12-01/{year+1}-02-28 | 30 | Snow-covered terrain (higher cloud tolerance) |

**Resolution**: Sentinel-2 is 10m vs Mapbox Satellite's 30–50cm. No auto-fade — seasonal imagery is available at all zoom levels for consistent seasonal view. User can manually switch to Mapbox Satellite for higher resolution when needed.

**Coverage**: Global, every 5 days since June 2015.

**Caching**: Redis `sentinel:{season}:{year}:{z}:{x}:{y}` with 7-day TTL.

#### Mode (applies on top of base)

| Layer | Source | Notes |
|---|---|---|
| Winter mode | Season-aware base style (coupled seasonal switch) | Mapbox — Outdoors Winter custom Standard style; MapTiler — `winter-v2` (ski-focused POIs, winter palette). Winter is set by selecting a winter basemap card, which sets `baseLayer` + `season` + `topoSource` atomically. Overlays (pistes, ski touring, snowshoe) are *not* auto-enabled — the user toggles them in the Overlays tab; winter-only overlays simply become available once the season is winter. |
| Summer mode | Season-aware base style (coupled seasonal switch) | Mapbox — Outdoors custom Standard style; MapTiler — `outdoor-v2`. Set by selecting a summer basemap card. |

#### Terrain Overlays (toggleable, with opacity slider)

| Layer | Source | Tile Format | Generation |
|---|---|---|---|
| Slope angle | Copernicus GLO-30 DEM (AWS S3) | Raster PNG z/x/y | Pre-generated with GDAL (`gdaldem slope` → `gdaldem color-relief` → `gdal2tiles.py`). Color bands: green (0–27°), yellow (28–29°), orange (30–34°), red (35–39°), magenta (40–44°), black (45°+). Client-side fallback: decode Mapbox Terrain RGB in browser for uncovered areas |
| Sun/shade exposure | Copernicus GLO-30 DEM | Raster PNG z/x/y | Pre-generated hillshade with solar angle for given date/time. `gdaldem hillshade` with `-az` (azimuth) and `-alt` (altitude) from sun position |
| Steep/flat terrain | Copernicus GLO-30 DEM | Raster PNG z/x/y | Classified slope bands (flat <15°, moderate 15–30°, steep 30–45°, very steep >45°) |
| Aspect (slope direction) | Copernicus GLO-30 DEM | Raster PNG z/x/y | `gdaldem aspect` → `gdaldem color-relief`. Colors: N=blue, NE=light blue, E=white, SE=light orange, S=orange, SW=brown, W=black, NW=dark blue |
| Avalanche slope filter | Copernicus GLO-30 DEM | Raster PNG z/x/y | Same slope pipeline but avalanche-specific color table: yellow (25–30°), orange (30–35°), red (35–40°), dark red (40–45°+). All other angles transparent |

#### Data Layers (toggleable)

| Layer | Source | Format | Update Frequency |
|---|---|---|---|
| Ski runs & lifts | OpenSkiData (openskimap.org) | GeoJSON | Daily export. Contains run name, difficulty, type, lift type. License: ODbL |
| Hiking trails | OSM via Overpass API | GeoJSON | On-demand or periodic. Query `highway=path/footway` with `sac_scale`, `route=hiking` relations |
| Activity tracks | mtamta API (`/api/v1/map/activities`) | GeoJSON | Live. User-recorded activity tracks within viewport |
| Climbing areas | OSM via Overpass API + OpenBeta | GeoJSON | Periodic. Query `sport=climbing`, `natural=cliff`. Supplemented with OpenBeta open-license data |
| Climbing routes (crags) | mtamta API (`/api/v1/map/crags`) | GeoJSON | Live. User-contributed and OpenBeta-seeded crag locations with route counts |
| Ski touring routes (CH) | swisstopo WMTS (`ch.swisstopo-karto.skitouren`) | Raster overlay | Winter-only. Ski touring ascent/descent routes in Switzerland |
| Snowshoe routes (CH) | swisstopo WMTS (`ch.swisstopo-karto.schneeschuhrouten`) | Raster overlay | Winter-only. Snowshoe trails in Switzerland |
| Ski pistes (global) | OpenSnowMap (`tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png`) | Raster overlay | Color-coded pistes + lifts worldwide (CC BY-SA) |

#### Live Data Layers (auto-refresh)

| Layer | Source | API | Update Freq | Format |
|---|---|---|---|---|
| Weather | Open-Meteo | `api.open-meteo.com/v1/forecast` | 15 min | JSON → map markers |
| Wind | Open-Meteo | Same endpoint, `wind_speed_10m,wind_direction_10m,wind_gusts_10m` | 15 min | JSON → arrows/particles |
| Snow depth | Open-Meteo | Same endpoint, `snow_depth` variable | 1 hour | JSON → color overlay |
| Snow cover (satellite) | Copernicus HR-WSI (Europe, 20m) + NOAA NOHRSC (USA) | WMS endpoints | Daily | WMS → overlay |
| Avalanche danger (US) | avalanche.org | `api.avalanche.org/v2/public/products/map-layer` | 6 hours | GeoJSON with danger levels 1–5 + colors |
| Avalanche danger (CH) | SLF | `aws.slf.ch/api/bulletin/caaml/en/geojson` | 6 hours | CAAMLv6 GeoJSON (CC BY 4.0) |
| Avalanche danger (Tyrol) | ALBINA | `api.avalanche.report/albina/api/` | 6 hours | CAAMLv5/v6 → normalized GeoJSON |
| Lift status (US) | Liftie | `liftie.info/api/resort/{id}` | 1 min | JSON (open/closed/hold/scheduled). License: MIT |
| Lift status (EU) | Custom scrapers | Per-resort | 5 min | Scraped → normalized JSON |
| Webcams | Windy API v3 | `api.windy.com/webcams/api/v3/webcams?nearby={lat},{lon},{radius_km}` | On-demand | JSON with thumbnail URLs |

Live data layers use client-side polling at the intervals specified (15 min for weather, 1 min for lifts, etc.) with `Cache-Control` headers. SSE or WebSockets may replace polling if needed at scale.

**Avalanche bulletin detail view**: Clicking an avalanche danger zone opens a detail panel showing: danger level (1–5), problem types (persistent slab, wind slab, wet avalanche), elevation/aspect/gradient of concern, full bulletin text, publication time, and link to original source. Bulletins visible within ~15 min of publication.

#### Map Tools (interactive)

| Tool | Implementation | Details |
|---|---|---|
| Elevation point query | Client-side | Decode Mapbox Terrain RGB at clicked coordinate. Display as popup (meters + feet). No server round-trip |
| Distance measurement | Client-side | Click points → polyline with geodesic distance (turf.js). Optional elevation profile along path |
| Custom terrain filter | Client-side (WebGL) | User sets elevation range + gradient range + aspect multi-select. Custom `CustomLayerInterface` with WebGL shader reads Terrain RGB tiles, computes slope/aspect per pixel from 3x3 kernel, applies filter, renders matching pixels as green overlay. Primary use case: correlate avalanche bulletin warnings with actual terrain |
| Route planner | Client + Server proxy | Draw waypoints on map → `POST /api/v1/routes/directions` (Mapbox Directions walking profile) → display snapped route + elevation profile (client-side `map.queryTerrainElevation`). Save as a `route` (the planned-itinerary entity). Fallback: straight-line segments if Directions API unavailable |

#### Heatmap Storage

Heatmaps are pre-rendered raster tiles generated from activity track density using PostGIS `ST_HexGrid` or similar aggregation. Stored in S3 alongside terrain tiles (`s3://mtamta-tiles/heatmap/`). Regenerated periodically (daily or weekly) as a batch job in the `tilegen` CLI. No dedicated database table needed — generated from existing `activities.track` geometry.

---

## External Integrations

### Weather & Wind & Snow — Open-Meteo

Single provider for all meteorological data. No API key required for non-commercial use.

- **Base URL**: `https://api.open-meteo.com/v1/forecast`
- **Key params**: `latitude`, `longitude`, `hourly=temperature_2m,precipitation,snowfall,snow_depth,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,visibility,freezing_level_height`
- **Models**: Auto-selects best available. For Alps: MeteoSwiss ICON-CH (1–2km resolution). For US: NOAA HRRR (3km resolution)
- **Free tier**: <10,000 calls/day, no API key needed
- **Commercial**: From $29/month for 1M calls
- **Update cadence**: Current conditions every 15 min, forecast every 1 hour, snow depth every 1 hour

### Avalanche — Multi-Source with Adapters

All avalanche services use the standard 5-level danger scale: 1 (Low) → 2 (Moderate) → 3 (Considerable) → 4 (High) → 5 (Extreme).

| Source | Coverage | API | Format | License |
|---|---|---|---|---|
| avalanche.org | US | `GET https://api.avalanche.org/v2/public/products/map-layer` | GeoJSON with `danger_level`, `color`, `link` | Public data |
| SLF | Switzerland | `GET https://aws.slf.ch/api/bulletin/caaml/en/geojson` | CAAMLv6 GeoJSON | CC BY 4.0 |
| ALBINA | Tyrol / South Tyrol / Trentino | `GET https://api.avalanche.report/albina/api/` | CAAMLv5/v6 | CC BY 4.0 |
| Other EU services *(stretch goal)* | Per-region | Per-service adapters (use pyAvaCore patterns for parsing) | CAAML v5/v6 XML+JSON → normalized GeoJSON | Varies |

EAWS region boundaries available at `regions.avalanches.org` for mapping danger zones to geographic areas. Core scope: avalanche.org + SLF + ALBINA only; additional EU service adapters are a stretch goal.

### Ski Lift Status

| Source | Coverage | API | Format | License |
|---|---|---|---|---|
| Liftie | US resorts | `GET https://liftie.info/api/resort/{id}` | JSON (open/closed/hold/scheduled) | MIT, open source, self-hostable |
| Custom scrapers *(stretch goal)* | EU resorts | Per-resort | Scraped → normalized JSON (open/closed/hold/scheduled) | N/A |

No standard API exists for European lift status. Custom scrapers needed per resort. Core scope: Liftie (US) only; EU scrapers are a stretch goal.

### Ski Area / Piste Data — OpenSkiData

- **Source**: Daily GeoJSON exports from openskimap.org
- **Contents**: Ski areas (11,971+), runs with difficulty rating, lifts with type — all with geometry
- **License**: ODbL (same as OSM)
- **Self-hostable**: Via openskidata-processor

### Webcams — Windy API v3

- **Endpoint**: `GET https://api.windy.com/webcams/api/v3/webcams?nearby={lat},{lon},{radius_km}`
- **Auth**: Header `x-windy-api-key: {key}`
- **Free tier**: Thumbnails only, 10-min URL expiry, must link to windy.com
- **Pro tier**: 9,990 EUR/year (full images, 24h tokens)

### Climbing Data — OpenBeta

- **Source**: openbeta.io — open-source climbing route database
- **License**: CC BY-SA 4.0
- **API**: GraphQL (`https://api.openbeta.io/graphql`)
- **Grade library**: `@openbeta/sandbag` npm package for grade conversion/comparison across systems (YDS, French, UIAA, Ewbank, etc.)
- **Coverage**: ~500K routes globally, with areas, crags, and route-level data
- **Seed strategy**: Bulk import OpenBeta areas as `locations` (type='crag') and routes as `climbing_routes` with `source='openbeta'` and `source_id` for dedup
- **Re-sync**: Monthly re-sync via GraphQL API to pick up new routes and edits

### Trail Routing — Mapbox Directions API

- **Endpoint**: `https://api.mapbox.com/directions/v5/mapbox/walking/{coordinates}`
- **Profile**: `walking` — snaps to trails, footpaths, hiking routes from OSM data
- **Max waypoints**: 25 per request
- **Key params**: `geometries=geojson`, `overview=full`, `steps=false`
- **Free tier**: 100K requests/month (included in Mapbox account)
- **Proxy**: All requests go through `POST /api/v1/routes/directions` to protect access token
- **Fallback**: Straight-line segments between waypoints if Directions API is unavailable
- **Caching**: Redis `directions:{sha256(waypoints)}`, 1-hour TTL

---

## Device Integrations

### Overview

mtamta supports direct integration with GPS devices and fitness platforms to automatically sync outdoor activities. The architecture is **provider-agnostic**: a common `Provider` interface allows new device integrations to be added without restructuring existing code.

**Current integrations:**
- **Garmin Connect** — Direct API (activity pull + course push)

**Future integrations:**
- COROS, Suunto, Polar, Wahoo — via Terra aggregator API
- Apple Health — iOS-only native SDK

### Provider Interface

```go
type Provider interface {
    Name() string
    AuthURL(state string) string
    ExchangeCode(ctx context.Context, code string, codeVerifier string) (*OAuthTokens, error)
    RefreshTokens(ctx context.Context, refreshToken string) (*OAuthTokens, error)
    FetchActivities(ctx context.Context, accessToken string, since time.Time) ([]ActivitySummary, error)
    DownloadActivity(ctx context.Context, accessToken string, activityID string) ([]byte, error)
    PushCourse(ctx context.Context, accessToken string, course *CourseData) (string, error)
    SupportsFeature(feature ProviderFeature) bool
}
```

Each provider implements this interface in its own subdirectory under `internal/integration/`.

### Garmin Connect Integration

- **API**: Garmin Connect Developer Program (free with approval, ~2 business days)
- **Auth**: OAuth 2.0 with PKCE — access tokens expire after 3 months, refresh tokens provided
- **Activity API**: Pull activities in FIT format (binary, industry standard)
- **Courses API**: Push planned routes to user's Garmin device via Garmin Connect
- **No webhooks**: Must poll for new activities
- **Sync mode**: Background polling every 15 minutes + manual sync (rate-limited: 1 per 5 min)
- **FIT format**: Binary GPS activity format, decoded with `github.com/muktihari/fit`

### Activity Type Mapping

| Garmin FIT Sport | mtamta activity_type |
|---|---|
| running | trail_run |
| hiking | hike |
| alpine_skiing | ski |
| backcountry_skiing | backcountry_ski |
| snowboarding | snowboard |
| rock_climbing | climb |
| mountaineering | alpinism |
| cycling | bike |
| Other | other |
| indoor_climbing | climb |
| bouldering | boulder |

> **Multi-pitch climbing data**: COROS watches and some Garmin devices segment climbing activities into approach, climb, and descent phases with per-pitch tracking. When FIT data contains these segments, the sync pipeline extracts them into `activity_segments` with pitch-level JSONB metadata.

### Security — Token Encryption

OAuth tokens stored in `device_providers` are encrypted at rest:

- **Algorithm**: AES-256-GCM
- **Key derivation**: HKDF from `INTEGRATION_TOKEN_KEY` environment variable
- **Nonce**: Random 12-byte nonce per encrypted value
- **Storage**: Encrypted tokens stored as `BYTEA` in PostgreSQL

### Future: Terra Aggregator

Terra API (terra.co) provides a unified API for 10+ fitness platforms. Planned for non-Garmin device support:
- Webhooks for real-time activity sync (unlike Garmin's polling model)
- Normalized data format across providers
- Free tier: 500 connections; paid from $99/month

---

## Data Pipeline

The ingest pipeline fetches external data on a schedule and stores it for map display and API queries.

```
┌───────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Scheduler │────>│ Fetcher  │────>│Transform │────>│  Store   │
│ (cron)    │     │(HTTP GET)│     │ (parse/  │     │(Postgres/│
│           │     │          │     │  clean)  │     │Timescale)│
└───────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Update Frequencies

| Data | Source | Frequency | Storage |
|---|---|---|---|
| Weather (current) | Open-Meteo | Every 15 minutes | PostgreSQL (hypertable-ready) |
| Weather (forecast) | Open-Meteo | Every 1 hour | PostgreSQL (hypertable-ready) |
| Wind | Open-Meteo | Every 15 minutes | PostgreSQL (hypertable-ready) |
| Snow depth | Open-Meteo | Every 1 hour | PostgreSQL (hypertable-ready) |
| Avalanche reports | avalanche.org / SLF / ALBINA | Every 6 hours | PostgreSQL |
| Ski lift status (US) | Liftie | Every 1 minute | PostgreSQL + Redis cache |
| Ski lift status (EU) | Custom scrapers | Every 5 minutes | PostgreSQL + Redis cache |
| Ski runs & lifts | OpenSkiData | Daily | PostgreSQL (GeoJSON) |
| Snow cover (satellite) | Copernicus HR-WSI / NOAA NOHRSC | Daily | S3 (raster tiles) |
| Webcam thumbnails | Windy API v3 | On-demand | Redis cache (10-min TTL) |
| Device activities | Garmin Connect API | Every 15 minutes | PostgreSQL + S3 (FIT files) |
| Climbing routes | OpenBeta GraphQL API | Monthly | PostgreSQL |

### Pipeline Implementation

- Runs as background goroutines within the main API process
- Uses Go's `time.Ticker` or a lightweight cron library
- Each fetcher is independent and can fail without affecting others
- Failed fetches are logged and retried on next cycle
- Stale data is marked with a timestamp so the UI can show "last updated" indicators

### Slope Angle Tile Generation Pipeline

Batch process for pre-generating terrain overlay tiles from Copernicus GLO-30 DEM data. Run once per region, re-run when DEM data is updated.

**Steps:**

1. **Download**: Copernicus GLO-30 GeoTIFF tiles from `s3://copernicus-dem-30m/` (license: free for all uses, Copernicus data policy)
2. **Mosaic**: `gdalbuildvrt region.vrt *.tif`
3. **Reproject**: `gdalwarp -t_srs EPSG:3857 region.vrt region_3857.tif`
4. **Slope**: `gdaldem slope region_3857.tif slope.tif` (output in degrees)
5. **Color relief**: `gdaldem color-relief slope.tif slope_colors.txt slope_colored.tif`
6. **Tile**: `gdal2tiles.py -z 8-15 slope_colored.tif ./tiles/slope/`
7. **Upload**: `aws s3 sync ./tiles/slope/ s3://mtamta-tiles/slope/`

**Slope color bands** (`slope_colors.txt`):

| Degrees | Color | Meaning |
|---|---|---|
| 0–27° | Green | Low angle, generally safe |
| 28–29° | Yellow | Caution zone |
| 30–34° | Orange | Avalanche-prone |
| 35–39° | Red | High avalanche danger |
| 40–44° | Magenta | Very steep |
| 45°+ | Black | Extreme steep terrain |

**Sun/shade tiles**: Same pipeline but use `gdaldem hillshade` with `-az` (solar azimuth) and `-alt` (solar altitude) parameters computed from sun position for a given date/time.

**Steep/flat tiles**: Same pipeline but classify into bands: flat (<15°), moderate (15–30°), steep (30–45°), very steep (>45°).

**Aspect tiles**: Same pipeline with `gdaldem aspect`. Color table:

| Aspect | Degrees | Color |
|---|---|---|
| N | 337.5°–22.5° | Blue (#0000FF) |
| NE | 22.5°–67.5° | Light blue (#87CEEB) |
| E | 67.5°–112.5° | White (#FFFFFF) |
| SE | 112.5°–157.5° | Light orange (#FFD580) |
| S | 157.5°–202.5° | Orange (#FF8C00) |
| SW | 202.5°–247.5° | Brown (#8B4513) |
| W | 247.5°–292.5° | Black (#000000) |
| NW | 292.5°–337.5° | Dark blue (#00008B) |

**Avalanche slope filter tiles**: Same slope pipeline, different color table. Angles outside 25°–45°+ are transparent:

| Degrees | Color | Meaning |
|---|---|---|
| 0–24° | Transparent | Below avalanche threshold |
| 25°–30° | Yellow | Transition zone |
| 30°–35° | Orange | Prime avalanche terrain |
| 35°–40° | Red | High danger |
| 40°–45°+ | Dark red | Very steep |

**Client-side fallback**: For areas without pre-generated tiles, decode Mapbox Terrain RGB (`mapbox.mapbox-terrain-dem-v1`) in the browser to compute slope angles on-the-fly. Uses the DEM decoding formula: `height = -10000 + ((R × 256 × 256 + G × 256 + B) × 0.1)`.

**Priority regions for pre-generation:**

| Region | Bounding Box | Notes |
|---|---|---|
| Alps | 44°N–48°N, 5°E–17°E | Primary ski/mountaineering region |
| US Mountain West | 35°N–49°N, 105°W–122°W | Rockies, Cascades, Sierra Nevada |
| Scandinavia | 57°N–71°N, 4°E–32°E | Nordic skiing, backcountry |

---

## Data Model

PostgreSQL 17 with PostGIS and TimescaleDB is the single primary store. PostGIS gives us first-class geospatial queries (nearest activities, bbox intersection, track simplification); TimescaleDB is wired up but used as plain Postgres until time-series volume justifies hypertables. Redis is cache and session lookup only.

> **Full DDL** for every table — columns, indexes, JSONB shapes, retention rules, Redis key patterns — lives in [`Database.md`](Database.md). This section is the durable entity overview: what exists, who owns it, how it connects.

### Entity Overview

| Entity | Phase | Owns | Key relationships |
|---|---|---|---|
| `users` | 1 | Profile, soft-delete flag | Referenced by everything user-owned |
| `auth_providers` | 1 | Google / Apple OAuth links to a user | `user_id` → `users` |
| `activities` | 4 | Recorded outings (GPX or device sync). Carries `track`, derived stats, device-sync columns from day one | `user_id` → `users`; optional `route_id` → `routes` |
| `activity_photos` | 4 | Photos tied to an activity (S3 key + EXIF) | `activity_id` → `activities` |
| `routes` | 6 | Planned itineraries — separate from recordings | `user_id` → `users` |
| `follows` / `activity_likes` / `activity_saves` / `comments` | 9 | Social graph + per-activity interactions | All cascade on user / activity delete |
| `notifications` | 9 | In-app inbox; push & email deferred | `user_id` → `users` |
| `locations` | 11 | Resorts, peaks, trailheads, crags. `type='crag'` is the anchor for climbing | Referenced by `climbing_routes.crag_id`, `crag_topos.crag_id` |
| `device_providers` / `synced_activities` | 5 | Encrypted OAuth tokens + per-platform sync ledger | `user_id` → `users`; `activity_id` → `activities` |
| `activity_segments` / `climbing_routes` / `crag_topos` / `crag_models` | 12 | Climbing-specific structure (approach/climb/descent, pitch grades, photo topos, 3D crags) | `activity_id` → `activities`; `crag_id` → `locations` |
| `weather_observations` / `wind_observations` / `snow_observations` / `avalanche_reports` / `lift_status` | 10 | Ingested live data, time-series shape | None — addressed by `(time, location)` or `(source, region_id)` |
| `pipeline_runs` | 10 | Observability — last run status per ingest pipeline | None |

Spatial columns use `GEOGRAPHY` (not `GEOMETRY`) so distance / length return meters by default. All coordinates are SRID 4326.

### Durable Decisions

- **One database, modular monolith schema.** Every domain (auth, activities, social, climbing, live data) shares one Postgres instance. Cross-domain queries are first-class; we are not building a service-mesh schema to chase scale we don't have.
- **`GEOGRAPHY` over `GEOMETRY`.** PostGIS's spherical math is good enough for everything we render and analyse; we don't want the per-query `ST_Distance_Spheroid` ceremony that `GEOMETRY` forces.
- **JSONB for evolving shapes.** `activities.metrics`, `locations.metadata`, `climbing_routes.grades`, `crag_topos.route_overlays`, `notifications.payload` all use JSONB so we can extend them without a migration. Indexed columns get their own scalar fields.
- **Time-series tables stay regular until they don't.** Hypertable conversion is one migration line each — no infrastructure change. Defer until the slow-query / row-count case is real.
- **Hard-delete activities (cascade), soft-delete users.** Users are referenced from everywhere; cascading them would silently delete every comment and like they've ever left. Soft delete + scrub-and-keep is the only sane stance.
- **Refresh tokens live in Redis, not Postgres.** Revocation is a `DEL` away. The schema reflects this — there is no `sessions` table.

### Indexing & Migration Strategy

Indexes ship with their tables in the same migration. GIST on every `GEOGRAPHY` column. Composite `(user_id, started_at DESC)` on `activities` matches the "my activities, newest first" query that dominates the user feed. Partial indexes (e.g. `idx_activities_status WHERE status != 'published'`) keep draft queries cheap without bloating the common case.

Migrations are golang-migrate `*.up.sql` / `*.down.sql` files in `apps/api/migrations/`, applied on every API startup. See [`Deployment.md` → Database migrations](Deployment.md#database-migrations) for the runbook.

---

## Search

### Meilisearch

Used for fast, typo-tolerant full-text search across activities, locations, and users.

**Indexes**:

| Index | Searchable Fields | Filterable Fields |
|---|---|---|
| `activities` | title, description, location name | activity_type, user_id, started_at |
| `locations` | name, region, country | type (resort, peak, trailhead) |
| `users` | display_name, bio | — |
| `crags` | name, region, rock_type, approach_description | type (crag), rock_type, location._geo |
| `climbing_routes` | name, description, first_ascent | route_type, crag_id, grade (sortable) |

**Sync Strategy**: After any activity/user create or update, push the updated document to Meilisearch. This can be async (via a small queue or goroutine).

**Geo Search**: Meilisearch supports `_geo` filtering, allowing "activities near me" queries with a radius.

---

## Storage

### S3-Compatible Object Storage

All user-uploaded files are stored in S3-compatible storage (AWS S3, MinIO, Cloudflare R2, or equivalent).

| Bucket / Prefix | Contents | Access |
|---|---|---|
| `gpx/` | Raw GPX files | Private (signed URLs) |
| `photos/` | Activity photos (original) | Public CDN |
| `photos/thumb/` | Activity photos (thumbnails) | Public CDN |
| `avatars/` | User profile photos | Public CDN |
| `fit/` | Raw FIT files from device syncs | Private (signed URLs) |
| `topos/` | Crag topo photos (originals) | Public CDN |
| `models/` | 3D crag models (glTF) and point clouds | Public CDN |

**Upload Flows**:

*Activity creation* — single multipart `POST /api/v1/activities` with metadata fields and an **optional** GPX file. If a GPX is attached, the API parses it server-side, derives the `track` + stats, and stores the original file in S3 (`gpx/{activity_id}.gpx`); without one, the activity is created from the submitted fields alone (manual entry). No pre-signed URL needed — GPX files are small (<50 MB) and must be parsed before the activity is created.

*Photos and other large files* — pre-signed URL flow:
1. Client requests a pre-signed upload URL from the API (`POST /api/v1/upload/url` with `{activity_id, file_ext, content_type}`). **The server generates the key** (`photos/{activity_id}/{uuid}.{ext}`) — clients never choose keys
2. Client uploads directly to S3 (no proxying through the API)
3. Client sends the **S3 object key** (not an arbitrary URL) back to the API to associate with the activity (`POST /api/v1/activities/{id}/photos` with `{key, caption, sort_order}`)
4. API validates the key matches the expected prefix (`photos/{activity_id}/`), fetches the object from S3 to extract EXIF metadata, and stores the photo record
5. Thumbnails: deferred — originals served initially in Phase 4c. Async thumbnail generation added in a later phase when traffic justifies it

---

## API Endpoints

The full per-endpoint catalogue — every shipped and planned route, with status tags (Shipped / Planned-Phase-N / Designed-gated) and per-endpoint detail — lives in [`API.md`](API.md). This section only covers the **conventions** that apply across endpoints; those are in [API Design & Conventions](#api-design--conventions) above (URL versioning, error format, status codes, pagination, rate limits, CORS, file-upload limits).

The shipped surface today (`cmd/server/main.go`):

- `GET /api/v1/health` — health check
- `POST /api/v1/auth/{google,apple,refresh,logout}` — sign-in flow
- `GET /api/v1/users/me`, `PATCH /api/v1/users/me` — current user
- `GET /api/v1/tiles/{provider}/{z}/{x}/{y}` — country-topo tile proxy
- `GET /api/v1/tiles/sentinel/{z}/{x}/{y}` — Sentinel Hub proxy (mounted only when `SENTINEL_HUB_INSTANCE_ID` is configured)

Everything else in `API.md` is designed but not yet wired up; each endpoint is tagged with the phase that builds it.

---

## Operations & Deployment

> **Runbook detail lives in [`Deployment.md`](Deployment.md):** Railway / Cloudflare account setup, the full environment-variable list, GitHub Actions secrets and variables, the local-development Make targets, the Dockerfile breakdown, backup strategy and restore procedure, region-move runbook, and the platform-migration matrix. This section only covers the durable architectural decisions.

### Principles

- **Platform-independent by default**: Application code has zero knowledge of where it runs. All config via environment variables. Docker containers as the universal deployment unit.
- **Railway as primary platform**: Managed services, git-push deploys, private networking. Chosen for low ops overhead for a solo developer.
- **Thin platform coupling**: Only the CI/CD deploy step and `apps/api/railway.toml` are Railway-specific. Everything else is portable — see the migration matrix in [`Deployment.md`](Deployment.md#platform-migration-railway--elsewhere).
- **No Terraform**: The infrastructure is simple enough (a Go API + Postgres + Redis on one platform, with Cloudflare Pages serving the web bundle) that Terraform adds overhead without proportional benefit. Revisit if external managed services (Timescale Cloud, Cloudflare Workers, etc.) accumulate.

### Deployment Topology

```
                  ┌──────────────────┐
                  │  Cloudflare DNS  │
                  └────────┬─────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              v            v            v
    ┌─────────────┐ ┌───────────┐ ┌──────────────┐
    │ Cloudflare  │ │  Railway   │ │ Cloudflare   │
    │   Pages     │ │  Project   │ │     R2       │
    │ (web app)   │ │            │ │ (S3 storage) │
    └─────────────┘ │  ┌──────┐ │ └──────────────┘
                    │  │  api │ │
                    │  └──┬───┘ │
                    │     │     │
                    │  ┌──┴───────────┐
                    │  │ private net  │
                    │  ├──────────────┤
                    │  │  postgres    │
                    │  │  (PostGIS)   │
                    │  ├──────────────┤
                    │  │  redis       │
                    │  ├──────────────┤
                    │  │ meilisearch  │
                    │  └──────────────┘
                    └───────────────────┘
```

### Services

The production runtime is three Railway services (`api`, `postgres`, `redis`) on Railway's private network, plus Cloudflare Pages for the web bundle, R2 for object storage, and Sentry for error tracking. Meilisearch joins as a fourth Railway service in Phase 11. See [`Deployment.md`](Deployment.md#railway-setup) for the per-service configuration and env-var lists.

### TimescaleDB Strategy

Local development, CI, and Railway production all use a TimescaleDB + PostGIS image (Railway adds SSL support via `ghcr.io/railwayapp-templates/timescale-postgis-ssl:pg17`). Both images include the extensions but require explicit `CREATE EXTENSION` in the initial migration.

Tables use standard PostgreSQL initially. When time-series data volume justifies it (slow range queries, millions of rows), run `SELECT create_hypertable(...)` migrations — no infrastructure change needed. This is a deliberate "pay only when it matters" stance; weather/wind/snow tables are already shaped for it.

### CI/CD Shape

GitHub Actions runs the test/build/lint gates on every push and PR. Railway auto-deploys the API from its GitHub connection with "Wait for CI" on; the web app is deployed by a `deploy-web` job using `wrangler`. CI is platform-agnostic except for that one job. The authoritative pipeline is `.github/workflows/ci.yml`; setup details and required secrets are in [`Deployment.md`](Deployment.md#github-actions-configuration).

### Observability

The observability strategy is designed for a solo developer running a modular monolith. There are no inter-service hops, so distributed tracing (Jaeger, Zipkin, OpenTelemetry collector) is unnecessary. Instead, the focus is on **request traceability**, **pipeline health**, and **error context**.

#### Tooling Overview

| Concern | Tool | Notes |
|---|---|---|
| **Structured logging** | `slog` (Go stdlib) | JSON in production, human-readable in development |
| **Request tracing** | Request ID middleware | UUID per request, propagated via `context.Context` |
| **Error tracking** | Sentry | Go SDK (`sentry-go`, installed) + React SDK (`@sentry/react`, planned) |
| **Pipeline monitoring** | Sentry Cron Monitors | Alerts when a pipeline misses its schedule |
| **Uptime** | Uptime Robot (free) | Pings `/api/v1/health` every 5 min |
| **Infra metrics** | Railway built-in | CPU, memory, network per service |
| **Log retention** | Railway (7 days) | Upgrade to Axiom or Better Stack free tier if needed later |

#### Request ID & Structured Logging

Every incoming request gets a unique ID that flows through the entire request lifecycle. This is the single most valuable observability feature — it lets you correlate all log lines, errors, and Sentry events for a single request.

**Middleware chain**:

```
Request → RequestID middleware → Logging middleware → Auth middleware → Handler
              │                       │
              │ Generate UUID          │ Log: method, path, status,
              │ Add to context         │      duration_ms, user_id,
              │ Set X-Request-ID       │      request_id
              │ response header        │
```

**Implementation** (`internal/middleware/`):

- `requestid.go` — generates UUID v4, stores in `context.Context`, sets `X-Request-ID` response header. If the incoming request already has `X-Request-ID` (e.g., from a load balancer), reuse it.
- `logging.go` — wraps the handler, logs on completion with all fields extracted from context.
- All `slog` calls throughout the codebase extract the request ID from context: `slog.InfoContext(ctx, "message")`.

**Log format** — JSON in production (`ENV=production`), human-readable text in development:

```json
{
  "time": "2026-02-10T12:00:00.123Z",
  "level": "INFO",
  "msg": "request",
  "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "GET",
  "path": "/api/v1/activities",
  "status": 200,
  "duration_ms": 12,
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "ip": "203.0.113.42"
}
```

**What gets logged at each level**:

| Level | When |
|---|---|
| **ERROR** | Unhandled errors, panic recovery, failed external API calls, database errors |
| **WARN** | Deprecated endpoint usage, rate limit approaching, token refresh failures (before retry) |
| **INFO** | Every HTTP request (on completion), pipeline run results, user actions (login, activity create) |
| **DEBUG** | SQL queries (dev only), external API request/response bodies, cache hit/miss |

#### Sentry Integration

Sentry provides error tracking with full context and performance monitoring. Both the Go backend and React frontend report to the same Sentry project.

**Go backend** (`sentry-go`):

- **Panic recovery**: Sentry middleware captures panics with full stack trace
- **Error context**: Every Sentry event includes `request_id`, `user_id`, request method/path, and Go module/function
- **Breadcrumbs**: Key operations (DB queries, external API calls, cache operations) are added as Sentry breadcrumbs, providing a timeline of what happened before the error
- **Performance**: Sentry transactions capture request duration. Spans track DB queries and external HTTP calls within a request

```go
// Example: Sentry context on every error
sentry.ConfigureScope(func(scope *sentry.Scope) {
    scope.SetTag("request_id", requestID)
    scope.SetUser(sentry.User{ID: userID})
    scope.SetContext("request", map[string]interface{}{
        "method": r.Method,
        "path":   r.URL.Path,
    })
})
```

**React frontend** (`@sentry/react`):

- Captures unhandled exceptions and rejected promises
- React Error Boundary integration for component crashes
- User context set on login (user ID, email)
- Breadcrumbs for navigation, API calls, user clicks

#### Pipeline Health Monitoring

The ingest pipeline (weather, avalanche, lifts, device sync) runs as background goroutines. Silent failures are the biggest risk — data goes stale without anyone noticing.

**Two complementary mechanisms**:

1. **Sentry Cron Monitors** — Each pipeline registers as a Sentry cron monitor with its expected schedule. The pipeline calls `checkin(status=in_progress)` when it starts and `checkin(status=ok|error)` when it finishes. If a check-in is missed (pipeline didn't run) or reports an error, Sentry sends an alert.

| Pipeline | Sentry Cron Schedule | Alert If Missed |
|---|---|---|
| Weather fetch | Every 15 minutes | After 30 min |
| Wind fetch | Every 15 minutes | After 30 min |
| Snow depth fetch | Every 1 hour | After 2 hours |
| Avalanche reports | Every 6 hours | After 12 hours |
| Lift status (US) | Every 1 minute | After 5 min |
| OpenSkiData sync | Daily | After 2 days |
| Snow cover fetch | Daily | After 2 days |
| Device activity sync | Every 15 minutes | After 1 hour |

2. **`pipeline_runs` table** — Every pipeline run is recorded in the database with status, duration, error message, and row count. This provides a queryable history and powers the admin health endpoint. See `pipeline_runs` table in Database Design section.

**Admin health endpoint**: `GET /api/v1/admin/pipelines` — returns the last run status for each pipeline. Protected by auth (admin only or API key). Useful for quick debugging:

```json
{
  "pipelines": [
    {
      "pipeline": "weather",
      "last_status": "success",
      "last_run": "2026-02-10T11:45:00Z",
      "duration_ms": 1230,
      "rows_affected": 48
    },
    {
      "pipeline": "avalanche",
      "last_status": "failed",
      "last_run": "2026-02-10T06:00:00Z",
      "error_message": "SLF API returned 503"
    }
  ]
}
```

#### Health Check Endpoint

The `GET /api/v1/health` endpoint checks all configured dependencies. Services are included only when their URL is set (e.g., Meilisearch appears after Phase 11):

```json
{
  "status": "ok",
  "services": {
    "postgres": "ok",
    "redis": "ok"
  }
}
```

`status` is `ok` when every checked service is healthy and `degraded` otherwise (unconfigured services are omitted, not failed). Railway uses this endpoint for deployment health checks and automatic restarts.

#### Alerting Summary

| Trigger | Channel | Source |
|---|---|---|
| Unhandled error / panic | Email (or Slack) | Sentry |
| Error rate spike (>10 errors/min) | Email | Sentry alert rule |
| Pipeline missed schedule | Email | Sentry Cron Monitor |
| API downtime | Email | Uptime Robot |
| Deploy failure | GitHub notification | GitHub Actions |

No PagerDuty or on-call rotation — this is a solo project. Email alerts are sufficient. Sentry's default alert rules cover error spikes out of the box.

### Backups & Portability

- **Postgres** is backed by Railway's daily/PITR backups plus a weekly `pg_dump` to R2 via GitHub Actions (`.github/workflows/backup.yml`, 30-day retention). The dump is a complete schema + data + `schema_migrations` snapshot, so a restore needs no migration step before the next deploy.
- **Redis** is treated as ephemeral — no backup; cache and session state rebuild from Postgres on next use.
- **R2** is durable by design (11 nines); no additional backup.
- **Platform portability**: every Railway-specific piece is replaceable in a couple of files (the CI deploy step, `apps/api/railway.toml`). Application code, Dockerfile, migrations, and `docker-compose.yml` move untouched. The Railway → Fly.io / VPS swap matrix lives in [`Deployment.md`](Deployment.md#platform-migration-railway--elsewhere).
