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
  topoSourceManual: boolean
  topoSource: TopoSourceId | null
}

const BASEMAP_PRESETS: Record<BasemapPreset, BasemapConfig> = {
  'outdoors-summer': {
    baseLayer: 'outdoors',
    season: 'summer',
    topoSourceManual: false,
    topoSource: null,
  },
  'outdoors-winter': {
    baseLayer: 'outdoors',
    season: 'winter',
    topoSourceManual: false,
    topoSource: null,
  },
  'satellite-summer': {
    baseLayer: 'satellite',
    season: 'summer',
    topoSourceManual: false,
    topoSource: null,
  },
  'satellite-winter': {
    baseLayer: 'satellite',
    season: 'winter',
    topoSourceManual: false,
    topoSource: null,
  },
  swisstopo: {
    baseLayer: 'outdoors',
    season: 'summer',
    topoSourceManual: true,
    topoSource: 'swisstopo',
  },
  'swisstopo-winter': {
    baseLayer: 'outdoors',
    season: 'winter',
    topoSourceManual: true,
    topoSource: 'swisstopo',
  },
  ign: { baseLayer: 'outdoors', season: 'summer', topoSourceManual: true, topoSource: 'ign' },
  'basemap-at': {
    baseLayer: 'outdoors',
    season: 'summer',
    topoSourceManual: true,
    topoSource: 'basemap-at',
  },
  bkg: { baseLayer: 'outdoors', season: 'summer', topoSourceManual: true, topoSource: 'bkg' },
  kartverket: {
    baseLayer: 'outdoors',
    season: 'summer',
    topoSourceManual: true,
    topoSource: 'kartverket',
  },
  usgs: { baseLayer: 'outdoors', season: 'summer', topoSourceManual: true, topoSource: 'usgs' },
}

export { BASEMAP_PRESETS }

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

  // Topo overlay (Phase 3)
  topoSource: TopoSourceId | null
  topoSourceManual: boolean

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
  setMapReady: (ready: boolean) => void
  setTopoSource: (source: TopoSourceId | null, manual?: boolean) => void
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

  baseLayer: 'outdoors',
  season: 'summer',
  terrainEnabled: false,
  terrainExaggeration: DEFAULT_TERRAIN_EXAGGERATION,

  topoSource: null,
  topoSourceManual: false,

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
  setMapReady: (isMapReady) => set({ isMapReady }),
  setTopoSource: (topoSource, manual) =>
    set(manual !== undefined ? { topoSource, topoSourceManual: manual } : { topoSource }),
  setOverlayPistes: (overlayPistes) => set({ overlayPistes }),
  setOverlaySkiTouring: (overlaySkiTouring) => set({ overlaySkiTouring }),
  setOverlaySnowshoe: (overlaySnowshoe) => set({ overlaySnowshoe }),
  setSentinelYear: (sentinelYear) => set({ sentinelYear }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
}))
