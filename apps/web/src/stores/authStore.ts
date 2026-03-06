import { create } from 'zustand'
import type { User, AuthResponse } from '@mtamta/shared'
import { tokenStorage, apiClient, setAuthCallbacks } from '../lib/api'

interface AuthStore {
  user: User | null
  isLoading: boolean
  refresh: () => Promise<string | null>
  signInWithGoogle: (idToken: string) => Promise<void>
  signOut: () => Promise<void>
  restoreSession: () => Promise<void>
}

const API_URL = import.meta.env.VITE_API_URL

// Dedup concurrent refresh calls — if a refresh is in-flight, return the
// same promise instead of issuing a second POST.
let refreshPromise: Promise<string | null> | null = null

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,

  refresh(): Promise<string | null> {
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) return null
        const { access_token } = (await res.json()) as { access_token: string }
        tokenStorage.setAccessToken(access_token)
        return access_token
      } catch {
        return null
      } finally {
        refreshPromise = null
      }
    })()

    return refreshPromise
  },

  async signInWithGoogle(idToken: string): Promise<void> {
    const data = await apiClient.post<AuthResponse>('/api/v1/auth/google', {
      id_token: idToken,
    })
    tokenStorage.setAccessToken(data.access_token)
    set({ user: data.user })
  },

  async signOut(): Promise<void> {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // ignore — clear local state regardless
    }
    tokenStorage.clear()
    set({ user: null })
  },

  async restoreSession(): Promise<void> {
    set({ isLoading: true })
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        set({ user: null, isLoading: false })
        return
      }
      const { access_token } = (await res.json()) as { access_token: string }
      tokenStorage.setAccessToken(access_token)

      const user = await apiClient.get<User>('/api/v1/users/me')
      set({ user, isLoading: false })
    } catch {
      set({ user: null, isLoading: false })
    }
  },
}))

// Wire auth callbacks to break circular dependency.
setAuthCallbacks({
  onRefresh: () => useAuthStore.getState().refresh(),
  onAuthFailure: () => useAuthStore.getState().signOut(),
})
