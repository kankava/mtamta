import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  resolveStyleUrl,
  TERRAIN_SOURCE_ID,
  TERRAIN_SOURCE,
  SKY_LAYER_ID,
  SKY_LAYER,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@mtamta/map-core'
import { useMapStore } from '../stores/mapStore'
import MapControls from './MapControls'
import { useTopoAutoSelect } from './useTopoAutoSelect'
import { useRasterOverlays } from './useRasterOverlays'

/**
 * Re-add terrain source, terrain exaggeration, sky layer,
 * and all raster overlays after a style swap.
 */
function applyPostStyleLoad(map: mapboxgl.Map) {
  addTerrainSource(map)

  const state = useMapStore.getState()
  if (state.terrainEnabled) {
    map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: state.terrainExaggeration })
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
    setViewport,
    setMapReady,
  } = useMapStore()

  // Track whether the initial style has loaded (to skip redundant setStyle on mount)
  const initialStyleRef = useRef(true)

  // Phase 3 hooks
  useTopoAutoSelect(mapInstance)
  useRasterOverlays(mapInstance)

  // --- Map initialization ---
  useEffect(() => {
    if (mapRef.current) return

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

    // CRITICAL: always clean up — prevents WebGL context leaks.
    return () => {
      setMapReady(false)
      setMapInstance(null)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Style switching (base layer or season change) ---
  useEffect(() => {
    // Skip on initial render — the map constructor already set the style.
    if (initialStyleRef.current) {
      initialStyleRef.current = false
      return
    }

    const map = mapRef.current
    if (!map) return

    const newStyle = resolveStyleUrl(baseLayer, season)
    map.setStyle(newStyle, { diff: false } as Parameters<typeof map.setStyle>[1])

    // After style replacement, all sources/layers are gone.
    map.once('style.load', () => {
      applyPostStyleLoad(map)
    })
  }, [baseLayer, season])

  // --- Terrain toggle ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (terrainEnabled) {
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: terrainExaggeration })
      if (!map.getLayer(SKY_LAYER_ID)) {
        map.addLayer(SKY_LAYER as mapboxgl.LayerSpecification)
      }
    } else {
      map.setTerrain(null)
      if (map.getLayer(SKY_LAYER_ID)) {
        map.removeLayer(SKY_LAYER_ID)
      }
    }
  }, [terrainEnabled, terrainExaggeration])

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
