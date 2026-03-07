import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApiClient } from './client'
import { createInMemoryTokenStorage } from '../storage/tokens'
import type { ApiClientOptions } from './client'

function makeClient(overrides?: Partial<ApiClientOptions>) {
  const tokenStorage = createInMemoryTokenStorage()
  const onRefresh = vi.fn<() => Promise<string | null>>()
  const onAuthFailure = vi.fn<() => void>()
  const client = createApiClient({
    baseURL: 'http://api.test',
    tokenStorage,
    onRefresh,
    onAuthFailure,
    ...overrides,
  })
  return { client, tokenStorage, onRefresh, onAuthFailure }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('createApiClient', () => {
  it('returns data on successful request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: '123', name: 'Test' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { client, onRefresh } = makeClient()
    const result = await client.get<{ id: string; name: string }>('/users/me')

    expect(result).toEqual({ id: '123', name: 'Test' })
    expect(onRefresh).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 401 when refresh succeeds', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '456' }),
      })
    vi.stubGlobal('fetch', mockFetch)

    const { client, onRefresh, tokenStorage } = makeClient()
    onRefresh.mockResolvedValue('new-access-token')

    const result = await client.get<{ id: string }>('/users/me')

    expect(result).toEqual({ id: '456' })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(tokenStorage.getAccessToken()).toBe('new-access-token')
  })

  it('calls onAuthFailure when refresh returns null', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'expired' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { client, onRefresh, onAuthFailure } = makeClient()
    onRefresh.mockResolvedValue(null)

    await expect(client.get('/users/me')).rejects.toThrow('Unauthorized')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onAuthFailure).toHaveBeenCalledTimes(1)
    // No retry — fetch called only once
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does not recurse when retry also returns 401', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED', message: 'still expired' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { client, onRefresh, onAuthFailure: _onAuthFailure } = makeClient()
    onRefresh.mockResolvedValue('new-token')

    await expect(client.get('/users/me')).rejects.toThrow()
    // onRefresh called once (for the original request), NOT again for the retry
    expect(onRefresh).toHaveBeenCalledTimes(1)
    // fetch called exactly twice: original + one retry
    expect(mockFetch).toHaveBeenCalledTimes(2)
    // onAuthFailure should not be called here — the error propagates as a non-401 path
    // Actually the retry IS a 401 but isRetry=true, so it falls through to the !res.ok branch
  })

  it('throws on non-401 error without calling refresh', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'NOT_FOUND', message: 'user not found' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { client, onRefresh } = makeClient()

    await expect(client.get('/users/999')).rejects.toThrow('user not found')
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('propagates network errors without calling refresh', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', mockFetch)

    const { client, onRefresh } = makeClient()

    await expect(client.get('/users/me')).rejects.toThrow('Failed to fetch')
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
