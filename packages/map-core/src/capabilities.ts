import type { MapProvider, FeatureId, CapabilityState, ProviderCapabilities } from './providers'

const MAPBOX_CAPABILITIES: ProviderCapabilities = {
  base_outdoors: 'available',
  base_satellite: 'available',
  terrain_3d: 'available',
  topo_overlays: 'available',
  raster_overlays: 'available',
  globe_projection: 'available',
  season_summer: 'available',
  season_winter: 'available',
  trip_routes: 'available',
  geocoder: 'coming_soon',
  weather: 'coming_soon',
  directions: 'coming_soon',
}

const MAPTILER_CAPABILITIES: ProviderCapabilities = {
  base_outdoors: 'available',
  base_satellite: 'available',
  terrain_3d: 'available',
  topo_overlays: 'available',
  raster_overlays: 'available',
  globe_projection: 'available',
  season_summer: 'available',
  season_winter: 'coming_soon',
  trip_routes: 'available',
  geocoder: 'coming_soon',
  weather: 'coming_soon',
  directions: 'coming_soon',
}

const CAPABILITIES: Record<MapProvider, ProviderCapabilities> = {
  mapbox: MAPBOX_CAPABILITIES,
  maptiler: MAPTILER_CAPABILITIES,
}

export function getProviderCapabilities(provider: MapProvider): ProviderCapabilities {
  return CAPABILITIES[provider]
}

export function getFeatureState(provider: MapProvider, feature: FeatureId): CapabilityState {
  return CAPABILITIES[provider][feature]
}

export function isFeatureAvailable(provider: MapProvider, feature: FeatureId): boolean {
  return CAPABILITIES[provider][feature] === 'available'
}
