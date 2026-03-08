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
