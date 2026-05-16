# Phase 3.5: Multi-Provider Support — Detailed Implementation Plan

> **Status: M1 + M2 + M3 COMPLETE** (manual testing remaining). **M4 (provider-specific features) deferred to after Phase 4.**
>
> Dual-provider web map support (Mapbox GL JS + MapTiler SDK). Introduces provider state, runtime boundary, AppMapAdapter interface, and lazy-loaded runtimes. Milestones: M1 + M2 + M3 (complete), M4 — provider-specific features like geocoder/weather (deferred to after Phase 4).
>
> **Spec**: [`MapProviders.md`](MapProviders.md) is the finalized product spec. This plan is the step-by-step implementation guide.

---

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Provider choice after login, localStorage from day one** | Auth and map provider are separate concerns. Gate only appears when no stored preference exists. |
| 2 | **MapTiler SDK (not raw MapLibre)** | Built-in terrain, geocoding, weather APIs — less glue code, consistent API surface, access to MapTiler tile infrastructure. |
| 3 | **AppMapAdapter is a type-narrowing interface, not a wrapper class** | Shared code targets a minimal surface. Provider-specific features use raw vendor SDK directly. |
| 4 | **Zero behavior regression in M1** | App must work identically after extraction. All changes are structural (file moves + interface introduction). |
| 5 | **Lazy-load runtimes via React.lazy + Suspense** | Only the selected provider's SDK chunk loads. No cross-provider bundle bloat. |
| 6 | **Develop both stacks in parallel by feature slice** | Prevent one stack from racing ahead and turning the other into a catch-up project. |

---

## M1 — Infrastructure + Mapbox Extraction

**Goal**: Introduce provider state and runtime boundaries without changing current Mapbox behavior.

### 1. Provider types and capability matrix — `packages/map-core/`

- [x] Create `packages/map-core/src/providers.ts` — `MapProvider`, `FeatureId`, `CapabilityState`, `ProviderCapabilities` types
- [x] Create `packages/map-core/src/capabilities.ts` — hardcoded capability matrices for both providers, query functions (`getProviderCapabilities`, `isFeatureAvailable`, `getFeatureState`)
- [x] Export new types and functions from `packages/map-core/src/index.ts`

### 2. Provider-keyed style and terrain configs — `packages/map-core/`

- [x] `styles.ts` — add `MAPTILER_STYLE_IDS` and `resolveStyleForProvider(provider, baseLayer, season)`. Keep existing `resolveStyleUrl` unchanged (Mapbox runtime continues using it)
- [x] `terrain.ts` — add `TerrainConfig` interface and `getTerrainConfig(provider)`. Mapbox config returns source ID + DEM URL as today. MapTiler config returns `null` for source/URL (SDK manages DEM internally via `enableTerrain()`) — only `exaggeration` is shared. Keep existing exports unchanged
- [x] Export new functions from `index.ts`

### 3. Add mapProvider state to mapStore with localStorage

- [x] `apps/web/src/stores/mapStore.ts` — add `mapProvider: MapProvider | null`, `setMapProvider`, localStorage key `mtamta:mapProvider`, read on init, persist on set, clear on `null`
- [x] `apps/web/src/stores/mapStore.test.ts` — add tests for localStorage read/write/clear

### 4. Define AppMapAdapter interface

- [x] Create `apps/web/src/map/runtime/shared/mapAdapter.ts` — pure type file, no vendor imports

```ts
export interface AppMapAdapter {
  isStyleLoaded(): boolean
  getStyleLayers(): Array<{ id: string; type: string }>
  getSource(id: string): unknown
  addSource(id: string, source: unknown): void
  removeSource(id: string): void
  getLayer(id: string): unknown
  addLayer(layer: unknown, beforeId?: string): void
  removeLayer(id: string): void
  getBounds(): [number, number, number, number]
  getZoom(): number
  flyTo(center: [number, number], zoom?: number): void
  onStyleLoad(cb: () => void): void
  offStyleLoad(cb: () => void): void
  onMoveEnd(cb: () => void): void
  offMoveEnd(cb: () => void): void
  onClick(layerId: string, cb: (e: { lngLat: [number, number]; features?: unknown[] }) => void): void
  offClick(layerId: string, cb: (...args: unknown[]) => void): void
}
```

### 5. Extract Mapbox files into `runtime/mapbox/`

Pure file move with import path fixes. NO logic changes **except** the cleanup fix below.

- [x] Move `MapContainer.tsx` → `runtime/mapbox/MapContainer.tsx`
- [x] Move `MapControls.tsx` → `runtime/mapbox/MapControls.tsx`
- [x] Move `TerrainControl.ts` → `runtime/mapbox/terrain.ts`
- [x] Fix import paths in moved files:
  - `useMapStore`: `'../../stores/mapStore'` → `'../../../stores/mapStore'`
  - `useRasterOverlays`: `'./useRasterOverlays'` → `'../../useRasterOverlays'` (stays at old location until step 7)
  - `TerrainControl`: `'./TerrainControl'` → `'./terrain'`
- [x] Fix cleanup: add `map.remove()` on real unmount (per `Architecture.md:564`). The current code skips it because React Strict Mode (dev) fires mount→unmount→mount synchronously, and Firefox can't recover a WebGL context after `map.remove()`. Both runtimes must use this pattern:

```ts
const mapRef = useRef<MapInstance | null>(null)
const removedRef = useRef(false)

useEffect(() => {
  // Strict Mode remount: map exists and wasn't removed — reuse it
  if (mapRef.current && !removedRef.current) {
    setMapInstance(mapRef.current)
    /* ... reattach load listener if needed ... */
    return
  }

  // First mount (or real re-mount after provider switch)
  removedRef.current = false
  const map = new Map(/* ... */)
  mapRef.current = map
  /* ... init ... */

  return () => {
    setMapReady(false)
    setMapInstance(null)
    // Defer removal to next microtask. If Strict Mode remounts
    // synchronously, the new mount effect will run first and
    // clear this timeout via the reuse guard above.
    const id = setTimeout(() => {
      map.remove()
      mapRef.current = null
      removedRef.current = true
    }, 0)
    // If Strict Mode re-mounts before timeout fires, cancel it
    // (the reuse guard runs first, so store a cancel handle)
    ;(mapRef as any).__cleanupTimer = id
  }
}, [])

// At the top of the reuse guard, cancel any pending deferred removal:
// clearTimeout((mapRef as any).__cleanupTimer)
```

The `setTimeout(0)` trick works because Strict Mode's unmount→mount cycle is synchronous — the remount effect runs before the timeout fires, so it cancels the deferred `map.remove()`. A real unmount has no subsequent mount, so the timeout executes and cleans up the WebGL context
- [x] Add `createMapboxAdapter(map)` factory to `runtime/mapbox/MapContainer.tsx` — wraps `mapboxgl.Map` to satisfy `AppMapAdapter` (wired in step 7)
- [x] Update `AppLayout.tsx` import: `'./MapContainer'` → `'./runtime/mapbox/MapContainer'`
- [x] Delete old files

### 6. Create MapRuntime dispatcher and MapProviderGate

- [x] Create `apps/web/src/map/MapRuntime.tsx` — reads `mapProvider` from store, lazy-loads `runtime/mapbox/MapContainer` (MapTiler case commented out for M2), wraps in `<Suspense>`
- [x] Create `apps/web/src/map/MapProviderGate.tsx` — two-button selector (Mapbox / MapTiler), calls `setMapProvider`, styled to match dark glass UI
- [x] Update `AppLayout.tsx` — if `mapProvider === null` render `<MapProviderGate>`, else render `<MapRuntime>` + `<Sidebar>`

### 7. Refactor rasterOverlays behind AppMapAdapter

- [x] Create `apps/web/src/map/runtime/shared/rasterOverlays.ts` — refactored from `useRasterOverlays.ts`:
  - All functions take `AppMapAdapter` instead of `mapboxgl.Map`
  - `findFirstSymbolLayer(adapter)` → `adapter.getStyleLayers().find(l => l.type === 'symbol')?.id`
  - Source/layer operations → `adapter.getSource`, `adapter.addSource`, etc.
  - Style load events → `adapter.onStyleLoad`/`adapter.offStyleLoad`
  - **No mapbox-gl import** in this file
- [x] Update `runtime/mapbox/MapContainer.tsx` — create adapter via `createMapboxAdapter(map)`, pass to `useRasterOverlays(adapter)`
- [x] Delete `apps/web/src/map/useRasterOverlays.ts`

### 8. Provider capabilities UI hooks + Settings "Change provider"

- [x] Create `apps/web/src/map/runtime/shared/providerCapabilities.ts` — `useIsFeatureAvailable(feature)`, `useFeatureState(feature)` hooks reading from store + map-core
- [x] Update `SettingsTab.tsx` — add "Map Engine" section showing current provider name and "Change" button (calls `setMapProvider(null)`)

### 9. Cleanup and final verification

- [x] Verify no imports from old file paths remain
- [x] `pnpm --filter @mtamta/web build` — clean build
- [x] `pnpm --filter @mtamta/web test` — all tests pass (19)
- [x] `pnpm --filter @mtamta/map-core test` — all tests pass (35)
- [x] Manual: auth flow → gate → Mapbox → styles → terrain → overlays → settings change → gate again

### M1 Verification Checklist

- [x] Auth → gate → select Mapbox → map loads with zero regression
- [x] localStorage persists provider, gate skipped on reload
- [x] Settings shows "Change" button, returns to gate
- [ ] All overlays work — topo verified; pistes / ski touring / snowshoe toggles not yet each verified
- [x] Terrain works (verified in Chrome); custom sky layer removed — Standard provides atmosphere
- [x] Style switching preserves overlays and terrain
- [x] Build produces clean chunks, no warnings

---

## M2 — MapTiler Runtime Boot

**Goal**: Add a working MapTiler map runtime with base-map and overlay parity.

### 1. Install `@maptiler/sdk` and update Vite config

- [x] `apps/web/package.json` — add `@maptiler/sdk`
- [x] `apps/web/vite.config.ts` — add manual chunk for `@maptiler/sdk` + `maplibre-gl`
- [x] `.env.local` — add `VITE_MAPTILER_API_KEY`

### 2. Implement MapTiler MapContainer with adapter

- [x] Create `apps/web/src/map/runtime/maptiler/MapContainer.tsx`

Same lifecycle pattern as Mapbox: ref + useEffect init, viewport sync on moveend, style switching, `createMaptilerAdapter(map)` factory, passes adapter to `useRasterOverlays`.

Key API differences from Mapbox:
- `import * as maptilersdk from '@maptiler/sdk'` + CSS import
- `maptilersdk.config.apiKey = import.meta.env.VITE_MAPTILER_API_KEY`
- Styles: season-aware — `'outdoor-v2'` (summer), `'winter-v2'` (winter), `'satellite'`
- Terrain: `map.enableTerrain(exaggeration)` / `map.disableTerrain()` (SDK manages DEM source internally)
- Events: same as Mapbox (`load`, `style.load`, `moveend`)
- Projection: `map.setProjection({ type: 'globe' })` (MapLibre v4+ API)

### 3. Implement MapTiler controls and terrain

- [x] Create `apps/web/src/map/runtime/maptiler/MapControls.tsx` — SDK built-in NavigationControl, GeolocateControl, ScaleControl + custom terrain toggle
- [x] Create `apps/web/src/map/runtime/maptiler/terrain.ts` — custom IControl using `map.enableTerrain()`/`map.disableTerrain()`, subscribes to mapStore. CSS class: `maplibregl-ctrl`

### 4. Wire MapTiler into MapRuntime dispatcher

- [x] Update `MapRuntime.tsx` — uncomment MapTiler lazy import and `case 'maptiler'`

### 5. Add capability gating to sidebar

- [x] Update `BasemapsTab.tsx` — replace hardcoded `disabled: true` / `hint: 'Coming soon'` on winter cards with capability-driven logic: derive `disabled` and `hint` from `useFeatureState('season_winter')`. Winter cards enabled for both providers (MapTiler uses `winter-v2` style)
- [x] Update `SettingsTab.tsx` — globe toggle uses `useFeatureState('globe_projection')`

### M2 Verification Checklist

- [x] Select MapTiler from gate → map renders and can switch base layers
- [x] 3D terrain works in MapTiler
- [ ] Shared overlays render in MapTiler via AppMapAdapter — not yet explicitly verified
- [x] Globe projection works in both providers
- [ ] Winter cards enabled for both providers; MapTiler switches to winter-v2 style — MapTiler winter not yet verified
- [x] Only selected provider's SDK chunk is loaded
- [x] Switching providers via Settings works cleanly

---

## M3 — Mapbox Standard Migration

> **Status: COMPLETE.**
>
> Migrated the Mapbox runtime from the `outdoors-v12` core style to **Mapbox Standard**, giving it a true seasonal pair matching MapTiler's native `outdoor-v2` / `winter-v2`.
>
> **Outcome / spike result**: The Outdoors and Outdoors Winter "themes" are distinct custom styles built on Mapbox Standard, hosted in the project's Mapbox Studio account (`mapbox://styles/kankava/…`) — not a `setConfigProperty` value. Season switching therefore stays a `setStyle()` reload (the step-2 config-update optimisation does not apply). Raster overlays insert into the `middle` slot; the MapTiler/MapLibre adapter derives an equivalent `beforeId`. The custom `sky-layer` was removed — Standard has built-in atmosphere. Satellite uses `mapbox://styles/mapbox/standard-satellite`. The step lists below are kept as the historical plan.

### 0. Spike — confirm the Standard themes API

- [ ] Read the Mapbox Standard docs (`docs.mapbox.com/map-styles/standard`) and confirm how the **Outdoors** / **Outdoors Winter** themes are selected: a `setConfigProperty` value, a style import/fragment, or distinct style IDs
- [ ] Confirm the themes are available on the project's Mapbox token / plan
- [ ] Confirm Standard's slot names (`bottom` / `middle` / `top`) and which slot keeps raster topo below labels
- [ ] Record findings in this section before starting step 1 — the rest of the milestone depends on the answer

### 1. Season-aware Mapbox style resolution — `packages/map-core/src/styles.ts`

- [ ] Replace the `outdoors` entry in `STYLE_URLS` with the Mapbox Standard style reference
- [ ] Make `resolveStyleUrl(baseLayer, season)` actually use `season` for Mapbox — Outdoors theme for summer, Outdoors Winter for winter (mechanism per the spike)
- [ ] Decide satellite: Mapbox Standard Satellite vs keep `satellite-streets-v12`
- [ ] Update `styles.test.ts`

### 2. Boot Mapbox Standard — `runtime/mapbox/MapContainer.tsx`

- [ ] Initialize the map with the Mapbox Standard style
- [ ] On season change, apply the theme via config update (`setConfigProperty`) instead of a full `setStyle` reload — faster, no layer teardown
- [ ] Verify the baseLayer outdoors↔satellite reload path still works

### 3. Slot-based layer insertion — `AppMapAdapter` + `rasterOverlays.ts`

- [ ] Add an optional `slot` field to the adapter's `addLayer` input
- [ ] Mapbox adapter (`createMapboxAdapter`): place raster topo/overlay layers in the slot the spike identified; stop relying on `findFirstSymbolLayer()` + `beforeId` (Standard's internal layers aren't enumerable the same way)
- [ ] MapTiler/MapLibre adapter: ignore `slot`, keep current `beforeId` behavior — no regression
- [ ] `rasterOverlays.ts` — pass the slot; behavior identical for MapTiler

### 4. Terrain, sky, and projection under Standard

- [ ] Verify 3D terrain still enables/disables (Standard manages lighting/terrain differently)
- [ ] Reconcile the custom `sky-layer` with Standard's built-in atmosphere — remove the custom sky layer if Standard supersedes it
- [ ] Verify globe projection still works
- [ ] Update `terrain.ts` Mapbox config if needed

### 5. Capability matrix + cleanup — `capabilities.ts`

- [ ] Confirm Mapbox `season_winter` is genuinely `available` post-migration (already in the matrix, but it was previously cosmetic-only)
- [ ] Remove now-dead code (custom sky layer, `outdoors-v12` references)

### M3 Verification Checklist — ✅ complete (2026-05-16, verified in Chrome)

- [x] `pnpm --filter @mtamta/web build` / `test` and `map-core test` — clean
- [x] Mapbox: Global Summer and Global Winter render visibly different base styles
- [x] All overlays (topo, pistes, ski touring, snowshoe, OpenTopoMap) insert correctly via slots, below labels
- [x] 3D terrain, sky/atmosphere, and globe work on Mapbox Standard
- [x] MapTiler runtime has zero regression (full pass)
- [x] Only the selected provider's SDK chunk loads; build is clean

**Verification outcomes:**

- **Terrain model** — the classic DEM-source + `setTerrain()` approach no-ops on Mapbox Standard (Standard owns terrain via the style). The dead code was removed; the Mapbox 2D/3D button now toggles camera pitch only. Commit: `fix(web): drive Mapbox 3D terrain via camera pitch on Standard`.
- **SDK chunking** — fixed a bug where Vite's preload helper was folded into the `mapbox-gl` vendor chunk, eagerly loading the 1.7 MB SDK for every user. Commit: `fix(web): keep provider SDKs out of the eager entry chunk`.
- **Firefox** — Mapbox GL JS v3 terrain does not render in Firefox on some Linux/GPU setups (a WebGL limitation, not an app bug). Verify maps in Chrome.

### Risks / Open Questions

- **Theme API uncertainty** — the exact selection mechanism for Outdoors / Outdoors Winter is resolved in the step-0 spike. If the themes turn out to be plan-gated or unavailable on the token, fall back to keeping `outdoors-v12` and re-defer this milestone.
- **Bundle / perf** — Mapbox Standard is a heavier 3D style; compare chunk size and initial render time against `outdoors-v12`.
- **Slot abstraction leak** — `slot` is a Mapbox-Standard concept; keep it optional on `AppMapAdapter` so the MapTiler adapter stays clean.

---

## Files Summary

**New files (M1 — 7):**
- `packages/map-core/src/providers.ts`
- `packages/map-core/src/capabilities.ts`
- `apps/web/src/map/runtime/shared/mapAdapter.ts`
- `apps/web/src/map/runtime/shared/rasterOverlays.ts`
- `apps/web/src/map/runtime/shared/providerCapabilities.ts`
- `apps/web/src/map/MapRuntime.tsx`
- `apps/web/src/map/MapProviderGate.tsx`

**Moved files (M1 — 3):**
- `apps/web/src/map/MapContainer.tsx` → `apps/web/src/map/runtime/mapbox/MapContainer.tsx`
- `apps/web/src/map/MapControls.tsx` → `apps/web/src/map/runtime/mapbox/MapControls.tsx`
- `apps/web/src/map/TerrainControl.ts` → `apps/web/src/map/runtime/mapbox/terrain.ts`

**Deleted files (M1 — 1):**
- `apps/web/src/map/useRasterOverlays.ts` (replaced by `runtime/shared/rasterOverlays.ts`)

**Modified files (M1 — 6):**
- `packages/map-core/src/styles.ts` — add MapTiler style resolution
- `packages/map-core/src/terrain.ts` — add MapTiler terrain config
- `packages/map-core/src/index.ts` — export new types/functions
- `apps/web/src/stores/mapStore.ts` — add mapProvider state with localStorage
- `apps/web/src/map/AppLayout.tsx` — wire gate + dispatcher
- `apps/web/src/map/sidebar/SettingsTab.tsx` — add "Map Engine" section

**New files (M2 — 3):**
- `apps/web/src/map/runtime/maptiler/MapContainer.tsx`
- `apps/web/src/map/runtime/maptiler/MapControls.tsx`
- `apps/web/src/map/runtime/maptiler/terrain.ts`

**Modified files (M2 — 3):**
- `apps/web/src/map/MapRuntime.tsx` — uncomment MapTiler case
- `apps/web/src/map/sidebar/BasemapsTab.tsx` — capability gating for winter cards
- `apps/web/src/map/sidebar/SettingsTab.tsx` — globe projection capability gating

---

## Critical Reference Files

- `apps/web/src/map/MapContainer.tsx` — source to extract (183 lines), current Mapbox init + style switching + terrain
- `apps/web/src/map/useRasterOverlays.ts` — source to refactor behind adapter (191 lines), all `map.xxx()` calls
- `apps/web/src/stores/mapStore.ts` — add mapProvider state (144 lines)
- `packages/map-core/src/styles.ts` — add provider style resolution
- `packages/map-core/src/terrain.ts` — add provider terrain config
- `docs/MapProviders.md` — finalized product spec (reference)
