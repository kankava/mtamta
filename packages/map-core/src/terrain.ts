// Terrain exaggeration settings, shared by both map providers.
// Mapbox Standard renders terrain as part of the style; MapTiler enables it
// via the SDK's enableTerrain(exaggeration). Only the exaggeration values
// (used by the Settings exaggeration slider) are shared here.

export const DEFAULT_TERRAIN_EXAGGERATION = 1.5
export const MIN_TERRAIN_EXAGGERATION = 1.0
export const MAX_TERRAIN_EXAGGERATION = 3.0
export const TERRAIN_EXAGGERATION_STEP = 0.1
