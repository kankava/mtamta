import MapContainer from './MapContainer'
import Sidebar from './sidebar/Sidebar'

export default function AppLayout() {
  return (
    <div className="relative w-full h-full">
      <MapContainer />
      <Sidebar />
    </div>
  )
}
