import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from './stores/authStore'
import MapPage from './map/MapPage'

export default function App() {
  const { user, isLoading, restoreSession } = useAuthStore()

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  // Loading state — session restoration in progress
  if (isLoading) {
    return (
      <div style={centeredStyle}>
        <p>Loading...</p>
      </div>
    )
  }

  // Not authenticated — show login screen
  if (!user) {
    return <LoginScreen />
  }

  // Authenticated — render the map app
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function LoginScreen() {
  const { signInWithGoogle } = useAuthStore()

  return (
    <div style={centeredStyle}>
      <h1 style={{ marginBottom: '24px' }}>mtamta</h1>
      <GoogleLogin
        onSuccess={(response) => {
          if (response.credential) {
            signInWithGoogle(response.credential)
          }
        }}
        onError={() => {
          console.error('Google Sign-In failed')
        }}
      />
    </div>
  )
}

const centeredStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
}
