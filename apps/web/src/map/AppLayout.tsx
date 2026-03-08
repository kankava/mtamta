import MapContainer from './MapContainer'
import LayerPanel from './LayerPanel'
import StyleSwitcher from './StyleSwitcher'
import { useAuthStore } from '../stores/authStore'

export default function AppLayout() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer />
      <StyleSwitcher />
      <LayerPanel />
      <NavBar />
    </div>
  )
}

function NavBar() {
  const { user, signOut } = useAuthStore()

  if (!user) return null

  return (
    <div style={navStyle}>
      <span style={{ fontSize: '14px' }}>{user.display_name}</span>
      <button onClick={() => signOut()} style={signOutStyle}>
        Sign out
      </button>
    </div>
  )
}

// top-left to avoid collision with Mapbox NavigationControl + GeolocateControl (top-right)
const navStyle: React.CSSProperties = {
  position: 'absolute',
  top: '10px',
  left: '10px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  background: 'white',
  borderRadius: '8px',
  padding: '8px 12px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  zIndex: 2,
}

const signOutStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #ddd',
  borderRadius: '4px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '12px',
}
