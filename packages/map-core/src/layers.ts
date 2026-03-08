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
