import { useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import { findTopoSourceForPoint } from '@mtamta/map-core'
import { useMapStore } from '../stores/mapStore'

/**
 * Auto-selects the topo source based on the map viewport center.
 * Disabled when the user has manually selected a source (topoSourceManual).
 * Runs on moveend and once on initial load — not on state transitions,
 * so that selectBasemap() can clear the topo without auto-detect
 * immediately re-applying it.
 */
export function useTopoAutoSelect(map: mapboxgl.Map | null): void {
  useEffect(() => {
    if (!map) return

    const handler = () => {
      const { topoSourceManual, setTopoSource } = useMapStore.getState()
      if (topoSourceManual) return

      const center = map.getCenter()
      const source = findTopoSourceForPoint(center.lng, center.lat)
      setTopoSource(source)
    }

    // Run once immediately for initial viewport
    if (map.isStyleLoaded()) {
      handler()
    }

    map.on('moveend', handler)
    return () => {
      map.off('moveend', handler)
    }
  }, [map])
}
