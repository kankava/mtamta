import { useMapStore } from '../stores/mapStore'
import MapRuntime from './MapRuntime'
import MapProviderGate from './MapProviderGate'
import Sidebar from './sidebar/Sidebar'

export default function AppLayout() {
  const mapProvider = useMapStore((s) => s.mapProvider)

  return (
    <div className="relative w-full h-full">
      {mapProvider === null ? (
        <MapProviderGate />
      ) : (
        <>
          <MapRuntime />
          <Sidebar />
        </>
      )}
    </div>
  )
}
