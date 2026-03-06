import type { User } from './user'

// access_token matches Go JSON tags (snake_case).
// refresh_token is NOT in this response — it is set as an HttpOnly cookie by
// the server and never exposed to JavaScript on web. Mobile reads it from
// the response body via a separate mobile-specific endpoint in Phase 9.
// Returned by POST /api/v1/auth/google and /apple.
export interface AuthResponse {
  access_token: string
  user: User
}

// Returned by POST /api/v1/auth/refresh — access token only, no user.
// The client already has the user in memory; re-fetching on every silent
// renewal would add an unnecessary DB read.
export interface RefreshResponse {
  access_token: string
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}
