import mapboxgl from 'mapbox-gl'
import {
  TERRAIN_SOURCE_ID,
  TERRAIN_SOURCE,
  SKY_LAYER_ID,
  SKY_LAYER,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '@mtamta/map-core'
import { useMapStore } from '../stores/mapStore'

/**
 * Custom Mapbox GL control: 2D/3D terrain toggle button.
 * Styled to match native Mapbox controls (same size, border, hover).
 */
export class TerrainControl implements mapboxgl.IControl {
  private container: HTMLDivElement | null = null
  private button: HTMLButtonElement | null = null
  private map: mapboxgl.Map | null = null
  private unsubscribe: (() => void) | null = null

  onAdd(map: mapboxgl.Map): HTMLElement {
    this.map = map

    this.container = document.createElement('div')
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.title = 'Toggle 3D terrain'
    this.button.addEventListener('click', this.handleClick)
    this.container.appendChild(this.button)

    // Sync button label with store state
    this.updateLabel(useMapStore.getState().terrainEnabled)
    this.unsubscribe = useMapStore.subscribe((state) => {
      this.updateLabel(state.terrainEnabled)
    })

    return this.container
  }

  onRemove(): void {
    this.unsubscribe?.()
    this.button?.removeEventListener('click', this.handleClick)
    this.container?.remove()
    this.map = null
    this.container = null
    this.button = null
  }

  private handleClick = (): void => {
    const store = useMapStore.getState()
    const enable = !store.terrainEnabled
    store.setTerrainEnabled(enable)

    if (!this.map) return

    if (enable) {
      // Ensure terrain source exists
      if (!this.map.getSource(TERRAIN_SOURCE_ID)) {
        this.map.addSource(TERRAIN_SOURCE_ID, TERRAIN_SOURCE)
      }

      const exaggeration = store.customExaggeration
        ? store.terrainExaggeration
        : DEFAULT_TERRAIN_EXAGGERATION

      this.map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration })

      if (!this.map.getLayer(SKY_LAYER_ID)) {
        this.map.addLayer(SKY_LAYER as mapboxgl.LayerSpecification)
      }

      // Tilt the map for a 3D perspective
      if (this.map.getPitch() < 30) {
        this.map.easeTo({ pitch: 60, duration: 500 })
      }
    } else {
      this.map.setTerrain(null)
      if (this.map.getLayer(SKY_LAYER_ID)) {
        this.map.removeLayer(SKY_LAYER_ID)
      }
      // Reset pitch to flat
      this.map.easeTo({ pitch: 0, duration: 500 })
    }
  }

  private updateLabel(enabled: boolean): void {
    if (!this.button) return
    this.button.textContent = enabled ? '3D' : '2D'
    this.button.style.fontWeight = '700'
    this.button.style.fontSize = '11px'
    this.button.style.lineHeight = '29px'
  }
}
