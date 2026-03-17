export type MapProvider = 'mapbox' | 'maptiler'

export type FeatureId =
  | 'base_outdoors'
  | 'base_satellite'
  | 'terrain_3d'
  | 'topo_overlays'
  | 'raster_overlays'
  | 'globe_projection'
  | 'season_summer'
  | 'season_winter'
  | 'trip_routes'
  | 'geocoder'
  | 'weather'
  | 'directions'

export type CapabilityState = 'available' | 'coming_soon' | 'unsupported'

export type ProviderCapabilities = Record<FeatureId, CapabilityState>
