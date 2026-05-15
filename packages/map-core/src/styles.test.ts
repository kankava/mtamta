import { describe, it, expect } from 'vitest'
import { resolveStyleUrl, STYLE_URLS } from './styles'

describe('resolveStyleUrl', () => {
  it('returns the Outdoors style for outdoors + summer', () => {
    expect(resolveStyleUrl('outdoors', 'summer')).toBe(STYLE_URLS.outdoors.summer)
  })

  it('returns the Outdoors Winter style for outdoors + winter', () => {
    expect(resolveStyleUrl('outdoors', 'winter')).toBe(STYLE_URLS.outdoors.winter)
  })

  it('uses a distinct style for outdoors winter vs summer', () => {
    expect(resolveStyleUrl('outdoors', 'winter')).not.toBe(resolveStyleUrl('outdoors', 'summer'))
  })

  it('returns the Standard Satellite style for satellite (both seasons)', () => {
    expect(resolveStyleUrl('satellite', 'summer')).toBe(STYLE_URLS.satellite.summer)
    expect(resolveStyleUrl('satellite', 'winter')).toBe(STYLE_URLS.satellite.winter)
  })
})
