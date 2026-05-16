import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { resolveStyleUrl, MIN_ZOOM, MAX_ZOOM } from '@mtamta/map-core'
import { useMapStore } from '../../../stores/mapStore'
import MapControls from './MapControls'
import { useRasterOverlays } from '../shared/rasterOverlays'
import type { AppMapAdapter } from '../shared/mapAdapter'

/**
 * Creates an AppMapAdapter wrapping a mapboxgl.Map instance.
 * Shared code (raster overlays, trip routes) uses this instead of raw SDK.
 */
export function createMapboxAdapter(map: mapboxgl.Map): AppMapAdapter {
  // Identity-based tracking: original cb → wrapped handler, keyed per layer.
  const clickHandlers = new Map<string, WeakMap<object, (...args: unknown[]) => void>>()

  return {
    isStyleLoaded: () => map.isStyleLoaded(),
    getSource: (id) => map.getSource(id),
    addSource: (id, source) => map.addSource(id, source as mapboxgl.SourceSpecification),
    removeSource: (id) => map.removeSource(id),
    getLayer: (id) => map.getLayer(id),
    // Mapbox Standard places custom layers via the `slot` property on the spec.
    addLayer: (layer, opts) =>
      map.addLayer(
        (opts?.slot
          ? { ...(layer as object), slot: opts.slot }
          : layer) as mapboxgl.LayerSpecification,
      ),
    removeLayer: (id) => map.removeLayer(id),
    getBounds: () => {
      const b = map.getBounds()!
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    },
    getZoom: () => map.getZoom(),
    flyTo: (center, zoom) => map.flyTo({ center, ...(zoom != null && { zoom }) }),
    onStyleLoad: (cb) => map.on('style.load', cb),
    offStyleLoad: (cb) => map.off('style.load', cb),
    onMoveEnd: (cb) => map.on('moveend', cb),
    offMoveEnd: (cb) => map.off('moveend', cb),
    onClick: (layerId, cb) => {
      const wrapper = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] }) => {
        const event: { lngLat: [number, number]; features?: unknown[] } = {
          lngLat: [e.lngLat.lng, e.lngLat.lat],
        }
        if (e.features) event.features = e.features as unknown[]
        cb(event)
      }
      let layerMap = clickHandlers.get(layerId)
      if (!layerMap) {
        layerMap = new WeakMap()
        clickHandlers.set(layerId, layerMap)
      }
      layerMap.set(cb, wrapper as (...args: unknown[]) => void)
      map.on('click', layerId, wrapper)
    },
    offClick: (layerId, cb) => {
      const layerMap = clickHandlers.get(layerId)
      const wrapper = layerMap?.get(cb)
      if (wrapper) {
        map.off('click', layerId, wrapper)
        layerMap!.delete(cb)
      }
    },
  }
}

export default function MapContainer() {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // useState (not useRef) for the map instance passed to children —
  // children need a re-render when the map becomes available.
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)

  // Adapter for shared overlay code
  const [adapter, setAdapter] = useState<AppMapAdapter | null>(null)

  const { center, zoom, pitch, bearing, baseLayer, season, projection, setViewport, setMapReady } =
    useMapStore()

  // Track whether the initial style has loaded (to skip redundant setStyle on mount)
  const initialStyleRef = useRef(true)

  // Phase 3 hooks — now use adapter instead of raw map
  useRasterOverlays(adapter)

  // --- Map initialization ---
  useEffect(() => {
    // Strict Mode remount: map exists and wasn't removed — reuse it.
    // Cancel any pending deferred removal from the previous unmount.
    if (mapRef.current) {
      if (cleanupTimerRef.current !== null) {
        clearTimeout(cleanupTimerRef.current)
        cleanupTimerRef.current = null
      }
      const map = mapRef.current
      setMapInstance(map)
      setAdapter(createMapboxAdapter(map))
      if (map.isStyleLoaded()) {
        setMapReady(true)
      } else {
        map.once('load', () => setMapReady(true))
      }
      return
    }

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
    if (!token?.startsWith('pk.')) {
      throw new Error(
        'VITE_MAPBOX_ACCESS_TOKEN must be a public token (pk.*). ' +
          'Never use a secret token (sk.*) in client-side code.',
      )
    }

    const map = new mapboxgl.Map({
      accessToken: token,
      container: containerRef.current!,
      style: resolveStyleUrl(baseLayer, season),
      projection,
      center,
      zoom,
      pitch,
      bearing,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    })

    mapRef.current = map

    map.on('load', () => {
      setMapReady(true)
      setMapInstance(map)
      setAdapter(createMapboxAdapter(map))
    })

    // Sync viewport back to store on moveend (not on every move — too noisy).
    map.on('moveend', () => {
      const c = map.getCenter()
      setViewport({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      })
    })

    // Deferred cleanup: schedule map.remove() via setTimeout(0).
    // Strict Mode remount is synchronous — the next mount effect runs
    // before this timer fires and cancels it. A real unmount (provider
    // switch, route change) has no subsequent mount, so the timer
    // executes and releases the WebGL context.
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

  // --- Style switching (base layer or season change) ---
  const prevStyleRef = useRef<string | null>(null)
  useEffect(() => {
    // Skip on initial render — the map constructor already set the style.
    if (initialStyleRef.current) {
      initialStyleRef.current = false
      prevStyleRef.current = resolveStyleUrl(baseLayer, season)
      return
    }

    const map = mapRef.current
    if (!map) return

    const newStyle = resolveStyleUrl(baseLayer, season)

    // Skip if resolved URL hasn't changed (e.g. season toggle within same base layer)
    if (newStyle === prevStyleRef.current) return
    prevStyleRef.current = newStyle

    map.setStyle(newStyle, { diff: false } as Parameters<typeof map.setStyle>[1])
    // Standard owns terrain; raster overlays re-add themselves via
    // useRasterOverlays' own style.load listener.
  }, [baseLayer, season])

  // --- Projection toggle ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setProjection(projection)
  }, [projection])

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <MapControls map={mapInstance} />
    </>
  )
}
