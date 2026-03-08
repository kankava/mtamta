# Phase 2: Maps Core — Detailed Implementation Plan

> Ordered task checklist. Complete tasks top-to-bottom — each section depends on the ones before it. Each task maps to a concrete file to create or modify.

---

## Library Decisions

| Concern | Choice | Import path / version |
|---|---|---|
| Map rendering | Mapbox GL JS v3 | `mapbox-gl@^3.0.0` |
| Map wrapper | Raw (no react-map-gl) | Direct `mapboxgl.Map` via `useRef` |
| Routing | React Router v6 | `react-router-dom` (already installed) |
| State management | Zustand | `zustand` (already installed) |
| Geospatial utils | Deferred to Phase 4 | `@turf/turf` — not installed yet |

**Key design decisions:**
- **Raw mapbox-gl, not react-map-gl** — full control over terrain, style switching, custom layers, and lifecycle. react-map-gl adds an abstraction layer that gets in the way for advanced use cases.
- **`useRef` for map instance** — not `useState`. Storing the map in state would trigger React re-renders on every map interaction.
- **Styles as Mapbox-hosted URLs** — no bundled style JSON. Style switching uses `map.setStyle(url)`.
- **Winter/summer as placeholders** — both use Mapbox Outdoors v12 in Phase 2. The toggle mechanism and store plumbing is what matters; custom Mapbox Studio styles are created later.
- **`/` is the map page** — auth gate wraps the router, not individual routes.

---

## 1. Map Core Package

### 1.1 Package scaffold — `packages/map-core/package.json`

- [x] Create `packages/map-core/package.json`:

```json
{
  "name": "@mtamta/map-core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

> This package has **no runtime dependencies** — it exports only configuration objects, constants, and type definitions. It does not depend on `mapbox-gl` or React. Platform-specific code (web, mobile) imports these configs and passes them to their respective map SDKs.

### 1.2 TypeScript config — `packages/map-core/tsconfig.json`

- [x] Create `packages/map-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```

> No `"DOM"` lib — this package is platform-agnostic. No browser APIs needed.

### 1.3 Vitest config — `packages/map-core/vitest.config.ts`

- [x] Create `packages/map-core/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
  },
})
```

### 1.4 Default viewport — `packages/map-core/src/config.ts`

- [x] Create `packages/map-core/src/config.ts`:

```typescript
// Default map viewport — centered on the Alps (Bern/Interlaken area).
// This is a sensible default for the primary target audience (Alpine outdoor sports).

export const DEFAULT_CENTER: [number, number] = [8.2275, 46.8182] // [lng, lat]
export const DEFAULT_ZOOM = 9
export const DEFAULT_PITCH = 0
export const DEFAULT_BEARING = 0

export const MIN_ZOOM = 2
export const MAX_ZOOM = 22

export const DEFAULT_VIEWPORT = {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  pitch: DEFAULT_PITCH,
  bearing: DEFAULT_BEARING,
} as const
```

### 1.5 Style URLs — `packages/map-core/src/styles.ts`

- [x] Create `packages/map-core/src/styles.ts`:

```typescript
// Mapbox-hosted style URLs. No bundled JSON — style switching uses setStyle(url).
// Custom winter/summer styles (Mapbox Studio) are Phase 3+ work.
// In Phase 2, both seasons resolve to the same Outdoors style.

export type BaseLayer = 'outdoors' | 'satellite'
export type Season = 'summer' | 'winter'

export const STYLE_URLS: Record<BaseLayer, string> = {
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
}

// Placeholder: both seasons use the same style for now.
// When custom Mapbox Studio styles are created, these will point to
// mapbox://styles/{username}/winter and mapbox://styles/{username}/summer.
const SEASON_STYLE_OVERRIDES: Record<Season, Partial<Record<BaseLayer, string>>> = {
  summer: {},
  winter: {},
}

/**
 * Resolve the Mapbox style URL for a given base layer and season.
 * Season overrides take precedence over the default base layer URL.
 */
export function resolveStyleUrl(baseLayer: BaseLayer, season: Season): string {
  return SEASON_STYLE_OVERRIDES[season][baseLayer] ?? STYLE_URLS[baseLayer]
}
```

### 1.6 Terrain config — `packages/map-core/src/terrain.ts`

- [x] Create `packages/map-core/src/terrain.ts`:

```typescript
// Mapbox Terrain-DEM v1 configuration for 3D terrain rendering.
// Used by both web (mapbox-gl) and mobile (@rnmapbox/maps).
//
// DEM decoding formula: height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
// Max zoom: 14 (SDK interpolates beyond)

export const TERRAIN_SOURCE_ID = 'mapbox-terrain-dem'

export const TERRAIN_SOURCE = {
  type: 'raster-dem' as const,
  url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
  maxzoom: 14,
}

export const DEFAULT_TERRAIN_EXAGGERATION = 1.5
export const MIN_TERRAIN_EXAGGERATION = 1.0
export const MAX_TERRAIN_EXAGGERATION = 3.0
export const TERRAIN_EXAGGERATION_STEP = 0.1

// Sky layer for atmospheric rendering in 3D mode.
export const SKY_LAYER_ID = 'sky-layer'

export const SKY_LAYER = {
  id: SKY_LAYER_ID,
  type: 'sky' as const,
  paint: {
    'sky-type': 'atmosphere' as const,
    'sky-atmosphere-sun': [0, 0] as [number, number],
    'sky-atmosphere-sun-intensity': 15,
  },
}
```

### 1.7 Layer registry — `packages/map-core/src/layers.ts`

- [x] Create `packages/map-core/src/layers.ts`:

```typescript
// Layer registry — metadata for all toggleable layers.
// Phase 2 includes only base layers and 3D terrain.
// Overlay, data, and live layers are added in later phases.

export type LayerCategory = 'base' | 'terrain' | 'overlay' | 'data' | 'live' | 'tool'

export interface LayerDefinition {
  id: string
  name: string
  category: LayerCategory
  description: string
  /** Phase in which this layer is implemented */
  phase: number
  /** Whether the layer is available for toggling in the current build */
  available: boolean
}

export const LAYER_REGISTRY: LayerDefinition[] = [
  {
    id: 'outdoors',
    name: 'Topographic',
    category: 'base',
    description: 'Mapbox Outdoors — trails, contours, hillshade, peaks',
    phase: 2,
    available: true,
  },
  {
    id: 'satellite',
    name: 'Satellite',
    category: 'base',
    description: 'Mapbox Satellite Streets — aerial imagery with labels',
    phase: 2,
    available: true,
  },
  {
    id: 'terrain-3d',
    name: '3D Terrain',
    category: 'terrain',
    description: 'DEM-based terrain exaggeration with sky atmosphere',
    phase: 2,
    available: true,
  },
]

/** Return only layers that are available in the current build */
export function getAvailableLayers(): LayerDefinition[] {
  return LAYER_REGISTRY.filter((l) => l.available)
}

/** Return available layers filtered by category */
export function getLayersByCategory(category: LayerCategory): LayerDefinition[] {
  return LAYER_REGISTRY.filter((l) => l.available && l.category === category)
}
```

### 1.8 Barrel export — `packages/map-core/src/index.ts`

- [x] Create `packages/map-core/src/index.ts`:

```typescript
export { DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_PITCH, DEFAULT_BEARING, MIN_ZOOM, MAX_ZOOM, DEFAULT_VIEWPORT } from './config'
export { STYLE_URLS, resolveStyleUrl } from './styles'
export type { BaseLayer, Season } from './styles'
export { TERRAIN_SOURCE_ID, TERRAIN_SOURCE, DEFAULT_TERRAIN_EXAGGERATION, MIN_TERRAIN_EXAGGERATION, MAX_TERRAIN_EXAGGERATION, TERRAIN_EXAGGERATION_STEP, SKY_LAYER_ID, SKY_LAYER } from './terrain'
export { LAYER_REGISTRY, getAvailableLayers, getLayersByCategory } from './layers'
export type { LayerCategory, LayerDefinition } from './layers'
```

### 1.9 Install package and register workspace

- [x] Run `pnpm install` from root to link the new `@mtamta/map-core` workspace package

> The root `package.json` already has `"workspaces"` (via `packages/*` glob in `pnpm-workspace.yaml` or `package.json`). Adding `packages/map-core/` automatically registers it.

---

## 2. Web App Dependencies

### 2.1 Add mapbox-gl and map-core to web app

- [x] Add dependencies to `apps/web/package.json`:

```json
{
  "dependencies": {
    "@mtamta/map-core": "workspace:*",
    "@mtamta/shared": "workspace:*",
    "@react-oauth/google": "^0.12.0",
    "mapbox-gl": "^3.9.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.0.0",
    "zustand": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [x] Run `pnpm install` from root to install `mapbox-gl` and link `@mtamta/map-core`

### 2.2 Add @mtamta/map-core path alias — `apps/web/tsconfig.json`

- [x] Update `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "paths": {
      "@mtamta/shared": ["../../packages/shared/src/index.ts"],
      "@mtamta/map-core": ["../../packages/map-core/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

### 2.3 Add @mtamta/map-core Vite alias — `apps/web/vite.config.ts`

- [x] Update `apps/web/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mtamta/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@mtamta/map-core': path.resolve(__dirname, '../../packages/map-core/src/index.ts'),
    },
  },
})
```

### 2.4 Add @mtamta/map-core Vitest alias — `apps/web/vitest.config.ts`

- [x] Update `apps/web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mtamta/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@mtamta/map-core': path.resolve(__dirname, '../../packages/map-core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
```

### 2.5 Add Mapbox access token env var — `apps/web/.env.example`

- [x] Update `apps/web/.env.example`:

```
VITE_API_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_public_token_here
```

### 2.6 Add Mapbox token type — `apps/web/src/vite-env.d.ts`

- [x] Update `apps/web/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

---

## 3. Map State Store

### 3.1 Map store — `apps/web/src/stores/mapStore.ts`

- [x] Create `apps/web/src/stores/mapStore.ts`:

```typescript
import { create } from 'zustand'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '@mtamta/map-core'
import type { BaseLayer, Season } from '@mtamta/map-core'

interface MapState {
  // Viewport
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number

  // Layers
  baseLayer: BaseLayer
  season: Season
  terrainEnabled: boolean
  terrainExaggeration: number

  // Map readiness
  isMapReady: boolean

  // Actions
  setViewport: (viewport: { center: [number, number]; zoom: number; pitch: number; bearing: number }) => void
  setBaseLayer: (layer: BaseLayer) => void
  setSeason: (season: Season) => void
  setTerrainEnabled: (enabled: boolean) => void
  setTerrainExaggeration: (exaggeration: number) => void
  setMapReady: (ready: boolean) => void
}

export const useMapStore = create<MapState>((set) => ({
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  pitch: DEFAULT_PITCH,
  bearing: DEFAULT_BEARING,

  baseLayer: 'outdoors',
  season: 'summer',
  terrainEnabled: false,
  terrainExaggeration: DEFAULT_TERRAIN_EXAGGERATION,

  isMapReady: false,

  setViewport: (viewport) => set(viewport),
  setBaseLayer: (baseLayer) => set({ baseLayer }),
  setSeason: (season) => set({ season }),
  setTerrainEnabled: (terrainEnabled) => set({ terrainEnabled }),
  setTerrainExaggeration: (terrainExaggeration) => set({ terrainExaggeration }),
  setMapReady: (isMapReady) => set({ isMapReady }),
}))
```

---

## 4. Map Components

### 4.1 MapContainer — `apps/web/src/map/MapContainer.tsx`

> MapContainer is the core component. It initializes Mapbox GL JS, manages lifecycle, reacts to store changes, and renders MapControls as a child (since controls need the map instance).
>
> The complete, final version is in section 4.5. Sections 4.2–4.4 define the supporting components first.

### 4.2 MapControls — `apps/web/src/map/MapControls.tsx`

- [x] Create `apps/web/src/map/MapControls.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

interface MapControlsProps {
  map: mapboxgl.Map | null
}

/**
 * Attaches Mapbox GL built-in controls to the map instance.
 * - NavigationControl: zoom + compass (top-right)
 * - GeolocateControl: locate user (top-right, below nav)
 * - ScaleControl: metric scale bar (bottom-left)
 *
 * Controls are added once when the map instance is available
 * and cleaned up if the component unmounts.
 */
export default function MapControls({ map }: MapControlsProps) {
  const controlsAdded = useRef(false)

  useEffect(() => {
    if (!map || controlsAdded.current) return
    controlsAdded.current = true

    const nav = new mapboxgl.NavigationControl({ visualizePitch: true })
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    })
    const scale = new mapboxgl.ScaleControl({ unit: 'metric' })

    map.addControl(nav, 'top-right')
    map.addControl(geolocate, 'top-right')
    map.addControl(scale, 'bottom-left')

    return () => {
      map.removeControl(nav)
      map.removeControl(geolocate)
      map.removeControl(scale)
      controlsAdded.current = false
    }
  }, [map])

  return null // controls are imperative, no DOM output
}
```

> **Note on MapControls integration:** This component needs a reference to the map instance. Since MapContainer manages the map via `useRef`, MapControls cannot be a sibling — it needs the map ref passed down. There are two clean approaches:
>
> 1. **Render MapControls inside MapContainer** (chosen) — MapContainer renders MapControls as a child, passing `mapRef.current`.
> 2. **Expose map via context** — more flexible but premature for Phase 2.
>
> We use approach 1. See the updated MapContainer in section 4.5.

### 4.3 LayerPanel — `apps/web/src/map/LayerPanel.tsx`

- [x] Create `apps/web/src/map/LayerPanel.tsx`:

```tsx
import { useMapStore } from '../stores/mapStore'
import { MIN_TERRAIN_EXAGGERATION, MAX_TERRAIN_EXAGGERATION, TERRAIN_EXAGGERATION_STEP } from '@mtamta/map-core'
import type { BaseLayer } from '@mtamta/map-core'

const BASE_LAYERS: { id: BaseLayer; label: string }[] = [
  { id: 'outdoors', label: 'Topographic' },
  { id: 'satellite', label: 'Satellite' },
]

/**
 * Floating layer control panel.
 * - Base layer radio buttons (mutually exclusive)
 * - 3D terrain toggle with exaggeration slider
 */
export default function LayerPanel() {
  const {
    baseLayer,
    setBaseLayer,
    terrainEnabled,
    setTerrainEnabled,
    terrainExaggeration,
    setTerrainExaggeration,
  } = useMapStore()

  return (
    <div style={panelStyle}>
      <div style={sectionStyle}>
        <strong style={headingStyle}>Base Layer</strong>
        {BASE_LAYERS.map((layer) => (
          <label key={layer.id} style={radioLabelStyle}>
            <input
              type="radio"
              name="baseLayer"
              value={layer.id}
              checked={baseLayer === layer.id}
              onChange={() => setBaseLayer(layer.id)}
            />
            {layer.label}
          </label>
        ))}
      </div>

      <div style={sectionStyle}>
        <strong style={headingStyle}>Terrain</strong>
        <label style={radioLabelStyle}>
          <input
            type="checkbox"
            checked={terrainEnabled}
            onChange={(e) => setTerrainEnabled(e.target.checked)}
          />
          3D Terrain
        </label>
        {terrainEnabled && (
          <div style={{ marginTop: '4px' }}>
            <label style={{ fontSize: '12px', color: '#666' }}>
              Exaggeration: {terrainExaggeration.toFixed(1)}x
              <input
                type="range"
                min={MIN_TERRAIN_EXAGGERATION}
                max={MAX_TERRAIN_EXAGGERATION}
                step={TERRAIN_EXAGGERATION_STEP}
                value={terrainExaggeration}
                onChange={(e) => setTerrainExaggeration(parseFloat(e.target.value))}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

// Inline styles — extracted to a CSS file or styled-components when the design system matures.
const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '40px',
  right: '10px',
  background: 'white',
  borderRadius: '8px',
  padding: '12px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  zIndex: 1,
  minWidth: '160px',
  fontSize: '14px',
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '8px',
}

const headingStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '12px',
  textTransform: 'uppercase',
  color: '#888',
  letterSpacing: '0.5px',
}

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 0',
  cursor: 'pointer',
}
```

### 4.4 StyleSwitcher — `apps/web/src/map/StyleSwitcher.tsx`

- [x] Create `apps/web/src/map/StyleSwitcher.tsx`:

```tsx
import { useMapStore } from '../stores/mapStore'
import type { Season } from '@mtamta/map-core'

/**
 * Winter/Summer mode toggle button.
 * In Phase 2 this is a placeholder — both modes resolve to the same
 * Mapbox Outdoors style. The toggle mechanism and store wiring is
 * what matters; custom styles come later.
 */
export default function StyleSwitcher() {
  const { season, setSeason } = useMapStore()

  const toggle = () => {
    const next: Season = season === 'summer' ? 'winter' : 'summer'
    setSeason(next)
  }

  return (
    <button
      onClick={toggle}
      style={buttonStyle}
      title={`Switch to ${season === 'summer' ? 'winter' : 'summer'} mode`}
    >
      {season === 'summer' ? 'Winter' : 'Summer'}
    </button>
  )
}

// bottom-left, above Mapbox ScaleControl. NavBar is top-left, Mapbox controls are top-right.
const buttonStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '40px',
  left: '10px',
  background: 'white',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 16px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
  zIndex: 1,
}
```

### 4.5 Updated MapContainer with controls

- [x] Update `apps/web/src/map/MapContainer.tsx` — integrate MapControls:

The final version of MapContainer renders MapControls as a child and passes the map instance. Replace the earlier version with this complete file:

```tsx
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  resolveStyleUrl,
  TERRAIN_SOURCE_ID,
  TERRAIN_SOURCE,
  SKY_LAYER_ID,
  SKY_LAYER,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@mtamta/map-core'
import { useMapStore } from '../stores/mapStore'
import MapControls from './MapControls'

export default function MapContainer() {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // useState (not useRef) for the map instance passed to children —
  // children need a re-render when the map becomes available.
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)

  const {
    center,
    zoom,
    pitch,
    bearing,
    baseLayer,
    season,
    terrainEnabled,
    terrainExaggeration,
    setViewport,
    setMapReady,
  } = useMapStore()

  // Track whether the initial style has loaded (to skip redundant setStyle on mount)
  const initialStyleRef = useRef(true)

  // --- Map initialization ---
  useEffect(() => {
    if (mapRef.current) return

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
    if (!token?.startsWith('pk.')) {
      throw new Error(
        'VITE_MAPBOX_ACCESS_TOKEN must be a public token (pk.*). ' +
        'Never use a secret token (sk.*) in client-side code.',
      )
    }

    const map = new mapboxgl.Map({
      accessToken: token,
      container: containerRef.current!,
      style: resolveStyleUrl(baseLayer, season),
      center,
      zoom,
      pitch,
      bearing,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    })

    mapRef.current = map

    map.on('load', () => {
      addTerrainSource(map)
      setMapReady(true)
      setMapInstance(map)
    })

    // Sync viewport back to store on moveend (not on every move — too noisy).
    // moveend fires once when user finishes interacting; at rest, store and map
    // are always in sync. Using 'move' would fire 60+ times/sec during pan/zoom.
    map.on('moveend', () => {
      const c = map.getCenter()
      setViewport({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      })
    })

    // CRITICAL: always clean up — prevents WebGL context leaks.
    // Browsers limit WebGL contexts (typically 8–16); without map.remove(),
    // every navigation or hot reload creates a new context without destroying
    // the old one.
    return () => {
      setMapReady(false)
      setMapInstance(null)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Style switching (base layer or season change) ---
  useEffect(() => {
    // Skip on initial render — the map constructor already set the style.
    if (initialStyleRef.current) {
      initialStyleRef.current = false
      return
    }

    const map = mapRef.current
    if (!map) return

    // diff:false forces full style replacement — required when switching between
    // fundamentally different styles (e.g. outdoors → satellite). Without it,
    // Mapbox tries to diff and may leave stale layers.
    const newStyle = resolveStyleUrl(baseLayer, season)
    map.setStyle(newStyle, { diff: false })

    // After style replacement, all sources/layers are gone.
    // Re-add terrain source and re-enable terrain if it was active.
    map.once('style.load', () => {
      addTerrainSource(map)
      if (useMapStore.getState().terrainEnabled) {
        const state = useMapStore.getState()
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: state.terrainExaggeration })
        if (!map.getLayer(SKY_LAYER_ID)) {
          map.addLayer(SKY_LAYER as mapboxgl.AnyLayerSpecification)
        }
      }
    })
  }, [baseLayer, season])

  // --- Terrain toggle ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (terrainEnabled) {
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: terrainExaggeration })
      if (!map.getLayer(SKY_LAYER_ID)) {
        map.addLayer(SKY_LAYER as mapboxgl.AnyLayerSpecification)
      }
    } else {
      map.setTerrain(null)
      if (map.getLayer(SKY_LAYER_ID)) {
        map.removeLayer(SKY_LAYER_ID)
      }
    }
  }, [terrainEnabled, terrainExaggeration])

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <MapControls map={mapInstance} />
    </>
  )
}

function addTerrainSource(map: mapboxgl.Map) {
  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, TERRAIN_SOURCE)
  }
}
```

---

## 5. Layout & Routing

### 5.1 Global CSS reset — `apps/web/src/index.css`

- [x] Create `apps/web/src/index.css`:

```css
/* Global reset — map fills the entire viewport */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

### 5.2 AppLayout — `apps/web/src/map/AppLayout.tsx`

- [x] Create `apps/web/src/map/AppLayout.tsx`:

```tsx
import MapContainer from './MapContainer'
import LayerPanel from './LayerPanel'
import StyleSwitcher from './StyleSwitcher'
import { useAuthStore } from '../stores/authStore'

export default function AppLayout() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer />
      <StyleSwitcher />
      <LayerPanel />
      <NavBar />
    </div>
  )
}

function NavBar() {
  const { user, signOut } = useAuthStore()

  if (!user) return null

  return (
    <div style={navStyle}>
      <span style={{ fontSize: '14px' }}>{user.display_name}</span>
      <button onClick={() => signOut()} style={signOutStyle}>
        Sign out
      </button>
    </div>
  )
}

// top-left to avoid collision with Mapbox NavigationControl + GeolocateControl (top-right)
const navStyle: React.CSSProperties = {
  position: 'absolute',
  top: '10px',
  left: '10px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  background: 'white',
  borderRadius: '8px',
  padding: '8px 12px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  zIndex: 2,
}

const signOutStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #ddd',
  borderRadius: '4px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '12px',
}
```

### 5.3 MapPage — `apps/web/src/map/MapPage.tsx`

- [x] Create `apps/web/src/map/MapPage.tsx`:

```tsx
import AppLayout from './AppLayout'

/**
 * Route-level page component for the map view.
 * Thin wrapper around AppLayout — exists so the router
 * has a dedicated page component to mount/unmount.
 */
export default function MapPage() {
  return <AppLayout />
}
```

### 5.4 Updated App.tsx — auth gate + router

- [x] Update `apps/web/src/App.tsx`:

```tsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from './stores/authStore'
import MapPage from './map/MapPage'

export default function App() {
  const { user, isLoading, restoreSession } = useAuthStore()

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  // Loading state — session restoration in progress
  if (isLoading) {
    return (
      <div style={centeredStyle}>
        <p>Loading...</p>
      </div>
    )
  }

  // Not authenticated — show login screen
  if (!user) {
    return <LoginScreen />
  }

  // Authenticated — render the map app
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function LoginScreen() {
  const { signInWithGoogle } = useAuthStore()

  return (
    <div style={centeredStyle}>
      <h1 style={{ marginBottom: '24px' }}>mtamta</h1>
      <GoogleLogin
        onSuccess={(response) => {
          if (response.credential) {
            signInWithGoogle(response.credential)
          }
        }}
        onError={() => {
          console.error('Google Sign-In failed')
        }}
      />
    </div>
  )
}

const centeredStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
}
```

> **Auth gate pattern:** The `BrowserRouter` is only rendered when the user is authenticated. This means:
> - No routes are accessible without auth (the router doesn't even mount)
> - Route changes inside the authenticated app don't trigger auth checks
> - Login/logout transitions are clean — the entire router mounts/unmounts

### 5.5 Updated main.tsx — import global CSS

- [x] Update `apps/web/src/main.tsx`:

```tsx
import { GoogleOAuthProvider } from '@react-oauth/google'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
```

---

## 6. CI & Linting Updates

### 6.1 Add map-core to CI test pipeline

- [x] Add `@mtamta/map-core` test step to `.github/workflows/ci.yml` `test-web` job:

```yaml
  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test --filter=@mtamta/shared
      - run: pnpm test --filter=@mtamta/map-core
      - run: pnpm test --filter=@mtamta/web
```

- [x] Verify `turbo lint` runs `tsc --noEmit` for `@mtamta/map-core` (auto-detected via workspace — no `turbo.json` changes needed).

---

## 7. Tests

> Test pure logic (map-core functions, store mutations). Do NOT test MapContainer/MapControls — mocking `mapbox-gl` in jsdom is brittle and tests what Mapbox does, not what our code does.

### 7.1 Map Core Unit Tests — `packages/map-core/src/styles.test.ts`

- [x] Create `packages/map-core/src/styles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveStyleUrl, STYLE_URLS } from './styles'

describe('resolveStyleUrl', () => {
  it('returns outdoors URL for outdoors + summer', () => {
    expect(resolveStyleUrl('outdoors', 'summer')).toBe(STYLE_URLS.outdoors)
  })

  it('returns satellite URL for satellite + summer', () => {
    expect(resolveStyleUrl('satellite', 'summer')).toBe(STYLE_URLS.satellite)
  })

  it('returns outdoors URL for outdoors + winter (placeholder — same in Phase 2)', () => {
    expect(resolveStyleUrl('outdoors', 'winter')).toBe(STYLE_URLS.outdoors)
  })

  it('returns satellite URL for satellite + winter (placeholder — same in Phase 2)', () => {
    expect(resolveStyleUrl('satellite', 'winter')).toBe(STYLE_URLS.satellite)
  })
})
```

### 7.2 Map Core Unit Tests — `packages/map-core/src/layers.test.ts`

- [x] Create `packages/map-core/src/layers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getAvailableLayers, getLayersByCategory, LAYER_REGISTRY } from './layers'

describe('layer registry', () => {
  it('contains exactly 3 layers in Phase 2', () => {
    expect(LAYER_REGISTRY).toHaveLength(3)
  })

  it('getAvailableLayers returns only available layers', () => {
    const available = getAvailableLayers()
    expect(available.every((l) => l.available)).toBe(true)
  })

  it('getLayersByCategory("base") returns 2 base layers', () => {
    const base = getLayersByCategory('base')
    expect(base).toHaveLength(2)
    expect(base.map((l) => l.id)).toEqual(['outdoors', 'satellite'])
  })

  it('getLayersByCategory("terrain") returns the 3D terrain layer', () => {
    const terrain = getLayersByCategory('terrain')
    expect(terrain).toHaveLength(1)
    expect(terrain[0].id).toBe('terrain-3d')
  })
})
```

### 7.3 Map Core Unit Tests — `packages/map-core/src/config.test.ts`

- [x] Create `packages/map-core/src/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_VIEWPORT, MIN_ZOOM, MAX_ZOOM } from './config'

describe('map config', () => {
  it('DEFAULT_CENTER is [lng, lat] in valid range', () => {
    const [lng, lat] = DEFAULT_CENTER
    expect(lng).toBeGreaterThanOrEqual(-180)
    expect(lng).toBeLessThanOrEqual(180)
    expect(lat).toBeGreaterThanOrEqual(-90)
    expect(lat).toBeLessThanOrEqual(90)
  })

  it('DEFAULT_ZOOM is within allowed bounds', () => {
    expect(DEFAULT_ZOOM).toBeGreaterThanOrEqual(MIN_ZOOM)
    expect(DEFAULT_ZOOM).toBeLessThanOrEqual(MAX_ZOOM)
  })

  it('DEFAULT_VIEWPORT contains all required fields', () => {
    expect(DEFAULT_VIEWPORT).toHaveProperty('center')
    expect(DEFAULT_VIEWPORT).toHaveProperty('zoom')
    expect(DEFAULT_VIEWPORT).toHaveProperty('pitch')
    expect(DEFAULT_VIEWPORT).toHaveProperty('bearing')
  })
})
```

### 7.4 Map Core Unit Tests — `packages/map-core/src/terrain.test.ts`

- [x] Create `packages/map-core/src/terrain.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  TERRAIN_SOURCE,
  TERRAIN_SOURCE_ID,
  DEFAULT_TERRAIN_EXAGGERATION,
  MIN_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION_STEP,
  SKY_LAYER,
} from './terrain'

describe('terrain config', () => {
  it('TERRAIN_SOURCE is a raster-dem with tileSize 512', () => {
    expect(TERRAIN_SOURCE.type).toBe('raster-dem')
    expect(TERRAIN_SOURCE.tileSize).toBe(512)
  })

  it('TERRAIN_SOURCE_ID is a non-empty string', () => {
    expect(TERRAIN_SOURCE_ID).toBeTruthy()
    expect(typeof TERRAIN_SOURCE_ID).toBe('string')
  })

  it('exaggeration defaults are ordered: min <= default <= max', () => {
    expect(MIN_TERRAIN_EXAGGERATION).toBeLessThanOrEqual(DEFAULT_TERRAIN_EXAGGERATION)
    expect(DEFAULT_TERRAIN_EXAGGERATION).toBeLessThanOrEqual(MAX_TERRAIN_EXAGGERATION)
  })

  it('exaggeration step divides the range evenly', () => {
    const range = MAX_TERRAIN_EXAGGERATION - MIN_TERRAIN_EXAGGERATION
    expect(range % TERRAIN_EXAGGERATION_STEP).toBeCloseTo(0)
  })

  it('SKY_LAYER has type "sky"', () => {
    expect(SKY_LAYER.type).toBe('sky')
  })
})
```

### 7.5 Map Store Tests — `apps/web/src/stores/mapStore.test.ts`

- [x] Create `apps/web/src/stores/mapStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from './mapStore'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '@mtamta/map-core'

describe('mapStore', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useMapStore.setState({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      baseLayer: 'outdoors',
      season: 'summer',
      terrainEnabled: false,
      terrainExaggeration: DEFAULT_TERRAIN_EXAGGERATION,
      isMapReady: false,
    })
  })

  it('has correct initial state', () => {
    const state = useMapStore.getState()
    expect(state.center).toEqual(DEFAULT_CENTER)
    expect(state.zoom).toBe(DEFAULT_ZOOM)
    expect(state.baseLayer).toBe('outdoors')
    expect(state.season).toBe('summer')
    expect(state.terrainEnabled).toBe(false)
    expect(state.isMapReady).toBe(false)
  })

  it('setViewport updates all viewport fields', () => {
    useMapStore.getState().setViewport({
      center: [12.0, 48.0],
      zoom: 14,
      pitch: 60,
      bearing: 45,
    })
    const state = useMapStore.getState()
    expect(state.center).toEqual([12.0, 48.0])
    expect(state.zoom).toBe(14)
    expect(state.pitch).toBe(60)
    expect(state.bearing).toBe(45)
  })

  it('setBaseLayer switches from outdoors to satellite', () => {
    useMapStore.getState().setBaseLayer('satellite')
    expect(useMapStore.getState().baseLayer).toBe('satellite')
  })

  it('setSeason toggles between summer and winter', () => {
    useMapStore.getState().setSeason('winter')
    expect(useMapStore.getState().season).toBe('winter')
    useMapStore.getState().setSeason('summer')
    expect(useMapStore.getState().season).toBe('summer')
  })

  it('setTerrainEnabled toggles terrain on and off', () => {
    useMapStore.getState().setTerrainEnabled(true)
    expect(useMapStore.getState().terrainEnabled).toBe(true)
    useMapStore.getState().setTerrainEnabled(false)
    expect(useMapStore.getState().terrainEnabled).toBe(false)
  })

  it('setTerrainExaggeration updates the exaggeration value', () => {
    useMapStore.getState().setTerrainExaggeration(2.5)
    expect(useMapStore.getState().terrainExaggeration).toBe(2.5)
  })

  it('setMapReady updates readiness flag', () => {
    useMapStore.getState().setMapReady(true)
    expect(useMapStore.getState().isMapReady).toBe(true)
  })
})
```

### 7.6 Add vitest to map-core

- [x] Add vitest to `packages/map-core/package.json` devDependencies and test script (already included in section 1.1)

- [x] Create `packages/map-core/vitest.config.ts` (already included in section 1.3)

> **What we do NOT test:**
> - `MapContainer`, `MapControls`, `LayerPanel`, `StyleSwitcher` — these are thin wrappers around imperative Mapbox GL JS calls. Mocking `mapbox-gl` in jsdom produces tests that verify our mocks work, not that maps render. These are verified manually and via E2E tests in Phase 12 (Playwright).

---

## 8. Implementation Notes

### 8.1 WebGL Context Leak Prevention

The `map.remove()` call in the useEffect cleanup is **critical**. Without it, every React navigation or hot reload creates a new WebGL context without destroying the old one. Browsers limit WebGL contexts (typically 8–16) — once exceeded, all canvases go black.

```
Component mount   → new mapboxgl.Map(...)  → WebGL context created
Component unmount → map.remove()            → WebGL context destroyed ✓
Component unmount → (nothing)               → WebGL context leaked ✗
```

### 8.2 Style Switching and Terrain

When `map.setStyle()` is called, all sources and layers are removed. The terrain DEM source must be re-added after the new style loads:

```
setStyle(newUrl) → sources/layers cleared → 'style.load' fires → addTerrainSource() → setTerrain() if enabled
```

Using `{ diff: false }` ensures a clean style replacement. Without it, Mapbox diffs the old and new styles and may leave stale layers when switching between fundamentally different styles (e.g., outdoors → satellite).

### 8.3 Viewport Sync Strategy

The store is updated on `moveend`, not `move`. Updating on every `move` event would:
- Fire 60+ times per second during pan/zoom animations
- Trigger unnecessary Zustand re-renders
- Have no observable benefit (no UI reads viewport during animations)

`moveend` fires once when the user finishes interacting — at rest, the store and map are always in sync.

### 8.4 Mapbox Access Token

`VITE_MAPBOX_ACCESS_TOKEN` must be a `pk.*` public token. MapContainer validates this at init and throws if the token doesn't start with `pk.` — the Mapbox SDK itself does not reject secret tokens, so without this guard an `sk.*` token could silently work while leaking full API access to every browser. Security comes from:
- **Runtime `pk.*` prefix check** in MapContainer (fail-fast if misconfigured)
- **URL restrictions** configured in the Mapbox dashboard per environment
- **Separate server-side `sk.*` token** for backend API calls (Directions, geocoding) — never sent to the browser
- Token rotation if accidentally committed to a public repo

### 8.5 No react-map-gl

This project uses raw `mapbox-gl` instead of `react-map-gl` because:
- Full control over terrain source lifecycle (add/remove on style switches)
- Direct access to `map.setStyle()` with options like `{ diff: false }`
- No abstraction layer between our code and the GL API for custom layers (Phase 7+)
- Simpler mental model — one imperative map object, not a React wrapper trying to reconcile declarative props with imperative GL calls

The cost is more boilerplate in MapContainer (useRef, useEffect, cleanup). This is a one-time cost that pays off when adding terrain overlays, custom draw modes, and WebGL custom layers in later phases.

---

## End-State File Tree

```
packages/map-core/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── config.ts
    ├── config.test.ts                 (new — test)
    ├── styles.ts
    ├── styles.test.ts                 (new — test)
    ├── terrain.ts
    ├── terrain.test.ts                (new — test)
    ├── layers.ts
    └── layers.test.ts                 (new — test)

apps/web/src/
├── index.css                          (new)
├── main.tsx                           (modified — import index.css)
├── App.tsx                            (modified — auth gate + router)
├── vite-env.d.ts                      (modified — VITE_MAPBOX_ACCESS_TOKEN)
├── lib/
│   └── api.ts                         (unchanged)
├── stores/
│   ├── authStore.ts                   (unchanged)
│   ├── authStore.test.js              (unchanged)
│   ├── mapStore.ts                    (new)
│   └── mapStore.test.ts              (new — test)
└── map/
    ├── MapContainer.tsx               (new)
    ├── MapControls.tsx                (new)
    ├── LayerPanel.tsx                 (new)
    ├── StyleSwitcher.tsx              (new)
    ├── AppLayout.tsx                  (new)
    └── MapPage.tsx                    (new)

apps/web/
├── package.json                       (modified — mapbox-gl, @mtamta/map-core)
├── tsconfig.json                      (modified — @mtamta/map-core path)
├── vite.config.ts                     (modified — @mtamta/map-core alias)
├── vitest.config.ts                   (modified — @mtamta/map-core alias)
└── .env.example                       (modified — VITE_MAPBOX_ACCESS_TOKEN)
```

**New files: 17** | **Modified files: 7** | **Deleted files: 0**

---

## Acceptance Criteria

- [x] Map renders full-screen on page load at the default Alps viewport (center ~[8.2, 46.8], zoom 9)
- [x] Map is only visible when the user is authenticated (auth gate wraps router)
- [x] Unauthenticated users see the login screen with Google Sign-In
- [x] User can switch between Topographic and Satellite base layers via the layer panel
- [x] Style switch preserves the current viewport (center, zoom, pitch, bearing)
- [x] User can toggle 3D terrain on/off; tilting the map shows terrain relief when enabled
- [x] Terrain exaggeration slider adjusts relief intensity between 1.0x and 3.0x
- [x] Sky atmosphere layer appears when 3D terrain is enabled
- [x] Winter/summer mode button toggles the season in the store (placeholder — same style for both in Phase 2)
- [x] Terrain source is re-added after every style switch (no missing terrain after switching layers)
- [x] Map state (center, zoom, pitch, bearing) syncs back to Zustand store on `moveend`
- [x] NavigationControl (zoom + compass), GeolocateControl, and ScaleControl are present on the map
- [x] `map.remove()` is called on component unmount (no WebGL context leaks)
- [x] `VITE_MAPBOX_ACCESS_TOKEN` is required and must be a `pk.*` public token
- [x] `@mtamta/map-core` is importable from both `apps/web` and has no runtime dependencies
- [x] `turbo lint` passes for all packages including `@mtamta/map-core`
- [x] `turbo test` passes — map-core unit tests (styles, layers, config, terrain) and mapStore tests all green
- [x] Existing tests still pass (authStore, shared/api/client)
- [x] No Phase 3+ features present (no country topos, no Sentinel imagery, no trip routes, no live data)
