import { create } from 'zustand'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '@mtamta/map-core'
import type { BaseLayer, Season, TopoSourceId } from '@mtamta/map-core'

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

  // Topo overlay (Phase 3)
  topoSource: TopoSourceId | null
  topoSourceManual: boolean
  topoOpacity: number

  // Overlays (Phase 3)
  overlayPistes: boolean
  overlaySkiTouring: boolean
  overlaySnowshoe: boolean

  // Seasonal satellite (Phase 3)
  sentinelYear: number

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
  setTopoSource: (source: TopoSourceId | null, manual?: boolean) => void
  setTopoOpacity: (opacity: number) => void
  resetTopoSourceAuto: () => void
  setOverlayPistes: (enabled: boolean) => void
  setOverlaySkiTouring: (enabled: boolean) => void
  setOverlaySnowshoe: (enabled: boolean) => void
  setSentinelYear: (year: number) => void
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

  topoSource: null,
  topoSourceManual: false,
  topoOpacity: 0.85,

  overlayPistes: false,
  overlaySkiTouring: false,
  overlaySnowshoe: false,

  sentinelYear: new Date().getFullYear(),

  isMapReady: false,

  setViewport: (viewport) => set(viewport),
  setBaseLayer: (baseLayer) => set({ baseLayer }),
  setSeason: (season) => set({ season }),
  setTerrainEnabled: (terrainEnabled) => set({ terrainEnabled }),
  setTerrainExaggeration: (terrainExaggeration) => set({ terrainExaggeration }),
  setMapReady: (isMapReady) => set({ isMapReady }),
  setTopoSource: (topoSource, manual) =>
    set(manual !== undefined ? { topoSource, topoSourceManual: manual } : { topoSource }),
  setTopoOpacity: (topoOpacity) => set({ topoOpacity }),
  resetTopoSourceAuto: () => set({ topoSourceManual: false }),
  setOverlayPistes: (overlayPistes) => set({ overlayPistes }),
  setOverlaySkiTouring: (overlaySkiTouring) => set({ overlaySkiTouring }),
  setOverlaySnowshoe: (overlaySnowshoe) => set({ overlaySnowshoe }),
  setSentinelYear: (sentinelYear) => set({ sentinelYear }),
}))
