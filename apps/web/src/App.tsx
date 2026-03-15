import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from './stores/authStore'

const MapPage = lazy(() => import('./map/MapPage'))

const DEV_USER: import('@mtamta/shared').User | null =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'
    ? {
        id: 'dev-local-user',
        display_name: 'Dev User',
        email: 'dev@localhost',
        avatar_url: null,
        bio: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    : null

export default function App() {
  const { user, isLoading, restoreSession } = useAuthStore()

  useEffect(() => {
    if (DEV_USER) {
      useAuthStore.setState({ user: DEV_USER, isLoading: false })
    } else {
      restoreSession()
    }
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
        <Route
          path="/"
          element={
            <Suspense fallback={<div style={centeredStyle}>Loading map…</div>}>
              <MapPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

function LoginScreen() {
  const { signInWithGoogle, error } = useAuthStore()

  return (
    <div style={centeredStyle}>
      <h1 style={{ marginBottom: '24px' }}>mtamta</h1>
      {error && <p style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</p>}
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
