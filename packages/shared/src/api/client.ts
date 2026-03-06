import type { TokenStorage } from '../storage/tokens'
import type { ApiError } from '../types/auth'

export interface ApiClientOptions {
  baseURL: string
  tokenStorage: TokenStorage
  // Called after a 401 to attempt a silent refresh.
  // Return the new access token on success, null on failure.
  onRefresh: () => Promise<string | null>
  // Called when refresh fails — e.g. redirect to login.
  onAuthFailure: () => void
}

export interface ApiClient {
  get: <T>(path: string) => Promise<T>
  post: <T>(path: string, body?: unknown) => Promise<T>
  patch: <T>(path: string, body?: unknown) => Promise<T>
  del: (path: string) => Promise<void>
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    isRetry = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const token = opts.tokenStorage.getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${opts.baseURL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : null,
    })

    if (res.status === 401 && !isRetry) {
      const newToken = await opts.onRefresh()
      if (newToken === null) {
        opts.onAuthFailure()
        throw new Error('Unauthorized')
      }
      opts.tokenStorage.setAccessToken(newToken)
      return request<T>(method, path, body, true)
    }

    if (!res.ok) {
      let apiError: ApiError | undefined
      try {
        apiError = (await res.json()) as ApiError
      } catch {
        // ignore parse error
      }
      const message = apiError?.error?.message ?? `HTTP ${res.status}`
      throw Object.assign(new Error(message), { status: res.status, apiError })
    }

    if (res.status === 204) {
      return undefined as unknown as T
    }

    return res.json() as Promise<T>
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del: (path: string) => request<void>('DELETE', path),
  }
}
