# Phase 3: Map Sources & Overlays — Detailed Implementation Plan ✅

> **Status: COMPLETE** — All 27 implementation items verified. Manual testing remaining.
>
> Country-specific topographic maps, seasonal satellite imagery, and ski-focused overlays. Split into 3 sub-milestones (3a → 3b → 3c). Complete tasks top-to-bottom within each sub-milestone.

---

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **TopoSource is separate from BaseLayer** | `BaseLayer` stays `'outdoors' \| 'satellite'`. A new `TopoSourceId` type controls which raster topo tiles overlay the Mapbox vector style when `baseLayer === 'outdoors'`. Hidden when satellite is active. |
| 2 | **Raster tiles overlay via `map.addSource()` + `map.addLayer()`** | Inserted `before` first symbol layer so Mapbox labels float above topo tiles. Default opacity ~0.85, user-adjustable. |
| 3 | **Auto-selection with manual override** | On `moveend`, check viewport center against country bounding boxes. `topoSourceManual` flag disables auto-switching. "Reset to auto" clears it. |
| 4 | **Single generic tile proxy handler** | One Go handler at `/api/v1/tiles/{provider}/{z}/{x}/{y}` with a provider allowlist. Sentinel-2 gets a separate handler due to OAuth2 + WMS complexity. |
| 5 | **`style.load` re-application** | Extract `applyPostStyleLoad(map)` that re-adds both terrain and raster overlays after any style swap. |

---

## Sub-milestone 3a — Country Topo Providers (frontend)

### 1. Topo source catalog — `packages/map-core/src/topo.ts`

- [x] Create `packages/map-core/src/topo.ts`

Types:
```typescript
export type TopoSourceId = 'swisstopo' | 'ign' | 'basemap-at' | 'bkg' | 'kartverket' | 'usgs' | 'opentopomap'

export interface TopoSourceDef {
  id: TopoSourceId
  name: string
  country: string              // ISO 3166-1 alpha-2
  bbox: [number, number, number, number]  // [west, south, east, north]
  tileUrl: string              // XYZ template with {z}/{x}/{y}
  winterTileUrl?: string       // swisstopo only
  attribution: string
  maxZoom: number
  tileSize: 256 | 512
  needsProxy: boolean          // true for IGN, OpenTopoMap
  proxyProvider?: string       // key for /api/v1/tiles/{provider}/
}
```

Exports:
- `TOPO_SOURCES: TopoSourceDef[]` — 7 providers with real tile URLs
- `OVERLAY_SOURCES: OverlaySourceDef[]` — pistes, ski touring, snowshoe
- `findTopoSourceForPoint(lng, lat)` — returns most specific country match (smallest bbox wins), excludes OpenTopoMap from auto-select
- `getTopoSource(id)` — lookup by ID
- `resolveTopoTileUrl(source, season, apiBaseUrl)` — resolves proxy or winter variant URLs

Providers:
| ID | Country | Direct/Proxy | Winter variant |
|----|---------|-------------|----------------|
| swisstopo | CH | Direct | Yes (pixelkarte-grau) |
| ign | FR | Proxy (API key) | No |
| basemap-at | AT | Direct | No |
| bkg | DE | Direct | No |
| kartverket | NO | Direct | No |
| usgs | US | Direct | No |
| opentopomap | Global | Proxy (rate limit) | No |

### 2. Layer registry update — `packages/map-core/src/layers.ts`

- [x] Add 3 Phase 3 entries to `LAYER_REGISTRY`:
  - `topo-overlay` (overlay, phase 3)
  - `pistes` (overlay, phase 3)
  - `satellite-seasonal` (base, phase 3)

### 3. Barrel exports — `packages/map-core/src/index.ts`

- [x] Export all topo types and functions from `./topo`

### 4. Map store — `apps/web/src/stores/mapStore.ts`

- [x] Add Phase 3 state fields:

```typescript
topoSource: TopoSourceId | null    // active topo source (null = none)
topoSourceManual: boolean          // user manually selected
topoOpacity: number                // 0-1, default 0.85
overlayPistes: boolean             // OpenSnowMap pistes
overlaySkiTouring: boolean         // swisstopo ski touring (winter + CH only)
overlaySnowshoe: boolean           // swisstopo snowshoe (winter + CH only)
sentinelYear: number               // default: current year
```

- [x] Add actions: `setTopoSource`, `setTopoOpacity`, `resetTopoSourceAuto`, `setOverlayPistes`, `setOverlaySkiTouring`, `setOverlaySnowshoe`, `setSentinelYear`

### 5. Raster overlay hook — `apps/web/src/map/useRasterOverlays.ts`

- [x] Create `useRasterOverlays(map)` hook

Responsibilities:
- React to store changes (`topoSource`, `topoOpacity`, `season`, `baseLayer`, overlay booleans, `sentinelYear`)
- Add/remove/swap raster sources + layers imperatively
- Insert layers before first symbol layer (z-ordering via `findFirstSymbolLayer`)
- Re-add all active layers on `style.load` event
- Handle swisstopo winter variant URL swap when season changes
- Handle sentinel seasonal satellite tiles when satellite base active
- Export `applyAllRasterOverlays(map)` for use in `applyPostStyleLoad`

Layer IDs: `topo-raster-source/layer`, `sentinel-source/layer`, `overlay-{id}-source/layer`

### 6. Auto-selection hook — `apps/web/src/map/useTopoAutoSelect.ts`

- [x] Create `useTopoAutoSelect(map)` hook
- Subscribes to `moveend`, calls `findTopoSourceForPoint()`, updates store if `topoSourceManual === false`
- Runs once immediately on mount if style is loaded

### 7. MapContainer integration — `apps/web/src/map/MapContainer.tsx`

- [x] Import and call `useTopoAutoSelect(mapInstance)` and `useRasterOverlays(mapInstance)`
- [x] Extract `applyPostStyleLoad(map)` function that re-adds terrain + raster overlays
- [x] Wire both terrain + raster re-add from `style.load` handler and initial `load`

### 8. LayerPanel UI — `apps/web/src/map/LayerPanel.tsx`

- [x] Add "Topo Map" section (visible when `baseLayer === 'outdoors'`):
  - Dropdown: Auto-detect (shows current source), None, each country source
  - Opacity slider (0–100%)
  - Attribution text
- [x] Add "Overlays" section (visible in winter mode):
  - Pistes checkbox (always)
  - Ski touring checkbox (when swisstopo active)
  - Snowshoe checkbox (when swisstopo active)
- [x] Add "Seasonal Satellite" section (visible when `baseLayer === 'satellite'`):
  - Year selector (2018–current)

### 9. Tests — `packages/map-core/src/topo.test.ts`

- [x] Create `topo.test.ts` — 21 tests:
  - Source catalog: count, required fields, proxy sources have proxyProvider
  - Overlay catalog: count, all winter-only, ski-touring/snowshoe require swisstopo
  - `findTopoSourceForPoint`: CH, FR, AT, DE, NO, US, ocean (null), border overlap (smallest bbox wins), OpenTopoMap excluded
  - `getTopoSource`: valid ID, unknown ID
  - `resolveTopoTileUrl`: direct summer, winter variant, proxy IGN, proxy opentopomap

### 10. Layer test update — `packages/map-core/src/layers.test.ts`

- [x] Update layer count from 3 → 6
- [x] Update base layer count from 2 → 3 (includes `satellite-seasonal`)

---

## Sub-milestone 3b — Backend Proxy & Caching

### 1. Config fields — `apps/api/internal/config/config.go`

- [x] Add optional env vars to `Config` struct:
  - `IGNApiKey` (`IGN_API_KEY`)
  - `SentinelHubInstanceID` (`SENTINEL_HUB_INSTANCE_ID`)
  - `SentinelHubClientID` (`SENTINEL_HUB_CLIENT_ID`)
  - `SentinelHubSecret` (`SENTINEL_HUB_CLIENT_SECRET`)
- All use `getEnv` with empty default (optional)

### 2. Provider registry — `apps/api/internal/tiles/provider.go`

- [x] Create `Provider` struct: ID, UpstreamURL (Go format string), CacheTTL, CachePrefix, Headers
- [x] `BuildProviders(cfg)` returns `map[string]*Provider`:
  - `opentopomap`: always registered, 24h TTL, User-Agent header
  - `ign`: only if `IGN_API_KEY` set, 24h TTL, API key in query param

### 3. Tile proxy handler — `apps/api/internal/tiles/handler.go`

- [x] Create `Handler` struct with providers, redis, httpClient, limiter
- [x] `ServeTile(w, r)` flow:
  1. Validate provider (404 if unknown)
  2. Parse & validate z/x/y (400 if invalid, z: 0-22, x/y: >= 0)
  3. Check Redis cache → return with `X-Cache: HIT`
  4. Rate limit check → 429 if exceeded
  5. Fetch upstream → 502 on failure
  6. Cache in Redis with provider's TTL
  7. Return bytes with `Content-Type`, `Cache-Control: public, max-age=86400`, `X-Cache: MISS`

### 4. Rate limiter — `apps/api/internal/tiles/ratelimit.go`

- [x] Simple in-memory rate limiter: mutex + counter, resets per minute window
- [x] `NewRateLimiter(maxPerMin)`, `Allow() bool`
- Default: 500 req/min for upstream tile fetches

### 5. Route registration — `apps/api/cmd/server/main.go`

- [x] Build providers: `tiles.BuildProviders(cfg)`
- [x] Create handler: `tiles.NewHandler(tileProviders, redisClient)`
- [x] Register public route: `r.Get("/api/v1/tiles/{provider}/{z}/{x}/{y}", tileHandler.ServeTile)`

### 6. Frontend proxy URL resolution — `packages/map-core/src/topo.ts`

- [x] `resolveTopoTileUrl()` for `needsProxy` sources builds `${apiBaseUrl}/api/v1/tiles/${provider}/{z}/{x}/{y}`
- Already implemented in 3a step 1, listed here for traceability

### 7. Tests — `apps/api/internal/tiles/handler_test.go`

- [x] Create handler tests:
  - Unknown provider → 404
  - Invalid coords (non-numeric z) → 400
  - Negative z → 400
  - Cache miss → fetch upstream, return MISS → second request returns HIT
  - Rate limit exceeded → 429

---

## Sub-milestone 3c — Seasonal Satellite & Overlays

### 1. Sentinel route registration — `apps/api/cmd/server/main.go`

- [x] Conditionally register sentinel route (if `SentinelHubInstanceID` set):
  `r.Get("/api/v1/tiles/sentinel/{z}/{x}/{y}", sentinelProvider.ServeTile)`

### 2. Sentinel Hub handler — `apps/api/internal/tiles/sentinel.go`

- [x] Create `SentinelProvider` struct with OAuth2 token management (double-checked locking)
- [x] `ServeTile(w, r)` — handles `GET /api/v1/tiles/sentinel/{z}/{x}/{y}?season=winter&year=2024`
  - Parses season (default: summer) and year (default: current, range: 2015–now)
  - Cache key: `sentinel:{season}:{year}:{z}:{x}:{y}`, 7-day TTL
  - Converts z/x/y to Web Mercator bbox via `tileBbox()`
  - Builds WMS request with TIME + MAXCC params
  - OAuth2 token acquired via `getToken()` (client_credentials grant, cached with 60s early expiry)
- [x] `tileBbox(z, x, y)` — converts tile coords to EPSG:3857 bbox string
- [x] `seasonDateRange(season, year)` — summer: Jun–Aug, winter: Dec(prev)–Feb

### 3. Overlay source definitions — `packages/map-core/src/topo.ts`

- [x] `OverlaySourceDef` interface with `seasonFilter` and `topoSourceFilter`
- [x] `OVERLAY_SOURCES` array:
  - `pistes` — OpenSnowMap, winter only
  - `ski-touring` — swisstopo, winter + swisstopo only
  - `snowshoe` — swisstopo, winter + swisstopo only

### 4. Raster overlay hook — `apps/web/src/map/useRasterOverlays.ts`

- [x] Handles overlay sources with season/topo filters
- [x] Handles sentinel seasonal satellite (when satellite base layer active)

### 5. Store — `apps/web/src/stores/mapStore.ts`

- [x] `sentinelYear` state with `setSentinelYear` action

### 6. LayerPanel — `apps/web/src/map/LayerPanel.tsx`

- [x] Satellite season controls: year selector dropdown (2018–current year)

### 7. Tests — `apps/api/internal/tiles/sentinel_test.go`

- [x] `tileBbox` tests: z=0 full world, z=1 top-left quarter
- [x] `seasonDateRange` tests: summer 2024, winter 2024

---

## Verification Checklist

- [x] `cd packages/map-core && pnpm test` — 37/37 passed
- [x] `cd apps/api && go build ./...` — compiles
- [x] `cd apps/api && go test ./internal/tiles/...` — unit tests pass
- [x] `cd apps/web && pnpm build` — web app builds
- [ ] Manual: open map over Switzerland → swisstopo auto-selected, tiles render
- [ ] Manual: switch to satellite → topo overlay hidden
- [ ] Manual: toggle winter mode → swisstopo switches to winter variant, pistes overlay appears
- [ ] Manual: proxy tiles load through `/api/v1/tiles/opentopomap/...` with Redis caching

---

## Files Summary

**New files (10):**
- `packages/map-core/src/topo.ts`
- `packages/map-core/src/topo.test.ts`
- `apps/web/src/map/useRasterOverlays.ts`
- `apps/web/src/map/useTopoAutoSelect.ts`
- `apps/api/internal/tiles/provider.go`
- `apps/api/internal/tiles/handler.go`
- `apps/api/internal/tiles/handler_test.go`
- `apps/api/internal/tiles/ratelimit.go`
- `apps/api/internal/tiles/sentinel.go`
- `apps/api/internal/tiles/sentinel_test.go`

**Modified files (8):**
- `packages/map-core/src/layers.ts`
- `packages/map-core/src/layers.test.ts`
- `packages/map-core/src/index.ts`
- `apps/web/src/stores/mapStore.ts`
- `apps/web/src/map/MapContainer.tsx`
- `apps/web/src/map/LayerPanel.tsx`
- `apps/api/internal/config/config.go`
- `apps/api/cmd/server/main.go`
