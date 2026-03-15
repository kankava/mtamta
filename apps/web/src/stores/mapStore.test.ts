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
      baseLayer: 'satellite',
      season: 'summer',
      terrainEnabled: false,
      terrainExaggeration: DEFAULT_TERRAIN_EXAGGERATION,
      projection: 'mercator',
      topoSource: null,
      sidebarOpen: true,
      sidebarTab: 'basemaps',
      isMapReady: false,
    })
  })

  it('has correct initial state', () => {
    const state = useMapStore.getState()
    expect(state.center).toEqual(DEFAULT_CENTER)
    expect(state.zoom).toBe(DEFAULT_ZOOM)
    expect(state.baseLayer).toBe('satellite')
    expect(state.season).toBe('summer')
    expect(state.terrainEnabled).toBe(false)
    expect(state.projection).toBe('mercator')
    expect(state.isMapReady).toBe(false)
    expect(state.sidebarOpen).toBe(true)
    expect(state.sidebarTab).toBe('basemaps')
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

  it('selectBasemap sets baseLayer, season, and topo atomically', () => {
    useMapStore.getState().selectBasemap('swisstopo-winter')
    const state = useMapStore.getState()
    expect(state.baseLayer).toBe('outdoors')
    expect(state.season).toBe('winter')
    expect(state.topoSource).toBe('swisstopo')
  })

  it('selectBasemap outdoors-summer clears topo source', () => {
    useMapStore.getState().selectBasemap('swisstopo')
    useMapStore.getState().selectBasemap('outdoors-summer')
    const state = useMapStore.getState()
    expect(state.baseLayer).toBe('outdoors')
    expect(state.season).toBe('summer')
    expect(state.topoSource).toBeNull()
  })

  it('selectBasemap satellite clears topo source', () => {
    useMapStore.getState().selectBasemap('swisstopo')
    useMapStore.getState().selectBasemap('satellite-winter')
    const state = useMapStore.getState()
    expect(state.baseLayer).toBe('satellite')
    expect(state.season).toBe('winter')
    expect(state.topoSource).toBeNull()
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

  it('setSidebarOpen toggles sidebar', () => {
    useMapStore.getState().setSidebarOpen(false)
    expect(useMapStore.getState().sidebarOpen).toBe(false)
    useMapStore.getState().setSidebarOpen(true)
    expect(useMapStore.getState().sidebarOpen).toBe(true)
  })

  it('setSidebarTab switches tabs', () => {
    useMapStore.getState().setSidebarTab('overlays')
    expect(useMapStore.getState().sidebarTab).toBe('overlays')
    useMapStore.getState().setSidebarTab('settings')
    expect(useMapStore.getState().sidebarTab).toBe('settings')
  })

  it('setProjection switches between mercator and globe', () => {
    expect(useMapStore.getState().projection).toBe('mercator')
    useMapStore.getState().setProjection('globe')
    expect(useMapStore.getState().projection).toBe('globe')
    useMapStore.getState().setProjection('mercator')
    expect(useMapStore.getState().projection).toBe('mercator')
  })
})
