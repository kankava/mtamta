import { describe, it, expect, vi, beforeEach } from 'vitest'

// Reset modules between tests to get a fresh store
beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('authStore', () => {
  it('refresh() calls fetch with POST and credentials:include', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-token-123' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { useAuthStore } = await import('./authStore')
    const { tokenStorage } = await import('../lib/api')

    const result = await useAuthStore.getState().refresh()

    expect(result).toBe('new-token-123')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const call = mockFetch.mock.calls[0]!
    expect(call[0]).toContain('/api/v1/auth/refresh')
    expect(call[1].method).toBe('POST')
    expect(call[1].credentials).toBe('include')
    expect(tokenStorage.getAccessToken()).toBe('new-token-123')
  })

  it('restoreSession() fetches user on success', async () => {
    const mockUser = {
      id: 'user-1',
      display_name: 'Test User',
      email: 'test@example.com',
      avatar_url: null,
      bio: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    // First call is refresh (raw fetch), second is apiClient.get which also uses fetch
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'restored-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockUser),
      })
    vi.stubGlobal('fetch', mockFetch)

    const { useAuthStore } = await import('./authStore')

    await useAuthStore.getState().restoreSession()

    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.isLoading).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('restoreSession() stays logged out on 401', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { useAuthStore } = await import('./authStore')

    await useAuthStore.getState().restoreSession()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isLoading).toBe(false)
    // Only one fetch (the refresh attempt), no further requests
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('signOut() calls logout endpoint and clears state', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { useAuthStore } = await import('./authStore')
    const { tokenStorage } = await import('../lib/api')

    // Set some initial state
    tokenStorage.setAccessToken('old-token')

    await useAuthStore.getState().signOut()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(tokenStorage.getAccessToken()).toBeNull()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const call = mockFetch.mock.calls[0]!
    expect(call[0]).toContain('/api/v1/auth/logout')
    expect(call[1].method).toBe('POST')
    expect(call[1].credentials).toBe('include')
  })
})
