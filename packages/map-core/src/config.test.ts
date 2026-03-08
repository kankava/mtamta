import { describe, it, expect } from 'vitest'
import { DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_VIEWPORT, MIN_ZOOM, MAX_ZOOM } from './config'

describe('map config', () => {
  it('DEFAULT_CENTER is [lng, lat] in valid range', () => {
    const [lng, lat] = DEFAULT_CENTER
    expect(lng).toBeGreaterThanOrEqual(-180)
    expect(lng).toBeLessThanOrEqual(180)
    expect(lat).toBeGreaterThanOrEqual(-90)
    expect(lat).toBeLessThanOrEqual(90)
  })

  it('DEFAULT_ZOOM is within allowed bounds', () => {
    expect(DEFAULT_ZOOM).toBeGreaterThanOrEqual(MIN_ZOOM)
    expect(DEFAULT_ZOOM).toBeLessThanOrEqual(MAX_ZOOM)
  })

  it('DEFAULT_VIEWPORT contains all required fields', () => {
    expect(DEFAULT_VIEWPORT).toHaveProperty('center')
    expect(DEFAULT_VIEWPORT).toHaveProperty('zoom')
    expect(DEFAULT_VIEWPORT).toHaveProperty('pitch')
    expect(DEFAULT_VIEWPORT).toHaveProperty('bearing')
  })
})
