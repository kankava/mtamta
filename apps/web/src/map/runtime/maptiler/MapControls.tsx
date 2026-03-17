import { useEffect, useRef } from 'react'
import type { Map as MaptilerMap } from '@maptiler/sdk'
import { NavigationControl, GeolocateControl, ScaleControl } from '@maptiler/sdk'
import { TerrainControl } from './terrain'

interface MapControlsProps {
  map: MaptilerMap | null
}

/**
 * Attaches MapTiler SDK built-in controls to the map instance.
 * Same layout as Mapbox: nav + terrain (bottom-right), geolocate (bottom-right), scale (bottom-left).
 */
export default function MapControls({ map }: MapControlsProps) {
  const controlsAdded = useRef(false)

  useEffect(() => {
    if (!map || controlsAdded.current) return
    controlsAdded.current = true

    const nav = new NavigationControl({ visualizePitch: true })
    const terrain = new TerrainControl()
    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    })
    const scale = new ScaleControl({ unit: 'metric' })

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

  return null
}
