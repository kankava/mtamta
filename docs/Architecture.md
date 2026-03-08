# mtamta — Architecture

> An outdoor adventure platform for logging, finding, and sharing extreme outdoor trips with rich map rendering, terrain analysis, and live data integrations.

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
12. [Database Design](#database-design)
13. [Search](#search)
14. [Storage](#storage)
15. [API Endpoints](#api-endpoints)
16. [Operations & Deployment](#operations--deployment)

> Backend (Go) includes: API Design & Conventions, Security & Validation, Testing, Authentication Architecture

---

## Overview

**mtamta** (working name) is a platform for outdoor enthusiasts to log, discover, and share trips across activities like backcountry skiing, resort skiing, snowboarding, trail running, rock climbing, and alpinism.

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
| **Maps** | Mapbox GL JS (web), `@rnmapbox/maps` (mobile) | Best-in-class vector tile rendering, 3D terrain, custom styling |
| **State management** | Zustand | Lightweight, minimal boilerplate, good fit for map-heavy UIs |
| **Data visualization** | Deck.gl (optional) | Advanced visualization layers on top of Mapbox when needed |
| **Monorepo** | Turborepo | Fast task orchestration, dependency-aware builds |
| **Database** | PostgreSQL + PostGIS | Robust relational store with first-class geospatial support |
| **Time-series** | TimescaleDB | PostgreSQL extension for weather/snow/wind time-series data. Included in `timescale/timescaledb-ha` image; hypertables enabled when data volume justifies it |
| **Cache** | Redis | Map tile caching, sessions, rate limiting |
| **Search** | Meilisearch | Fast full-text search for trips, locations, resorts |
| **Object storage** | S3-compatible | GPX files, photos, user uploads |
| **Auth** | Self-built in Go | Only 2 OAuth providers (Google + Apple); ~200-300 lines of Go; full control over user model |
| **FIT parsing** | `github.com/muktihari/fit` | Parse binary FIT files from Garmin and other GPS devices |

### Libraries — Go

| Library | Purpose |
|---|---|
| `golang.org/x/oauth2` | OAuth2 flows |
| `github.com/golang-jwt/jwt/v5` | JWT issuance and validation |
| `github.com/muktihari/fit` | FIT file decoding (binary GPS activity format) |

### Libraries — Frontend

| Library | Purpose |
|---|---|
| `mapbox-gl` | Web map rendering |
| `@rnmapbox/maps` | React Native map rendering |
| `zustand` | State management |
| `deck.gl` | Advanced data visualization (optional) |
| `@turf/turf` | Geodesic distance, geometry operations |
| `@openbeta/sandbag` | Climbing grade conversion/comparison across systems (YDS, French, UIAA, etc.) |
| `threebox` (`three.js` Mapbox integration) | 3D model rendering (glTF wall meshes) as custom Mapbox layers |

### External Service Costs

| Service | Free Tier | Paid Tier | Notes |
|---|---|---|---|
| **Mapbox** | 50K web map loads/month, 25K mobile MAU/month, 750K raster tile requests/month | Pay-as-you-go beyond free tier | A "map load" = one `new Map()` initialization, NOT per-interaction |
| **Mapbox Directions API** | 100K requests/month (included in Mapbox free tier) | Pay-as-you-go beyond | Walking profile for trail snapping; proxied through backend |
| **Open-Meteo** | <10K calls/day (no API key) | From $29/month for 1M calls | Free for non-commercial use |
| **OpenSkiData** | Free | — | ODbL license, self-hostable |
| **Liftie** | Free | — | MIT license, self-hostable |
| **Avalanche APIs** | Free | — | Public data / CC BY 4.0 |
| **Windy webcams** | Free (thumbnails, 10-min expiry, must link to windy.com) | 9,990 EUR/year (full images, 24h tokens) | Free tier likely sufficient initially |
| **IGN Géoplateforme** | Free (2M tiles/day) | Paid tiers available | Requires free API key; France only; attribution required |
| **OpenTopoMap** | Free (fair use) | — | Community-run; ~2 req/sec rate limit; CC-BY-SA attribution |
| **Copernicus Sentinel Hub** | Free (10K PU/month, 10K req/month) | From 25 EUR/month | Seasonal satellite imagery (Sentinel-2); requires free registration; proxy through backend |
| **Copernicus HR-WSI** | Free | — | Satellite-derived snow cover for Europe (20m); successor to HR-S&I |
| **NOAA NOHRSC** | Free | — | Daily snow depth/SWE analysis for USA; public domain |
| **Garmin Connect API** | Free (with approval) | — | Requires developer program enrollment (~2 day approval); activity pull + course push |
| **Terra API** | 500 connections free | From $99/month | Future: aggregator for non-Garmin devices (COROS, Apple Health, Polar, etc.) |
| **OpenBeta** | Free | — | CC BY-SA 4.0; GraphQL API; ~500K routes globally |

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
┌─────────┐  ┌─────────┐  ┌─────────┐
│  Redis  │  │Meilisearch│ │S3 Storage│
│ (cache) │  │ (search) │  │ (files) │
└─────────┘  └─────────┘  └─────────┘
```

All backend components run as a **single Go binary** (modular monolith). Package boundaries enforce separation. The ingest pipeline runs as background goroutines or a scheduled job within the same process.

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
│   ├── mobile/               # React Native application
│   │   ├── src/
│   │   │   ├── screens/      # Screen components
│   │   │   ├── components/   # Mobile-specific components
│   │   │   ├── navigation/   # React Navigation setup
│   │   │   └── hooks/        # Mobile-specific hooks
│   │   ├── ios/
│   │   ├── android/
│   │   └── package.json
│   │
│   └── api/                  # Go backend
│       ├── cmd/
│       │   ├── server/
│       │   │   └── main.go   # Entry point
│       │   └── tilegen/
│       │       └── main.go   # Batch tile generation CLI
│       ├── internal/
│       │   ├── auth/         # Authentication (OAuth, JWT)
│       │   ├── user/         # User management
│       │   ├── trip/         # Trip CRUD, GPX parsing
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
│       └── go.sum
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
│   ├── map-core/             # Map config, styles, layer definitions
│   │   ├── src/
│   │   │   ├── styles/       # Mapbox style definitions
│   │   │   ├── layers/       # Layer configuration
│   │   │   └── config.ts     # Mapbox tokens, defaults
│   │   └── package.json
│   │
│   # packages/ui/ — created when shared component logic emerges between web and mobile (Phase 9+)
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
├── docker-compose.yml        # Local development services (TimescaleDB+PostGIS, Redis, Meilisearch, MinIO)
├── railway.toml              # Railway deployment configuration
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
├── trip/
│   ├── handler.go        # HTTP handlers (CRUD)
│   ├── service.go        # Trip logic, GPX parsing
│   ├── gpx.go            # GPX file parsing
│   └── repository.go     # trips table operations
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
│   ├── repository.go     # climbing_routes, crag_topos, trip_segments tables
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
- Photos: max 10MB per file, max 50 per trip. Types: JPEG, PNG, WebP. Magic byte validation. EXIF GPS stripped for privacy
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
- **Integration tests**: Use `testcontainers-go` or CI service containers for PostGIS. Test full flows: auth → create trip → query by bbox → verify PostGIS spatial query. Test migration up/down for all migrations
- **Repository tests**: Test PostGIS spatial queries with real data (point-in-polygon, bbox intersection, nearest neighbor)
- **Coverage target**: 80% on `internal/` packages. Handler layer tested via integration tests, not unit tests
- **Mocking**: Interface-based. Each service depends on repository interfaces, injected in tests. No global mocks

**Frontend (Web)**:

- **Unit tests**: Vitest for `packages/shared` logic (API client, type validation, utility functions)
- **Component tests**: React Testing Library for key interactive components (GpxUploader, LayerPanel, SearchBar)
- **No snapshot tests**: They add noise, break on every UI change, and catch nothing meaningful

**E2E Tests** (Phase 12):

- Playwright for critical user flows: sign in → create trip (GPX upload) → view on map → like → search → find trip
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
   │<── { access_token, refresh_token } ─────────────│
   │              │                │                  │
```

1. Client obtains ID token from Google/Apple native SDK
2. Client sends ID token to `POST /api/v1/auth/google` (or `/auth/apple`)
3. Backend verifies the ID token:
   - **Google**: Verify JWT signature against Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`)
   - **Apple**: Verify JWT signature against Apple's JWKS (`https://appleid.apple.com/auth/keys`)
4. Backend extracts `sub` (subject/provider UID) and `email` from the verified token
5. Backend finds or creates a `user` + `auth_providers` record
6. Backend issues a JWT pair (short-lived access token + long-lived refresh token)
7. Client stores tokens; sends access token on every subsequent request via `Authorization: Bearer <token>`

**Token Details**:
- Access token: JWT, 15-minute expiry, contains `user_id` and `email`
- Refresh token: Opaque, 30-day expiry, stored hashed in Redis (`user_session:{sha256(token)}`, 30-day TTL) as the sole store; delete from Redis to revoke
- Rotation: None — tokens are long-lived. Revocation is via Redis delete (logout, password change, admin action). One user can have multiple active sessions

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

- **React 18+** with TypeScript
- **Vite** for development and builds
- **Mapbox GL JS** for map rendering
- **Zustand** for state management
- **React Router** for routing

### Map Integration

The web app is centered around an interactive map. The map component is the primary UI element, with overlaid panels for trip details, search, and filters.

**Implementation requirements for `MapContainer.tsx`:**
- Use `useRef` + `useEffect` pattern — store map instance in a ref, initialize in `useEffect(fn, [])`, **always return a cleanup function that calls `map.remove()`** to prevent WebGL context leaks on route changes
- Import `'mapbox-gl/dist/mapbox-gl.css'` — the map canvas is invisible without it
- Use Mapbox GL JS **v3.x**: pass `accessToken` in the Map constructor rather than setting `mapboxgl.accessToken` globally
- `VITE_MAPBOX_ACCESS_TOKEN` must be a public `pk.*` token with URL restrictions configured per environment in the Mapbox dashboard; the Directions API proxy uses a server-side `sk.*` token that never reaches the browser

**Layer ordering — user content must render on top:**
All app-generated layers (trip routes, waypoints, user position) must be added after the base style loads and appended without a `beforeId` so they sit above POI symbols. A route line covering a café icon is acceptable; a POI icon covering a route line is not.

```
┌───────────────────────────────────────┐
│ ┌─────┐                    ┌───────┐ │
│ │Nav  │                    │Search │ │
│ │Bar  │                    │Panel  │ │
│ ├─────┤                    └───────┘ │
│ │     │                              │
│ │Side │     MAP (Mapbox GL JS)       │
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

Key stores:
- **`mapStore`** — viewport (center, zoom, bearing, pitch), active layers, selected features
- **`authStore`** — current user, tokens, login/logout actions
- **`tripStore`** — active trip, trip list, filters
- **`uiStore`** — panel states, modals, loading indicators

### Map Layer System

Layers are toggled via the UI and managed through the shared `map-core` package. Full layer specifications (sources, APIs, formats) are in the [Map & Geospatial](#map--geospatial) section.

| Category | Layer | Type | Source |
|---|---|---|---|
| **Base** | Topographic | Vector | Mapbox Outdoors v12 (`mapbox://styles/mapbox/outdoors-v12`) |
| **Base** | Satellite | Raster | Mapbox Satellite Streets v12 (`mapbox://styles/mapbox/satellite-streets-v12`) |
| **Base** | Country Topographic | Raster (WMTS/XYZ) | National mapping agency tiles, auto-selected by viewport (swisstopo, IGN, basemap.at, BKG, Kartverket, USGS); OpenTopoMap manually-selectable global topo source; Mapbox Outdoors global default |
| **Base** | Satellite — Summer | Raster (WMS) | Sentinel-2 via Copernicus Sentinel Hub (Jun–Aug composite, 10m, MAXCC=20); proxied through backend |
| **Base** | Satellite — Winter | Raster (WMS) | Sentinel-2 via Copernicus Sentinel Hub (Dec–Feb composite, 10m, MAXCC=30); proxied through backend |
| **Base** | 3D Terrain | DEM | Mapbox Terrain-DEM v1 (`mapbox.mapbox-terrain-dem-v1`) |
| **Mode** | Winter style | Style switch | Custom Mapbox Studio style (from Outdoors base) |
| **Mode** | Summer style | Style switch | Custom Mapbox Studio style (from Outdoors base) |
| **Overlay** | Slope angle | Raster tiles | Copernicus GLO-30 DEM (pre-generated) + Mapbox Terrain RGB (client-side fallback) |
| **Overlay** | Sun/shade exposure | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Overlay** | Steep/flat terrain | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Overlay** | Aspect (slope direction) | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Overlay** | Avalanche slope filter | Raster tiles | Copernicus GLO-30 DEM (pre-generated) |
| **Data** | Trip routes | GeoJSON | mtamta API (`/api/v1/map/trips`) |
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
| **Tool** | Route planner | Interactive overlay | Draw waypoints → Mapbox Directions API (walking profile, proxied) → snapped route + elevation profile |

---

## Frontend — Mobile

### Stack

- **React Native** (bare or Expo)
- **`@rnmapbox/maps`** for Mapbox integration
- **React Navigation** for screen routing
- Shared `packages/shared` for types, API client, and utilities
- Shared `packages/map-core` for map configuration and layer definitions

### Shared Code with Web

| Package | Contents | Used By |
|---|---|---|
| `packages/shared` | TypeScript types, API client, validation | Web + Mobile |
| `packages/map-core` | Map styles, layer configs, Mapbox token | Web + Mobile |
| `packages/ui` | Platform-agnostic component logic (Phase 9+) | Web + Mobile |

### Offline Capabilities (Phase 11)

- Download map tile regions for offline use via Mapbox offline API
- Cache trip data locally (SQLite or AsyncStorage)
- Queue actions (likes, comments) for sync when back online
- GPS track recording works fully offline

### Performance Considerations

- If map performance becomes a bottleneck on React Native, specific map-heavy screens can be ejected to native code
- Lazy-load screens and heavy components
- Minimize bridge traffic between JS and native map layer

---

## Map & Geospatial

**Geographic priority**: Alps + North America + Scandinavia first, eventually worldwide. Country-specific topographic maps from national mapping agencies provide higher detail than Mapbox Outdoors for priority regions.

### Mapbox Tilesets Used

| Tileset | ID | Type | Purpose |
|---|---|---|---|
| Streets v8 | `mapbox.mapbox-streets-v8` | Vector | Roads, landuse, water, labels, POIs |
| Terrain v2 | `mapbox.mapbox-terrain-v2` | Vector | Contour lines (10m at z14+), hillshade polygons, landcover |
| Terrain-DEM v1 | `mapbox.mapbox-terrain-dem-v1` | Raster DEM | 3D terrain rendering (0.1m precision, max z14) |
| Satellite | `mapbox.satellite` | Raster | Aerial/satellite imagery (50cm global) |

### Base Map Styles

| Style | URL | Usage |
|---|---|---|
| Outdoors v12 | `mapbox://styles/mapbox/outdoors-v12` | Default — trails, contours, hillshade, peaks |
| Satellite Streets v12 | `mapbox://styles/mapbox/satellite-streets-v12` | Satellite with road/label overlays |
| Custom Winter | `mapbox://styles/{username}/winter` | Snow-tinted terrain, blue water, white roads (built in Mapbox Studio from Outdoors base) |
| Custom Summer | `mapbox://styles/{username}/summer` | Green vegetation emphasis (built in Mapbox Studio from Outdoors base) |
| OpenTopoMap | `https://tile.opentopomap.org/{z}/{x}/{y}.png` | Outdoor-focused manually-selectable topo source (raster XYZ, max z19, CC-BY-SA) |
| Sentinel-2 Summer | Copernicus Sentinel Hub WMS (proxied) | Seasonal satellite composite: Jun–Aug, 10m, MAXCC ≤20% |
| Sentinel-2 Winter | Copernicus Sentinel Hub WMS (proxied) | Seasonal satellite composite: Dec–Feb, 10m, MAXCC ≤30% |

**Country-specific topo sources**: National mapping agency topo maps are available as additional base layer options for priority regions (Switzerland, France, Austria, Germany, Norway, USA). Auto-selected by viewport location. See [Country-Specific Topographic Maps](#country-specific-topographic-maps) in the Layer Catalog.

**Access token**: Stored in environment variables, loaded via `packages/map-core`.

### 3D Terrain Configuration

- **Source**: `mapbox.mapbox-terrain-dem-v1` (Terrain-DEM v1)
- **Tile size**: 512px
- **Max zoom**: 14 (SDK interpolates beyond)
- **Default exaggeration**: 1.5 (adjustable via UI slider)
- **Sky layer**: Enabled in 3D mode for atmospheric rendering
- **DEM decoding formula**: `height = -10000 + ((R × 256 × 256 + G × 256 + B) × 0.1)`

Both Mapbox GL JS and `@rnmapbox/maps` support 3D terrain natively. Combined with custom pitch/bearing controls for immersive flyover views.

### Layer Architecture

```
┌─────────────────────────────┐
│       UI Layer Controls     │  ← User toggles layers on/off
├─────────────────────────────┤
│      Live Data Layers       │  ← Weather, wind, snow, avalanche, lifts, webcams
├─────────────────────────────┤
│      Data Layers            │  ← Trips, ski runs, hiking trails, climbing areas
├─────────────────────────────┤
│      Terrain Overlays       │  ← Slope angle, sun exposure, steep/flat (custom tiles)
├─────────────────────────────┤
│      Mode                   │  ← Winter / Summer style applied on top of base
├─────────────────────────────┤
│      Base Layer             │  ← Topographic (Mapbox / country-specific / OpenTopoMap) OR Satellite
├─────────────────────────────┤
│      Terrain (3D)           │  ← DEM-based terrain exaggeration
└─────────────────────────────┘
```

### Layer Catalog

#### Base Layers (mutually exclusive)

| Layer | Source | Notes |
|---|---|---|
| Topographic | Mapbox Outdoors v12 | Default. Includes contours, hillshade, trails, peaks |
| Satellite | Mapbox Satellite Streets v12 | Toggle replaces base style |

#### Country-Specific Topographic Maps

National mapping agencies provide high-detail topographic maps that significantly exceed Mapbox Outdoors quality for their respective regions. These are added as raster tile sources (WMTS/XYZ) and function as alternative base layers within the "Topographic" category. Mapbox Outdoors remains the global default; OpenTopoMap is available as a manually-selectable outdoor-focused topo source.

| Source | Region | Tile URL / Endpoint | Type | Max Zoom | API Key | License |
|---|---|---|---|---|---|---|
| swisstopo | Switzerland | `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg` | XYZ (JPEG) | z21 | No | Free with attribution |
| swisstopo (winter) | Switzerland | `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg` | XYZ (JPEG) | z21 | No | Free with attribution |
| IGN Géoplateforme | France | WMTS via `data.geopf.fr` (SCAN25, PLAN.IGN layers) | WMTS | z19 | Yes (free tier: 2M tiles/day) | Free with attribution |
| basemap.at | Austria | WMTS via `basemap.at` (bmaphidpi layer) | WMTS | z19 | No | CC-BY 4.0 |
| BKG TopPlusOpen | Germany | `https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png` | WMTS (PNG) | z26 | No | DL-DE-BY 2.0 |
| Kartverket | Norway | WMTS via `opencache.statkart.no` (topo4 layer) | WMTS | z20 | No | CC-BY 4.0 |
| USGS National Map | USA | WMTS via `basemap.nationalmap.gov` (USGSTopo layer) | WMTS | z16 | No | Public domain |
| OpenTopoMap | Global | `https://tile.opentopomap.org/{z}/{x}/{y}.png` | XYZ (PNG) | z19 | No | CC-BY-SA 3.0 |

**Auto-selection logic**: When the map viewport center falls within a country's bounding box, the system auto-suggests (or auto-switches, based on user preference) the corresponding country topo source:

1. **Country-specific source** — if viewport center is within a supported country's bounds
2. **Mapbox Outdoors v12** — global default when no country-specific source matches

OpenTopoMap is available as a manual selection but is not part of the auto-selection fallback chain.

> **Why raster?** Country topo sources are pre-rendered cartographic products from national mapping agencies. Using their raster tiles gives expert-quality cartography (contour styling, hillshading, trail symbols, local labels) with zero styling effort. Vector tile alternatives exist for some providers but would require building and maintaining per-country Mapbox GL style specs — significant effort for marginal benefit when the goal is to overlay national topo quality on the Mapbox vector basemap.

Country bounding boxes (approximate, stored in `packages/map-core`):

| Country | Bounding Box (SW → NE) |
|---|---|
| Switzerland | 45.82°N, 5.96°E → 47.81°N, 10.49°E |
| France | 41.33°N, -5.14°E → 51.09°N, 9.56°E |
| Austria | 46.37°N, 9.53°E → 49.02°N, 17.16°E |
| Germany | 47.27°N, 5.87°E → 55.06°N, 15.04°E |
| Norway | 57.96°N, 4.50°E → 71.19°N, 31.17°E |
| USA | 24.40°N, -124.85°W → 49.38°N, -66.89°W |

**Overlap handling**: When the viewport center falls within multiple countries' bounding boxes (e.g., border regions), prefer the source with the smallest bounding box (most specific/detailed source wins). User can always manually override via the layer panel.

**Attribution**: Each source requires different attribution text. The map attribution control must dynamically update when the active topo source changes. Attribution strings are stored per-source in `packages/map-core`.

**Tile caching**: Country topo tiles cached in Redis using existing `tile:{z}:{x}:{y}:{layer}` pattern with 24h TTL (these tiles change infrequently). IGN tiles proxied through Go backend (API key must not be exposed to client); all others loaded directly from client. Monitor Redis memory usage; consider migrating topo tile cache to S3/disk if memory exceeds budget.

#### Seasonal Satellite Imagery

Copernicus Sentinel-2 imagery (10m resolution) provides seasonal satellite views via the Sentinel Hub WMS API hosted on the Copernicus Data Space Ecosystem. This supplements the default Mapbox Satellite (which is a fixed "best available" composite with no seasonal control).

**Provider**: Copernicus Data Space Ecosystem (dataspace.copernicus.eu)
**API**: Sentinel Hub WMS with `TIME` and `MAXCC` parameters
**Registration**: Free account → create Configuration Instance → get Instance ID
**Free tier**: 10,000 processing units/month, 10,000 requests/month

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
| Winter mode | Custom Mapbox Studio style (coupled seasonal switch) | Snow-tinted terrain, blue water, ski-focused POIs. Auto-activates: swisstopo winter base map (CH), Sentinel-2 winter satellite, swisstopo ski touring/snowshoe overlays (CH), OpenSnowMap pistes overlay. User can override individual layers |
| Summer mode | Custom Mapbox Studio style (coupled seasonal switch) | Green vegetation, hiking-focused POIs. Auto-activates: standard swisstopo (CH), Sentinel-2 summer satellite. User can override individual layers |

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
| Trip routes | mtamta API (`/api/v1/map/trips`) | GeoJSON | Live. User-uploaded GPX tracks within viewport |
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
| Route planner | Client + Server proxy | Draw waypoints on map → `POST /api/v1/routes/directions` (Mapbox Directions walking profile) → display snapped route + elevation profile (client-side `map.queryTerrainElevation`). Save as trip with `status='planned'`, `source='planned'`. Fallback: straight-line segments if Directions API unavailable |

#### Heatmap Storage

Heatmaps are pre-rendered raster tiles generated from trip route density using PostGIS `ST_HexGrid` or similar aggregation. Stored in S3 alongside terrain tiles (`s3://mtamta-tiles/heatmap/`). Regenerated periodically (daily or weekly) as a batch job in the `tilegen` CLI. No dedicated database table needed — generated from existing `trips.route` geometry.

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

> **Multi-pitch climbing data**: COROS watches and some Garmin devices segment climbing activities into approach, climb, and descent phases with per-pitch tracking. When FIT data contains these segments, the sync pipeline extracts them into `trip_segments` with pitch-level JSONB metadata.

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

## Database Design

### PostgreSQL + PostGIS

Primary data store for all persistent data. PostGIS extension enables geospatial queries (nearest trips, trips within bounding box, route intersections).

```sql
-- Users (see auth section above)

-- Trips
CREATE TABLE trips (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    title         TEXT NOT NULL,
    description   TEXT,
    activity_type TEXT NOT NULL,  -- 'ski', 'backcountry_ski', 'trail_run', 'climb', etc.
    route         GEOGRAPHY(LineString, 4326),  -- PostGIS geography
    distance_m    FLOAT,
    elevation_gain_m FLOAT,
    elevation_loss_m FLOAT,
    duration_s    INTEGER,
    start_point   GEOGRAPHY(Point, 4326),
    end_point     GEOGRAPHY(Point, 4326),
    gpx_file_url  TEXT,
    cover_photo_url TEXT,
    is_public     BOOLEAN NOT NULL DEFAULT TRUE,
    status        TEXT NOT NULL DEFAULT 'published',  -- 'draft', 'planned', 'published'
    route_waypoints JSONB,  -- Original waypoints for planned routes: [{"lng": ..., "lat": ...}, ...]
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trips_route ON trips USING GIST(route);
CREATE INDEX idx_trips_start_point ON trips USING GIST(start_point);
CREATE INDEX idx_trips_activity_type ON trips(activity_type);
CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_status ON trips(status) WHERE status != 'published';
```

All spatial columns use `GEOGRAPHY` (not `GEOMETRY`) so distance/length functions return meters by default.

**Canonical activity types**: `ski`, `backcountry_ski`, `snowboard`, `trail_run`, `hike`, `climb`, `boulder`, `alpinism`, `bike`, `other`. Validated at the application layer (Go service).

> **Climbing trip note**: For `climb` and `alpinism` activity types, the primary `route` field may be unreliable (GPS multipath on vertical walls). Structured data lives in the `trip_segments` table, where each climb segment contains pitch-level JSONB metadata. The `route` field still stores whatever GPS track is available for map display.

```sql
-- Trip Photos
CREATE TABLE trip_photos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    caption    TEXT,
    location   GEOGRAPHY(Point, 4326),
    taken_at   TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Social: Follows
CREATE TABLE follows (
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, followed_id)
);

-- Social: Likes
CREATE TABLE trip_likes (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, trip_id)
);

-- Social: Saves (bookmarks)
CREATE TABLE trip_saves (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, trip_id)
);

-- Social: Comments
CREATE TABLE comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,       -- 'follow', 'like', 'comment'
    payload    JSONB NOT NULL,
    read       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
```

**Notifications**: In-app notifications via the `notifications` table (user_id, type, payload JSONB, read BOOLEAN, created_at). Fetched via `GET /api/v1/notifications`. Push notifications and email deferred to post-launch.

```sql
-- Locations (resorts, peaks, trailheads, etc.)
CREATE TABLE locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    region      TEXT,
    country     TEXT,
    type        TEXT NOT NULL,  -- 'resort', 'peak', 'trailhead', 'town', 'hut', 'crag'
    location    GEOGRAPHY(Point, 4326) NOT NULL,
    elevation_m FLOAT,
    source      TEXT,           -- 'openskidata', 'osm', 'manual'
    source_id   TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_locations_geo ON locations USING GIST(location);
CREATE INDEX idx_locations_type ON locations(type);
```

> **Crag-specific metadata** (stored in `metadata` JSONB for `type='crag'`):
> `wall_orientation` (compass bearing), `rock_type` (limestone/granite/sandstone/gneiss), `approach_description`, `approach_time_min`, `route_count` (denormalized), `altitude_m`, `season` (recommended months)

### Device Integration Tables

```sql
-- OAuth credentials for connected devices
CREATE TABLE device_providers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         TEXT NOT NULL,          -- 'garmin', 'coros', etc.
    provider_uid     TEXT,                   -- User's ID at provider
    access_token     BYTEA NOT NULL,         -- AES-GCM encrypted
    refresh_token    BYTEA NOT NULL,         -- AES-GCM encrypted
    token_expires_at TIMESTAMPTZ NOT NULL,
    last_sync_at     TIMESTAMPTZ,
    sync_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Tracks which provider activities map to which trips
CREATE TABLE synced_activities (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_provider_id   UUID NOT NULL REFERENCES device_providers(id) ON DELETE CASCADE,
    provider_activity_id TEXT NOT NULL,
    trip_id              UUID REFERENCES trips(id) ON DELETE SET NULL,
    fit_file_url         TEXT,
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status          TEXT NOT NULL DEFAULT 'success', -- success/failed/skipped
    error_message        TEXT,
    UNIQUE(device_provider_id, provider_activity_id)
);
```

**Trips table alterations** (added for device sync support):

```sql
ALTER TABLE trips ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
  -- Values: 'manual', 'garmin', 'coros', 'suunto', 'apple_health', 'gps_recording', 'planned'
ALTER TABLE trips ADD COLUMN source_id TEXT;
  -- Format: '{provider}:{activity_id}' for dedup
ALTER TABLE trips ADD COLUMN fit_file_url TEXT;
  -- S3 URL to original FIT file
```

### Climbing Trip Model

```sql
-- Trip segments (approach/climb/descent phases for climbing trips)
CREATE TABLE trip_segments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    segment_type  TEXT NOT NULL,  -- 'approach', 'climb', 'descent'
    segment_order INTEGER NOT NULL,
    track         GEOGRAPHY(LineString, 4326),
    elevation_gain_m FLOAT,
    elevation_loss_m FLOAT,
    duration_s    INTEGER,
    pitches       JSONB,  -- [{number, grade: {yds, french, uiaa}, elevation_m, duration_s, belay_type}]
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_segments_trip_id ON trip_segments(trip_id);

-- Climbing routes at a crag
CREATE TABLE climbing_routes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crag_id       UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    grades        JSONB NOT NULL,  -- { yds: "5.10a", french: "6a+", uiaa: "VI+" }
    route_type    TEXT NOT NULL,   -- 'sport', 'trad', 'boulder', 'aid', 'ice', 'mixed', 'alpine'
    pitches       JSONB,           -- [{number, grade: {yds, french, uiaa}, length_m, description}]
    description   TEXT,
    first_ascent  TEXT,
    protection    TEXT,
    source        TEXT,            -- 'manual', 'openbeta'
    source_id     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_climbing_routes_crag_id ON climbing_routes(crag_id);
CREATE INDEX idx_climbing_routes_route_type ON climbing_routes(route_type);

-- Photo topos for a crag
CREATE TABLE crag_topos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crag_id         UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    photo_url       TEXT NOT NULL,
    photo_width     INTEGER NOT NULL,
    photo_height    INTEGER NOT NULL,
    route_overlays  JSONB NOT NULL,  -- [{route_id, path: "M0.1,0.2 L0.3,0.4...", color, label}]
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_crag_topos_crag_id ON crag_topos(crag_id);

-- 3D crag models (Tier 3, future)
CREATE TABLE crag_models (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crag_id         UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    model_url       TEXT NOT NULL,    -- glTF file URL
    pointcloud_url  TEXT,             -- Potree point cloud URL
    bounds          GEOGRAPHY(Polygon, 4326),
    transform       JSONB,           -- Position/rotation/scale for Mapbox placement
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_crag_models_crag_id ON crag_models(crag_id);
```

**Grade storage**: Grades are stored as multi-system JSONB (`{ yds: "5.10a", french: "6a+", uiaa: "VI+" }`). The backend is a dumb store — it accepts and returns whatever grade systems the client provides. Frontend uses `@openbeta/sandbag` for grade conversion, comparison, and display in the user's preferred system.

**SVG path coordinates**: Route overlays in `crag_topos.route_overlays` use normalized 0–1 coordinates relative to the photo dimensions. This allows overlays to scale correctly regardless of display size. Example path: `"M0.12,0.85 C0.15,0.60 0.20,0.40 0.25,0.15"`.

**3D rendering**: Crag 3D models (glTF) are rendered in Mapbox via Threebox's `CustomLayerInterface`. The `transform` JSONB stores position (lng/lat/altitude), rotation, and scale for correct geospatial placement. Point clouds use Potree for large datasets. This is Tier 3 (experimental/future).

### TimescaleDB — Time-Series Data

TimescaleDB is a PostgreSQL extension included in the `timescale/timescaledb-ha` Docker image alongside PostGIS. Tables use standard PostgreSQL initially — `create_hypertable()` is a one-line migration when data volume justifies it (no infrastructure change needed).

```sql
-- Weather observations
CREATE TABLE weather_observations (
    time        TIMESTAMPTZ NOT NULL,
    location    GEOGRAPHY(Point, 4326) NOT NULL,
    station_id  TEXT,
    temperature FLOAT,
    humidity    FLOAT,
    pressure    FLOAT,
    precip_mm   FLOAT,
    visibility  FLOAT,
    cloud_cover FLOAT
);
-- Enable when data volume justifies it:
-- SELECT create_hypertable('weather_observations', 'time');

-- Wind observations
CREATE TABLE wind_observations (
    time       TIMESTAMPTZ NOT NULL,
    location   GEOGRAPHY(Point, 4326) NOT NULL,
    station_id TEXT,
    speed_ms   FLOAT,
    direction  FLOAT,
    gust_ms    FLOAT
);
-- Enable when data volume justifies it:
-- SELECT create_hypertable('wind_observations', 'time');

-- Snow observations
CREATE TABLE snow_observations (
    time      TIMESTAMPTZ NOT NULL,
    location  GEOGRAPHY(Point, 4326) NOT NULL,
    depth_cm  FLOAT,
    new_cm    FLOAT
);
-- Enable when data volume justifies it:
-- SELECT create_hypertable('snow_observations', 'time');

-- Avalanche reports
CREATE TABLE avalanche_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source        TEXT NOT NULL,       -- 'avalanche_org', 'slf', 'albina'
    region_id     TEXT NOT NULL,
    danger_level  INTEGER NOT NULL,    -- 1-5
    danger_zones  GEOGRAPHY(MultiPolygon, 4326),
    problems      JSONB,               -- [{type, aspects, elevations}]
    bulletin_text TEXT,
    published_at  TIMESTAMPTZ NOT NULL,
    expires_at    TIMESTAMPTZ,
    raw_data      JSONB,
    fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, region_id, published_at)
);

-- Lift status
CREATE TABLE lift_status (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resort_id   TEXT NOT NULL,
    source      TEXT NOT NULL,         -- 'liftie', 'scraper'
    lift_name   TEXT NOT NULL,
    status      TEXT NOT NULL,         -- 'open', 'closed', 'hold', 'scheduled'
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(resort_id, lift_name)
);
```

### Pipeline Health

```sql
-- Tracks every ingest pipeline run for observability
CREATE TABLE pipeline_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline      TEXT NOT NULL,        -- 'weather', 'avalanche', 'lifts', 'device_sync', etc.
    status        TEXT NOT NULL,        -- 'success', 'failed', 'running'
    started_at    TIMESTAMPTZ NOT NULL,
    finished_at   TIMESTAMPTZ,
    duration_ms   INTEGER,
    rows_affected INTEGER,              -- Records fetched/updated
    error_message TEXT,
    metadata      JSONB                 -- Pipeline-specific context (e.g., region, provider)
);
CREATE INDEX idx_pipeline_runs_pipeline ON pipeline_runs(pipeline, started_at DESC);
```

Retention: keep 30 days of runs, prune older rows via a weekly cleanup query. At ~100 runs/day this table stays small.

### Data Retention

**User Deletion**: Soft delete via `deleted_at TIMESTAMPTZ` column on `users` table. On delete: set display_name to "Deleted User", clear bio/avatar/email, keep trips as "by deleted user" unless user requests full data removal. GDPR export: `GET /api/v1/users/me/export` returns JSON dump of all user data.

**Trip Deletion**: Hard delete with `ON DELETE CASCADE` (photos, segments, likes, comments all removed).

**Data Cleanup**:

| Data | Retention | Method |
|---|---|---|
| `notifications` | 90 days | Auto-delete via scheduled cleanup |
| `pipeline_runs` | 30 days | Weekly prune query (already specified) |
| `weather_observations` | 90 days | Drop old rows (continuous aggregates can retain summaries if hypertables are enabled) |
| `wind_observations` | 90 days | Same as weather |
| `snow_observations` | 90 days | Same as weather |

### Redis — Cache Layer

| Key Pattern | Purpose | TTL |
|---|---|---|
| `tile:{z}:{x}:{y}:{layer}` | Cached rendered tiles (terrain overlays: 1h; country topo: 24h) | 1–24 hours |
| `weather:{lat}:{lon}` | Current weather at location | 15 minutes |
| `lift_status:{resort_id}` | Current lift statuses | 5 minutes |
| `user_session:{token}` | Refresh token lookup | 30 days |
| `rate_limit:{ip}` | Rate limit counter | 1 minute |
| `sentinel:{season}:{year}:{z}:{x}:{y}` | Seasonal satellite tiles (Sentinel-2) | 7 days |
| `integration:sync_lock:{user_id}:{provider}` | Prevents concurrent syncs | 10 minutes |
| `integration:oauth_state:{state}` | OAuth PKCE state + code_verifier | 5 minutes |
| `crags:bbox:{hash}` | Crag locations within bounding box | 15 minutes |
| `webcam:{lat}:{lon}` | Nearby webcam thumbnails + metadata | 10 minutes |
| `directions:{sha256(waypoints)}` | Cached Mapbox Directions response | 1 hour |

---

## Search

### Meilisearch

Used for fast, typo-tolerant full-text search across trips, locations, and users.

**Indexes**:

| Index | Searchable Fields | Filterable Fields |
|---|---|---|
| `trips` | title, description, location name | activity_type, user_id, created_at |
| `locations` | name, region, country | type (resort, peak, trailhead) |
| `users` | display_name, bio | — |
| `crags` | name, region, rock_type, approach_description | type (crag), rock_type, location._geo |
| `climbing_routes` | name, description, first_ascent | route_type, crag_id, grade (sortable) |

**Sync Strategy**: After any trip/user create or update, push the updated document to Meilisearch. This can be async (via a small queue or goroutine).

**Geo Search**: Meilisearch supports `_geo` filtering, allowing "trips near me" queries with a radius.

---

## Storage

### S3-Compatible Object Storage

All user-uploaded files are stored in S3-compatible storage (AWS S3, MinIO, Cloudflare R2, or equivalent).

| Bucket / Prefix | Contents | Access |
|---|---|---|
| `gpx/` | Raw GPX files | Private (signed URLs) |
| `photos/` | Trip photos (original) | Public CDN |
| `photos/thumb/` | Trip photos (thumbnails) | Public CDN |
| `avatars/` | User profile photos | Public CDN |
| `fit/` | Raw FIT files from device syncs | Private (signed URLs) |
| `topos/` | Crag topo photos (originals) | Public CDN |
| `models/` | 3D crag models (glTF) and point clouds | Public CDN |

**Upload Flow**:
1. Client requests a pre-signed upload URL from the API
2. Client uploads directly to S3 (no proxying through the API)
3. Client sends the S3 key back to the API to associate with the trip/user
4. API generates thumbnails asynchronously (for photos)

---

## API Endpoints

### System

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health check (reports status of configured dependencies: postgres, redis, and — when enabled — meilisearch) |
| `GET` | `/api/v1/admin/pipelines` | Pipeline health dashboard (last run status per pipeline, admin only) |

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/google` | Sign in with Google ID token |
| `POST` | `/api/v1/auth/apple` | Sign in with Apple ID token |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Invalidate refresh token |

### Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/users/me` | Get current user profile |
| `PATCH` | `/api/v1/users/me` | Update current user profile |
| `GET` | `/api/v1/users/:id` | Get user by ID |
| `GET` | `/api/v1/users/:id/trips` | Get user's public trips |
| `GET` | `/api/v1/users/:id/followers` | Get user's followers |
| `GET` | `/api/v1/users/:id/following` | Get users this user follows |
| `GET` | `/api/v1/users/me/export` | Export all user data (GDPR) |
| `DELETE` | `/api/v1/users/me` | Soft-delete current user account |

### Trips

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/trips` | Create a trip |
| `GET` | `/api/v1/trips/:id` | Get trip details |
| `PATCH` | `/api/v1/trips/:id` | Update a trip |
| `DELETE` | `/api/v1/trips/:id` | Delete a trip |
| `GET` | `/api/v1/trips` | List/search trips (filters: activity_type, bbox, status). Defaults to status=published |
| `POST` | `/api/v1/trips/:id/gpx` | Upload GPX file for trip |
| `POST` | `/api/v1/trips/:id/photos` | Upload photos for trip |
| `GET` | `/api/v1/trips/trending` | Get trending trips |
| `GET` | `/api/v1/trips/featured` | Get featured trips |

### Climbing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/crags` | List/search crags (bbox, rock_type, route_count) |
| `GET` | `/api/v1/crags/:id` | Get crag details |
| `POST` | `/api/v1/crags` | Create a crag |
| `PATCH` | `/api/v1/crags/:id` | Update crag details |
| `GET` | `/api/v1/crags/:id/routes` | List climbing routes at a crag |
| `POST` | `/api/v1/crags/:id/routes` | Add a climbing route |
| `GET` | `/api/v1/climbing-routes/:id` | Get climbing route details |
| `PATCH` | `/api/v1/climbing-routes/:id` | Update a climbing route |
| `DELETE` | `/api/v1/climbing-routes/:id` | Delete a climbing route |
| `GET` | `/api/v1/crags/:id/topos` | List photo topos for a crag |
| `POST` | `/api/v1/crags/:id/topos` | Upload topo photo + route overlays |
| `PATCH` | `/api/v1/crag-topos/:id` | Update topo overlays |
| `DELETE` | `/api/v1/crag-topos/:id` | Delete a topo |
| `POST` | `/api/v1/trips/:id/segments` | Add segments to a trip |
| `GET` | `/api/v1/trips/:id/segments` | Get trip segments with pitch data |
| `PATCH` | `/api/v1/trip-segments/:id` | Update a trip segment |

### Social

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/users/:id/follow` | Follow a user |
| `DELETE` | `/api/v1/users/:id/follow` | Unfollow a user |
| `POST` | `/api/v1/trips/:id/like` | Like a trip |
| `DELETE` | `/api/v1/trips/:id/like` | Unlike a trip |
| `POST` | `/api/v1/trips/:id/save` | Save/bookmark a trip |
| `DELETE` | `/api/v1/trips/:id/save` | Unsave a trip |
| `GET` | `/api/v1/trips/:id/comments` | Get trip comments |
| `POST` | `/api/v1/trips/:id/comments` | Add a comment |
| `DELETE` | `/api/v1/comments/:id` | Delete a comment |
| `GET` | `/api/v1/feed` | Activity feed for current user |

### Notifications

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/notifications` | Get current user's notifications |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark notification as read |

### Integrations

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/integrations/providers` | List available providers + connection status |
| `GET` | `/api/v1/integrations/providers/:provider/auth` | Get OAuth URL to connect |
| `POST` | `/api/v1/integrations/providers/:provider/callback` | Exchange OAuth code |
| `DELETE` | `/api/v1/integrations/providers/:provider` | Disconnect provider |
| `GET` | `/api/v1/integrations/providers/:provider/status` | Sync status + stats |
| `PATCH` | `/api/v1/integrations/providers/:provider/settings` | Toggle auto-sync |
| `POST` | `/api/v1/integrations/providers/:provider/sync` | Manual sync (rate-limited: 1 per 5 min) |
| `GET` | `/api/v1/integrations/activities` | List synced activities (paginated) |
| `POST` | `/api/v1/integrations/providers/:provider/courses` | Push route to device |

### Geo / Map

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/map/trips` | Get trips within bounding box |
| `GET` | `/api/v1/map/pois` | Get POIs within bounding box |
| `GET` | `/api/v1/tiles/{layer}/{z}/{x}/{y}` | Get custom overlay tile |
| `GET` | `/api/v1/tiles/sentinel/{z}/{x}/{y}?season=winter&year=2024` | Get seasonal satellite tile (proxied Sentinel Hub) |
| `GET` | `/api/v1/map/crags` | Get crags within bounding box |
| `POST` | `/api/v1/routes/directions` | Proxy Mapbox Directions API (walking profile). Accepts waypoints, returns snapped route + distance |

### Weather / Live Data

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/weather` | Get weather for location |
| `GET` | `/api/v1/weather/forecast` | Get forecast for location |
| `GET` | `/api/v1/wind` | Get wind data for location |
| `GET` | `/api/v1/snow` | Get snow data for location |
| `GET` | `/api/v1/avalanche` | Get avalanche report for region |
| `GET` | `/api/v1/avalanche/:region/detail` | Get full avalanche bulletin detail (problems, aspects, elevations, text) |
| `GET` | `/api/v1/lifts` | Get lift status for resort |

### Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/search` | Global search (trips, locations, users) |
| `GET` | `/api/v1/search/trips` | Search trips |
| `GET` | `/api/v1/search/locations` | Search locations |

### Storage

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/upload/url` | Get pre-signed upload URL |

---

## Operations & Deployment

### Principles

- **Platform-independent by default**: Application code has zero knowledge of where it runs. All config via environment variables. Docker containers as the universal deployment unit.
- **Railway as primary platform**: Managed services, git-push deploys, private networking. Chosen for low ops overhead for a solo developer.
- **Thin platform coupling**: Only the CI/CD deploy step and `railway.toml` are Railway-specific. Everything else is portable.
- **No Terraform**: The infrastructure is simple enough (5 services on one platform) that Terraform adds overhead without proportional benefit. Revisit if external managed services (Timescale Cloud, Cloudflare workers, etc.) accumulate.

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

### Railway Services

| Service | Type | Source | Notes |
|---|---|---|---|
| **api** | Docker | `apps/api/Dockerfile` | Go binary with background goroutines (ingest pipeline, sync scheduler) |
| **postgres** | Docker | `timescale-postgis-ssl:pg17` | Railway TimescaleDB+PostGIS template. Extensions enabled via `001_init` migration. Regular tables initially; hypertables when data volume justifies it |
| **redis** | Railway plugin | Managed | Sessions, cache, rate limiting, sync locks |
| **meilisearch** | Docker | `getmeili/meilisearch:v1.12` | With persistent Railway volume for data |

Services communicate over Railway's private network (internal hostnames, no public exposure for databases).

### External Services

| Service | Provider | Purpose | Cost |
|---|---|---|---|
| **Static web hosting** | Cloudflare Pages | Vite build output, global CDN, automatic deploys from `apps/web/` | Free |
| **Object storage** | Cloudflare R2 | GPX files, FIT files, photos, terrain tiles, avatars | Free tier: 10GB storage, 10M reads/mo, zero egress |
| **DNS** | Cloudflare | DNS management, proxied records, automatic TLS | Free |
| **Error tracking** | Sentry | Go backend + React frontend error capture | Free tier: 5K events/mo |

### TimescaleDB Strategy

Local development and CI use `timescale/timescaledb-ha:pg17`. Railway production uses the [TimescaleDB + PostGIS template](https://railway.com/deploy/ZZURpX) (`ghcr.io/railwayapp-templates/timescale-postgis-ssl:pg17`), which adds SSL support. Both images include PostGIS and TimescaleDB but require explicit `CREATE EXTENSION` in the initial migration.

Tables use standard PostgreSQL initially. When time-series data volume justifies it (slow range queries, millions of rows), run `SELECT create_hypertable(...)` migrations — no infrastructure change needed.

### Container Strategy

**Go API** — multi-stage build for minimal image:

```dockerfile
# apps/api/Dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /api ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /api /api
EXPOSE 8080
CMD ["/api"]
```

**Local development** — `docker-compose.yml` mirrors production topology:

> **Note**: This docker-compose shows the final-state local development setup. Services are added incrementally per Phase (Redis in Phase 1, MinIO in Phase 4, Meilisearch in Phase 10).

```yaml
# docker-compose.yml (root)
services:
  postgres:
    image: timescale/timescaledb-ha:pg17
    environment:
      POSTGRES_DB: mtamta
      POSTGRES_USER: mtamta
      POSTGRES_PASSWORD: mtamta
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  meilisearch:
    image: getmeili/meilisearch:v1.12
    environment:
      MEILI_ENV: development
      MEILI_MASTER_KEY: mtamta-dev-key
    ports:
      - "7700:7700"
    volumes:
      - meilidata:/meili_data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  meilidata:
  miniodata:
```

The Go API and Vite dev server run on the host (not containerized) during development for fast iteration and hot reload. `turbo dev` starts both.

### Environment Configuration

All configuration via environment variables. No `.env` files committed to the repo.

```
# Core
PORT=8080
ENV=production|staging|development

# Database
DATABASE_URL=postgresql://user:pass@host:5432/mtamta?sslmode=require

# Redis
REDIS_URL=redis://host:6379

# Meilisearch
MEILI_URL=http://meilisearch:7700
MEILI_MASTER_KEY=...

# Auth
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
APPLE_CLIENT_ID=...

# Storage (S3-compatible — works with R2, MinIO, AWS S3)
S3_ENDPOINT=https://account.r2.cloudflarestorage.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=mtamta

# Mapbox
MAPBOX_ACCESS_TOKEN=...

# Device integrations
INTEGRATION_TOKEN_KEY=...    # AES-256 key for OAuth token encryption
GARMIN_CLIENT_ID=...
GARMIN_CLIENT_SECRET=...

# Sentinel Hub (Phase 3+)
SENTINEL_INSTANCE_ID=...

# External APIs
WINDY_API_KEY=...
IGN_API_KEY=...

# Monitoring
SENTRY_DSN=...
```

Railway injects `REDIS_URL` automatically for the managed Redis plugin. `DATABASE_URL` and other secrets are set via Railway dashboard or CLI (`railway variables set KEY=value`).

**Local development**: Use a `.env.local` file (gitignored) loaded by the Go API and Vite dev server.

### Developer Experience

**Local Development Workflow**:

- `make dev` — starts docker-compose services + Go API (with `watchexec` or `air` for hot reload) + Vite dev server
- `make seed` — loads sample data: 5 demo users, 20 trips across Alps/US, ski area data from OpenSkiData sample, sample crags
- `make test` — runs Go tests + frontend tests
- `make db-migrate` — run pending migrations
- `make db-reset` — drop and recreate from migrations + seed

**`.env.example`**: Committed to repo root with all required env vars and safe local defaults (pointing to docker-compose services). Developers copy to `.env.local` (gitignored).

**Seed Data**: Located in `data/seed/`. Contains:

- `users.sql` — demo users with various profiles
- `trips.sql` — sample trips with GPX routes (embedded as PostGIS LineStrings)
- `locations.sql` — sample resorts, peaks, trailheads
- Sample GPX files in `data/seed/gpx/`

### CI/CD Pipeline

GitHub Actions handles both CI and CD. The pipeline is platform-agnostic except for the final deploy step.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb-ha:pg17
        env:
          POSTGRES_DB: mtamta_test
          POSTGRES_USER: mtamta
          POSTGRES_PASSWORD: mtamta
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U mtamta"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.23"
      - run: go test ./...
        working-directory: apps/api
        env:
          DATABASE_URL: postgresql://mtamta:mtamta@localhost:5432/mtamta_test?sslmode=disable

  build-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npx turbo build --filter=web
      - run: npx turbo lint --filter=web

  # ── Deploy (only on push to main) ──────────────────────────
  deploy-api:
    needs: [test-api, build-web]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ┌─────────────────────────────────────────────────────┐
      # │ PLATFORM-SPECIFIC: Only this step changes if you    │
      # │ migrate away from Railway.                          │
      # └─────────────────────────────────────────────────────┘
      - uses: railwayapp/railway-github-link@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: api

  deploy-web:
    needs: [test-api, build-web]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npx turbo build --filter=web
      # Cloudflare Pages deploy
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy apps/web/dist --project-name=mtamta
```

**Deploy flow**:
1. Push to `main` (or merge PR)
2. CI runs: Go tests (with PostGIS test DB), turbo build, turbo lint
3. If CI passes: deploy API to Railway, deploy web to Cloudflare Pages
4. Railway builds the Docker image from `apps/api/Dockerfile` and deploys
5. Cloudflare Pages serves the new static build

**PR previews**: Cloudflare Pages automatically creates preview deployments for PRs (e.g., `pr-42.mtamta.pages.dev`).

### Railway Configuration

```toml
# railway.toml (root)
[build]
dockerfilePath = "apps/api/Dockerfile"

[deploy]
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### Domain & TLS

| Domain | Points To | TLS |
|---|---|---|
| `mtamta.app` (or chosen domain) | Cloudflare Pages (web) | Automatic (Cloudflare) |
| `api.mtamta.app` | Railway service (api) | Automatic (Railway) |

Cloudflare DNS manages both records. The web app calls `api.mtamta.app` for all API requests. CORS configured in the Go middleware to allow the web origin.

### Observability

The observability strategy is designed for a solo developer running a modular monolith. There are no inter-service hops, so distributed tracing (Jaeger, Zipkin, OpenTelemetry collector) is unnecessary. Instead, the focus is on **request traceability**, **pipeline health**, and **error context**.

#### Tooling Overview

| Concern | Tool | Notes |
|---|---|---|
| **Structured logging** | `slog` (Go stdlib) | JSON in production, human-readable in development |
| **Request tracing** | Request ID middleware | UUID per request, propagated via `context.Context` |
| **Error tracking** | Sentry | Go SDK (`sentry-go`) + React SDK (`@sentry/react`) |
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
  "path": "/api/v1/trips",
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
| **INFO** | Every HTTP request (on completion), pipeline run results, user actions (login, trip create) |
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

The `GET /api/v1/health` endpoint checks all configured dependencies. Services are included only when their URL is set (e.g., Meilisearch appears after Phase 10):

```json
{
  "status": "healthy",
  "version": "abc1234",
  "uptime_s": 86400,
  "checks": {
    "postgres": "ok",
    "redis": "ok",
    "meilisearch": "ok"
  }
}
```

Returns HTTP 200 if all checks pass, HTTP 503 if any critical dependency is down (unconfigured services are omitted, not failed). Railway uses this for deployment health checks and automatic restarts.

#### Alerting Summary

| Trigger | Channel | Source |
|---|---|---|
| Unhandled error / panic | Email (or Slack) | Sentry |
| Error rate spike (>10 errors/min) | Email | Sentry alert rule |
| Pipeline missed schedule | Email | Sentry Cron Monitor |
| API downtime | Email | Uptime Robot |
| Deploy failure | GitHub notification | GitHub Actions |

No PagerDuty or on-call rotation — this is a solo project. Email alerts are sufficient. Sentry's default alert rules cover error spikes out of the box.

### Backups

| Data | Strategy | Retention |
|---|---|---|
| **PostgreSQL** | Railway automatic daily backups + point-in-time recovery | Managed by Railway (varies by plan) |
| **PostgreSQL** (additional) | Weekly `pg_dump` to R2 via GitHub Actions cron job | 30 days |
| **Redis** | No backup — cache is ephemeral and rebuilt from Postgres | N/A |
| **Meilisearch** | No backup — search index is rebuilt from Postgres via bulk re-index | N/A |
| **R2 (files)** | Durable by design (11 nines). No additional backup needed | Permanent |

**Scheduled backup workflow** (GitHub Actions):

```yaml
# .github/workflows/backup.yml
name: Database Backup

on:
  schedule:
    - cron: "0 3 * * 0" # Weekly, Sunday 3am UTC

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Dump database
        run: |
          pg_dump "$DATABASE_URL" | gzip > backup-$(date +%Y%m%d).sql.gz
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Upload to R2
        run: |
          aws s3 cp backup-*.sql.gz s3://mtamta-backups/ \
            --endpoint-url ${{ secrets.S3_ENDPOINT }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.S3_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.S3_SECRET_KEY }}
```

### Migration Playbook

If Railway stops working for you, here's what's portable and what needs changing:

**Portable (zero changes)**:
- All application code (Go API, React web, shared packages)
- Dockerfiles
- `docker-compose.yml` (local dev)
- GitHub Actions CI jobs (test, build, lint)
- Environment variable schema
- Database migrations

**Platform-specific (swap required)**:
| Component | Railway | Fly.io equivalent | VPS equivalent |
|---|---|---|---|
| Deploy step | `railwayapp/railway-github-link` action | `superfly/flyctl-actions/setup-flyctl` + `fly deploy` | `ssh` + `docker compose pull && docker compose up -d` |
| Platform config | `railway.toml` | `fly.toml` | `docker-compose.prod.yml` |
| Managed Postgres | Railway plugin | Fly Postgres (or external) | Self-hosted container |
| Managed Redis | Railway plugin | Fly Redis (Upstash) | Self-hosted container |
| Secrets management | Railway dashboard/CLI | `fly secrets set` | `.env` on server or Vault |

**Migration steps** (estimated: half a day):
1. Set up account on new platform
2. Create services / provision databases
3. Swap the deploy step in `.github/workflows/ci.yml` (~10 lines)
4. Write new platform config file (`fly.toml` or `docker-compose.prod.yml`)
5. Set environment variables on new platform
6. `pg_dump` from Railway → `pg_restore` on new platform
7. Upload R2 data (or keep R2 — it's external to Railway)
8. Update DNS records (api.mtamta.app → new platform)
9. Verify health check passes, run smoke tests
