import { createApiClient, createInMemoryTokenStorage } from '@mtamta/shared'

export const tokenStorage = createInMemoryTokenStorage()

type AuthCallbacks = {
  onRefresh: () => Promise<string | null>
  onAuthFailure: () => void
}

let _auth: AuthCallbacks = {
  onRefresh: () => Promise.resolve(null),
  onAuthFailure: () => {},
}

/** Called once by authStore after it is created. Breaks the circular dep. */
export function setAuthCallbacks(cb: AuthCallbacks): void {
  _auth = cb
}

export const apiClient = createApiClient({
  baseURL: import.meta.env.VITE_API_URL,
  tokenStorage,
  onRefresh: () => _auth.onRefresh(),
  onAuthFailure: () => _auth.onAuthFailure(),
})
