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
