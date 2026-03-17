// Terrain configuration for both map providers.
// Mapbox: explicit DEM source + setTerrain().
// MapTiler: SDK manages DEM internally via enableTerrain() — only exaggeration is shared.

import type { MapProvider } from './providers'

// --- Mapbox Terrain-DEM v1 ---
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

// --- Provider-keyed terrain config ---

export interface TerrainConfig {
  /** DEM source ID — null for MapTiler (SDK manages internally) */
  sourceId: string | null
  /** DEM source spec — null for MapTiler */
  source: { type: 'raster-dem'; url: string; tileSize: number; maxzoom: number } | null
  exaggeration: number
}

export function getTerrainConfig(provider: MapProvider): TerrainConfig {
  if (provider === 'maptiler') {
    return {
      sourceId: null,
      source: null,
      exaggeration: DEFAULT_TERRAIN_EXAGGERATION,
    }
  }
  return {
    sourceId: TERRAIN_SOURCE_ID,
    source: TERRAIN_SOURCE,
    exaggeration: DEFAULT_TERRAIN_EXAGGERATION,
  }
}
