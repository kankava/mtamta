import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from './mapStore'
import { DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_TERRAIN_EXAGGERATION } from '@mtamta/map-core'

describe('mapStore', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useMapStore.setState({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      baseLayer: 'outdoors',
      season: 'summer',
      terrainEnabled: false,
      terrainExaggeration: DEFAULT_TERRAIN_EXAGGERATION,
      isMapReady: false,
    })
  })

  it('has correct initial state', () => {
    const state = useMapStore.getState()
    expect(state.center).toEqual(DEFAULT_CENTER)
    expect(state.zoom).toBe(DEFAULT_ZOOM)
    expect(state.baseLayer).toBe('outdoors')
    expect(state.season).toBe('summer')
    expect(state.terrainEnabled).toBe(false)
    expect(state.isMapReady).toBe(false)
  })

  it('setViewport updates all viewport fields', () => {
    useMapStore.getState().setViewport({
      center: [12.0, 48.0],
      zoom: 14,
      pitch: 60,
      bearing: 45,
    })
    const state = useMapStore.getState()
    expect(state.center).toEqual([12.0, 48.0])
    expect(state.zoom).toBe(14)
    expect(state.pitch).toBe(60)
    expect(state.bearing).toBe(45)
  })

  it('setBaseLayer switches from outdoors to satellite', () => {
    useMapStore.getState().setBaseLayer('satellite')
    expect(useMapStore.getState().baseLayer).toBe('satellite')
  })

  it('setSeason toggles between summer and winter', () => {
    useMapStore.getState().setSeason('winter')
    expect(useMapStore.getState().season).toBe('winter')
    useMapStore.getState().setSeason('summer')
    expect(useMapStore.getState().season).toBe('summer')
  })

  it('setTerrainEnabled toggles terrain on and off', () => {
    useMapStore.getState().setTerrainEnabled(true)
    expect(useMapStore.getState().terrainEnabled).toBe(true)
    useMapStore.getState().setTerrainEnabled(false)
    expect(useMapStore.getState().terrainEnabled).toBe(false)
  })

  it('setTerrainExaggeration updates the exaggeration value', () => {
    useMapStore.getState().setTerrainExaggeration(2.5)
    expect(useMapStore.getState().terrainExaggeration).toBe(2.5)
  })

  it('setMapReady updates readiness flag', () => {
    useMapStore.getState().setMapReady(true)
    expect(useMapStore.getState().isMapReady).toBe(true)
  })
})
