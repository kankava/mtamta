import { describe, it, expect } from 'vitest'
import { resolveStyleUrl, STYLE_URLS } from './styles'

describe('resolveStyleUrl', () => {
  it('returns outdoors URL for outdoors + summer', () => {
    expect(resolveStyleUrl('outdoors', 'summer')).toBe(STYLE_URLS.outdoors)
  })

  it('returns satellite URL for satellite + summer', () => {
    expect(resolveStyleUrl('satellite', 'summer')).toBe(STYLE_URLS.satellite)
  })

  it('returns outdoors URL for outdoors + winter (placeholder — same in Phase 2)', () => {
    expect(resolveStyleUrl('outdoors', 'winter')).toBe(STYLE_URLS.outdoors)
  })

  it('returns satellite URL for satellite + winter (placeholder — same in Phase 2)', () => {
    expect(resolveStyleUrl('satellite', 'winter')).toBe(STYLE_URLS.satellite)
  })
})
