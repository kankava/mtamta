import { lazy, Suspense } from 'react'
import { useMapStore } from '../stores/mapStore'
import type { MapProvider } from '@mtamta/map-core'

const MapboxContainer = lazy(() => import('./runtime/mapbox/MapContainer'))
// MapTiler runtime — uncomment in M2:
// const MaptilerContainer = lazy(() => import('./runtime/maptiler/MapContainer'))

function RuntimeForProvider({ provider }: { provider: MapProvider }) {
  switch (provider) {
    case 'mapbox':
      return <MapboxContainer />
    // case 'maptiler':
    //   return <MaptilerContainer />
    default:
      return null
  }
}

export default function MapRuntime() {
  const mapProvider = useMapStore((s) => s.mapProvider)

  if (!mapProvider) return null

  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1a]">
          <div className="text-white/40 text-sm">Loading map...</div>
        </div>
      }
    >
      <RuntimeForProvider provider={mapProvider} />
    </Suspense>
  )
}
