import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TERRAIN_EXAGGERATION,
  MIN_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION_STEP,
} from './terrain'

describe('terrain config', () => {
  it('exaggeration defaults are ordered: min <= default <= max', () => {
    expect(MIN_TERRAIN_EXAGGERATION).toBeLessThanOrEqual(DEFAULT_TERRAIN_EXAGGERATION)
    expect(DEFAULT_TERRAIN_EXAGGERATION).toBeLessThanOrEqual(MAX_TERRAIN_EXAGGERATION)
  })

  it('exaggeration step produces a whole number of steps', () => {
    const range = MAX_TERRAIN_EXAGGERATION - MIN_TERRAIN_EXAGGERATION
    const steps = Math.round(range / TERRAIN_EXAGGERATION_STEP)
    expect(steps * TERRAIN_EXAGGERATION_STEP).toBeCloseTo(range)
  })
})
