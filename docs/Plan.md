# mtamta — Implementation Plan

> Phased roadmap from empty repo to full outdoor adventure platform. Each phase builds on the prior and is designed to produce a working, demoable increment.

---

## Table of Contents

1. [Phase 1: Foundation](#phase-1-foundation)
2. [Phase 2: Maps Core](#phase-2-maps-core)
3. [Phase 3: Map Sources & Overlays](#phase-3-map-sources--overlays)
4. [Phase 4: Trip System](#phase-4-trip-system)
5. [Phase 5: Device Integrations](#phase-5-device-integrations)
6. [Phase 6: User & Social](#phase-6-user--social)
7. [Phase 7: Terrain Analysis Layers](#phase-7-terrain-analysis-layers)
8. [Phase 8: Live Data Integrations](#phase-8-live-data-integrations)
9. [Phase 9: Mobile App](#phase-9-mobile-app)
10. [Phase 10: Search & Discovery](#phase-10-search--discovery)
11. [Phase 11: Advanced Features](#phase-11-advanced-features)
12. [Phase 12: Polish & Launch](#phase-12-polish--launch)

---

## Phase 1: Foundation

**Goal**: Standing monorepo with a Go backend that serves authenticated API requests, a React web shell, and a working database.

### Dependencies

None — this is the starting point.

### Features

- Turborepo monorepo with `apps/web`, `apps/api`, `packages/shared`
- Go backend with HTTP server, router, and middleware
- PostgreSQL database with initial schema (users, auth_providers)
- Google Sign-In authentication (OAuth → JWT)
- Apple Sign-In authentication (OAuth → JWT)
- JWT access/refresh token issuance and validation
- Basic user profile endpoints (get/update self)
- React + Vite web app shell (renders, authenticates, displays current user)
- Shared TypeScript types and API client package

### Technical Tasks

1. **Initialize monorepo**
   - `package.json` with workspaces (`apps/*`, `packages/*`)
   - `turbo.json` with `build`, `dev`, `lint` pipelines
   - Root `.gitignore`, `.editorconfig`, `tsconfig.base.json`

2. **Scaffold Go backend** (`apps/api/`)
   - `go.mod` with module path
   - `cmd/server/main.go` — entry point, starts HTTP server
   - Router setup (chi or stdlib mux)
   - Middleware: request ID (UUID → context + `X-Request-ID` header), structured logging, CORS, panic recovery
   - Structured logging with `slog`: JSON in production, text in development. All log lines include `request_id`, `method`, `path`, `status`, `duration_ms`, `user_id`
   - Health check endpoint: `GET /api/v1/health` with dependency checks (postgres, redis)
   - Sentry integration: `sentry-go` SDK, panic recovery middleware, error context (request ID, user ID)
   - Configuration loading from environment variables

3. **Database setup**
   - Docker Compose file with PostgreSQL + PostGIS + TimescaleDB (`timescale/timescaledb-ha:pg17`), Redis (sessions, refresh tokens). Time-series tables use regular PostgreSQL initially; hypertables enabled when data volume justifies it. MinIO/local-fs in Phase 4, Meilisearch in Phase 10
   - Migration tooling (golang-migrate or goose)
   - Initial migration: enable extensions (`CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS timescaledb`), `users` table, `auth_providers` table
   - Database connection pool in Go

4. **Authentication**
   - `internal/auth/google.go` — verify Google ID tokens via JWKS
   - `internal/auth/apple.go` — verify Apple ID tokens via JWKS
   - `internal/auth/jwt.go` — issue/validate access + refresh tokens
   - `internal/auth/handler.go` — `POST /api/v1/auth/google`, `POST /api/v1/auth/apple`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`
   - `internal/auth/repository.go` — auth_providers CRUD
   - `internal/middleware/auth.go` — JWT auth middleware

5. **User module**
   - `internal/user/handler.go` — `GET /api/v1/users/me`, `PATCH /api/v1/users/me`
   - `internal/user/service.go` — user business logic
   - `internal/user/repository.go` — users table CRUD

6. **Scaffold web app** (`apps/web/`)
   - Vite + React + TypeScript project
   - Environment variable setup (API URL)
   - Google Sign-In integration (client-side)
   - Auth flow: get ID token → call backend → store JWT → show user info
   - Basic layout with header and placeholder content

7. **Shared packages** (`packages/shared/`)
   - TypeScript types: `User`, `AuthResponse`, `ApiError`
   - API client: typed `fetch` wrapper with auth header injection
   - Token storage utilities

8. **Docker & deployment setup**
   - `apps/api/Dockerfile` — multi-stage Go build (golang:1.23-alpine builder → alpine:3.20 runtime)
   - `docker-compose.yml` — local dev services (TimescaleDB+PostGIS, Redis). MinIO added in Phase 4, Meilisearch in Phase 10
   - `railway.toml` — deploy config with health check path
   - Railway project setup: api service (Docker), Postgres via TimescaleDB+PostGIS template (Docker), managed Redis

9. **CI/CD setup**
   - `.github/workflows/ci.yml` — on push/PR: `go test ./...` (with PostGIS service container), `turbo build`, `turbo lint`
   - On merge to `main`: auto-deploy API to Railway, deploy web to Cloudflare Pages
   - `.github/workflows/backup.yml` — weekly `pg_dump` to Cloudflare R2
   - Sentry integration for error tracking (Go + React)

10. **Testing foundation**
    - Table-driven tests for auth token verification (valid/expired/malformed) and JWT issuance
    - Integration test for full auth flow (mock Google ID token → JWT pair → protected endpoint)
    - Integration test for logout: issue refresh token → call `POST /auth/logout` → verify token deleted from Redis → verify `POST /auth/refresh` with old token returns 401
    - Integration test for request ID: send request → verify `X-Request-ID` in response header → verify same ID appears in structured log output
    - PostGIS test container in CI (already configured in task 9)

11. **Developer experience**
    - `Makefile` with `dev`/`test`/`seed`/`db-migrate`/`db-reset` targets
    - `.env.example` with all required env vars and safe local defaults
    - `data/seed/` with sample SQL (users, trips placeholder)

### Key Files

```
mtamta/
├── package.json
├── turbo.json
├── tsconfig.base.json
├── docker-compose.yml
├── railway.toml
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── backup.yml
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   ├── cmd/server/main.go
│   │   ├── internal/auth/
│   │   ├── internal/user/
│   │   ├── internal/middleware/
│   │   ├── internal/config/
│   │   └── migrations/001_init.up.sql
│   └── web/
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/main.tsx
│       ├── src/App.tsx
│       └── src/stores/authStore.ts
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/types/index.ts
├── Makefile
├── .env.example
├── data/seed/
│   └── users.sql
```

### Acceptance Criteria

- [ ] `make dev` starts all services (docker-compose + Go API with hot reload + Vite dev server)
- [ ] `make seed` loads sample data successfully
- [ ] Auth token verification has table-driven unit tests covering valid, expired, and malformed tokens
- [ ] Integration test proves full auth flow: mock ID token → JWT pair → authenticated request
- [ ] `turbo dev` starts both the Go API and Vite dev server
- [ ] `POST /api/v1/auth/google` with a valid Google ID token returns a JWT pair
- [ ] `POST /api/v1/auth/apple` with a valid Apple ID token returns a JWT pair
- [ ] `GET /api/v1/users/me` with a valid JWT returns the current user
- [ ] Web app renders, allows Google Sign-In, and displays the logged-in user's name
- [ ] Database migrations run cleanly on a fresh TimescaleDB+PostGIS instance
- [ ] All shared types are importable from both `apps/web` and `packages/shared`
- [ ] `POST /api/v1/auth/logout` invalidates the refresh token
- [ ] Every API response includes an `X-Request-ID` header; all log lines include the same request ID
- [ ] API logs are structured JSON in production with `request_id`, `method`, `path`, `status`, `duration_ms`, `user_id`
- [ ] Errors are reported to Sentry with request ID, user ID, and stack trace
- [ ] `GET /api/v1/health` returns dependency status (postgres, redis) and HTTP 503 if any are down
- [ ] GitHub Actions CI passes on push (go test + turbo build + lint)
- [ ] Merging to `main` auto-deploys API to Railway and web to Cloudflare Pages
- [ ] API is reachable at `api.mtamta.app/api/v1/health` (or chosen domain)
- [ ] Web app is served from Cloudflare Pages at the chosen domain

---

## Phase 2: Maps Core

**Goal**: Interactive map in the web app with base layer switching, 3D terrain, and winter/summer modes.

### Dependencies

- Phase 1 (web app shell, auth)

### Features

- Full-screen Mapbox GL JS map as the primary web UI
- Base layer switching: topographic / satellite
- 3D terrain rendering with pitch/bearing controls
- Winter mode and summer mode (Mapbox style switching)
- Layer toggle panel UI
- Map state management (Zustand store: center, zoom, bearing, pitch, active layers)
- Shared map configuration package
- Layout integration (map fills viewport, side panel overlay, responsive)

### Technical Tasks

1. **Map core package** (`packages/map-core/`)
   - Mapbox access token configuration
   - Base style: Mapbox Outdoors v12 (`mapbox://styles/mapbox/outdoors-v12`)
   - Satellite style: Mapbox Satellite Streets v12 (`mapbox://styles/mapbox/satellite-streets-v12`)
   - Winter style: Custom Mapbox Studio style (built from Outdoors base — snow-tinted, blue water, white roads)
   - Summer style: Custom Mapbox Studio style (built from Outdoors base — green vegetation emphasis)
   - Layer registry: metadata for each toggleable layer (see Architecture.md Layer Catalog)
   - 3D terrain source: `mapbox.mapbox-terrain-dem-v1` (Terrain-DEM v1, 512px tiles, max z14, default exaggeration 1.5)

2. **Map component** (`apps/web/src/map/`)
   - `MapContainer.tsx` — Mapbox GL JS initialization, lifecycle management
   - `MapControls.tsx` — zoom, compass, pitch, geolocate
   - `LayerPanel.tsx` — base layer selector + overlay toggles
   - `StyleSwitcher.tsx` — winter/summer mode toggle
   - 3D terrain toggle with exaggeration slider
   - Sky layer for atmospheric rendering in 3D mode

3. **Map state** (`apps/web/src/stores/mapStore.ts`)
   - Viewport state: center, zoom, bearing, pitch
   - Active base layer (topo | satellite)
   - Active mode (winter | summer)
   - Active overlay layers (set of layer IDs)
   - 3D terrain enabled/disabled

4. **Layout integration**
   - Map fills the viewport
   - Side panel overlay for future trip details
   - Layer panel as floating UI element
   - Responsive: panel collapses on small screens

### Key Files

```
packages/map-core/
├── src/
│   ├── config.ts          # Mapbox token, default center/zoom
│   ├── styles/
│   │   ├── topo.ts        # Topographic style URL or JSON
│   │   ├── satellite.ts   # Satellite style URL or JSON
│   │   ├── winter.ts      # Winter custom style
│   │   └── summer.ts      # Summer custom style
│   ├── layers/
│   │   └── registry.ts    # Layer metadata and configuration
│   └── terrain.ts         # 3D terrain source config

apps/web/src/
├── map/
│   ├── MapContainer.tsx
│   ├── MapControls.tsx
│   ├── LayerPanel.tsx
│   └── StyleSwitcher.tsx
├── stores/
│   └── mapStore.ts
└── pages/
    └── MapPage.tsx
```

### Acceptance Criteria

- [ ] Map renders full-screen on page load at a default location
- [ ] User can switch between topographic and satellite base layers
- [ ] User can toggle winter/summer mode and the map style updates
- [ ] 3D terrain can be enabled; tilting the map shows terrain relief
- [ ] Map state (center, zoom, layers) persists across style switches
- [ ] Layer panel shows all available layers with toggle controls
- [ ] Map is responsive and usable on tablet-sized screens

---

## Phase 3: Map Sources & Overlays

**Goal**: Country-specific topographic maps, seasonal satellite imagery, and ski-focused overlays on top of the core map.

### Dependencies

- Phase 2 (map rendering, layer system)

### Features

- Country-specific topographic base layers (swisstopo, IGN, basemap.at, BKG, Kartverket, USGS) with viewport-based auto-selection, OpenTopoMap as intermediate fallback, and Mapbox Outdoors as global default
- Seasonal satellite imagery (summer/winter) via Copernicus Sentinel-2, proxied through backend
- Coupled season modes (winter/summer toggle auto-switches satellite variant, swisstopo variant, and seasonal overlays)
- swisstopo winter base map variant with ski touring and snowshoe route overlays
- OpenSnowMap pistes overlay (global ski piste + lift layer)

### Technical Tasks

1. **Country topographic source catalog** (`packages/map-core/`)
   - Country-specific topographic source catalog: tile URLs, WMTS endpoints, max zoom, API key requirements, license/attribution per source
   - Country bounding box definitions for viewport-based auto-selection (Switzerland, France, Austria, Germany, Norway, USA)
   - OpenTopoMap configuration as intermediate global topo fallback
   - Dynamic attribution strings per topo source
   - Sentinel-2 seasonal satellite configuration: WMS URL template, season date ranges, MAXCC values
   - swisstopo winter variant: `ch.swisstopo.pixelkarte-farbe-winter` layer ID and tile URL
   - swisstopo winter sport overlay configs: ski touring routes, snowshoe routes
   - OpenSnowMap pistes tile source configuration

2. **Map source components** (`apps/web/src/map/`)
   - `TopoSourceSwitcher.tsx` — country topo source selector (auto-suggestion banner + manual override dropdown)
   - Viewport-based auto-detection: on viewport change, check if center falls within a country bounding box and suggest/switch topo source
   - Dynamic map attribution: update attribution control text when topo source changes
   - Satellite sub-selector: Default (Mapbox) / Summer (Sentinel-2) / Winter (Sentinel-2) options within satellite base layer
   - Coupled season mode: winter/summer toggle auto-switches satellite variant, swisstopo variant (CH), and seasonal overlays together. User can override individual layers

3. **Map state extensions** (`apps/web/src/stores/mapStore.ts`)
   - Active topo source (mapbox-outdoors | country-specific ID | opentopomap)
   - Auto-topo-selection preference (auto | manual)
   - Detected country for viewport (derived from bounding box check)
   - Active satellite variant (mapbox-default | sentinel-summer | sentinel-winter)
   - Season mode (winter | summer | auto) — extends existing winter/summer mode toggle

4. **Backend proxy & caching**
   - Configure raster tile sources for each national mapping agency (WMTS/XYZ endpoints)
   - IGN Géoplateforme: register free API key, configure WMTS tile URL template
   - Viewport-to-country bounding box intersection check (point-in-rectangle, no geocoding needed)
   - Auto-selection logic: viewport center moves → detect country → suggest/switch topo source
   - Overlap handling for border regions: prefer source whose bbox center is nearest to viewport center
   - Attribution manager: swap attribution text when active topo source changes
   - Proxy endpoint for IGN tiles: `GET /api/v1/tiles/ign/{z}/{x}/{y}` (API key must not be exposed to client)
   - swisstopo, basemap.at, BKG, Kartverket, and USGS tiles loaded directly from source (no proxy needed — no API keys, generous rate limits)
   - Proxy endpoint for OpenTopoMap tiles: `GET /api/v1/tiles/opentopomap/{z}/{x}/{y}` — proxy with Redis cache (`tile:opentopomap:{z}:{x}:{y}`, 24h TTL) to stay within OpenTopoMap's ~2 req/sec fair-use limit
   - swisstopo winter variant: swap tile URL when season mode = winter and viewport is in Switzerland
   - swisstopo winter sport overlays: ski touring + snowshoe route layers, enabled in winter mode
   - Proxy endpoint for Sentinel-2 seasonal tiles: `GET /api/v1/tiles/sentinel/{season}/{z}/{x}/{y}` (Instance ID not exposed to client)
   - Redis caching for Sentinel-2 tiles: `sentinel:{season}:{year}:{z}:{x}:{y}`, 7-day TTL
   - OpenSnowMap pistes overlay source integration

5. **Basic tile proxy handler** (`apps/api/internal/geo/tileproxy.go`)
   - Implement basic tile proxy handler for IGN, OpenTopoMap, and Sentinel-2 tiles. The full terrain tile generation pipeline is in Phase 7; this phase only adds HTTP proxy + Redis caching for external tile sources
   - Redis caching for country topo tiles (where proxied): `tile:{z}:{x}:{y}:{layer}`, 24-hour TTL

6. **Tile proxy tests**
   - Integration test: request IGN tile → verify Redis cache populated → second request served from cache
   - Integration test: request Sentinel-2 tile → verify 7-day TTL in Redis
   - Integration test: request OpenTopoMap tile → verify 24h TTL in Redis
   - Unit test: verify proxy injects API keys and does not expose them in response

### Key Files

```
packages/map-core/src/
├── country-topo/       # Country-specific topo source configs
│   ├── index.ts        # Source catalog + auto-selection logic
│   ├── swisstopo.ts
│   ├── ign.ts
│   ├── basemap-at.ts
│   ├── bkg.ts
│   ├── kartverket.ts
│   ├── usgs.ts
│   ├── opentopomap.ts
│   └── bounds.ts       # Country bounding boxes
├── seasonal/            # Seasonal satellite + topo configs
│   ├── sentinel.ts      # Sentinel Hub WMS config, season date ranges
│   └── swisstopo-winter.ts  # swisstopo winter variant + sport overlays

apps/web/src/map/
└── TopoSourceSwitcher.tsx
```

### Acceptance Criteria

- [ ] When viewport is over Switzerland, swisstopo topo map is auto-suggested or auto-applied
- [ ] Country-specific topo sources render correctly as raster tile layers for all 6 supported countries
- [ ] OpenTopoMap is used as fallback when viewport is outside supported countries
- [ ] User can manually override the auto-selected topo source via the layer panel
- [ ] Map attribution updates dynamically to reflect the active topo source
- [ ] IGN tiles are proxied through the backend (API key not exposed to client)
- [ ] User can select Summer or Winter satellite view; seasonal Sentinel-2 imagery loads as raster tiles
- [ ] Sentinel-2 tiles are proxied through backend (Instance ID not exposed)
- [ ] Winter/summer mode toggle is coupled: auto-switches satellite variant, swisstopo variant (CH), and seasonal overlays together
- [ ] In winter mode over Switzerland, swisstopo switches to winter base map variant
- [ ] swisstopo ski touring and snowshoe route overlays are available in winter mode
- [ ] OpenSnowMap pistes layer renders as a toggleable overlay
- [ ] User can manually override any individually coupled layer
- [ ] Sentinel-2 tiles are cached in Redis with 7-day TTL
- [ ] Country topo tiles (where proxied) are cached in Redis with 24-hour TTL
- [ ] OpenTopoMap tiles are proxied through the backend with 24h Redis cache

---

## Phase 4: Trip System

**Goal**: Users can create trips by uploading GPX files, view trip routes on the map, and browse trip detail pages.

### Dependencies

- Phase 1 (auth, user system, API)
- Phase 2 (map rendering)

### Features

- GPX file upload and server-side parsing (Go)
- Trip CRUD API (create, read, update, delete)
- Route geometry extraction from GPX → PostGIS LineString
- Distance, elevation gain/loss, duration calculation from GPX
- Trip routes displayed on the map as colored lines
- Trip detail page with route, stats, description, photos
- Photo upload for trips (S3 pre-signed URLs)
- Trip list view with cards
- Trip segments model for climbing: approach/climb/descent phases with per-pitch metadata
- Pitch-by-pitch data: grade (multi-system JSONB), elevation gain, duration, belay type
- Vertical elevation profile visualization for climb segments (pitch stacked bars, color = grade)

### Technical Tasks

1. **GPX parsing** (`apps/api/internal/trip/gpx.go`)
   - Parse GPX XML format
   - Extract track points with lat/lon/ele/time
   - Build PostGIS LineString from track points
   - Calculate total distance (PostGIS `ST_Length` on geography column — returns meters)
   - Calculate elevation gain and loss
   - Calculate duration from first/last trackpoint timestamps

2. **Trip API** (`apps/api/internal/trip/`)
   - `handler.go` — CRUD endpoints
   - `service.go` — business logic, GPX processing orchestration
   - `repository.go` — PostGIS-backed trip storage
   - Trips table migration

3. **Photo upload**
   - `internal/storage/s3.go` — S3 client, pre-signed URL generation
   - `POST /api/v1/upload/url` — returns pre-signed upload URL
   - `POST /api/v1/trips/:id/photos` — associate uploaded photo with trip
   - Trip photos table migration

4. **Map trip display** (`apps/web/src/map/`)
   - `TripLayer.tsx` — renders trip routes as GeoJSON on the map
   - Fetch trips within current viewport bounding box
   - Color routes by activity type
   - Click a route to open trip detail panel

5. **Trip UI** (`apps/web/src/`)
   - `pages/TripDetailPage.tsx` — full trip view (route on mini-map, stats, photos, description)
   - `pages/TripCreatePage.tsx` — upload GPX, fill metadata, add photos
   - `components/TripCard.tsx` — compact trip preview for list views
   - `stores/tripStore.ts` — trip list, active trip, filters
   - `components/GpxUploader.tsx` — drag-and-drop GPX upload

6. **Climbing trip segments** (`apps/api/internal/climbing/`)
   - `trip_segments` table migration (`004_trip_segments.up.sql`)
   - `POST /api/v1/trips/:id/segments`, `GET /api/v1/trips/:id/segments`
   - `@openbeta/sandbag` frontend grade display/conversion
   - `ClimbingProfile.tsx` — vertical pitch-by-pitch stacked bars
   - Climbing-aware trip detail: segments timeline, per-pitch stats

### Key Files

```
apps/api/
├── internal/trip/
│   ├── handler.go
│   ├── service.go
│   ├── gpx.go
│   └── repository.go
├── internal/climbing/
│   └── (see Phase 11 for full package; trip_segments repo here)
├── internal/storage/
│   └── s3.go
├── migrations/
│   ├── 002_trips.up.sql
│   ├── 003_trip_photos.up.sql
│   └── 004_trip_segments.up.sql

apps/web/src/
├── map/
│   └── TripLayer.tsx
├── pages/
│   ├── TripDetailPage.tsx
│   └── TripCreatePage.tsx
├── components/
│   ├── TripCard.tsx
│   ├── GpxUploader.tsx
│   └── ClimbingProfile.tsx
└── stores/
    └── tripStore.ts

packages/shared/src/types/
└── trip.ts
```

### Acceptance Criteria

- [ ] User can upload a GPX file and create a trip with title, description, activity type
- [ ] Backend parses GPX and stores route geometry in PostGIS
- [ ] Trip detail page shows route on map with distance, elevation, duration stats
- [ ] Trip routes appear on the main map when browsing
- [ ] Clicking a route on the map opens the trip detail panel
- [ ] Photos can be uploaded and displayed on the trip detail page
- [ ] Only the trip owner can edit or delete their trip
- [ ] Trips are queryable by bounding box (`GET /api/v1/map/trips?bbox=...`)
- [ ] User can add approach/climb/descent segments to a climbing trip
- [ ] Each climb segment supports per-pitch metadata (grade, elevation, duration, belay type)
- [ ] Grades display correctly in user's preferred system via @openbeta/sandbag
- [ ] Climbing trip detail shows vertical elevation profile with pitch-by-pitch stacked bars

---

## Phase 5: Device Integrations

**Goal**: Provider-agnostic device integration framework with Garmin as the first implementation — automatic activity sync, FIT file parsing, and route push to device.

### Dependencies

- Phase 1 (auth, user system, API, database)
- Phase 4 (trip system — synced activities create trips)

### Features

- Provider-agnostic integration framework (`Provider` interface)
- Garmin Connect OAuth 2.0 with PKCE (connect/disconnect)
- Background activity sync (every 15 min polling + manual sync)
- FIT binary file parsing → trip creation with route, stats, activity type
- Course push — send planned routes to Garmin device
- Sync dashboard (connection status, sync history, error visibility)
- AES-256-GCM encryption for stored OAuth tokens

### Technical Tasks

1. **Provider framework** (`apps/api/internal/integration/`)
   - `provider.go` — `Provider` interface definition with `Name`, `AuthURL`, `ExchangeCode`, `RefreshTokens`, `FetchActivities`, `DownloadActivity`, `PushCourse`, `SupportsFeature`
   - `service.go` — orchestrates connect, disconnect, sync, course push across providers
   - `repository.go` — `device_providers` + `synced_activities` table operations
   - `handler.go` — HTTP handlers for `/api/v1/integrations/*` (9 endpoints)
   - `oauth.go` — PKCE code verifier/challenge generation, state management via Redis (5 min TTL)
   - `crypto.go` — AES-256-GCM encrypt/decrypt for OAuth tokens, HKDF key derivation from `INTEGRATION_TOKEN_KEY` env var
   - `fit.go` — FIT binary file parsing using `github.com/muktihari/fit`, extract trackpoints → PostGIS LineString, calculate distance/elevation/duration. For climbing activities: detect approach/climb/descent segments from FIT session data (COROS multi-pitch, Garmin climbing mode), extract per-pitch elevation/duration, auto-populate `trip_segments` with pitch JSONB
   - `scheduler.go` — sync scheduler: tick every 15 min, query active providers, acquire Redis lock, refresh tokens if needed, fetch + process activities, release lock

2. **Garmin provider** (`apps/api/internal/integration/garmin/`)
   - `garmin.go` — `Provider` implementation, activity type mapping (Garmin FIT Sport → mtamta activity_type)
   - `activities.go` — Garmin Activity API client (list activities, download FIT)
   - `courses.go` — Garmin Courses API client (push route as course)
   - `oauth.go` — Garmin-specific OAuth 2.0 endpoints, scopes, token exchange

3. **Database migrations**
   - `005_device_providers.up.sql` — `device_providers` table (user_id, provider, encrypted tokens, sync state)
   - `006_synced_activities.up.sql` — `synced_activities` table (provider activity → trip mapping)
   - `007_trips_source.up.sql` — ALTER trips: add `source`, `source_id`, `fit_file_url` columns

4. **Sync scheduler**
   - Background goroutine within main API process
   - Per-provider Redis lock (`integration:sync_lock:{user_id}:{provider}`, 10 min TTL) to prevent concurrent syncs
   - Proactive token refresh when expiry < 7 days
   - Failed syncs: `sync_status='failed'` + error_message, retried next cycle
   - Initial sync on connect: last 30 days of activities

5. **API endpoints**
   - `GET /api/v1/integrations/providers` — list available providers + connection status
   - `GET /api/v1/integrations/providers/:provider/auth` — get OAuth URL
   - `POST /api/v1/integrations/providers/:provider/callback` — exchange OAuth code
   - `DELETE /api/v1/integrations/providers/:provider` — disconnect
   - `GET /api/v1/integrations/providers/:provider/status` — sync status + stats
   - `PATCH /api/v1/integrations/providers/:provider/settings` — toggle auto-sync
   - `POST /api/v1/integrations/providers/:provider/sync` — manual sync (rate-limited: 1 per 5 min)
   - `GET /api/v1/integrations/activities` — list synced activities (paginated)
   - `POST /api/v1/integrations/providers/:provider/courses` — push route to device

6. **Web UI** (`apps/web/src/`)
   - `pages/IntegrationsPage.tsx` — list providers, connect/disconnect buttons, sync status, sync history. Add IntegrationsPage route to React Router configuration
   - `components/ProviderCard.tsx` — provider connection card with status indicator
   - `components/SyncHistory.tsx` — paginated list of synced activities with status
   - `components/SourceBadge.tsx` — "Synced from Garmin" badge on trip detail
   - `components/PushToDeviceButton.tsx` — "Send to Garmin" button on trip detail (if connected + provider supports courses)
   - `stores/integrationStore.ts` — connected providers, sync status, sync history, actions for connect/disconnect/sync/push

7. **Shared types** (`packages/shared/src/types/integration.ts`)
   - `ProviderInfo` — provider name, connected status, features, last sync
   - `SyncedActivity` — synced activity with status, provider activity ID, trip ID
   - `SyncSettings` — auto-sync toggle, sync frequency
   - Extended `Trip` type with `source`, `sourceId`, `fitFileUrl` fields

### Key Files

```
apps/api/
├── internal/integration/
│   ├── handler.go
│   ├── service.go
│   ├── repository.go
│   ├── provider.go
│   ├── oauth.go
│   ├── crypto.go
│   ├── fit.go
│   ├── scheduler.go
│   └── garmin/
│       ├── garmin.go
│       ├── activities.go
│       ├── courses.go
│       └── oauth.go
├── migrations/
│   ├── 005_device_providers.up.sql
│   ├── 006_synced_activities.up.sql
│   └── 007_trips_source.up.sql

apps/web/src/
├── pages/
│   └── IntegrationsPage.tsx
├── components/
│   ├── ProviderCard.tsx
│   ├── SyncHistory.tsx
│   ├── SourceBadge.tsx
│   └── PushToDeviceButton.tsx
├── stores/
│   └── integrationStore.ts

packages/shared/src/types/
└── integration.ts
```

### Acceptance Criteria

- [ ] User can connect their Garmin account via OAuth 2.0 with PKCE
- [ ] User can disconnect their Garmin account; tokens are deleted
- [ ] On connect, last 30 days of activities are synced automatically
- [ ] Background sync runs every 15 minutes for connected users
- [ ] User can trigger manual sync (rate-limited to 1 per 5 min)
- [ ] FIT files are downloaded, stored in S3, and parsed into trips
- [ ] Parsed trips have correct route geometry, distance, elevation, duration, and activity type
- [ ] Activity type mapping works correctly (Garmin FIT Sport → mtamta activity_type)
- [ ] Synced trips are created with `is_public=false` and `source='garmin'`
- [ ] Duplicate activities are not re-synced (dedup by `source_id`)
- [ ] User can push a trip route to their Garmin device as a course
- [ ] OAuth tokens are encrypted at rest with AES-256-GCM
- [ ] Token refresh happens proactively before expiry
- [ ] Failed syncs are recorded with error messages and retried next cycle
- [ ] Integrations page shows connected providers, sync status, and sync history
- [ ] Trip detail shows source badge and "Send to Garmin" button when applicable
- [ ] COROS/Garmin climbing activities are parsed into approach/climb/descent segments with pitch data
- [ ] Per-pitch elevation and duration from FIT multi-pitch data populate trip_segments

---

## Phase 6: User & Social

**Goal**: User profiles, social interactions (follow, like, save, comment), an activity feed, and in-app notifications.

### Dependencies

- Phase 1 (auth, users)
- Phase 4 (trips exist to like/save/comment on)
- Phase 5 (device-synced trips also appear in social feeds)

### Features

- Public user profile pages (avatar, bio, trip list, stats)
- Follow / unfollow users
- Like / unlike trips
- Save / unsave (bookmark) trips
- Comments on trips
- Activity feed (trips from followed users)
- Follower/following counts and lists
- In-app notifications (follow, like, comment triggers)

### Technical Tasks

1. **Social API** (`apps/api/internal/social/`)
   - `handler.go` — follow, like, save, comment endpoints
   - `service.go` — social logic, feed generation
   - `repository.go` — follows, likes, saves, comments table operations
   - Database migrations for social tables

2. **Activity feed**
   - `GET /api/v1/feed` — returns trips from followed users, sorted by recency
   - Pagination (cursor-based)
   - Include trip previews with like/save counts

3. **User profile enhancements**
   - `PATCH /api/v1/users/me` — update avatar, bio, display name
   - Avatar upload via S3 pre-signed URL
   - Trip count, follower/following counts on profile

4. **Notifications**
   - `notifications` table migration
   - `GET /api/v1/notifications` — polling endpoint for current user's notifications
   - `PATCH /api/v1/notifications/:id/read` — mark notification as read
   - Trigger notifications on follow, like, and comment actions

5. **Web UI**
   - `pages/UserProfilePage.tsx` — user profile with trip grid
   - `components/FollowButton.tsx` — follow/unfollow toggle
   - `components/LikeButton.tsx` — like/unlike with count
   - `components/SaveButton.tsx` — bookmark toggle
   - `components/CommentSection.tsx` — comment list + add form
   - `pages/FeedPage.tsx` — activity feed with trip cards

### Key Files

```
apps/api/
├── internal/social/
│   ├── handler.go
│   ├── service.go
│   └── repository.go
├── migrations/
│   ├── 008_follows.up.sql
│   ├── 009_likes_saves.up.sql
│   ├── 010_comments.up.sql
│   └── 011_notifications.up.sql

apps/web/src/
├── pages/
│   ├── UserProfilePage.tsx
│   └── FeedPage.tsx
├── components/
│   ├── FollowButton.tsx
│   ├── LikeButton.tsx
│   ├── SaveButton.tsx
│   └── CommentSection.tsx
```

### Acceptance Criteria

- [ ] User can view other users' profiles with their public trips
- [ ] User can follow/unfollow other users
- [ ] User can like and save trips; counts update in real time
- [ ] User can comment on trips; comments display chronologically
- [ ] Activity feed shows recent trips from followed users
- [ ] Feed supports cursor-based pagination
- [ ] User can update their avatar, bio, and display name
- [ ] All social actions require authentication
- [ ] User receives in-app notifications for follows, likes, and comments

---

## Phase 7: Terrain Analysis Layers

**Goal**: Custom-generated overlay layers for slope angle (avalanche terrain), sun/shade exposure, and flat/steep terrain indicators.

### Dependencies

- Phase 2 (map layer system, layer toggle UI)

### Features

- Slope angle layer: color-coded by degree, highlighting >30° (avalanche-prone) zones
- Aspect (slope direction) layer: compass direction overlay (N/S/E/W color-coded)
- Avalanche slope filter layer: highlights only 25°–45°+ terrain (yellow→dark red), all other angles transparent
- Sun/shade exposure layer: shows which slopes receive sun vs. shade at a given time
- Flat/steep terrain indicator layer
- Custom raster tile generation pipeline in Go
- Tile serving endpoint

### Technical Tasks

1. **DEM data acquisition**
   - Source: Copernicus GLO-30 DEM (30m resolution) from `s3://copernicus-dem-30m/`
   - Priority regions: Alps (44°N–48°N, 5°E–17°E), US Mountain West (35°N–49°N, 105°W–122°W), Scandinavia (57°N–71°N, 4°E–32°E)
   - Tile zoom levels: z8–z15

2. **Tile generation pipeline** (`apps/api/internal/terrain/` + `apps/api/cmd/tilegen/`)
   - GDAL-based pipeline: `gdalbuildvrt` (mosaic) → `gdalwarp` (reproject to EPSG:3857) → `gdaldem slope` / `gdaldem hillshade` → `gdaldem color-relief` → `gdal2tiles.py` (z8–z15)
   - `slope.go` — orchestrate GDAL pipeline, color bands: green (0–27°), yellow (28–29°), orange (30–34°), red (35–39°), magenta (40–44°), black (45°+)
   - `aspect.go` — `gdaldem aspect` → `gdaldem color-relief` with compass direction color table (N=blue, NE=light blue, E=white, SE=light orange, S=orange, SW=brown, W=black, NW=dark blue)
   - `avy_slope.go` — same slope pipeline but avalanche-specific color table: yellow (25–30°), orange (30–35°), red (35–40°), dark red (40–45°+), all other angles transparent
   - `exposure.go` — `gdaldem hillshade` with `-az` (solar azimuth) and `-alt` (solar altitude) for sun/shade
   - `tilegen.go` — render PNG tiles at standard z/x/y coordinates
   - Output tiles to S3 (`s3://mtamta-tiles/slope/`, `s3://mtamta-tiles/aspect/`, `s3://mtamta-tiles/avy-slope/`, `s3://mtamta-tiles/exposure/`, etc.)
   - Client-side fallback: decode Mapbox Terrain RGB (`mapbox.mapbox-terrain-dem-v1`) in browser for uncovered areas using `height = -10000 + ((R × 256 × 256 + G × 256 + B) × 0.1)`

3. **Tile serving**
   - `GET /api/v1/tiles/{layer}/{z}/{x}/{y}`
   - Serve pre-generated tiles from storage
   - Cache headers for CDN/browser caching
   - Fallback to on-the-fly generation for cache misses (optional)

4. **Map integration**
   - Add slope angle, aspect, avalanche slope filter, sun exposure, flat/steep as raster tile sources in `packages/map-core`
   - Toggle controls in the layer panel
   - Opacity slider for overlay layers
   - Legend showing color scale (e.g., slope angle 0°–60°)

### Key Files

```
apps/api/internal/terrain/
├── slope.go
├── aspect.go
├── avy_slope.go
├── exposure.go
├── tilegen.go
└── handler.go          # Tile serving endpoint

packages/map-core/src/layers/
├── slope-angle.ts      # Slope layer config
├── aspect.ts           # Aspect layer config
├── avy-slope.ts        # Avalanche slope filter layer config
├── sun-exposure.ts     # Sun exposure layer config
└── steep-flat.ts       # Steep/flat layer config

apps/web/src/map/
└── OverlayLayers.tsx   # Raster overlay layer rendering
```

### Acceptance Criteria

- [ ] Slope angle tiles render correctly with avalanche-prone zones (>30°) clearly highlighted
- [ ] Aspect layer renders with correct compass direction colors (N=blue through NW=dark blue)
- [ ] Avalanche slope filter highlights only 25°–45°+ terrain with yellow→dark red gradient, all other angles transparent
- [ ] Sun exposure layer shows sun/shade based on time of day and terrain aspect
- [ ] Flat/steep indicator layer classifies terrain into meaningful bands
- [ ] Tiles load efficiently and are cached (browser + CDN)
- [ ] User can toggle each overlay layer on/off independently
- [ ] Overlay opacity is adjustable
- [ ] Layer legend explains the color coding

---

## Phase 8: Live Data Integrations

**Goal**: Real-time environmental data displayed on the map — weather, wind, snow depth, avalanche reports, ski lift status.

### Dependencies

- Phase 2 (map, layer system)
- Phase 7 (overlay layer infrastructure, tile serving)

### Features

- Current weather display at user's location and on map
- Weather forecast panel
- Wind speed/direction visualization (arrows or animated particles)
- Snow depth overlay
- Avalanche danger ratings and report summaries
- Avalanche bulletin detail panel: tap danger zone → full bulletin with problem types, elevation/aspect/gradient of concern, full text, publication time, and link to source
- Ski lift status for resorts (open/closed, wait times)
- "Last updated" indicators for all live data
- Satellite-derived snow cover overlay: Copernicus HR-WSI (Europe, 20m) + NOAA NOHRSC (USA)

### Technical Tasks

1. **Data ingestion pipeline** (`apps/api/internal/ingest/`)
   - `scheduler.go` — cron-like scheduler for periodic fetches
   - `weather.go` — Open-Meteo API (`https://api.open-meteo.com/v1/forecast`) with params: `temperature_2m,precipitation,snowfall,snow_depth,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,visibility,freezing_level_height`
   - `wind.go` — Open-Meteo (same endpoint, wind-specific params)
   - `avalanche.go` — multi-source adapters: avalanche.org (`GET https://api.avalanche.org/v2/public/products/map-layer`), SLF (`GET https://aws.slf.ch/api/bulletin/caaml/en/geojson`), ALBINA (`GET https://api.avalanche.report/albina/api/`), with EAWS region boundaries from `regions.avalanches.org`. Parse full bulletin detail: problem types (persistent slab, wind slab, wet avalanche), elevation bands, aspect ranges, full text. Other EU CAAML adapters *(stretch goal)*
   - `lifts.go` — Liftie for US (`GET https://liftie.info/api/resort/{id}`). Custom scrapers for EU resorts *(stretch goal)*
   - `snow.go` — Open-Meteo `snow_depth` variable
   - `skidata.go` — OpenSkiData daily GeoJSON export from openskimap.org (runs, lifts, ski areas)
   - `webcams.go` — Windy API v3 (`GET https://api.windy.com/webcams/api/v3/webcams?nearby={lat},{lon},{radius}`)
   - `snow_cover.go` — Copernicus HR-WSI WMS for European snow cover (20m, free), NOAA NOHRSC for US snow depth analysis

2. **Time-series tables**
   - Migrations for `weather_observations`, `wind_observations`, `snow_observations` tables (regular PostgreSQL; hypertable conversion deferred until data volume justifies it)
   - Avalanche reports table (non-timeseries, regular PostgreSQL)
   - Lift status table

3. **Hiking trail overlay**
   - Periodic Overpass API query for `highway=path/footway` with `sac_scale` and `route=hiking` relations within priority regions
   - Stored as GeoJSON, served via map data layer

4. **Live data API**
   - `GET /api/v1/weather?lat=&lon=` — current weather
   - `GET /api/v1/weather/forecast?lat=&lon=` — weather forecast
   - `GET /api/v1/wind?lat=&lon=` — current wind data
   - `GET /api/v1/snow?lat=&lon=` — snow depth
   - `GET /api/v1/avalanche?region=` — avalanche report
   - `GET /api/v1/lifts?resort=` — lift statuses

5. **Map visualization** (`apps/web/src/map/`)
   - `WeatherLayer.tsx` — weather icons/data on map
   - `WindLayer.tsx` — wind arrows or animated particles (Deck.gl or custom)
   - `SnowLayer.tsx` — snow depth color overlay
   - `AvalancheLayer.tsx` — avalanche danger zone polygons on map
   - `AvalancheBulletinPanel.tsx` — detail panel on click: danger level (1–5), problem types, elevation/aspect/gradient of concern, full bulletin text, publication time, link to source
   - `LiftStatusPanel.tsx` — lift status for selected resort
   - `SnowCoverLayer.tsx` — satellite-derived snow coverage overlay (Copernicus HR-WSI for Europe, NOAA NOHRSC for USA)

6. **Redis caching**
   - Cache weather, wind, lift data with appropriate TTLs
   - Serve from cache; fall back to database on cache miss

7. **Pipeline health observability**
   - `pipeline_runs` table migration — tracks every pipeline run (status, duration, rows_affected, error_message)
   - Each pipeline fetcher records start/finish in `pipeline_runs` table
   - Sentry Cron Monitors: register each pipeline with its expected schedule. Check-in on start (`in_progress`) and finish (`ok`/`error`). Sentry alerts if a pipeline misses its schedule
   - `GET /api/v1/admin/pipelines` — admin endpoint returning last run status per pipeline
   - 30-day retention with weekly cleanup of old `pipeline_runs` rows

### Key Files

```
apps/api/internal/ingest/
├── scheduler.go
├── weather.go
├── wind.go
├── avalanche.go
├── lifts.go
├── snow.go
├── skidata.go
├── webcams.go
└── snow_cover.go

apps/api/migrations/
├── 012_weather_observations.up.sql
├── 013_wind_observations.up.sql
├── 014_snow_observations.up.sql
├── 015_avalanche_reports.up.sql
├── 016_lift_status.up.sql
└── 017_pipeline_runs.up.sql

apps/web/src/map/
├── WeatherLayer.tsx
├── WindLayer.tsx
├── SnowLayer.tsx
├── AvalancheLayer.tsx
├── AvalancheBulletinPanel.tsx
├── LiftStatusPanel.tsx
├── SnowCoverLayer.tsx
└── WebcamPanel.tsx
```

### Acceptance Criteria

- [ ] Weather data displays for user's location with current conditions + forecast
- [ ] Wind visualization shows speed and direction on the map
- [ ] Snow depth is visible as a map overlay
- [ ] Avalanche danger zones display on the map as colored polygons matching danger level
- [ ] Clicking an avalanche danger zone opens a detail panel with danger level, problem types, elevation/aspect/gradient of concern, full bulletin text, publication time, and link to source
- [ ] Avalanche bulletins are visible within ~15 min of publication
- [ ] Ski lift status shows open/closed for supported resorts
- [ ] Data refreshes automatically on the configured schedule
- [ ] "Last updated" timestamp shown for all live data
- [ ] Stale data (>1 hour for weather, >1 day for avalanche) is clearly marked
- [ ] Satellite-derived snow cover overlay displays for Europe (Copernicus HR-WSI) and USA (NOAA NOHRSC)
- [ ] Every pipeline run is recorded in `pipeline_runs` with status, duration, and error details
- [ ] Sentry Cron Monitors alert when a pipeline misses its expected schedule
- [ ] `GET /api/v1/admin/pipelines` returns last run status for each pipeline

---

## Phase 9: Mobile App

**Goal**: React Native mobile app with map, auth, and trip browsing — sharing code with the web app.

### Dependencies

- Phase 1 (auth, API, shared packages)
- Phase 2 (map-core package)
- Phase 4 (trip system)

### Features

- React Native app shell (iOS + Android)
- Google and Apple Sign-In (native SDKs)
- Full-screen map with `@rnmapbox/maps`
- Base layer switching, 3D terrain, winter/summer modes
- Trip browsing on map (tap route to view details)
- Trip detail screen (route, stats, photos)
- User profile screen
- Navigation (tab bar: map, explore, profile)

### Technical Tasks

1. **React Native setup** (`apps/mobile/`)
   - Initialize React Native project (bare or Expo)
   - Configure `@rnmapbox/maps` for iOS and Android
   - Set up React Navigation with tab and stack navigators
   - Integrate `packages/shared` for types and API client
   - Integrate `packages/map-core` for map configuration

2. **Authentication**
   - Google Sign-In: `@react-native-google-signin/google-signin`
   - Apple Sign-In: `@invertase/react-native-apple-authentication`
   - Token storage: `react-native-keychain` or `expo-secure-store`
   - Same auth flow as web (get ID token → call backend → store JWT)

3. **Map screen**
   - Full-screen Mapbox map with gestures (pan, zoom, tilt, rotate)
   - Base layer and style switching (from `map-core` config)
   - Trip routes rendered on map
   - Tap route → navigate to trip detail

4. **Trip screens**
   - Trip detail screen: mini-map, stats, photos, description
   - Trip list / explore screen: scroll through trip cards

5. **Profile screen**
   - Current user's profile, trips, stats
   - Edit profile (avatar, bio, display name)

### Key Files

```
apps/mobile/
├── package.json
├── app.json
├── src/
│   ├── App.tsx
│   ├── navigation/
│   │   └── RootNavigator.tsx
│   ├── screens/
│   │   ├── MapScreen.tsx
│   │   ├── ExploreScreen.tsx
│   │   ├── TripDetailScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   └── LoginScreen.tsx
│   ├── components/
│   │   ├── MapView.tsx
│   │   └── TripCard.tsx
│   └── hooks/
│       └── useAuth.ts
├── ios/
└── android/
```

### Acceptance Criteria

- [ ] App builds and runs on iOS and Android simulators
- [ ] Google and Apple Sign-In work natively
- [ ] Map renders with Mapbox, supports base layer switching and 3D terrain
- [ ] Trip routes display on map; tapping opens trip detail
- [ ] Trip detail screen shows route, stats, photos
- [ ] User can view and edit their profile
- [ ] Shared packages (`shared`, `map-core`) work correctly in React Native
- [ ] Navigation between screens is smooth and intuitive

---

## Phase 10: Search & Discovery

**Goal**: Full-text and location-based search for trips, locations, and users.

### Dependencies

- Phase 4 (trips to search)
- Phase 6 (users to search)

### Features

- Global search bar (trips + locations + users)
- Full-text search with typo tolerance (Meilisearch)
- Location-based search ("trips near me", "trips in Chamonix")
- Filter by activity type, distance, elevation, date
- Featured/trending trips on explore page
- Search results displayed as map pins and list cards

### Technical Tasks

1. **Meilisearch setup**
   - Docker Compose service for Meilisearch
   - Index configuration (trips, locations, users)
   - Geo search enabled with `_geo` field

2. **Locations and climbing tables**
   - Migration `018_locations.up.sql` — `locations` table (resorts, peaks, trailheads, towns, huts, crags)
   - Migration `019_climbing_routes.up.sql` — `climbing_routes` table (linked to crag locations)
   - Migration `020_crag_topos.up.sql` — `crag_topos` table (photo topo storage)
   - Seed pipeline: import resorts from OpenSkiData, peaks and trailheads from OSM, crags from OpenBeta (GraphQL bulk import with `source='openbeta'`, dedup by `source_id`)
   - Climbing routes from OpenBeta imported into `climbing_routes` table, linked to crag locations
   - Locations indexed in Meilisearch for search

3. **Search sync** (`apps/api/internal/search/`)
   - `service.go` — Meilisearch client, index management
   - Sync trips to Meilisearch on create/update/delete
   - Sync users to Meilisearch on create/update
   - Bulk re-index command for initial population

4. **Search API**
   - `GET /api/v1/search?q=&type=` — global search
   - `GET /api/v1/search/trips?q=&activity=&near=&radius=` — trip search with filters
   - `GET /api/v1/search/locations?q=` — location search

5. **Trending/featured**
   - Trending: trips with most likes/views in recent timeframe
   - Featured: manually curated or algorithmically selected
   - `GET /api/v1/trips/trending`
   - `GET /api/v1/trips/featured`

6. **Web UI**
   - `components/SearchBar.tsx` — global search with autocomplete
   - `pages/SearchResultsPage.tsx` — results as map pins + list
   - `components/SearchFilters.tsx` — activity type, distance, date filters
   - `pages/ExplorePage.tsx` — trending + featured trips

7. **Mobile UI**
   - Search bar on explore screen
   - Filter sheet
   - Results list with map view

### Key Files

```
apps/api/internal/search/
├── handler.go
└── service.go

apps/api/migrations/
├── 018_locations.up.sql
├── 019_climbing_routes.up.sql
└── 020_crag_topos.up.sql

apps/web/src/
├── components/
│   ├── SearchBar.tsx
│   └── SearchFilters.tsx
├── pages/
│   ├── SearchResultsPage.tsx
│   └── ExplorePage.tsx

docker-compose.yml  # Add Meilisearch service
```

### Acceptance Criteria

- [ ] Searching "chamonix trail run" returns relevant trips with typo tolerance
- [ ] "Trips near me" returns trips sorted by distance from user's location
- [ ] Filters by activity type, min/max distance, and date range work correctly
- [ ] Search results appear both as map pins and list cards
- [ ] Autocomplete suggestions appear while typing
- [ ] Trending page shows popular recent trips
- [ ] Search is fast (<200ms for typical queries)

---

## Phase 11: Advanced Features

**Goal**: Offline maps on mobile, in-app GPS recording, heatmaps, and route planning tools.

### Dependencies

- Phase 9 (mobile app)
- Phase 4 (trip system)
- Phase 2 (map)
- Phase 7 (terrain analysis)
- Phase 8 (live data)
- Phase 10 (search & discovery)

### Features

- Offline map downloads (mobile) — download tile regions for offline use
- In-app GPS track recording (mobile + PWA)
- Heatmaps showing popular routes/areas
- Route planning tools (draw waypoints on map, snap to trails via Mapbox Directions API, elevation profile, save as planned trip, push to Garmin)
- Elevation profile visualization for any route
- Elevation point query: tap map → show elevation at point (client-side DEM decode)
- Distance measurement tool: click points → measure geodesic distance with optional elevation profile
- Custom terrain filter: set elevation + gradient + aspect → highlight matching terrain (client-side WebGL)
- Photo topo editor: web-based tool for drawing SVG route lines on crag photos
- Crag detail page with climbing routes, grades, photo topos, and approach info
- Climbing route search and filtering (by grade, type, crag)
- 3D wall visualization: render photogrammetry models (glTF) of crags via Threebox (experimental)

### Technical Tasks

1. **Offline maps** (mobile)
   - Mapbox offline tile pack management
   - UI to select region and zoom levels for download
   - Download progress indicator
   - Offline indicator when no network

2. **GPS recording**
   - Background location tracking (React Native)
   - Record trackpoints (lat/lon/ele/time)
   - Live track display on map during recording
   - Save recording as trip (auto-generate GPX)
   - Activity timer and live stats (distance, elevation, speed)

3. **Heatmaps**
   - Heatmap tiles pre-rendered from trip route density using PostGIS aggregation (`ST_HexGrid` or similar)
   - Stored in S3 (`s3://mtamta-tiles/heatmap/`). Regenerated as batch job via `tilegen` CLI. No dedicated table
   - Toggleable layer on the map

4. **Route planning**
   - **Schema migration** (`022_route_planning.up.sql`):
     - `ALTER TABLE trips ADD COLUMN status TEXT NOT NULL DEFAULT 'published';` — values: 'draft', 'planned', 'published'
     - `ALTER TABLE trips ADD COLUMN route_waypoints JSONB;` — original waypoints for re-editing
     - Partial index on `status` where not 'published'
   - **Directions proxy** (`apps/api/internal/geo/directions.go`):
     - `POST /api/v1/routes/directions` — accepts waypoints, calls Mapbox Directions API (walking profile), returns snapped GeoJSON LineString + distance_m + duration_s
     - Redis cache: `directions:{sha256(waypoints)}`, 1-hour TTL
     - Rate limit: 10 req/min per user
     - Fallback: straight-line segments if Mapbox returns error
   - **Route planner UI** (`apps/web/src/map/RoutePlanner.tsx`):
     - Click-to-place waypoints on map (draggable markers)
     - On each waypoint change, call directions proxy to snap route
     - Display snapped route as GeoJSON layer
     - Show distance and estimated duration
     - Undo/redo for waypoint edits
   - **Elevation profile** (`apps/web/src/components/ElevationProfile.tsx`):
     - Sample points along route using `turf.along()`, query elevation via `map.queryTerrainElevation()`
     - SVG/Canvas chart: distance vs elevation, total ascent/descent, min/max
     - Hover highlights corresponding point on map
     - Reusable for planned routes, completed trips, and measurement tool
   - **Save & manage planned routes**:
     - Save via `POST /api/v1/trips` with `source='planned'`, `status='planned'`, `route_waypoints` JSONB
     - Edit re-opens planner with saved waypoints
     - Planned routes on user profile with "Planned" badge
     - Push to Garmin via existing course push endpoint
   - **Trip status filtering**:
     - `GET /api/v1/trips` and `GET /api/v1/map/trips` default to `status=published`
     - User's own trip list shows all statuses with filter tabs
   - **Zustand store** (`apps/web/src/stores/routePlannerStore.ts`):
     - State: waypoints, snapped route, elevation samples, loading/error
     - Actions: addWaypoint, moveWaypoint, removeWaypoint, clearRoute, fetchDirections, saveAsTrip

5. **Elevation point query**
   - Click/tap handler on map to capture coordinates
   - Decode Mapbox Terrain RGB tile at clicked coordinate (client-side): `height = -10000 + ((R × 256 × 256 + G × 256 + B) × 0.1)`
   - Display elevation as popup (meters + feet). No server round-trip
   - `ElevationQuery.tsx` — click handler + popup display

6. **Distance measurement**
   - Interactive polyline tool: click points on map to build a measurement path
   - Calculate geodesic distance between points using turf.js
   - Display cumulative distance on each segment
   - Optional elevation profile along the measurement path
   - `MeasureTool.tsx` — interactive polyline + distance display

7. **Custom terrain filter**
   - `TerrainFilterPanel.tsx` — filter panel UI with elevation range slider, gradient range slider, and aspect multi-select toggles (N/NE/E/SE/S/SW/W/NW)
   - `TerrainFilterLayer.tsx` — WebGL `CustomLayerInterface` that reads Mapbox Terrain RGB tiles, computes slope/aspect per pixel from 3×3 kernel, applies user-defined filter, renders matching pixels as green overlay
   - `terrainFilterStore.ts` — Zustand store for filter state (elevation min/max, gradient min/max, selected aspects)
   - Primary use case: correlate avalanche bulletin warnings with actual terrain

8. **Photo topo system** (Tier 2 — `apps/api/internal/climbing/`)
   - Uses `climbing_routes` and `crag_topos` tables from Phase 10 (`019_climbing_routes.up.sql`, `020_crag_topos.up.sql`)
   - `climbing/` package: `handler.go`, `service.go`, `repository.go`, `grades.go`, `topo.go`
   - `TopoEditor.tsx` — interactive SVG drawing tool for route lines on crag photos
   - `CragDetailPage.tsx` — crag overview with climbing routes, grades, photo topos, approach info
   - `TopoViewer.tsx` — display photo topo with route overlays
   - `GradeDisplay.tsx` — grade display component using `@openbeta/sandbag` for conversion
   - `RouteTable.tsx` — sortable/filterable climbing route table
   - `climbingStore.ts` — Zustand store for crags, climbing routes, topos

9. **3D wall visualization** (Tier 3, experimental)
   - `021_crag_models.up.sql` migration
   - `WallModelLayer.tsx` — Threebox `CustomLayerInterface` for rendering glTF crag models in Mapbox
   - `PointCloudViewer.tsx` — Potree integration for large point cloud visualization
   - Feature-flagged: disabled by default, enabled via settings

### Key Files

```
apps/mobile/src/
├── screens/
│   ├── RecordScreen.tsx       # GPS recording UI
│   └── OfflineMapsScreen.tsx  # Download management
├── services/
│   ├── locationTracker.ts     # Background GPS tracking
│   └── offlineManager.ts     # Tile download management

apps/api/
├── internal/climbing/
│   ├── handler.go
│   ├── service.go
│   ├── repository.go
│   ├── grades.go
│   └── topo.go
├── internal/geo/
│   └── directions.go         # Mapbox Directions API proxy
├── migrations/
│   ├── 021_crag_models.up.sql   # 019-020 are in Phase 10
│   └── 022_route_planning.up.sql

apps/web/src/
├── map/
│   ├── HeatmapLayer.tsx
│   ├── RoutePlanner.tsx
│   ├── ElevationQuery.tsx
│   ├── MeasureTool.tsx
│   ├── TerrainFilterLayer.tsx
│   └── WallModelLayer.tsx
├── pages/
│   └── CragDetailPage.tsx
├── components/
│   ├── ElevationProfile.tsx
│   ├── TerrainFilterPanel.tsx
│   ├── TopoEditor.tsx
│   ├── TopoViewer.tsx
│   ├── GradeDisplay.tsx
│   ├── RouteTable.tsx
│   └── PointCloudViewer.tsx
├── stores/
│   ├── terrainFilterStore.ts
│   ├── routePlannerStore.ts
│   └── climbingStore.ts
```

### Acceptance Criteria

- [ ] User can download a map region for offline use on mobile
- [ ] Offline maps work without network connectivity
- [ ] GPS recording captures track with live display on map
- [ ] Recorded track can be saved as a trip with auto-calculated stats
- [ ] Heatmap layer shows popular routes with configurable intensity
- [ ] User can place waypoints on the map; waypoints are draggable
- [ ] Route snaps to trails via Mapbox Directions API after each waypoint change
- [ ] Fallback to straight-line segments if Directions API unavailable
- [ ] Elevation profile chart displays for drawn route with total ascent/descent
- [ ] Hovering on elevation profile highlights corresponding point on map
- [ ] User can save planned route as trip with status='planned'
- [ ] Planned routes appear on user profile with "Planned" badge
- [ ] User can edit a saved planned route (waypoints reload, re-snap)
- [ ] User can push planned route to Garmin via existing course push
- [ ] GET /api/v1/trips defaults to status=published (backward compatible)
- [ ] Directions API responses cached in Redis (1-hour TTL)
- [ ] Elevation profile is reusable for planned routes, completed trips, and measurement tool
- [ ] Tapping the map with elevation query tool shows a popup with elevation in meters and feet
- [ ] Distance measurement tool allows clicking multiple points and displays cumulative geodesic distance
- [ ] Custom terrain filter highlights terrain matching user-specified elevation, gradient, and aspect criteria
- [ ] Custom terrain filter renders dynamically via WebGL as the user adjusts filter parameters
- [ ] Custom terrain filter can be combined with avalanche bulletin data to identify dangerous terrain
- [ ] User can create, view, and edit crags with crag-specific metadata (rock type, approach, orientation)
- [ ] User can add, edit, and delete climbing routes at a crag with multi-system grades
- [ ] Photo topo editor allows drawing SVG route lines on uploaded crag photos
- [ ] Crag detail page displays climbing routes, grades, photo topos, and approach info
- [ ] Crags display on the map as markers within the current viewport
- [ ] Climbing routes and crags are searchable via Meilisearch (by name, grade, type)
- [ ] OpenBeta data seeds crags and climbing routes with `source='openbeta'`
- [ ] Grades display correctly across systems (YDS, French, UIAA) via `@openbeta/sandbag`
- [ ] 3D wall visualization renders glTF crag models in Mapbox via Threebox (feature-flagged)

---

## Phase 12: Polish & Launch

**Goal**: Production readiness — performance, SEO, monitoring, analytics, and final polish.

### Dependencies

- All prior phases (this is the final phase)

### Features

- Performance optimization (bundle size, lazy loading, image optimization)
- PWA support (installable web app, service worker)
- SEO for public trip pages (server-side rendering or meta tags)
- Analytics (privacy-respecting usage tracking)
- Error monitoring and logging
- Rate limiting and abuse prevention
- Accessibility audit and fixes
- Landing page

### Technical Tasks

1. **Performance**
   - Code splitting and lazy loading for web routes
   - Image optimization (WebP, responsive sizes, lazy loading)
   - Map tile loading optimization (viewport-based fetching)
   - Bundle analysis and tree shaking
   - Database query optimization (EXPLAIN ANALYZE on slow queries)
   - API response compression (gzip)

2. **PWA**
   - Service worker for offline shell caching
   - Web app manifest
   - Install prompt

3. **SEO**
   - Meta tags for trip pages (title, description, Open Graph, Twitter Cards)
   - Sitemap generation for public trips
   - Structured data (JSON-LD) for trip pages
   - Consider SSR/SSG for public pages (or prerendering)

4. **Analytics & Monitoring**
   - Error tracking review (Sentry — already integrated in Phase 1)
   - Structured logging in Go backend
   - Request latency tracking
   - Database connection pool monitoring
   - Uptime monitoring
   - Privacy-respecting analytics (Plausible or self-hosted)

5. **Security hardening**
   - Rate limiting on all API endpoints
   - Input validation audit
   - CSRF protection
   - Content Security Policy headers
   - Dependency vulnerability scanning

6. **E2E tests**
   - Playwright for critical user flows: sign in → create trip (GPX upload) → view on map → like → search → find trip
   - 5 core scenarios, run against staging environment

7. **Landing page**
   - Public landing page explaining the platform
   - Screenshots, feature highlights
   - Call-to-action for sign-up

### Key Files

```
apps/web/
├── vite.config.ts          # Optimize build config
├── public/manifest.json    # PWA manifest
├── src/sw.ts               # Service worker
├── src/pages/
│   └── LandingPage.tsx

apps/api/
├── internal/middleware/
│   ├── ratelimit.go        # Rate limiting
│   └── security.go         # Security headers
```

### Acceptance Criteria

- [ ] Lighthouse score >90 on performance, accessibility, best practices, SEO
- [ ] Web app is installable as PWA
- [ ] Public trip pages have correct meta tags and Open Graph images
- [ ] Error monitoring captures and alerts on backend errors
- [ ] API responds within 200ms for typical requests under normal load
- [ ] Rate limiting prevents abuse (429 responses for excessive requests)
- [ ] No critical accessibility violations
- [ ] Landing page clearly communicates the platform's value
- [ ] E2E tests pass for 5 critical user flows (sign in, create trip, view on map, like, search)

---

## Summary

| Phase | Focus | Key Deliverable |
|---|---|---|
| 1 | Foundation | Authenticated API + web shell + CI |
| 2 | Maps Core | Interactive map with layers, 3D terrain |
| 3 | Map Sources & Overlays | Country-specific topo maps, seasonal satellite, ski overlays |
| 4 | Trip System | GPX upload, trip CRUD, routes on map, climbing segments + pitch metadata |
| 5 | **Device Integrations** | **Garmin sync, FIT parsing, course push, multi-pitch climb parsing** |
| 6 | User & Social | Profiles, follows, likes, comments, feed, notifications |
| 7 | Terrain Analysis | Slope angle, aspect, avalanche slope filter, sun exposure, custom tiles |
| 8 | Live Data | Weather, wind, snow, avalanche, lifts |
| 9 | Mobile App | React Native with shared code |
| 10 | Search & Discovery | Full-text + geo search, trending, locations, crag/route seeding from OpenBeta |
| 11 | Advanced | Offline maps, GPS recording, heatmaps, custom terrain filter, map tools, photo topos, 3D walls |
| 12 | Polish & Launch | Performance, PWA, SEO, monitoring |

Each phase produces a working increment. Phases 1–4 form the minimum viable product (including climbing trip segments with pitch metadata). Phase 5 adds device connectivity with multi-pitch FIT parsing. Phases 6–8 add social and data richness. Phase 10 seeds crags and climbing routes from OpenBeta. Phase 11 adds photo topos and experimental 3D wall visualization. Phase 12 polishes for launch.
