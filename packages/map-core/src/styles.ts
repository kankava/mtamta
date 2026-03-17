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

export const MAPTILER_STYLE_IDS: Record<BaseLayer, string> = {
  outdoors: 'outdoor-v2',
  satellite: 'satellite',
}

// --- Provider-keyed resolution ---

/**
 * Resolve style identifier for any provider.
 * Returns a Mapbox style URL or a MapTiler style ID string.
 */
export function resolveStyleForProvider(
  provider: MapProvider,
  baseLayer: BaseLayer,
  _season: Season,
): string {
  if (provider === 'maptiler') {
    return MAPTILER_STYLE_IDS[baseLayer]
  }
  return STYLE_URLS[baseLayer]
}
