import { useEffect } from 'react'
import { getTopoSource, resolveTopoTileUrl, OVERLAY_SOURCES } from '@mtamta/map-core'
import { useMapStore } from '../../../stores/mapStore'
import type { AppMapAdapter } from './mapAdapter'

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

/** Slot for raster overlays — above roads, below labels (Mapbox Standard). */
const RASTER_SLOT = 'middle'

/** Remove a source+layer pair safely */
function removeSourceAndLayer(adapter: AppMapAdapter, layerId: string, sourceId: string) {
  if (adapter.getLayer(layerId)) adapter.removeLayer(layerId)
  if (adapter.getSource(sourceId)) adapter.removeSource(sourceId)
}

/** Add a raster tile source + layer */
function addRasterLayer(
  adapter: AppMapAdapter,
  sourceId: string,
  layerId: string,
  tileUrl: string,
  opts: {
    tileSize: number
    maxZoom: number
    opacity: number
    attribution: string
    bounds?: [number, number, number, number]
  },
) {
  if (!adapter.getSource(sourceId)) {
    adapter.addSource(sourceId, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: opts.tileSize,
      maxzoom: opts.maxZoom,
      attribution: opts.attribution,
      ...(opts.bounds && { bounds: opts.bounds }),
    })
  }

  if (!adapter.getLayer(layerId)) {
    adapter.addLayer(
      {
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': opts.opacity },
      },
      { slot: RASTER_SLOT },
    )
  }
}

/** Apply topo overlay based on current store state */
function applyTopoOverlay(adapter: AppMapAdapter) {
  const { topoSource, baseLayer, season } = useMapStore.getState()

  // Remove existing topo layer
  removeSourceAndLayer(adapter, TOPO_RASTER_LAYER, TOPO_RASTER_SOURCE)

  // Only show topo when outdoors base layer is active
  if (baseLayer !== 'outdoors' || !topoSource) return

  const sourceDef = getTopoSource(topoSource)
  if (!sourceDef) return

  const tileUrl = resolveTopoTileUrl(sourceDef, season, API_BASE_URL)
  addRasterLayer(adapter, TOPO_RASTER_SOURCE, TOPO_RASTER_LAYER, tileUrl, {
    tileSize: sourceDef.tileSize,
    maxZoom: sourceDef.maxZoom,
    opacity: 1,
    attribution: sourceDef.attribution,
    bounds: sourceDef.tileBounds ?? sourceDef.bbox,
  })
}

/** Apply overlay layers (pistes, ski touring, snowshoe) */
function applyOverlays(adapter: AppMapAdapter) {
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

    removeSourceAndLayer(adapter, lyrId, srcId)

    if (shouldShow) {
      addRasterLayer(adapter, srcId, lyrId, overlay.tileUrl, {
        tileSize: overlay.tileSize,
        maxZoom: overlay.maxZoom,
        opacity: 1,
        attribution: overlay.attribution,
      })
    }
  }
}

/** Apply sentinel seasonal satellite overlay (disabled until Sentinel Hub is configured) */
function applySentinel(adapter: AppMapAdapter) {
  // Always clean up in case it was previously active
  removeSourceAndLayer(adapter, SENTINEL_LAYER, SENTINEL_SOURCE)

  // Sentinel overlay adds seasonal/historical satellite imagery on top of
  // the Mapbox satellite base. Disabled until Sentinel Hub backend env vars
  // are configured and the UI year selector is re-enabled.
  // TODO: gate on /api/v1/capabilities endpoint (capability-aware cards)
}

/**
 * Re-apply all raster overlays. Called after style.load or state changes.
 */
export function applyAllRasterOverlays(adapter: AppMapAdapter): void {
  applyTopoOverlay(adapter)
  applyOverlays(adapter)
  applySentinel(adapter)
}

/**
 * Run a raster-overlay apply, swallowing the transient error mapbox-gl throws
 * if a source/layer op runs mid style-swap (a setStyle in flight) — that case
 * is recovered by the style.load handler in useRasterOverlays.
 *
 * `isStyleLoaded()` is deliberately NOT used as a guard: it returns false
 * whenever ANY source still has tiles loading (including right after an
 * overlay is added), so guarding on it would wrongly defer a following toggle
 * to a style.load that never comes.
 */
function safeApply(apply: () => void): void {
  try {
    apply()
  } catch {
    // Style mid-swap — the style.load handler re-applies once it settles.
  }
}

/**
 * Hook that manages all raster overlay sources/layers on the map.
 * Reacts to store state changes and re-applies layers as needed.
 * Takes an AppMapAdapter instead of a vendor-specific map instance.
 */
export function useRasterOverlays(adapter: AppMapAdapter | null): void {
  const topoSource = useMapStore((s) => s.topoSource)
  const baseLayer = useMapStore((s) => s.baseLayer)
  const season = useMapStore((s) => s.season)
  const overlayPistes = useMapStore((s) => s.overlayPistes)
  const overlaySkiTouring = useMapStore((s) => s.overlaySkiTouring)
  const overlaySnowshoe = useMapStore((s) => s.overlaySnowshoe)
  const sentinelYear = useMapStore((s) => s.sentinelYear)

  // Basemap / season changes — rebuild the topo raster and the overlays.
  useEffect(() => {
    if (adapter) safeApply(() => applyAllRasterOverlays(adapter))
  }, [adapter, topoSource, baseLayer, season, sentinelYear])

  // Overlay toggles — re-apply only the overlay layers. The topo raster is
  // left untouched, so toggling an overlay doesn't re-fetch the basemap.
  useEffect(() => {
    if (adapter) safeApply(() => applyOverlays(adapter))
  }, [adapter, overlayPistes, overlaySkiTouring, overlaySnowshoe])

  // Re-apply everything after a style swap — recovers anything a mid-swap
  // apply above had to skip.
  useEffect(() => {
    if (!adapter) return
    const handler = () => applyAllRasterOverlays(adapter)
    adapter.onStyleLoad(handler)
    return () => {
      adapter.offStyleLoad(handler)
    }
  }, [adapter])
}
