import { describe, it, expect } from 'vitest'
import { getProviderCapabilities, getFeatureState, isFeatureAvailable } from './capabilities'

describe('capabilities', () => {
  it('returns full capability matrix for mapbox', () => {
    const caps = getProviderCapabilities('mapbox')
    expect(caps.base_outdoors).toBe('available')
    expect(caps.season_winter).toBe('available')
    expect(caps.geocoder).toBe('coming_soon')
  })

  it('returns full capability matrix for maptiler', () => {
    const caps = getProviderCapabilities('maptiler')
    expect(caps.base_outdoors).toBe('available')
    expect(caps.season_winter).toBe('coming_soon')
    expect(caps.geocoder).toBe('coming_soon')
  })

  it('getFeatureState returns correct state per provider', () => {
    expect(getFeatureState('mapbox', 'season_winter')).toBe('available')
    expect(getFeatureState('maptiler', 'season_winter')).toBe('coming_soon')
    expect(getFeatureState('mapbox', 'terrain_3d')).toBe('available')
    expect(getFeatureState('maptiler', 'terrain_3d')).toBe('available')
  })

  it('isFeatureAvailable returns boolean shortcut', () => {
    expect(isFeatureAvailable('mapbox', 'season_winter')).toBe(true)
    expect(isFeatureAvailable('maptiler', 'season_winter')).toBe(false)
    expect(isFeatureAvailable('maptiler', 'base_satellite')).toBe(true)
  })

  it('all feature IDs are present in both providers', () => {
    const mapbox = getProviderCapabilities('mapbox')
    const maptiler = getProviderCapabilities('maptiler')
    const mapboxKeys = Object.keys(mapbox).sort()
    const maptilerKeys = Object.keys(maptiler).sort()
    expect(mapboxKeys).toEqual(maptilerKeys)
  })
})
