import { describe, it, expect } from 'vitest'
import { getAvailableLayers, getLayersByCategory, LAYER_REGISTRY } from './layers'

describe('layer registry', () => {
  it('contains exactly 6 layers through Phase 3', () => {
    expect(LAYER_REGISTRY).toHaveLength(6)
  })

  it('getAvailableLayers returns only available layers', () => {
    const available = getAvailableLayers()
    expect(available.every((l) => l.available)).toBe(true)
  })

  it('getLayersByCategory("base") returns 3 base layers', () => {
    const base = getLayersByCategory('base')
    expect(base).toHaveLength(3)
    expect(base.map((l) => l.id)).toEqual(['outdoors', 'satellite', 'satellite-seasonal'])
  })

  it('getLayersByCategory("terrain") returns the 3D terrain layer', () => {
    const terrain = getLayersByCategory('terrain')
    expect(terrain).toHaveLength(1)
    expect(terrain[0]?.id).toBe('terrain-3d')
  })
})
