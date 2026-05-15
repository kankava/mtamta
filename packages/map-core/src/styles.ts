// Style URLs and IDs for both map providers.
// Mapbox uses hosted style URLs; MapTiler uses string style IDs.

export type BaseLayer = 'outdoors' | 'satellite'
export type Season = 'summer' | 'winter'

// --- Mapbox ---
// Outdoors / Outdoors Winter are custom styles built on Mapbox Standard,
// hosted in the project's Mapbox Studio account — season selects a distinct
// style URL. Satellite uses Mapbox Standard Satellite (same for both seasons).

export const STYLE_URLS: Record<BaseLayer, Record<Season, string>> = {
  outdoors: {
    summer: 'mapbox://styles/kankava/cmp6x7gqn000o01skbescgqr3',
    winter: 'mapbox://styles/kankava/cmp6xadna002e01s81n7c055u',
  },
  satellite: {
    summer: 'mapbox://styles/mapbox/standard-satellite',
    winter: 'mapbox://styles/mapbox/standard-satellite',
  },
}

/**
 * Resolve the Mapbox style URL for a given base layer and season.
 */
export function resolveStyleUrl(baseLayer: BaseLayer, season: Season): string {
  return STYLE_URLS[baseLayer][season]
}

// --- MapTiler ---

export const MAPTILER_STYLE_IDS: Record<BaseLayer, Record<Season, string>> = {
  outdoors: { summer: 'outdoor-v2', winter: 'winter-v2' },
  // 'hybrid' = satellite imagery + roads/labels/borders, matching Mapbox's
  // satellite-streets style. Plain 'satellite' is imagery only.
  satellite: { summer: 'hybrid', winter: 'hybrid' },
}

/**
 * Resolve the MapTiler style ID for a given base layer and season.
 */
export function resolveMaptilerStyle(baseLayer: BaseLayer, season: Season): string {
  return MAPTILER_STYLE_IDS[baseLayer]?.[season] ?? 'outdoor-v2'
}
