import { describe, it, expect } from 'vitest'
import {
  TERRAIN_SOURCE,
  TERRAIN_SOURCE_ID,
  DEFAULT_TERRAIN_EXAGGERATION,
  MIN_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION_STEP,
  SKY_LAYER,
} from './terrain'

describe('terrain config', () => {
  it('TERRAIN_SOURCE is a raster-dem with tileSize 512', () => {
    expect(TERRAIN_SOURCE.type).toBe('raster-dem')
    expect(TERRAIN_SOURCE.tileSize).toBe(512)
  })

  it('TERRAIN_SOURCE_ID is a non-empty string', () => {
    expect(TERRAIN_SOURCE_ID).toBeTruthy()
    expect(typeof TERRAIN_SOURCE_ID).toBe('string')
  })

  it('exaggeration defaults are ordered: min <= default <= max', () => {
    expect(MIN_TERRAIN_EXAGGERATION).toBeLessThanOrEqual(DEFAULT_TERRAIN_EXAGGERATION)
    expect(DEFAULT_TERRAIN_EXAGGERATION).toBeLessThanOrEqual(MAX_TERRAIN_EXAGGERATION)
  })

  it('exaggeration step produces a whole number of steps', () => {
    const range = MAX_TERRAIN_EXAGGERATION - MIN_TERRAIN_EXAGGERATION
    const steps = Math.round(range / TERRAIN_EXAGGERATION_STEP)
    expect(steps * TERRAIN_EXAGGERATION_STEP).toBeCloseTo(range)
  })

  it('SKY_LAYER has type "sky"', () => {
    expect(SKY_LAYER.type).toBe('sky')
  })
})
