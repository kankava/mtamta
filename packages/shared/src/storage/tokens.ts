// Access token storage interface — implemented differently per platform.
// Web: access token lives only in memory (Zustand state). The refresh token
//      is in an HttpOnly cookie managed by the browser — JS never touches it.
// Mobile (Phase 9): both tokens stored in Keychain/Keystore via
//      react-native-keychain or expo-secure-store.
export interface TokenStorage {
  getAccessToken: () => string | null
  setAccessToken: (t: string) => void
  clear: () => void
}

// Web implementation — in-memory only. Access token is lost on page refresh
// and silently restored by calling POST /api/v1/auth/refresh on app mount
// (the HttpOnly refresh cookie is sent automatically by the browser).
export function createInMemoryTokenStorage(): TokenStorage {
  let accessToken: string | null = null
  return {
    getAccessToken: () => accessToken,
    setAccessToken: (t) => {
      accessToken = t
    },
    clear: () => {
      accessToken = null
    },
  }
}
