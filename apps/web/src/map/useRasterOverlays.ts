import { useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import { getTopoSource, resolveTopoTileUrl, OVERLAY_SOURCES } from '@mtamta/map-core'
import { useMapStore } from '../stores/mapStore'

// Source/layer IDs
const TOPO_RASTER_SOURCE = 'topo-raster-source'
const TOPO_RASTER_LAYER = 'topo-raster-layer'
const SENTINEL_SOURCE = 'sentinel-source'
const SENTINEL_LAYER = 'sentinel-layer'

function overlaySourceId(id: string) {
  return `overlay-${id}-source`
}
function overlayLayerId(id: string) {
  return `overlay-${id}-layer`
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

/** Find the first symbol layer to insert raster layers below labels */
function findFirstSymbolLayer(map: mapboxgl.Map): string | undefined {
  const layers = map.getStyle()?.layers
  if (!layers) return undefined
  for (const layer of layers) {
    if (layer.type === 'symbol') return layer.id
  }
  return undefined
}

/** Remove a source+layer pair safely */
function removeSourceAndLayer(map: mapboxgl.Map, layerId: string, sourceId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId)
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

/** Add a raster tile source + layer */
function addRasterLayer(
  map: mapboxgl.Map,
  sourceId: string,
  layerId: string,
  tileUrl: string,
  opts: { tileSize: number; maxZoom: number; opacity: number; attribution: string },
) {
  const beforeLayer = findFirstSymbolLayer(map)

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: opts.tileSize,
      maxzoom: opts.maxZoom,
      attribution: opts.attribution,
    })
  }

  if (!map.getLayer(layerId)) {
    map.addLayer(
      {
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': opts.opacity },
      },
      beforeLayer,
    )
  }
}

/** Apply topo overlay based on current store state */
function applyTopoOverlay(map: mapboxgl.Map) {
  const { topoSource, topoOpacity, baseLayer, season } = useMapStore.getState()

  // Remove existing topo layer
  removeSourceAndLayer(map, TOPO_RASTER_LAYER, TOPO_RASTER_SOURCE)

  // Only show topo when outdoors base layer is active
  if (baseLayer !== 'outdoors' || !topoSource) return

  const sourceDef = getTopoSource(topoSource)
  if (!sourceDef) return

  const tileUrl = resolveTopoTileUrl(sourceDef, season, API_BASE_URL)
  addRasterLayer(map, TOPO_RASTER_SOURCE, TOPO_RASTER_LAYER, tileUrl, {
    tileSize: sourceDef.tileSize,
    maxZoom: sourceDef.maxZoom,
    opacity: topoOpacity,
    attribution: sourceDef.attribution,
  })
}

/** Apply overlay layers (pistes, ski touring, snowshoe) */
function applyOverlays(map: mapboxgl.Map) {
  const { season, topoSource, overlayPistes, overlaySkiTouring, overlaySnowshoe } =
    useMapStore.getState()

  const overlayStates: Record<string, boolean> = {
    pistes: overlayPistes,
    'ski-touring': overlaySkiTouring,
    snowshoe: overlaySnowshoe,
  }

  for (const overlay of OVERLAY_SOURCES) {
    const srcId = overlaySourceId(overlay.id)
    const lyrId = overlayLayerId(overlay.id)
    const enabled = overlayStates[overlay.id] ?? false

    // Check season/topo filters
    const seasonOk = !overlay.seasonFilter || overlay.seasonFilter === season
    const topoOk = !overlay.topoSourceFilter || overlay.topoSourceFilter === topoSource
    const shouldShow = enabled && seasonOk && topoOk

    removeSourceAndLayer(map, lyrId, srcId)

    if (shouldShow) {
      addRasterLayer(map, srcId, lyrId, overlay.tileUrl, {
        tileSize: overlay.tileSize,
        maxZoom: overlay.maxZoom,
        opacity: 1,
        attribution: overlay.attribution,
      })
    }
  }
}

/** Apply sentinel seasonal satellite */
function applySentinel(map: mapboxgl.Map) {
  const { baseLayer, season, sentinelYear } = useMapStore.getState()

  removeSourceAndLayer(map, SENTINEL_LAYER, SENTINEL_SOURCE)

  // Only show sentinel when satellite base layer is active
  if (baseLayer !== 'satellite') return

  const tileUrl = `${API_BASE_URL}/api/v1/tiles/sentinel/{z}/{x}/{y}?season=${season}&year=${sentinelYear}`

  addRasterLayer(map, SENTINEL_SOURCE, SENTINEL_LAYER, tileUrl, {
    tileSize: 256,
    maxZoom: 14,
    opacity: 1,
    attribution: '&copy; Copernicus Sentinel-2',
  })
}

/**
 * Re-apply all raster overlays. Called after style.load or state changes.
 */
export function applyAllRasterOverlays(map: mapboxgl.Map): void {
  applyTopoOverlay(map)
  applyOverlays(map)
  applySentinel(map)
}

/**
 * Hook that manages all raster overlay sources/layers on the map.
 * Reacts to store state changes and re-applies layers as needed.
 */
export function useRasterOverlays(map: mapboxgl.Map | null): void {
  const topoSource = useMapStore((s) => s.topoSource)
  const topoOpacity = useMapStore((s) => s.topoOpacity)
  const baseLayer = useMapStore((s) => s.baseLayer)
  const season = useMapStore((s) => s.season)
  const overlayPistes = useMapStore((s) => s.overlayPistes)
  const overlaySkiTouring = useMapStore((s) => s.overlaySkiTouring)
  const overlaySnowshoe = useMapStore((s) => s.overlaySnowshoe)
  const sentinelYear = useMapStore((s) => s.sentinelYear)

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return
    applyAllRasterOverlays(map)
  }, [
    map,
    topoSource,
    topoOpacity,
    baseLayer,
    season,
    overlayPistes,
    overlaySkiTouring,
    overlaySnowshoe,
    sentinelYear,
  ])

  // Re-apply on style.load (after style swap)
  useEffect(() => {
    if (!map) return

    const handler = () => applyAllRasterOverlays(map)
    map.on('style.load', handler)
    return () => {
      map.off('style.load', handler)
    }
  }, [map])

  // Handle opacity changes without full re-add
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return
    if (map.getLayer(TOPO_RASTER_LAYER)) {
      map.setPaintProperty(TOPO_RASTER_LAYER, 'raster-opacity', topoOpacity)
    }
  }, [map, topoOpacity])
}
