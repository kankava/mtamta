import { useEffect } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuthStore } from './stores/authStore'

export default function App() {
  const { user, isLoading, signInWithGoogle, signOut, restoreSession } = useAuthStore()

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
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

  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem',
        }}
      >
        <h1>mtamta</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>{user.display_name}</span>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </header>
      <main style={{ padding: '1rem' }}>
        <p>Welcome, {user.display_name}</p>
      </main>
    </div>
  )
}
