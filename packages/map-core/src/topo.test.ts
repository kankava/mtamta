import { describe, it, expect } from 'vitest'
import {
  TOPO_SOURCES,
  OVERLAY_SOURCES,
  findTopoSourceForPoint,
  getTopoSource,
  resolveTopoTileUrl,
} from './topo'

describe('TOPO_SOURCES', () => {
  it('contains 7 providers', () => {
    expect(TOPO_SOURCES).toHaveLength(7)
  })

  it('every source has required fields', () => {
    for (const s of TOPO_SOURCES) {
      expect(s.id).toBeTruthy()
      expect(s.name).toBeTruthy()
      expect(s.tileUrl).toBeTruthy()
      expect(s.bbox).toHaveLength(4)
      expect(s.maxZoom).toBeGreaterThan(0)
      expect([256, 512]).toContain(s.tileSize)
    }
  })

  it('proxy sources have proxyProvider set', () => {
    for (const s of TOPO_SOURCES) {
      if (s.needsProxy) {
        expect(s.proxyProvider).toBeTruthy()
      }
    }
  })

  it('tileBounds is wider than bbox where set', () => {
    for (const s of TOPO_SOURCES) {
      if (s.tileBounds) {
        expect(s.tileBounds[0]).toBeLessThanOrEqual(s.bbox[0])
        expect(s.tileBounds[1]).toBeLessThanOrEqual(s.bbox[1])
        expect(s.tileBounds[2]).toBeGreaterThanOrEqual(s.bbox[2])
        expect(s.tileBounds[3]).toBeGreaterThanOrEqual(s.bbox[3])
      }
    }
  })
})

describe('OVERLAY_SOURCES', () => {
  it('contains 3 overlay sources', () => {
    expect(OVERLAY_SOURCES).toHaveLength(3)
  })

  it('all overlays are winter-only', () => {
    for (const o of OVERLAY_SOURCES) {
      expect(o.seasonFilter).toBe('winter')
    }
  })

  it('ski-touring and snowshoe require swisstopo', () => {
    const skiTouring = OVERLAY_SOURCES.find((o) => o.id === 'ski-touring')
    const snowshoe = OVERLAY_SOURCES.find((o) => o.id === 'snowshoe')
    expect(skiTouring?.topoSourceFilter).toBe('swisstopo')
    expect(snowshoe?.topoSourceFilter).toBe('swisstopo')
  })
})

describe('findTopoSourceForPoint', () => {
  it('returns swisstopo for a point in Switzerland', () => {
    expect(findTopoSourceForPoint(8.23, 46.82)).toBe('swisstopo')
  })

  it('returns ign for a point in France', () => {
    expect(findTopoSourceForPoint(2.35, 48.86)).toBe('ign')
  })

  it('returns basemap-at for a point in Austria', () => {
    expect(findTopoSourceForPoint(13.4, 47.26)).toBe('basemap-at')
  })

  it('returns bkg for a point in Germany', () => {
    expect(findTopoSourceForPoint(10.45, 51.16)).toBe('bkg')
  })

  it('returns kartverket for a point in Norway', () => {
    expect(findTopoSourceForPoint(10.75, 59.91)).toBe('kartverket')
  })

  it('returns usgs for a point in the US', () => {
    expect(findTopoSourceForPoint(-105.27, 40.01)).toBe('usgs')
  })

  it('returns null for a point in the ocean', () => {
    expect(findTopoSourceForPoint(-30, 30)).toBeNull()
  })

  it('prefers smaller bbox when bboxes overlap', () => {
    // A point on the French-Swiss border that falls in both bboxes
    // swisstopo bbox is smaller than IGN, so swisstopo should win
    expect(findTopoSourceForPoint(6.15, 46.2)).toBe('swisstopo')
  })

  it('does not auto-select opentopomap (global fallback)', () => {
    // Point in Africa — no country source, should return null
    expect(findTopoSourceForPoint(36.82, -1.29)).toBeNull()
  })

  it('does not auto-select usgs outside CONUS bbox', () => {
    // Edmonton, Canada (well north of CONUS bbox)
    expect(findTopoSourceForPoint(-113.5, 53.5)).toBeNull()
    // Mexico City (south of CONUS bbox)
    expect(findTopoSourceForPoint(-99.13, 19.43)).toBeNull()
  })
})

describe('getTopoSource', () => {
  it('returns the source definition for a valid ID', () => {
    const s = getTopoSource('swisstopo')
    expect(s).toBeDefined()
    expect(s!.country).toBe('CH')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getTopoSource('nonexistent' as any)).toBeUndefined()
  })
})

describe('resolveTopoTileUrl', () => {
  const apiBase = 'https://api.mtamta.com'

  it('returns proxy URL for swisstopo in summer', () => {
    const s = getTopoSource('swisstopo')!
    const url = resolveTopoTileUrl(s, 'summer', apiBase)
    expect(url).toBe(`${apiBase}/api/v1/tiles/swisstopo/{z}/{x}/{y}`)
  })

  it('returns winter proxy URL for swisstopo in winter', () => {
    const s = getTopoSource('swisstopo')!
    const url = resolveTopoTileUrl(s, 'winter', apiBase)
    expect(url).toBe(`${apiBase}/api/v1/tiles/swisstopo-winter/{z}/{x}/{y}`)
  })

  it('returns direct tile URL for non-proxy source in summer', () => {
    const s = getTopoSource('basemap-at')!
    const url = resolveTopoTileUrl(s, 'summer', apiBase)
    expect(url).toBe(s.tileUrl)
  })

  it('returns proxy URL for IGN', () => {
    const s = getTopoSource('ign')!
    const url = resolveTopoTileUrl(s, 'summer', apiBase)
    expect(url).toBe(`${apiBase}/api/v1/tiles/ign/{z}/{x}/{y}`)
  })

  it('returns proxy URL for opentopomap', () => {
    const s = getTopoSource('opentopomap')!
    const url = resolveTopoTileUrl(s, 'summer', apiBase)
    expect(url).toBe(`${apiBase}/api/v1/tiles/opentopomap/{z}/{x}/{y}`)
  })
})
