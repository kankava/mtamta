# mtamta — Implementation Plan

> Phased roadmap from empty repo to full outdoor adventure platform. Each phase builds on the prior and is designed to produce a working, demoable increment.

---

## Table of Contents

1. [Phase 1: Foundation](#phase-1-foundation)
2. [Phase 2: Maps Core](#phase-2-maps-core)
3. [Phase 3: Map Sources & Overlays](#phase-3-map-sources--overlays)
4. [Phase 3.5: Multi-Provider Support](#phase-35-multi-provider-support)
5. [Phase 4: Activity System](#phase-4-activity-system)
6. [Phase 5: Device Integrations](#phase-5-device-integrations)
7. [Phase 6: Route & Planning](#phase-6-route--planning)
8. [Phase 7: Mobile App + Offline](#phase-7-mobile-app--offline)
9. [Phase 8: Terrain Analysis Layers](#phase-8-terrain-analysis-layers)
10. [Phase 9: User & Social](#phase-9-user--social)
11. [Phase 10: Live Data Integrations](#phase-10-live-data-integrations)
12. [Phase 11: Search & Discovery](#phase-11-search--discovery)
13. [Phase 12: Advanced Features](#phase-12-advanced-features)
14. [Phase 13: Polish & Launch](#phase-13-polish--launch)

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
   - Docker Compose file with PostgreSQL + PostGIS + TimescaleDB (`timescale/timescaledb-ha:pg17`), Redis (sessions, refresh tokens). Time-series tables use regular PostgreSQL initially; hypertables enabled when data volume justifies it. MinIO/local-fs in Phase 4, Meilisearch in Phase 11
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
   - `apps/api/Dockerfile` — multi-stage Go build (golang:1.26-alpine builder → alpine:3.20 runtime)
   - `docker-compose.yml` — local dev services (TimescaleDB+PostGIS, Redis). MinIO added in Phase 4, Meilisearch in Phase 11
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
    - `data/seed/` with sample SQL (users, activities placeholder)

### Key Files

```
mtamta/
├── package.json
├── turbo.json
├── tsconfig.base.json
├── docker-compose.yml
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── backup.yml
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── railway.toml
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
   - Base style: Mapbox Standard — Outdoors / Outdoors Winter (custom styles built on Mapbox Standard)
   - Satellite style: Mapbox Standard Satellite (`mapbox://styles/mapbox/standard-satellite`)
   - Winter/summer toggle: season-aware style resolution selects Outdoors vs Outdoors Winter on Mapbox, `outdoor-v2` vs `winter-v2` on MapTiler — see MapProviders.md
   - Layer registry: metadata for each toggleable layer (see Architecture.md Layer Catalog)
   - 3D terrain source: `mapbox.mapbox-terrain-dem-v1` (Terrain-DEM v1, 512px tiles, max z14, default exaggeration 1.5)

2. **Map component** (`apps/web/src/map/`)
   - `MapContainer.tsx` — Mapbox GL JS initialization, lifecycle management
   - `MapControls.tsx` — zoom, compass, pitch, geolocate
   - `sidebar/Sidebar.tsx` — collapsible right sidebar with basemap/overlay/settings tabs
   - Basemap cards atomically set base layer + season + topo source
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
   - Side panel overlay for future activity details
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
│   └── sidebar/
│       ├── Sidebar.tsx
│       ├── BasemapsTab.tsx
│       ├── OverlaysTab.tsx
│       └── SettingsTab.tsx
├── stores/
│   └── mapStore.ts
└── pages/
    └── MapPage.tsx
```

### Acceptance Criteria

- [ ] Map renders full-screen on page load at a default location
- [ ] User can switch between topographic and satellite base layers
- [ ] User can toggle winter/summer mode and the map style updates (Mapbox: Outdoors ↔ Outdoors Winter; MapTiler: outdoor-v2 ↔ winter-v2)
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

- Country-specific topographic base layers (swisstopo, IGN, basemap.at, BKG, Kartverket, USGS) with explicit country topo selection via sidebar cards; Satellite Summer remains the app default basemap
- Seasonal satellite imagery (summer/winter) via Copernicus Sentinel-2, proxied through backend — _deferred: backend proxy built, frontend card disabled_
- Atomic basemap presets that set baseLayer + season + topoSource in one action (no separate winter/summer toggle)
- swisstopo winter base map variant with ski touring and snowshoe route overlays
- OpenSnowMap pistes overlay (global ski piste + lift layer)

### Sub-milestones

- **3a — Country topo providers**: Source catalog, bounding boxes, attribution (tasks 1, 2, 3)
- **3b — Backend proxy & caching**: Tile proxy for OpenTopoMap/Sentinel-2, Redis caching (tasks 4, 5, 6)
- **3c — Seasonal & overlays**: Sentinel-2 satellite imagery, swisstopo winter variant, OpenSnowMap pistes
- **3d — UI Redesign**: Collapsible right sidebar replacing LayerPanel + StyleSwitcher, Tailwind CSS v4 migration, basemap cards that atomically set baseLayer + season + topoSource (no separate winter/summer toggle), NavBar moved into sidebar header, topoOpacity slider removed (full opacity always)

### Technical Tasks

1. **Country topographic source catalog** (`packages/map-core/`)
   - Country-specific topographic source catalog: tile URLs, WMTS endpoints, max zoom, API key requirements, license/attribution per source
   - Country bounding box definitions (Switzerland, France, Austria, Germany, Norway, USA)
   - OpenTopoMap configuration as a manually-selectable global topo source
   - Dynamic attribution strings per topo source
   - Sentinel-2 seasonal satellite configuration: WMS URL template, season date ranges, MAXCC values
   - swisstopo winter variant: `ch.swisstopo.pixelkarte-farbe-winter` layer ID and tile URL
   - swisstopo winter sport overlay configs: ski touring routes, snowshoe routes
   - OpenSnowMap pistes tile source configuration

2. **Sidebar UI** (`apps/web/src/map/sidebar/`)
   - `BasemapsTab.tsx` — card grid with global cards (Outdoors/Satellite × Summer/Winter) + country topo cards. Clicking a card atomically sets baseLayer + season + topoSource via `selectBasemap()`
   - `OverlaysTab.tsx` — toggle switches for pistes, ski touring, snowshoe; Sentinel year selector (satellite only)
   - `SettingsTab.tsx` — custom exaggeration toggle + slider, flat/globe projection toggle (3D terrain toggle is a map control)
   - Dynamic map attribution: update attribution control text when topo source changes

3. **Map state extensions** (`apps/web/src/stores/mapStore.ts`)
   - Active topo source (`TopoSourceId | null` — null = no country topo overlay)
   - `BasemapPreset` type and `BASEMAP_PRESETS` lookup table (11 presets)
   - `selectBasemap(preset)` action — atomically sets baseLayer + season + topoSource
   - Sidebar state: `sidebarOpen`, `sidebarTab`
   - Sentinel year for seasonal satellite

4. **Backend proxy & caching**
   - Configure raster tile sources for each national mapping agency (WMTS/XYZ endpoints)
   - IGN Géoplateforme: configure the public `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` WMTS tile URL template (key-less `data.geopf.fr` endpoint)
   - Overlap handling for border regions: smallest bbox wins (most specific/detailed source)
   - Attribution manager: swap attribution text when active topo source changes
   - IGN, basemap.at, BKG, Kartverket, and USGS tiles loaded directly from source (no proxy needed — no API keys, generous rate limits); swisstopo (summer + winter) is proxied so the backend can drop blank border tiles
   - Proxy endpoint for OpenTopoMap tiles: `GET /api/v1/tiles/opentopomap/{z}/{x}/{y}` — proxy with Redis cache (`tile:opentopomap:{z}:{x}:{y}`, 24h TTL) to stay within OpenTopoMap's ~2 req/sec fair-use limit
   - swisstopo winter variant: swap tile URL when season mode = winter and viewport is in Switzerland
   - swisstopo winter sport overlays: ski touring + snowshoe route layers, enabled in winter mode
   - Proxy endpoint for Sentinel-2 seasonal tiles: `GET /api/v1/tiles/sentinel/{z}/{x}/{y}?season=winter&year=2024` (Instance ID not exposed to client)
   - Redis caching for Sentinel-2 tiles: `sentinel:{season}:{year}:{z}:{x}:{y}`, 7-day TTL
   - OpenSnowMap pistes overlay source integration

5. **Basic tile proxy handler** (`apps/api/internal/geo/tileproxy.go`)
   - Implement basic tile proxy handler for OpenTopoMap and Sentinel-2 tiles. The full terrain tile generation pipeline is in Phase 8; this phase only adds HTTP proxy + Redis caching for external tile sources
   - Redis caching for country topo tiles (where proxied): `tile:{z}:{x}:{y}:{layer}`, 24-hour TTL

6. **Tile proxy tests**
   - Integration test: request IGN tile → verify Redis cache populated → second request served from cache
   - Integration test: request Sentinel-2 tile → verify 7-day TTL in Redis
   - Integration test: request OpenTopoMap tile → verify 24h TTL in Redis
   - Unit test: verify proxy injects API keys and does not expose them in response

### Key Files

```
packages/map-core/src/
├── topo.ts              # Source catalog, overlay defs, bbox lookup, URL resolution
├── topo.test.ts
├── styles.ts            # Base style URLs, resolveStyleUrl
├── layers.ts            # Layer registry
└── terrain.ts           # Terrain config

apps/web/src/map/
├── sidebar/
│   ├── Sidebar.tsx           # Collapsible right panel with tabs
│   ├── BasemapsTab.tsx       # Basemap card grid (global + country topo)
│   ├── OverlaysTab.tsx       # Overlay toggles + sentinel year selector
│   └── SettingsTab.tsx       # 3D terrain toggle + exaggeration
└── useRasterOverlays.ts      # Imperatively manages raster overlay layers
```

### Acceptance Criteria

- [ ] Clicking a country topo card (e.g. swisstopo) loads the topo overlay; switching back to a global Outdoors card removes it
- [ ] Country-specific topo sources render correctly as raster tile layers for all 6 supported countries
- [ ] Satellite Summer is used as the default basemap for both Mapbox and MapTiler
- [ ] Basemap cards atomically set baseLayer + season + topoSource in one action
- [ ] Map attribution updates dynamically to reflect the active topo source
- [ ] IGN tiles load directly from the public key-less `PLANIGNV2` endpoint (no backend proxy, no API key)
- [ ] _(Deferred)_ Seasonal Sentinel-2 satellite imagery loads as raster tiles
- [ ] _(Deferred)_ Sentinel-2 tiles are proxied through backend (Instance ID not exposed)
- [ ] Selecting a winter basemap card sets base layer, season, and swisstopo variant (CH) atomically; overlays are toggled separately in the Overlays tab
- [ ] swisstopo winter card loads winter base map variant (`pixelkarte-farbe-winter`)
- [ ] swisstopo ski touring and snowshoe route overlays are available when swisstopo winter card is active
- [ ] OpenSnowMap pistes layer renders as a toggleable overlay
- [ ] User can manually override any individually coupled layer
- [ ] _(Deferred)_ Sentinel-2 tiles are cached in Redis with 7-day TTL
- [ ] Country topo tiles (where proxied) are cached in Redis with 24-hour TTL
- [ ] OpenTopoMap tiles are proxied through the backend with 24h Redis cache

---

## Phase 3.5: Multi-Provider Support

> **Status: M1–M3 complete & verified (2026-05-16).** M4 deferred to after Phase 4. Full detail in [Phase3_5.md](Phase3_5.md).

**Goal**: Dual-provider map rendering (Mapbox + MapTiler) with a shared overlay system and runtime-selected provider loading.

### Dependencies

- Phase 2 (map rendering, map-core package)
- Phase 3 (overlay system, raster tiles)

### Features

- Post-login provider selection gate (localStorage-persisted)
- Lazy-loaded provider runtimes (Mapbox or MapTiler)
- Shared `AppMapAdapter` type interface for app-owned layers
- Provider capability matrix gating UI controls (`available`, `coming_soon`, `unsupported`)
- Both providers render topographic, satellite, and 3D terrain base maps
- Shared raster overlays (country topo, seasonal satellite) work in both providers
- "Change map provider" option in Settings

### Sub-Milestones

**M1 — Infrastructure + Mapbox Extraction**
- Add `MapProvider` types and capability model to `@mtamta/map-core`
- Add `mapProvider` state to `mapStore` with localStorage persistence
- Create post-login `MapProviderGate` (only shown when no stored preference exists)
- Extract current Mapbox code into `runtime/mapbox/` modules
- Define `AppMapAdapter` type interface (source/layer lifecycle, style reload, viewport reads)
- Move shared overlays (`useRasterOverlays`, activity track layers) to `runtime/shared/` targeting `AppMapAdapter`
- Verify zero behavior regression in existing Mapbox stack

**M2 — MapTiler Runtime Boot + Shared Layer Parity**
- Implement `runtime/maptiler/MapContainer.tsx` using `@maptiler/sdk`
- Implement `runtime/maptiler/MapControls.tsx`
- Wire MapTiler style resolution (Outdoor v2, Satellite, Terrain RGB v2)
- Verify shared overlays (raster topo, seasonal satellite) work in MapTiler runtime
- Add capability gating for incomplete MapTiler features (show `Coming soon`)
- Both providers boot cleanly from the provider gate

**M3 — Mapbox Standard Migration ✅**
- Migrated the Mapbox runtime from `outdoors-v12` to Mapbox Standard — Outdoors / Outdoors Winter custom styles give a true seasonal pair matching MapTiler
- Mapbox style resolution is season-aware (`resolveStyleUrl`)
- `AppMapAdapter` + `rasterOverlays.ts` use slot-based layer insertion on Mapbox; the MapTiler adapter derives an equivalent `beforeId`
- Settled the adapter layer-insertion contract ahead of Phase 4 activity-track layers
- Full detail in [Phase3_5.md](Phase3_5.md#m3--mapbox-standard-migration)

**M4 — Provider-Specific Features (deferred to after Phase 4)**
- Geocoder for each provider
- Weather integration per provider
- Directions / route planning per provider
- Update capability matrix as each feature lands

### Key Files

```
apps/web/src/map/
  runtime/
    mapbox/
      MapContainer.tsx
      MapControls.tsx
      terrain.ts
    maptiler/
      MapContainer.tsx
      MapControls.tsx
      terrain.ts
    shared/
      mapAdapter.ts
      activityTracks.ts
      rasterOverlays.ts
      providerCapabilities.ts
  MapRuntime.tsx
  MapProviderGate.tsx

packages/map-core/src/
  providers.ts          # MapProvider type, FeatureId, CapabilityState
  capabilities.ts       # Per-provider capability matrix
```

### Acceptance Criteria

- [ ] Provider gate appears after login when no stored preference exists
- [ ] Selecting Mapbox loads the Mapbox runtime with no behavior regression
- [ ] Selecting MapTiler loads the MapTiler runtime with base maps and 3D terrain
- [ ] Shared overlays (country topo, seasonal satellite) render in both providers
- [ ] Activity track layers (from Phase 4) use `AppMapAdapter` and work in both providers
- [ ] Provider choice persists in localStorage; gate is skipped on subsequent visits
- [ ] Unsupported or not-yet-implemented features show `Coming soon` in the UI
- [ ] Capability matrix accurately reflects implementation status

> **Detailed implementation spec**: See [`docs/MapProviders.md`](MapProviders.md) for adapter interface, runtime file structure, capability matrix, and testing strategy.

---

## Phase 4: Activity System

**Goal**: Users can log activities — by uploading a GPX file or by manual entry — view activity tracks on the map, and browse activity detail pages.

### Dependencies

- Phase 1 (auth, user system, API)
- Phase 2 (map rendering)
- Phase 3.5 (multi-provider adapter — activity tracks written against `AppMapAdapter`)

### Features

- Activity creation as one unified flow: a metadata form with an **optional** GPX file (a GPX pre-fills the `track` + stats; without one, it is manual entry)
- GPX file parsing (Go, `encoding/xml`) → PostGIS LineString `track` + derived distance, elevation gain/loss, duration
- Activity CRUD API (create, read, update, delete)
- Manual entry with activity-type-aware fields — type-specific stats stored in a `metrics` JSONB column
- Per-activity visibility: private / followers / public
- Activity tracks displayed on the map as colored lines
- Activity detail page with track, stats, description, photos
- Photo upload for activities (S3 pre-signed URLs) with EXIF / GPX-timestamp geotagging
- Activity list view with cards
- Activity segments model for climbing: approach/climb/descent phases with per-pitch metadata
- Pitch-by-pitch data: grade (multi-system JSONB), elevation gain, duration, belay type
- Vertical elevation profile visualization for climb segments (pitch stacked bars, color = grade)
- Map search bar — geocode cities, peaks, POIs via Mapbox Search Box API
- Radix UI primitives for accessible interactive components (dialogs, dropdowns, toasts) — install per-component as needed (`@radix-ui/react-dialog`, etc.), styled with Tailwind

> **Activity vs Route**: a recorded **activity** is distinct from a planned **route**. The `Route` entity (planned itineraries) and the route planner are designed in `Architecture.md` but built in a later phase — Phase 4 ships activities only. An activity may later link to the route it followed via `activities.route_id`.

> **Ingestion**: Phase 4 ingests **GPX**. FIT parsing (the richer device format) lands in Phase 5 behind the same neutral `ParsedActivity` parser seam.

### Technical Tasks

1. **GPX parsing** (`apps/api/internal/activity/gpx.go`)
   - Parse GPX XML format; extract track points with lat/lon/ele/time
   - Build PostGIS LineString from track points
   - Calculate total distance, elevation gain/loss, duration → a format-neutral `ParsedActivity`

2. **Activity CRUD API** — unified create (metadata form + optional GPX), PostGIS `track` storage, activity CRUD endpoints, bbox GeoJSON query with zoom-dependent simplification
3. **Photo upload + geotagging** — S3 pre-signed uploads (server-generated keys), EXIF GPS extraction, timestamp interpolation fallback
4. **Map activity display** — activity tracks as GeoJSON on map, color by activity type, click to open detail panel; `useActivityTracks` uses `AppMapAdapter`, placed in `runtime/shared/`
5. **Activity UI** — unified create page (form + optional GPX), detail page, card component, Radix UI primitives (Dialog, DropdownMenu, Toast)
6. **Map search bar** — Mapbox SearchBox geocoder (fly-to-place only; full app search is Phase 11); Mapbox SearchBox is Mapbox-specific, wrap in capability check, mark `coming_soon` for MapTiler
7. **Climbing activity segments** — approach/climb/descent segments, per-pitch JSONB metadata, `@openbeta/sandbag` grade display, vertical profile

> **Detailed implementation plan**: See [`docs/Phase4.md`](Phase4.md) for sub-milestones (4a–4d), file manifests, SQL schemas, endpoint contracts, and verification checklists.

### Acceptance Criteria

- [ ] User can create an activity by uploading a GPX file, or by manual entry, with title, description, activity type
- [ ] Backend parses GPX and stores track geometry in PostGIS
- [ ] Manual entry captures activity-type-specific fields into the `metrics` column
- [ ] Activity detail page shows the track on a map with distance, elevation, duration stats
- [ ] Activity tracks appear on the main map when browsing (`visibility='public'` only)
- [ ] Clicking a track on the map opens the activity detail panel
- [ ] Photos can be uploaded and displayed on the activity detail page
- [ ] Per-activity visibility (private / followers / public) is respected
- [ ] Only the activity owner can edit or delete their activity
- [ ] Activities are queryable by bounding box with zoom-dependent simplification and feature cap
- [ ] Map search bar geocodes locations and flies to result on map
- [ ] User can add approach/climb/descent segments to a climbing activity
- [ ] Each climb segment supports per-pitch metadata (grade, elevation, duration, belay type)
- [ ] Climbing activity detail shows vertical elevation profile with pitch-by-pitch stacked bars

---

## Phase 5: Device Integrations

**Goal**: Provider-agnostic device integration framework with Garmin as the first implementation — automatic activity sync, FIT file parsing, and route push to device.

### Dependencies

- Phase 1 (auth, user system, API, database)
- Phase 4 (activity system — synced device activities create activity records)

### Features

- Provider-agnostic integration framework (`Provider` interface)
- Garmin Connect OAuth 2.0 with PKCE (connect/disconnect)
- Background activity sync (every 15 min polling + manual sync)
- FIT binary file parsing → activity creation with track, stats, activity type
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
   - `fit.go` — FIT binary file parsing using `github.com/muktihari/fit`, extract trackpoints → PostGIS LineString, calculate distance/elevation/duration. For climbing activities: detect approach/climb/descent segments from FIT session data (COROS multi-pitch, Garmin climbing mode), extract per-pitch elevation/duration, auto-populate `activity_segments` with pitch JSONB. FIT parsing produces the same neutral `ParsedActivity` that Phase 4's GPX parser yields
   - `scheduler.go` — sync scheduler: tick every 15 min, query active providers, acquire Redis lock, refresh tokens if needed, fetch + process activities, release lock

2. **Garmin provider** (`apps/api/internal/integration/garmin/`)
   - `garmin.go` — `Provider` implementation, activity type mapping (Garmin FIT Sport → mtamta activity_type)
   - `activities.go` — Garmin Activity API client (list activities, download FIT)
   - `courses.go` — Garmin Courses API client (push route as course)
   - `oauth.go` — Garmin-specific OAuth 2.0 endpoints, scopes, token exchange

3. **Database migrations**
   - `006_device_providers.up.sql` — `device_providers` table (user_id, provider, encrypted tokens, sync state)
   - `007_synced_activities.up.sql` — `synced_activities` table (provider activity → local activity mapping)
   - No `activities` ALTER needed — `source`, `source_id`, `original_file_url`, `original_file_format` are already in migration 003 (Phase 4)

4. **Sync scheduler**
   - Background goroutine within main API process
   - Per-provider Redis lock (`integration:sync_lock:{user_id}:{provider}`, 10 min TTL) to prevent concurrent syncs
   - Proactive token refresh when expiry < 7 days
   - Failed syncs: `sync_status='failed'` + error_message, retried next cycle
   - Initial sync on connect: last 30 days of activities

> **Architecture note**: Background goroutines within the API process are sufficient for Phase 5's single-provider sync. Before Phase 10 (multiple concurrent ingest pipelines), extract schedulers into a dedicated worker binary (`cmd/worker/`) to avoid overloading the web API process and enable independent scaling.

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
   - `components/SourceBadge.tsx` — "Synced from Garmin" badge on activity detail
   - `components/PushToDeviceButton.tsx` — "Send to Garmin" button on activity detail (if connected + provider supports courses)
   - `stores/integrationStore.ts` — connected providers, sync status, sync history, actions for connect/disconnect/sync/push

7. **Shared types** (`packages/shared/src/types/integration.ts`)
   - `ProviderInfo` — provider name, connected status, features, last sync
   - `SyncedActivity` — synced activity with status, provider activity ID, local activity ID
   - `SyncSettings` — auto-sync toggle, sync frequency
   - The `Activity` type already carries `source`, `sourceId`, `originalFileUrl`, `originalFileFormat` — no extension needed

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
│   ├── 006_device_providers.up.sql
│   └── 007_synced_activities.up.sql

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
- [ ] FIT files are downloaded, stored in S3, and parsed into activities
- [ ] Parsed activities have correct track geometry, distance, elevation, duration, and activity type
- [ ] Activity type mapping works correctly (Garmin FIT Sport → mtamta activity_type)
- [ ] Synced activities are created with `visibility='private'` and `source='garmin'`
- [ ] Duplicate activities are not re-synced (dedup by `source_id`)
- [ ] User can push a route to their Garmin device as a course
- [ ] OAuth tokens are encrypted at rest with AES-256-GCM
- [ ] Token refresh happens proactively before expiry
- [ ] Failed syncs are recorded with error messages and retried next cycle
- [ ] Integrations page shows connected providers, sync status, and sync history
- [ ] Activity detail shows source badge and "Send to Garmin" button when applicable
- [ ] COROS/Garmin climbing activities are parsed into approach/climb/descent segments with pitch data
- [ ] Per-pitch elevation and duration from FIT multi-pitch data populate activity_segments

---

## Phase 6: Route & Planning

**Goal**: Users can plan routes — place waypoints, snap them to trails, see an elevation profile, and save, share, and export routes. Builds the `route` entity designed in `Architecture.md` (planned itineraries, distinct from recorded activities).

### Dependencies

- Phase 2 (map rendering, layer system)
- Phase 3.5 (multi-provider adapter — the route layer targets `AppMapAdapter`)
- Phase 4 (activities — a completed activity can link the route it followed via `activities.route_id`)

### Features

- Route planner: click-to-place waypoints, draggable, with undo/redo
- Trail snapping via the Mapbox Directions API (walking profile), proxied + cached
- Elevation profile for the planned route (distance vs elevation, total ascent/descent)
- The `routes` entity — planned itineraries with `path` geometry + `waypoints` JSONB
- Route CRUD, save, and share; routes shown on the user profile
- GPX import (build a route from an uploaded GPX) and GPX export (download a route)
- Per-route visibility (private / followers / public), mirroring activities
- Push a route to a Garmin device as a course (via the Phase 5 course-push endpoint)

### Technical Tasks

1. **Routes migration** — `routes` table + `activities.route_id` FK
   - `CREATE TABLE routes` per the Architecture.md schema (`path` GEOGRAPHY(LineString), `waypoints` JSONB, `activity_type`, distance/elevation, `visibility`)
   - `ALTER TABLE activities ADD CONSTRAINT ... FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL` — adds the deferred FK; the `route_id` column already exists (NULL-able, FK-less) from Phase 4's migration 003
   - Migration number: next available at implementation time (Phase 5 device-sync migrations land first)

2. **Route domain, repository, service, handler** (`apps/api/internal/route/`)
   - `route.go`, `repository.go`, `service.go`, `handler.go` — follow the `activity` package patterns (SQL const, COALESCE updates, pgx scanning, sentinel errors)
   - Bbox GeoJSON query for `GET /api/v1/map/routes` (zoom-dependent `ST_Simplify`, `visibility='public'`)

3. **Directions proxy** (`apps/api/internal/geo/directions.go`)
   - `POST /api/v1/routes/directions` — accepts waypoints, calls the Mapbox Directions API (walking profile), returns a snapped GeoJSON LineString + distance_m + duration_s
   - Redis cache `directions:{sha256(waypoints)}`, 1-hour TTL; rate limit 10 req/min per user
   - Fallback: straight-line segments if the Directions API errors

4. **Route CRUD API**
   - `POST/GET/PATCH/DELETE /api/v1/routes` — create, read, update, delete (owner-only mutations)
   - `GET /api/v1/routes` — the caller's own routes; `GET /api/v1/map/routes` — public routes by bbox
   - `GET /api/v1/routes/{id}/gpx` — export a route as a GPX file

5. **Route planner UI** (`apps/web/src/map/RoutePlanner.tsx`)
   - Click-to-place draggable waypoints; on each change, call the directions proxy to snap
   - Render the snapped route via `AppMapAdapter.addLayer(layer, { slot: 'top' })`
   - Show distance + estimated duration; undo/redo for waypoint edits

6. **Elevation profile** (`apps/web/src/components/ElevationProfile.tsx`)
   - Sample points with `turf.along()`, query elevation via `map.queryTerrainElevation()`
   - SVG/Canvas chart: distance vs elevation, total ascent/descent, min/max; hover highlights the point on the map
   - Reusable for routes, completed activities, and (later) the measurement tool

7. **GPX import / export**
   - Import: build a route from an uploaded GPX — reuse the Phase 4 GPX parser to derive `waypoints` + `path`
   - Export: serve a route as GPX via `GET /api/v1/routes/{id}/gpx`

8. **Route store** (`apps/web/src/stores/routeStore.ts`)
   - State: waypoints, snapped route, elevation samples, the caller's routes
   - Actions: addWaypoint, moveWaypoint, removeWaypoint, clearRoute, fetchDirections, saveRoute, fetchMyRoutes

### Key Files

```
apps/api/
├── internal/route/
│   ├── route.go
│   ├── repository.go
│   ├── service.go
│   └── handler.go
└── internal/geo/
    └── directions.go

apps/web/src/
├── map/RoutePlanner.tsx
├── components/ElevationProfile.tsx
└── stores/routeStore.ts
```

### Acceptance Criteria

- [ ] The `routes` table is created and the `activities.route_id` FK is added
- [ ] User can place draggable waypoints on the map
- [ ] Route snaps to trails via the Mapbox Directions proxy after each waypoint change
- [ ] Fallback to straight-line segments if the Directions API is unavailable
- [ ] Directions responses are cached in Redis (1-hour TTL)
- [ ] Elevation profile chart displays for the planned route with total ascent/descent
- [ ] Hovering the elevation profile highlights the corresponding point on the map
- [ ] User can save a route (`POST /api/v1/routes`) and re-open it for editing
- [ ] Route CRUD via `/api/v1/routes` works with ownership checks
- [ ] Public routes are queryable by bbox via `GET /api/v1/map/routes`
- [ ] A route can be imported from a GPX file and exported as GPX
- [ ] A completed activity can link the route it followed via `route_id`
- [ ] User can push a route to a Garmin device as a course

---

## Phase 7: Mobile App + Offline

**Goal**: A React Native mobile app sharing code with the web app, with offline map and data support for field use. Split into 7a (the app, online) and 7b (offline).

### Dependencies

- Phase 1 (auth, API, shared packages)
- Phase 2 (map-core package)
- Phase 4 (activities) and Phase 6 (routes) — the app's primary content

---

### Sub-milestone 7a — Mobile App (online)

**Goal**: A shippable React Native app — auth, map, and browsing activities and routes online.

**Features**

- React Native app shell (iOS + Android)
- Google and Apple Sign-In (native SDKs)
- Full-screen map with `@rnmapbox/maps`; base layer switching, 3D terrain, winter/summer
- Browse activities and routes on the map (tap to view detail)
- Activity / route detail screens (track, stats, photos)
- User profile screen; tab navigation (map, explore, profile)

**Technical Tasks**

1. **React Native setup** (`apps/mobile/`) — initialize the project (bare or Expo), configure `@rnmapbox/maps` for iOS/Android, React Navigation (tab + stack), integrate `packages/shared` (types, API client) and `packages/map-core` (map config, provider types — the provider model extends to mobile)
2. **Authentication** — Google Sign-In (`@react-native-google-signin/google-signin`), Apple Sign-In (`@invertase/react-native-apple-authentication`), token storage via `react-native-keychain` / `expo-secure-store`; same flow as web (ID token → backend → JWT)
3. **Map screen** — full-screen map with gestures; base layer / style switching from `map-core`; activity tracks + route lines rendered; tap → detail
4. **Activity / route screens** — detail screens (mini-map, stats, photos); explore/list screens with cards
5. **Profile screen** — current user's profile, activities, routes, stats; edit profile

**7a Verification**

- [ ] App builds and runs on iOS and Android simulators
- [ ] Google and Apple Sign-In work natively
- [ ] Map renders with Mapbox; base layer switching and 3D terrain work
- [ ] Activity tracks and route lines display; tapping opens detail
- [ ] User can view and edit their profile
- [ ] Shared `shared` and `map-core` packages work correctly in React Native

---

### Sub-milestone 7b — Offline

**Goal**: Download map regions and activity/route data for use in the field with no connectivity.

**Features**

- Offline map downloads — select a region + zoom range, download tiles
- Cached activity and route data available offline
- Offline indicator + graceful no-network UX

**Technical Tasks**

1. **Offline maps** — region/zoom selection UI, tile-pack download with progress, offline indicator. The PMTiles-on-R2 tile strategy (see `Architecture.md`) is offline-friendly: a region is a PMTiles slice
2. **Offline data** — cache the caller's activities and routes locally (SQLite / AsyncStorage); read-through cache, sync on reconnect
3. **Field UX** — clear offline/online state indication, queued actions where applicable

**7b Verification**

- [ ] User can download a map region for offline use
- [ ] Offline maps render with no network connectivity
- [ ] The caller's activities and routes are viewable offline
- [ ] The app clearly indicates offline state and recovers on reconnect

### Key Files

```
apps/mobile/
├── package.json
├── app.json
└── src/
    ├── App.tsx
    ├── navigation/RootNavigator.tsx
    ├── screens/
    │   ├── MapScreen.tsx
    │   ├── ExploreScreen.tsx
    │   ├── ActivityDetailScreen.tsx
    │   ├── RouteDetailScreen.tsx
    │   ├── ProfileScreen.tsx
    │   ├── LoginScreen.tsx
    │   └── OfflineMapsScreen.tsx
    ├── components/
    │   ├── MapView.tsx
    │   └── ActivityCard.tsx
    ├── services/offlineManager.ts
    └── hooks/useAuth.ts
```

### Acceptance Criteria

- [ ] (7a) Mobile app builds and runs on iOS + Android with native auth, map, and activity/route browsing
- [ ] (7a) Shared `shared` and `map-core` packages work in React Native
- [ ] (7b) Map regions download for offline use and render with no connectivity
- [ ] (7b) The caller's activities and routes are available offline; the app recovers on reconnect

---

## Phase 8: Terrain Analysis Layers

**Goal**: Custom-generated overlay layers for slope angle (avalanche terrain), aspect, sun/shade exposure, and flat/steep terrain — plus an interactive elevation/slope/aspect terrain filter.

### Dependencies

- Phase 2 (map layer system, layer toggle UI)
- Phase 6 (route planning — slope/aspect layers directly inform planning)

### Features

- Slope angle layer: color-coded by degree, highlighting >30° (avalanche-prone) zones
- Aspect (slope direction) layer: compass direction overlay (N/S/E/W color-coded)
- Avalanche slope filter layer: highlights only 25°–45°+ terrain (yellow→dark red), all other angles transparent
- Sun/shade exposure layer: shows which slopes receive sun vs. shade at a given time
- Flat/steep terrain indicator layer
- Interactive terrain filter: set elevation + slope + aspect ranges → highlight matching terrain live (client-side WebGL)
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
   - Toggle controls in the sidebar overlays tab
   - Opacity slider for overlay layers
   - Legend showing color scale (e.g., slope angle 0°–60°)

5. **Custom terrain filter** (interactive, client-side)
   - `TerrainFilterPanel.tsx` — filter panel UI: elevation range slider, slope/gradient range slider, aspect multi-select toggles (N/NE/E/SE/S/SW/W/NW)
   - `TerrainFilterLayer.tsx` — WebGL `CustomLayerInterface` that reads Mapbox Terrain RGB tiles, computes slope/aspect per pixel from a 3×3 kernel, applies the user-defined filter, renders matching pixels as a green overlay
   - `terrainFilterStore.ts` — Zustand store for filter state (elevation min/max, slope min/max, selected aspects)
   - Shares slope/aspect math with the pre-rendered overlays above; unlike them it renders live as the user drags the sliders
   - Primary use case: once Phase 10 (Live Data) ships, correlate avalanche bulletin warnings (danger aspects/elevations) with actual terrain

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

apps/web/src/
├── map/
│   ├── OverlayLayers.tsx       # Raster overlay layer rendering
│   └── TerrainFilterLayer.tsx  # Interactive WebGL terrain filter
├── components/TerrainFilterPanel.tsx
└── stores/terrainFilterStore.ts
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
- [ ] Interactive terrain filter highlights terrain matching user-specified elevation, slope, and aspect criteria
- [ ] The terrain filter renders dynamically via WebGL as the user adjusts filter parameters

---

## Phase 9: User & Social

**Goal**: User profiles, social interactions (follow, like, save, comment), an activity feed, and in-app notifications.

### Dependencies

- Phase 1 (auth, users)
- Phase 4 (activities exist to like/save/comment on)
- Phase 5 (device-synced activities also appear in social feeds)

### Features

- Public user profile pages (avatar, bio, activity list, stats)
- Follow / unfollow users
- Like / unlike activities
- Save / unsave (bookmark) activities
- Comments on activities
- Activity feed (activities from followed users)
- Follower/following counts and lists
- In-app notifications (follow, like, comment triggers)

### Technical Tasks

1. **Social API** (`apps/api/internal/social/`)
   - `handler.go` — follow, like, save, comment endpoints
   - `service.go` — social logic, feed generation
   - `repository.go` — follows, likes, saves, comments table operations
   - Database migrations for the social tables (`follows`, `likes`/`saves`, `comments`, `notifications`) — numbers assigned at implementation

2. **Activity feed**
   - `GET /api/v1/feed` — returns activities from followed users, sorted by recency
   - Pagination (cursor-based)
   - Include activity previews with like/save counts

3. **User profile enhancements**
   - `PATCH /api/v1/users/me` — update avatar, bio, display name
   - Fix nullable field clearing: PATCH currently uses COALESCE so clients can't set bio/avatar_url to null. Use a three-state patch type (unset / null / value) or explicit clear flags
   - Avatar upload via S3 pre-signed URL
   - Activity count, follower/following counts on profile

4. **Auth improvements**
   - Multi-provider account linking: sign-in with a second provider for the same email should attach the provider to the existing user, not fail with 409. Implement "find by normalized email and attach provider" in one transaction
   - Refresh token rotation: implement one-time-use refresh tokens. Once rotation is in place, also fix the StrictMode double-restore in App.tsx (dev-only mount effect fires twice, issuing duplicate /auth/refresh requests)

5. **Notifications**
   - `notifications` table migration
   - `GET /api/v1/notifications` — polling endpoint for current user's notifications
   - `PATCH /api/v1/notifications/:id/read` — mark notification as read
   - Trigger notifications on follow, like, and comment actions

6. **Web UI**
   - `pages/UserProfilePage.tsx` — user profile with activity grid
   - `components/FollowButton.tsx` — follow/unfollow toggle
   - `components/LikeButton.tsx` — like/unlike with count
   - `components/SaveButton.tsx` — bookmark toggle
   - `components/CommentSection.tsx` — comment list + add form
   - `pages/FeedPage.tsx` — activity feed with activity cards

### Key Files

```
apps/api/
├── internal/social/
│   ├── handler.go
│   ├── service.go
│   └── repository.go
└── migrations/        # follows, likes_saves, comments, notifications

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

- [ ] Open sign-ups: remove `ALLOWED_EMAILS` restriction on Railway (currently locked to owner email only)
- [ ] User can view other users' profiles with their public activities
- [ ] User can follow/unfollow other users
- [ ] User can like and save activities; counts update in real time
- [ ] User can comment on activities; comments display chronologically
- [ ] Activity feed shows recent activities from followed users
- [ ] Feed supports cursor-based pagination
- [ ] User can update their avatar, bio, and display name
- [ ] All social actions require authentication
- [ ] User receives in-app notifications for follows, likes, and comments

---

## Phase 10: Live Data Integrations

**Goal**: Real-time environmental data displayed on the map — weather, wind, snow depth, avalanche reports, ski lift status.

### Dependencies

- Phase 2 (map, layer system)
- Phase 8 (overlay layer infrastructure, tile serving)

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

> **Prerequisite**: Extract background job scheduler into `cmd/worker/` (see Phase 5 note). Phase 10 pipelines run in the worker process, not the API.

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

## Phase 11: Search & Discovery

**Goal**: Full-text and location-based search for activities, locations, and users.

### Dependencies

- Phase 4 (activities to search)
- Phase 9 (users to search)

### Features

- Global search bar (activities + locations + users)
- Full-text search with typo tolerance (Meilisearch)
- Location-based search ("activities near me", "activities in Chamonix")
- Filter by activity type, distance, elevation, date
- Featured/trending activities on explore page
- Search results displayed as map pins and list cards

### Technical Tasks

1. **Meilisearch setup**
   - Docker Compose service for Meilisearch
   - Index configuration (activities, locations, users)
   - Geo search enabled with `_geo` field

2. **Locations and climbing tables**
   - Migration: `locations` table (resorts, peaks, trailheads, towns, huts, crags)
   - Migration: `climbing_routes` table (linked to crag locations)
   - Migration: `crag_topos` table (photo topo storage)
   - Migration numbers assigned at implementation
   - Seed pipeline: import resorts from OpenSkiData, peaks and trailheads from OSM, crags from OpenBeta (GraphQL bulk import with `source='openbeta'`, dedup by `source_id`)
   - Climbing routes from OpenBeta imported into `climbing_routes` table, linked to crag locations
   - Locations indexed in Meilisearch for search

3. **Search sync** (`apps/api/internal/search/`)
   - `service.go` — Meilisearch client, index management
   - Sync activities to Meilisearch on create/update/delete
   - Sync users to Meilisearch on create/update
   - Bulk re-index command for initial population

4. **Search API**
   - `GET /api/v1/search?q=&type=` — global search
   - `GET /api/v1/search/activities?q=&activity_type=&near=&radius=` — activity search with filters
   - `GET /api/v1/search/locations?q=` — location search

5. **Trending/featured**
   - Trending: activities with most likes/views in recent timeframe
   - Featured: manually curated or algorithmically selected
   - `GET /api/v1/activities/trending`
   - `GET /api/v1/activities/featured`

6. **Web UI**
   - `components/SearchBar.tsx` — global search with autocomplete
   - `pages/SearchResultsPage.tsx` — results as map pins + list
   - `components/SearchFilters.tsx` — activity type, distance, date filters
   - `pages/ExplorePage.tsx` — trending + featured activities

7. **Mobile UI**
   - Search bar on explore screen
   - Filter sheet
   - Results list with map view

### Key Files

```
apps/api/internal/search/
├── handler.go
└── service.go

apps/api/migrations/   # locations, climbing_routes, crag_topos

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

- [ ] Searching "chamonix trail run" returns relevant activities with typo tolerance
- [ ] "Activities near me" returns activities sorted by distance from user's location
- [ ] Filters by activity type, min/max distance, and date range work correctly
- [ ] Search results appear both as map pins and list cards
- [ ] Autocomplete suggestions appear while typing
- [ ] Trending page shows popular recent activities
- [ ] Search is fast (<200ms for typical queries)

---

## Phase 12: Advanced Features

**Goal**: In-app GPS recording, activity heatmaps, map measurement tools, and climbing photo-topo + 3D-wall visualization.

### Dependencies

- Phase 2 (map)
- Phase 4 (activities — GPS recording produces activities)
- Phase 7 (mobile app — GPS recording is mobile)
- Phase 8 (terrain analysis — the `tilegen` CLI is reused for heatmaps)
- Phase 11 (search & discovery — `climbing_routes` / `crag_topos` tables)

### Features

- In-app GPS track recording (mobile + PWA)
- Heatmaps showing popular activity areas
- Elevation point query: tap map → show elevation at point (client-side DEM decode)
- Distance measurement tool: click points → geodesic distance with optional elevation profile
- Photo topo editor: web-based tool for drawing SVG route lines on crag photos
- Crag detail page with climbing routes, grades, photo topos, and approach info
- Climbing route search and filtering (by grade, type, crag)
- 3D wall visualization: render photogrammetry models (glTF) of crags via Threebox (experimental)

### Technical Tasks

1. **GPS recording**
   - Background location tracking (React Native)
   - Record trackpoints (lat/lon/ele/time); live track display on map during recording
   - Save recording as an activity (auto-generate GPX)
   - Activity timer and live stats (distance, elevation, speed)

2. **Heatmaps**
   - Heatmap tiles pre-rendered from activity track density using PostGIS aggregation (`ST_HexGrid` or similar)
   - Stored in S3 (`s3://mtamta-tiles/heatmap/`). Regenerated as a batch job via the `tilegen` CLI. No dedicated table
   - Toggleable layer on the map

3. **Elevation point query**
   - Click/tap handler on map to capture coordinates
   - Decode Mapbox Terrain RGB tile at the clicked coordinate (client-side): `height = -10000 + ((R × 256 × 256 + G × 256 + B) × 0.1)`
   - Display elevation as a popup (meters + feet). No server round-trip
   - `ElevationQuery.tsx` — click handler + popup display

4. **Distance measurement**
   - Interactive polyline tool: click points on map to build a measurement path
   - Geodesic distance between points via turf.js; cumulative distance per segment
   - Optional elevation profile along the path (reuses the Phase 6 `ElevationProfile`)
   - `MeasureTool.tsx` — interactive polyline + distance display

5. **Photo topo system** (climbing — `apps/api/internal/climbing/`)
   - Uses the `climbing_routes` and `crag_topos` tables from Phase 11
   - `climbing/` package: `handler.go`, `service.go`, `repository.go`, `grades.go`, `topo.go`
   - `TopoEditor.tsx` — interactive SVG drawing tool for route lines on crag photos
   - `CragDetailPage.tsx` — crag overview with climbing routes, grades, photo topos, approach info
   - `TopoViewer.tsx` — display photo topo with route overlays
   - `GradeDisplay.tsx` — grade display component using `@openbeta/sandbag` for conversion
   - `RouteTable.tsx` — sortable/filterable climbing route table
   - `climbingStore.ts` — Zustand store for crags, climbing routes, topos

6. **3D wall visualization** (experimental)
   - `crag_models` migration (number assigned at implementation)
   - `WallModelLayer.tsx` — Threebox `CustomLayerInterface` for rendering glTF crag models in Mapbox
   - `PointCloudViewer.tsx` — Potree integration for large point cloud visualization
   - Feature-flagged: disabled by default, enabled via settings

### Key Files

```
apps/mobile/src/
├── screens/RecordScreen.tsx       # GPS recording UI
└── services/locationTracker.ts    # Background GPS tracking

apps/api/internal/climbing/
├── handler.go
├── service.go
├── repository.go
├── grades.go
└── topo.go

apps/web/src/
├── map/
│   ├── HeatmapLayer.tsx
│   ├── ElevationQuery.tsx
│   ├── MeasureTool.tsx
│   └── WallModelLayer.tsx
├── pages/
│   └── CragDetailPage.tsx
├── components/
│   ├── TopoEditor.tsx
│   ├── TopoViewer.tsx
│   ├── GradeDisplay.tsx
│   ├── RouteTable.tsx
│   └── PointCloudViewer.tsx
└── stores/climbingStore.ts
```

### Acceptance Criteria

- [ ] GPS recording captures a track with live display on the map
- [ ] Recorded track can be saved as an activity with auto-calculated stats
- [ ] Heatmap layer shows popular activity areas with configurable intensity
- [ ] Tapping the map with the elevation query tool shows a popup with elevation in meters and feet
- [ ] Distance measurement tool allows clicking multiple points and displays cumulative geodesic distance
- [ ] User can create, view, and edit crags with crag-specific metadata (rock type, approach, orientation)
- [ ] User can add, edit, and delete climbing routes at a crag with multi-system grades
- [ ] Photo topo editor allows drawing SVG route lines on uploaded crag photos
- [ ] Crag detail page displays climbing routes, grades, photo topos, and approach info
- [ ] Crags display on the map as markers within the current viewport
- [ ] Climbing routes and crags are searchable via Meilisearch (by name, grade, type)
- [ ] Grades display correctly across systems (YDS, French, UIAA) via `@openbeta/sandbag`
- [ ] 3D wall visualization renders glTF crag models in Mapbox via Threebox (feature-flagged)

---

## Phase 13: Polish & Launch

**Goal**: Production readiness — performance, SEO, monitoring, analytics, and final polish.

### Dependencies

- All prior phases (this is the final phase)

### Features

- Performance optimization (bundle size, lazy loading, image optimization)
- PWA support (installable web app, service worker)
- SEO for public activity pages (server-side rendering or meta tags)
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
   - Meta tags for activity pages (title, description, Open Graph, Twitter Cards)
   - Sitemap generation for public activities
   - Structured data (JSON-LD) for activity pages
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
   - Playwright for critical user flows: sign in → create activity (GPX upload) → view on map → like → search → find activity
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
- [ ] Public activity pages have correct meta tags and Open Graph images
- [ ] Error monitoring captures and alerts on backend errors
- [ ] API responds within 200ms for typical requests under normal load
- [ ] Rate limiting prevents abuse (429 responses for excessive requests)
- [ ] No critical accessibility violations
- [ ] Landing page clearly communicates the platform's value
- [ ] E2E tests pass for 5 critical user flows (sign in, create activity, view on map, like, search)

---

## Summary

| Phase | Focus | Key Deliverable |
|---|---|---|
| 1 | Foundation | Authenticated API + web shell + CI |
| 2 | Maps Core | Interactive map with layers, 3D terrain |
| 3 | Map Sources & Overlays | Country-specific topo maps, seasonal satellite, ski overlays |
| 3.5 | Multi-Provider Support | Dual Mapbox/MapTiler rendering, shared adapter, capability matrix |
| 4 | Activity System | GPX upload + manual entry, activity CRUD, tracks via provider-neutral adapter, climbing segments + pitch metadata |
| 5 | Device Integrations | Garmin sync, FIT parsing, course push, multi-pitch climb parsing |
| 6 | Route & Planning | Route entity, planner UI, trail snapping, elevation profile, GPX import/export |
| 7 | Mobile App + Offline | React Native app (shared code) + offline map regions and data |
| 8 | Terrain Analysis | Slope/aspect/avalanche overlays, sun exposure, interactive terrain filter |
| 9 | User & Social | Profiles, follows, likes, comments, feed, notifications |
| 10 | Live Data | Weather, wind, snow, avalanche, lifts |
| 11 | Search & Discovery | Full-text + geo search, trending, locations, crag/route seeding from OpenBeta |
| 12 | Advanced Features | GPS recording, heatmaps, map tools, photo topos, 3D walls |
| 13 | Polish & Launch | Performance, PWA, SEO, monitoring |

Each phase produces a working increment. Phases 1–3 build the core map experience; Phase 3.5 adds multi-provider support (Mapbox + MapTiler) before activity features land. Phases 1–4 form the minimum viable product (including climbing activity segments with pitch metadata). Phase 5 adds device sync; Phase 6 the route planner; Phase 7 the mobile app with offline support. Phases 8–10 add terrain analysis, social, and live data. Phase 11 adds search and seeds crags/climbing routes from OpenBeta. Phase 12 adds advanced map tools and climbing topos. Phase 13 polishes for launch.
