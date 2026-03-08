import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

interface MapControlsProps {
  map: mapboxgl.Map | null
}

/**
 * Attaches Mapbox GL built-in controls to the map instance.
 * - NavigationControl: zoom + compass (top-right)
 * - GeolocateControl: locate user (top-right, below nav)
 * - ScaleControl: metric scale bar (bottom-left)
 */
export default function MapControls({ map }: MapControlsProps) {
  const controlsAdded = useRef(false)

  useEffect(() => {
    if (!map || controlsAdded.current) return
    controlsAdded.current = true

    const nav = new mapboxgl.NavigationControl({ visualizePitch: true })
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    })
    const scale = new mapboxgl.ScaleControl({ unit: 'metric' })

    map.addControl(nav, 'top-right')
    map.addControl(geolocate, 'top-right')
    map.addControl(scale, 'bottom-left')

    return () => {
      map.removeControl(nav)
      map.removeControl(geolocate)
      map.removeControl(scale)
      controlsAdded.current = false
    }
  }, [map])

  return null // controls are imperative, no DOM output
}
