// Style URLs and IDs for both map providers.
// Mapbox uses hosted style URLs; MapTiler uses string style IDs.

import type { MapProvider } from './providers'

export type BaseLayer = 'outdoors' | 'satellite'
export type Season = 'summer' | 'winter'

// --- Mapbox ---

export const STYLE_URLS: Record<BaseLayer, string> = {
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
}

/**
 * Resolve the Mapbox style URL for a given base layer and season.
 * Season does not currently affect the Mapbox style URL — topo winter
 * variants are handled by tile URL switching in resolveTopoTileUrl.
 */
export function resolveStyleUrl(baseLayer: BaseLayer, _season: Season): string {
  return STYLE_URLS[baseLayer]
}

// --- MapTiler ---

export const MAPTILER_STYLE_IDS: Record<BaseLayer, Record<Season, string>> = {
  outdoors: { summer: 'outdoor-v2', winter: 'winter-v2' },
  satellite: { summer: 'satellite', winter: 'satellite' },
}

/**
 * Resolve the MapTiler style ID for a given base layer and season.
 */
export function resolveMaptilerStyle(baseLayer: BaseLayer, season: Season): string {
  return MAPTILER_STYLE_IDS[baseLayer]?.[season] ?? 'outdoor-v2'
}

// --- Provider-keyed resolution ---

/**
 * Resolve style identifier for any provider.
 * Returns a Mapbox style URL or a MapTiler style ID string.
 */
export function resolveStyleForProvider(
  provider: MapProvider,
  baseLayer: BaseLayer,
  season: Season,
): string {
  if (provider === 'maptiler') {
    return resolveMaptilerStyle(baseLayer, season)
  }
  return STYLE_URLS[baseLayer]
}
