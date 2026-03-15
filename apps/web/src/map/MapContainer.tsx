import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  resolveStyleUrl,
  TERRAIN_SOURCE_ID,
  TERRAIN_SOURCE,
  DEFAULT_TERRAIN_EXAGGERATION,
  SKY_LAYER_ID,
  SKY_LAYER,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@mtamta/map-core'
import { useMapStore } from '../stores/mapStore'
import MapControls from './MapControls'
import { useRasterOverlays } from './useRasterOverlays'

/**
 * Re-add terrain source, terrain exaggeration, sky layer,
 * and all raster overlays after a style swap.
 */
function applyPostStyleLoad(map: mapboxgl.Map) {
  addTerrainSource(map)

  const state = useMapStore.getState()
  if (state.terrainEnabled) {
    const exaggeration = state.customExaggeration
      ? state.terrainExaggeration
      : DEFAULT_TERRAIN_EXAGGERATION
    map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration })
    if (!map.getLayer(SKY_LAYER_ID)) {
      map.addLayer(SKY_LAYER as mapboxgl.LayerSpecification)
    }
  }

  // Raster overlays are handled by useRasterOverlays' own style.load listener.
}

export default function MapContainer() {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // useState (not useRef) for the map instance passed to children —
  // children need a re-render when the map becomes available.
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)

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

  // Track whether the initial style has loaded (to skip redundant setStyle on mount)
  const initialStyleRef = useRef(true)

  // Phase 3 hooks
  useRasterOverlays(mapInstance)

  // --- Map initialization ---
  useEffect(() => {
    // React Strict Mode (dev) fires mount → unmount → mount.
    // Reuse the existing map on remount — Firefox can't recover a
    // WebGL context after map.remove().
    if (mapRef.current) {
      const map = mapRef.current
      setMapInstance(map)
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
      applyPostStyleLoad(map)
      setMapReady(true)
      setMapInstance(map)
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

    // Reset state on unmount but keep map alive — mapRef.current is
    // intentionally NOT cleared so the Strict Mode remount path above
    // can reuse it. On real unmount (route change), the DOM container
    // is removed and the browser reclaims WebGL resources on navigation.
    return () => {
      setMapReady(false)
      setMapInstance(null)
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

    // After style replacement, all sources/layers are gone.
    map.once('style.load', () => {
      applyPostStyleLoad(map)
    })
  }, [baseLayer, season])

  // --- Terrain exaggeration sync (toggle handled by TerrainControl) ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || !terrainEnabled) return

    const exaggeration = customExaggeration
      ? terrainExaggeration
      : DEFAULT_TERRAIN_EXAGGERATION
    map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration })
  }, [terrainEnabled, terrainExaggeration, customExaggeration])

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

function addTerrainSource(map: mapboxgl.Map) {
  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, TERRAIN_SOURCE)
  }
}
