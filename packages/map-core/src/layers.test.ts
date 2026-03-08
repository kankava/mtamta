import { describe, it, expect } from 'vitest'
import { getAvailableLayers, getLayersByCategory, LAYER_REGISTRY } from './layers'

describe('layer registry', () => {
  it('contains exactly 3 layers in Phase 2', () => {
    expect(LAYER_REGISTRY).toHaveLength(3)
  })

  it('getAvailableLayers returns only available layers', () => {
    const available = getAvailableLayers()
    expect(available.every((l) => l.available)).toBe(true)
  })

  it('getLayersByCategory("base") returns 2 base layers', () => {
    const base = getLayersByCategory('base')
    expect(base).toHaveLength(2)
    expect(base.map((l) => l.id)).toEqual(['outdoors', 'satellite'])
  })

  it('getLayersByCategory("terrain") returns the 3D terrain layer', () => {
    const terrain = getLayersByCategory('terrain')
    expect(terrain).toHaveLength(1)
    expect(terrain[0]?.id).toBe('terrain-3d')
  })
})
