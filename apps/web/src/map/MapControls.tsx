import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { TerrainControl } from './TerrainControl'

interface MapControlsProps {
  map: mapboxgl.Map | null
}

/**
 * Attaches Mapbox GL built-in controls to the map instance.
 * - NavigationControl: zoom + compass (bottom-right)
 * - TerrainControl: 2D/3D toggle (bottom-right)
 * - GeolocateControl: locate user (bottom-right)
 * - ScaleControl: metric scale bar (bottom-left)
 */
export default function MapControls({ map }: MapControlsProps) {
  const controlsAdded = useRef(false)

  useEffect(() => {
    if (!map || controlsAdded.current) return
    controlsAdded.current = true

    const nav = new mapboxgl.NavigationControl({ visualizePitch: true })
    const terrain = new TerrainControl()
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    })
    const scale = new mapboxgl.ScaleControl({ unit: 'metric' })

    map.addControl(nav, 'bottom-right')
    map.addControl(terrain, 'bottom-right')
    map.addControl(geolocate, 'bottom-right')
    map.addControl(scale, 'bottom-left')

    return () => {
      map.removeControl(nav)
      map.removeControl(terrain)
      map.removeControl(geolocate)
      map.removeControl(scale)
      controlsAdded.current = false
    }
  }, [map])

  return null // controls are imperative, no DOM output
}
