import { useEffect, useRef, useState } from 'react'
import { Map as MaptilerMap, config as maptilerConfig } from '@maptiler/sdk'
import type { MapOptions, StyleSpecification } from '@maptiler/sdk'
import '@maptiler/sdk/dist/maptiler-sdk.css'
import {
  MAPTILER_STYLE_IDS,
  DEFAULT_TERRAIN_EXAGGERATION,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@mtamta/map-core'
import { useMapStore } from '../../../stores/mapStore'
import MapControls from './MapControls'
import { useRasterOverlays } from '../shared/rasterOverlays'
import type { AppMapAdapter } from '../shared/mapAdapter'

/**
 * Creates an AppMapAdapter wrapping a MapTiler SDK Map instance.
 */
export function createMaptilerAdapter(map: MaptilerMap): AppMapAdapter {
  const clickHandlers = new Map<string, WeakMap<object, (...args: unknown[]) => void>>()

  const m = map as any

  return {
    isStyleLoaded: () => !!map.isStyleLoaded(),
    getStyleLayers: () => {
      const layers = map.getStyle()?.layers
      if (!layers) return []
      return layers.map((l) => ({ id: l.id, type: l.type }))
    },
    getSource: (id) => map.getSource(id),
    addSource: (id, source) => map.addSource(id, source as Parameters<typeof map.addSource>[1]),
    removeSource: (id) => map.removeSource(id),
    getLayer: (id) => map.getLayer(id),
    addLayer: (layer, beforeId) =>
      map.addLayer(layer as Parameters<typeof map.addLayer>[0], beforeId),
    removeLayer: (id) => map.removeLayer(id),
    getBounds: () => {
      const b = map.getBounds()
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    },
    getZoom: () => map.getZoom(),
    flyTo: (center, zoom) => map.flyTo({ center, ...(zoom != null && { zoom }) }),
    onStyleLoad: (cb) => { map.on('style.load', cb) },
    offStyleLoad: (cb) => { map.off('style.load', cb) },
    onMoveEnd: (cb) => { map.on('moveend', cb) },
    offMoveEnd: (cb) => { map.off('moveend', cb) },
    onClick: (layerId, cb) => {
      const wrapper = (e: { lngLat: { lng: number; lat: number }; features?: unknown[] }) => {
        const event: { lngLat: [number, number]; features?: unknown[] } = {
          lngLat: [e.lngLat.lng, e.lngLat.lat],
        }
        if (e.features) event.features = e.features
        cb(event)
      }
      let layerMap = clickHandlers.get(layerId)
      if (!layerMap) {
        layerMap = new WeakMap()
        clickHandlers.set(layerId, layerMap)
      }
      layerMap.set(cb, wrapper as (...args: unknown[]) => void)
      // MapTiler SDK layer-click overload requires cast
      m.on('click', layerId, wrapper)
    },
    offClick: (layerId, cb) => {
      const layerMap = clickHandlers.get(layerId)
      const wrapper = layerMap?.get(cb)
      if (wrapper) {
        m.off('click', layerId, wrapper)
        layerMap!.delete(cb)
      }
    },
  }
}

function resolveStyle(baseLayer: string): string {
  return MAPTILER_STYLE_IDS[baseLayer as keyof typeof MAPTILER_STYLE_IDS] ?? 'outdoor-v2'
}

/**
 * Re-apply terrain after a style swap.
 */
function applyPostStyleLoad(map: MaptilerMap) {
  const state = useMapStore.getState()
  if (state.terrainEnabled) {
    const exaggeration = state.customExaggeration
      ? state.terrainExaggeration
      : DEFAULT_TERRAIN_EXAGGERATION
    map.enableTerrain(exaggeration)
  }
}

export default function MapContainer() {
  const mapRef = useRef<MaptilerMap | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mapInstance, setMapInstance] = useState<MaptilerMap | null>(null)
  const [adapter, setAdapter] = useState<AppMapAdapter | null>(null)

  const {
    center,
    zoom,
    pitch,
    bearing,
    baseLayer,
    season,
    terrainEnabled,
    terrainExaggeration,
    customExaggeration,
    projection,
    setViewport,
    setMapReady,
  } = useMapStore()

  const initialStyleRef = useRef(true)

  useRasterOverlays(adapter)

  // --- Map initialization ---
  useEffect(() => {
    // Strict Mode remount: reuse existing map
    if (mapRef.current) {
      if (cleanupTimerRef.current !== null) {
        clearTimeout(cleanupTimerRef.current)
        cleanupTimerRef.current = null
      }
      const map = mapRef.current
      setMapInstance(map)
      setAdapter(createMaptilerAdapter(map))
      if (map.isStyleLoaded()) {
        setMapReady(true)
      } else {
        map.once('load', () => setMapReady(true))
      }
      return
    }

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY
    if (!apiKey) {
      throw new Error('VITE_MAPTILER_API_KEY is required for MapTiler runtime.')
    }

    maptilerConfig.apiKey = apiKey

    const map = new MaptilerMap({
      container: containerRef.current!,
      style: resolveStyle(baseLayer) as MapOptions['style'],
      center,
      zoom,
      pitch,
      bearing,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    } as MapOptions)

    mapRef.current = map

    map.on('load', () => {
      map.setProjection(projection as 'mercator' | 'globe')
      applyPostStyleLoad(map)
      setMapReady(true)
      setMapInstance(map)
      setAdapter(createMaptilerAdapter(map))
    })

    map.on('moveend', () => {
      const c = map.getCenter()
      setViewport({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      })
    })

    // Deferred cleanup — same pattern as Mapbox runtime
    return () => {
      setMapReady(false)
      setMapInstance(null)
      setAdapter(null)
      cleanupTimerRef.current = setTimeout(() => {
        map.remove()
        mapRef.current = null
        cleanupTimerRef.current = null
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Style switching ---
  const prevStyleRef = useRef<string | null>(null)
  useEffect(() => {
    if (initialStyleRef.current) {
      initialStyleRef.current = false
      prevStyleRef.current = resolveStyle(baseLayer)
      return
    }

    const map = mapRef.current
    if (!map) return

    const newStyle = resolveStyle(baseLayer)
    if (newStyle === prevStyleRef.current) return
    prevStyleRef.current = newStyle

    map.setStyle(newStyle as string | StyleSpecification, { diff: false })

    map.once('style.load', () => {
      applyPostStyleLoad(map)
    })
  }, [baseLayer, season])

  // --- Terrain sync ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (terrainEnabled) {
      const exaggeration = customExaggeration ? terrainExaggeration : DEFAULT_TERRAIN_EXAGGERATION
      map.enableTerrain(exaggeration)
    } else {
      map.disableTerrain()
    }
  }, [terrainEnabled, terrainExaggeration, customExaggeration])

  // --- Projection toggle ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setProjection(projection as 'mercator' | 'globe')
  }, [projection])

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <MapControls map={mapInstance} />
    </>
  )
}
