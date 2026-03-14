// Mapbox-hosted style URLs. No bundled JSON — style switching uses setStyle(url).

export type BaseLayer = 'outdoors' | 'satellite'
export type Season = 'summer' | 'winter'

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
