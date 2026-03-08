import { create } from 'zustand'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '@mtamta/map-core'
import type { BaseLayer, Season } from '@mtamta/map-core'

interface MapState {
  // Viewport
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number

  // Layers
  baseLayer: BaseLayer
  season: Season
  terrainEnabled: boolean
  terrainExaggeration: number

  // Map readiness
  isMapReady: boolean

  // Actions
  setViewport: (viewport: {
    center: [number, number]
    zoom: number
    pitch: number
    bearing: number
  }) => void
  setBaseLayer: (layer: BaseLayer) => void
  setSeason: (season: Season) => void
  setTerrainEnabled: (enabled: boolean) => void
  setTerrainExaggeration: (exaggeration: number) => void
  setMapReady: (ready: boolean) => void
}

export const useMapStore = create<MapState>((set) => ({
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  pitch: DEFAULT_PITCH,
  bearing: DEFAULT_BEARING,

  baseLayer: 'outdoors',
  season: 'summer',
  terrainEnabled: false,
  terrainExaggeration: DEFAULT_TERRAIN_EXAGGERATION,

  isMapReady: false,

  setViewport: (viewport) => set(viewport),
  setBaseLayer: (baseLayer) => set({ baseLayer }),
  setSeason: (season) => set({ season }),
  setTerrainEnabled: (terrainEnabled) => set({ terrainEnabled }),
  setTerrainExaggeration: (terrainExaggeration) => set({ terrainExaggeration }),
  setMapReady: (isMapReady) => set({ isMapReady }),
}))
