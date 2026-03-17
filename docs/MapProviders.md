# Map Providers: Dual Mapbox + MapTiler Web Architecture

> **Status: ACCEPTED**
>
> Finalized implementation reference for dual-provider web map rendering. Provider selection persisted in localStorage from day one. MapTiler SDK (MapLibre-based) as the alternative provider. M1+M2 complete before Phase 4; M3 deferred.

---

## Goal

Support two full web map stacks in parallel:

- **Mapbox stack** — Mapbox GL JS renderer + Mapbox SDK features
- **MapTiler stack** — MapTiler SDK renderer (MapLibre-based) + MapTiler SDK features

The user chooses the stack **after login** (gate shown only when no stored preference exists). The app then loads only the selected runtime and only the corresponding provider features. No cross-provider fallback mixing.

This document is the detailed implementation reference. [Architecture.md](Architecture.md) and [Plan.md](Plan.md) contain high-level summaries pointing here for details.

---

## Locked Product Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Provider choice happens after login** | Auth and map provider are separate concerns. The app should restore auth first, then resolve map stack. |
| 2 | **localStorage persistence from day one** | Provider gate only appears when no stored preference exists. Returning users skip the gate entirely. |
| 3 | **"Change map provider" in Settings** | Users can switch providers at any time via Settings without clearing browser data. |
| 4 | **MapTiler SDK (not raw MapLibre)** | MapTiler SDK wraps MapLibre with built-in terrain, geocoding, and weather APIs — less glue code, consistent API surface, and access to MapTiler's tile infrastructure. |
| 5 | **Web-only initial scope** | Avoid coupling current refactor to mobile work. Keep mobile-compatible package boundaries where practical, but do not block web implementation on mobile parity. |
| 6 | **Use the chosen stack fully** | If the user selects Mapbox, load Mapbox runtime and Mapbox-specific features. If the user selects MapTiler, load MapTiler runtime and MapTiler-specific features. |
| 7 | **No fallback mixing for now** | Simpler product story and cleaner implementation boundaries. |
| 8 | **Unsupported features are visible but disabled** | If a feature is not implemented for the selected stack, show it disabled with `Coming soon` rather than silently hiding it or swapping to another vendor. |
| 9 | **Develop both stacks in parallel by feature slice** | Prevent one stack from racing far ahead and turning the other into a permanent catch-up project. |

---

## Non-Goals

- Do **not** add mobile dual-provider support in this phase.
- Do **not** attempt to hot-swap SDK internals inside one mounted map instance.
- Do **not** mix providers per feature in the first version.
- Do **not** rewrite app-owned overlays twice if a shared abstraction can avoid it.

---

## Shared Types

```ts
export type MapProvider = 'mapbox' | 'maptiler'

export type FeatureId =
  | 'base_outdoors'
  | 'base_satellite'
  | 'terrain_3d'
  | 'topo_overlays'
  | 'raster_overlays'
  | 'globe_projection'
  | 'season_summer'
  | 'season_winter'
  | 'trip_routes'
  | 'geocoder'
  | 'weather'
  | 'directions'

export type CapabilityState = 'available' | 'coming_soon' | 'unsupported'

export type ProviderCapabilities = Record<FeatureId, CapabilityState>
```

Notes:

- `available` means implemented and enabled for that stack
- `coming_soon` means planned but disabled in the UI
- `unsupported` means intentionally unavailable for that stack (e.g. architectural limitation)

---

## Feature Matrix

This matrix is the product contract. It determines which controls render as active versus disabled.

| Feature | Mapbox | MapTiler | Notes |
|---|---|---|---|
| Base outdoors map | `available` | `available` | Mapbox Outdoors v12 / MapTiler Outdoor v2 |
| Base satellite map | `available` | `available` | Mapbox Satellite Streets v12 / MapTiler Satellite |
| 3D terrain | `available` | `available` | Mapbox Terrain-DEM v1 / MapTiler Terrain RGB v2 |
| Country topo raster overlays | `available` | `available` | XYZ tiles are renderer-neutral |
| Raster overlays (seasonal satellite) | `available` | `available` | XYZ/WMS tiles are renderer-neutral |
| Globe projection | `available` | `available` | Both SDKs support globe; MapTiler SDK is built on MapLibre v4+ which added globe support |
| Summer mode | `available` | `available` | Mapbox Outdoors v12 / MapTiler Outdoor v2 |
| Winter mode | `available` | `available` | Mapbox Outdoors v12 + raster overlays / MapTiler Winter v2 (native pistes, lifts, avalanche zones) |
| Trip route layers | `available` | `available` | Shared via `AppMapAdapter` |
| Geocoder | `coming_soon` | `coming_soon` | Mapbox SearchBox ships in Phase 4 inside `runtime/mapbox/` (matrix updated to `available` when it lands); MapTiler Geocoding in M3 |
| Weather | `coming_soon` | `coming_soon` | MapTiler weather API available; Mapbox-side TBD |
| Directions / route planner | `coming_soon` | `coming_soon` | Mapbox Directions API; MapTiler equivalent TBD |

This matrix should be updated as each feature slice lands.

### Winter Style Strategy

The two providers take different approaches to winter/seasonal map styles:

**MapTiler** — Native seasonal styles. The SDK provides `outdoor-v2` (summer) and `winter-v2` (winter) as a designed pair. `winter-v2` includes ski pistes, lifts, cross-country trails, snow parks, avalanche zones, and a winter color palette. Style resolution is season-aware: `resolveMaptilerStyle(baseLayer, season)`.

**Mapbox** — No built-in winter style. Both seasons currently use `outdoors-v12`. Winter features come from raster overlays (OpenSnowMap pistes, swisstopo ski touring/snowshoe routes). The base map retains its summer appearance.

**Planned**: Create custom Mapbox Studio styles to match MapTiler's seasonal pair:
- Fork `outdoors-v12` → custom summer style with mtamta branding/colors
- Fork `outdoors-v12` → custom winter style with winter color palette, ski piste/lift data from OSM, avalanche zone styling
- Published as `mapbox://styles/mtamta/summer-v1` and `mapbox://styles/mtamta/winter-v1` (or similar)
- Once created, update `STYLE_URLS` in `styles.ts` to use them and make `resolveStyleUrl` season-aware (same pattern as MapTiler)

| Card | Mapbox (current) | Mapbox (planned) | MapTiler |
|---|---|---|---|
| Global Summer | `outdoors-v12` | custom summer style | `outdoor-v2` |
| Global Winter | `outdoors-v12` + raster overlays | custom winter style | `winter-v2` (native) |
| Satellite | `satellite-streets-v12` | `satellite-streets-v12` | `satellite` |

**Future option**: MapTiler also offers `topo-v2` (operational/SAR-focused) which could be added as a "Map Style" preference in Settings, orthogonal to the seasonal axis.

---

## Web Runtime Structure

End-state structure (files marked with milestone when they are created):

```text
apps/web/src/map/
  runtime/
    mapbox/
      MapContainer.tsx      # Mapbox GL JS map init, style switching         (M1)
      MapControls.tsx       # Mapbox-specific controls                       (M1)
      terrain.ts            # Mapbox Terrain-DEM v1 wiring                   (M1)
      MapSearch.tsx         # Mapbox SearchBox integration                   (Phase 4)
      weather.ts            # Weather overlay (Mapbox-side)                  (M3)
    maptiler/
      MapContainer.tsx      # MapTiler SDK map init, style switching         (M2)
      MapControls.tsx       # MapTiler-specific controls                     (M2)
      terrain.ts            # MapTiler Terrain RGB v2 wiring                 (M2)
      MapSearch.tsx         # MapTiler Geocoding integration                 (M3)
      weather.ts            # MapTiler weather API                           (M3)
    shared/
      mapAdapter.ts         # AppMapAdapter type definition
      tripLayers.ts         # Trip route layer lifecycle (uses AppMapAdapter)
      rasterOverlays.ts     # Country topo + seasonal satellite overlays
      providerCapabilities.ts  # Query functions over map-core capability data (isFeatureAvailable, getProviderCapabilities)
  MapRuntime.tsx            # Runtime dispatcher (lazy-loads selected provider)
  MapProviderGate.tsx       # Provider selection UI

packages/map-core/src/
  providers.ts              # MapProvider type, FeatureId, CapabilityState
  capabilities.ts           # Per-provider capability data (raw matrix)
```

Possible later extraction into workspace packages (`@mtamta/map-web-mapbox`, `@mtamta/map-web-maptiler`). Start in-app first. Extract only if the runtime code becomes large enough to justify package boundaries.

---

## Shared Map Adapter

A **type-narrowing interface** (not a wrapper class) that shared app-owned layers target. The adapter exposes only the methods actually used by shared code (`rasterOverlays.ts`, `tripLayers.ts`, viewport-driven data fetching):

```ts
export interface AppMapAdapter {
  // Style inspection (needed for layer ordering — insert raster below first symbol layer)
  isStyleLoaded(): boolean
  getStyleLayers(): Array<{ id: string; type: string }>

  // Source/layer lifecycle
  getSource(id: string): unknown
  addSource(id: string, source: unknown): void
  removeSource(id: string): void

  getLayer(id: string): unknown
  addLayer(layer: unknown, beforeId?: string): void
  removeLayer(id: string): void

  // Viewport reads (needed for bbox queries, zoom-dependent simplification)
  getBounds(): [number, number, number, number]
  getZoom(): number

  // Navigation (needed for search fly-to, trip focus)
  flyTo(center: [number, number], zoom?: number): void

  // Events
  onStyleLoad(cb: () => void): void
  offStyleLoad(cb: () => void): void
  onMoveEnd(cb: () => void): void
  offMoveEnd(cb: () => void): void
  onClick(layerId: string, cb: (e: { lngLat: [number, number]; features?: unknown[] }) => void): void
  offClick(layerId: string, cb: (...args: unknown[]) => void): void
}
```

**Why these methods**: `getStyleLayers()` is required by `useRasterOverlays.ts` to find the first symbol layer for correct layer ordering (raster below labels). `getBounds()`/`getZoom()`/`onMoveEnd()` are required by viewport-driven trip route fetching. `onClick()` is required for trip route click-to-open-detail. `flyTo()` is required for search result navigation.

Each provider runtime wraps its map instance to satisfy this interface. The goal is **not** to abstract the entire vendor SDK — only to support shared app-owned behavior:

- Source/layer lifecycle (add, remove, check existence)
- Style inspection (layer ordering)
- Style reload handling (re-apply overlays after style change)
- Viewport reads and events (data fetching, interaction)

Provider-specific features (search, weather, directions, terrain setup) live inside each runtime module and use the raw vendor SDK directly.

---

## State Changes

Extend `apps/web/src/stores/mapStore.ts` with provider selection state:

```ts
interface MapState {
  mapProvider: MapProvider | null
  setMapProvider: (provider: MapProvider | null) => void
}
```

Behavior:

- On app init, read `mapProvider` from `localStorage`
- If found, set in store and skip the provider gate
- If not found (`null`), show `MapProviderGate`
- On provider selection: update store + write to `localStorage`
- "Change map provider" in Settings: clear stored value, show gate

Do **not** write this to the user profile yet.

---

## Post-Login Flow

### App Flow

1. Restore auth session
2. If not authenticated, show login screen
3. If authenticated, read `mapProvider` from `localStorage`
4. If stored provider exists, set in store → lazy-load runtime → mount `MapPage`
5. If no stored provider, show `MapProviderGate`
6. On provider selection:
   - Update store + persist to `localStorage`
   - Lazy-load the selected runtime
   - Mount `MapPage`

### UX Rules

- The chooser appears **after login**, only when no stored preference exists
- It must clearly label the two stacks
- It should explain that some features may be marked `Coming soon`
- It should not suggest that both stacks are equal on day one unless they actually are

### Settings

- "Change map provider" action in Settings clears stored preference and shows the gate
- Future per-user sync via `PATCH /api/v1/users/me` or a dedicated preferences field (not in scope)

---

## Implementation Phases

### M1 — Infrastructure + Mapbox Extraction

**Goal**: Introduce provider state and runtime boundaries without changing current Mapbox behavior.

- [x] Add `MapProvider` types and capability model to `@mtamta/map-core`
- [x] Add `mapProvider` state to `mapStore` with localStorage read/write
- [x] Create post-login `MapProviderGate` (skipped when localStorage has a stored value)
- [x] Extract current `MapContainer` into `runtime/mapbox/MapContainer.tsx`
- [x] Extract current controls into `runtime/mapbox/MapControls.tsx`
- [x] Define `AppMapAdapter` interface in `runtime/shared/mapAdapter.ts`
- [x] Refactor shared overlays behind `AppMapAdapter`
- [x] Route selected provider into `MapRuntime.tsx` dispatcher
- [x] Ensure zero behavior regression in current Mapbox stack

Verification:

- [ ] Auth flow still works
- [ ] Provider gate appears after login (on first visit)
- [ ] Selecting Mapbox loads the current app successfully
- [ ] Base styles still switch
- [ ] Terrain still re-applies after style changes
- [ ] Raster overlays still re-apply after style changes
- [ ] Viewport persistence still works

### M2 — MapTiler Runtime Boot + Shared Layer Parity

**Goal**: Add a working MapTiler map runtime with base-map and overlay parity.

- [x] Implement `runtime/maptiler/MapContainer.tsx` using `@maptiler/sdk`
- [x] Implement `runtime/maptiler/MapControls.tsx`
- [x] Wire MapTiler style resolution (Outdoor v2, Satellite, Terrain RGB v2)
- [x] Verify shared overlays (country topo, seasonal satellite) work via `AppMapAdapter`
- [x] Add capability gating for incomplete MapTiler features (`Coming soon` UI)
- [x] Both providers boot cleanly from the provider gate

Verification:

- [ ] Provider gate can load MapTiler runtime
- [ ] Base map renders (outdoors + satellite)
- [ ] 3D terrain works
- [ ] Style switching works
- [ ] Shared overlays render correctly
- [ ] Features marked `coming_soon` show disabled with "Coming soon" label
- [ ] Globe projection works in MapTiler runtime

### M3 — Provider-Specific Features (deferred to after Phase 4)

**Goal**: Add MapTiler equivalents for provider-specific features already shipped in the Mapbox runtime.

Note: Mapbox SearchBox geocoder is implemented in Phase 4 (inside `runtime/mapbox/`). M3 adds the MapTiler equivalent and any remaining provider-specific features.

- [ ] Geocoder for MapTiler stack (MapTiler Geocoding API)
- [ ] Weather integration per provider
- [ ] Directions for Mapbox stack (Mapbox Directions API) — if not already shipped in Phase 4
- [ ] Directions for MapTiler stack (or mark as `Coming soon`)
- [ ] Update capability matrix as each feature lands

Verification:

- [ ] Disabled-state UX is correct
- [ ] Capabilities match actual implementation status
- [ ] No stack exposes broken controls as active

---

## UI Capability Gating

Any feature control that depends on provider support must read from the capability matrix.

Rules:

- `available` → enabled
- `coming_soon` → visible, disabled, labeled `Coming soon`
- `unsupported` → hidden or disabled based on product choice

For the first version, prefer visible + disabled for most incomplete features. This helps users understand the selected stack's roadmap.

Likely affected areas:

- basemap cards
- terrain toggle
- geocoder UI
- weather UI
- directions / route-planning tools
- globe projection toggle

---

## Runtime Boundary

The app should never scatter provider checks throughout the UI.

Branching belongs at the runtime boundary:

- runtime selection (`MapRuntime.tsx`)
- provider capabilities (`providerCapabilities.ts`)
- provider-specific adapters (each runtime's `MapContainer.tsx`)

The rest of the app should ask questions like:

- `getProviderCapabilities(provider)`
- `isFeatureAvailable(provider, 'terrain_3d')`
- `resolveBaseStyle(provider, baseLayer, season)`

It should **not** call `if (provider === 'mapbox')` across random components.

---

## Testing Strategy

### Unit Tests

- provider capability matrix
- style resolution per provider
- terrain config per provider
- provider gate state transitions (no stored pref → gate, stored pref → skip)
- store behavior for provider selection and localStorage sync

### Manual Verification

For both `Mapbox` and `MapTiler`:

- first visit → chooser appears
- select provider → map loads
- return visit → chooser skipped, stored provider loads
- base style renders
- season switch behaves correctly
- terrain control state matches capability matrix
- trip overlays survive style changes
- unsupported features render disabled
- "Change map provider" in Settings resets and shows gate

### Regression Rules

- A feature must not be marked `available` unless it has been manually verified in both the chosen runtime and the current browser targets.
- The capability matrix and UI state must be updated in the same PR as the implementation.

---

## Future Extensions

- User-profile sync for provider preference (server-side persistence)
- Mobile runtime split if dual-provider mobile support becomes necessary
- Per-feature provider fallback if product priorities later justify mixed stacks
- Custom Mapbox Studio styles (summer + winter) to match MapTiler's seasonal pair
- MapTiler `topo-v2` as a "Map Style" preference in Settings (orthogonal to season axis)
- Unified map control CSS — thin override layer targeting both `.mapboxgl-ctrl-group` and `.maplibregl-ctrl-group` to match the app's dark glass UI (background, border-radius, backdrop-filter). Keeps vendor control logic/icons, just unifies visual appearance across providers

Those are explicitly out of scope for M1–M3.
