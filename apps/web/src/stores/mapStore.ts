import { create } from 'zustand'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '@mtamta/map-core'
import type { BaseLayer, Season, TopoSourceId } from '@mtamta/map-core'

export type BasemapPreset =
  | 'outdoors-summer'
  | 'outdoors-winter'
  | 'satellite-summer'
  | 'satellite-winter'
  | 'swisstopo'
  | 'swisstopo-winter'
  | 'ign'
  | 'basemap-at'
  | 'bkg'
  | 'kartverket'
  | 'usgs'

interface BasemapConfig {
  baseLayer: BaseLayer
  season: Season
  topoSource: TopoSourceId | null
}

const BASEMAP_PRESETS: Record<BasemapPreset, BasemapConfig> = {
  'outdoors-summer': { baseLayer: 'outdoors', season: 'summer', topoSource: null },
  'outdoors-winter': { baseLayer: 'outdoors', season: 'winter', topoSource: null },
  'satellite-summer': { baseLayer: 'satellite', season: 'summer', topoSource: null },
  'satellite-winter': { baseLayer: 'satellite', season: 'winter', topoSource: null },
  swisstopo: { baseLayer: 'outdoors', season: 'summer', topoSource: 'swisstopo' },
  'swisstopo-winter': { baseLayer: 'outdoors', season: 'winter', topoSource: 'swisstopo' },
  ign: { baseLayer: 'outdoors', season: 'summer', topoSource: 'ign' },
  'basemap-at': { baseLayer: 'outdoors', season: 'summer', topoSource: 'basemap-at' },
  bkg: { baseLayer: 'outdoors', season: 'summer', topoSource: 'bkg' },
  kartverket: { baseLayer: 'outdoors', season: 'summer', topoSource: 'kartverket' },
  usgs: { baseLayer: 'outdoors', season: 'summer', topoSource: 'usgs' },
}

export { BASEMAP_PRESETS }

export type Projection = 'mercator' | 'globe'
export type SidebarTab = 'basemaps' | 'overlays' | 'settings'

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
  customExaggeration: boolean
  projection: Projection

  // Topo overlay (Phase 3)
  topoSource: TopoSourceId | null

  // Overlays (Phase 3)
  overlayPistes: boolean
  overlaySkiTouring: boolean
  overlaySnowshoe: boolean

  // Seasonal satellite (Phase 3)
  sentinelYear: number

  // Sidebar
  sidebarOpen: boolean
  sidebarTab: SidebarTab

  // Map readiness
  isMapReady: boolean

  // Actions
  setViewport: (viewport: {
    center: [number, number]
    zoom: number
    pitch: number
    bearing: number
  }) => void
  selectBasemap: (preset: BasemapPreset) => void
  setTerrainEnabled: (enabled: boolean) => void
  setTerrainExaggeration: (exaggeration: number) => void
  setCustomExaggeration: (enabled: boolean) => void
  setProjection: (projection: Projection) => void
  setMapReady: (ready: boolean) => void
  setTopoSource: (source: TopoSourceId | null) => void
  setOverlayPistes: (enabled: boolean) => void
  setOverlaySkiTouring: (enabled: boolean) => void
  setOverlaySnowshoe: (enabled: boolean) => void
  setSentinelYear: (year: number) => void
  setSidebarOpen: (open: boolean) => void
  setSidebarTab: (tab: SidebarTab) => void
}

export const useMapStore = create<MapState>((set) => ({
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  pitch: DEFAULT_PITCH,
  bearing: DEFAULT_BEARING,

  baseLayer: 'satellite',
  season: 'summer',
  terrainEnabled: false,
  terrainExaggeration: DEFAULT_TERRAIN_EXAGGERATION,
  customExaggeration: false,
  projection: 'mercator',

  topoSource: null,

  overlayPistes: false,
  overlaySkiTouring: false,
  overlaySnowshoe: false,

  sentinelYear: new Date().getFullYear(),

  sidebarOpen: true,
  sidebarTab: 'basemaps',

  isMapReady: false,

  setViewport: (viewport) => set(viewport),
  selectBasemap: (preset) => set(BASEMAP_PRESETS[preset]),
  setTerrainEnabled: (terrainEnabled) => set({ terrainEnabled }),
  setTerrainExaggeration: (terrainExaggeration) => set({ terrainExaggeration }),
  setCustomExaggeration: (customExaggeration) => set({ customExaggeration }),
  setProjection: (projection) => set({ projection }),
  setMapReady: (isMapReady) => set({ isMapReady }),
  setTopoSource: (topoSource) => set({ topoSource }),
  setOverlayPistes: (overlayPistes) => set({ overlayPistes }),
  setOverlaySkiTouring: (overlaySkiTouring) => set({ overlaySkiTouring }),
  setOverlaySnowshoe: (overlaySnowshoe) => set({ overlaySnowshoe }),
  setSentinelYear: (sentinelYear) => set({ sentinelYear }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
}))
