import type { Map as MaptilerMap, IControl } from '@maptiler/sdk'
import { DEFAULT_TERRAIN_EXAGGERATION } from '@mtamta/map-core'
import { useMapStore } from '../../../stores/mapStore'

/**
 * Custom MapTiler terrain toggle control.
 * Uses SDK's enableTerrain()/disableTerrain() — no manual DEM source needed.
 * Styled to match MapLibre GL controls.
 */
export class TerrainControl implements IControl {
  private container: HTMLDivElement | null = null
  private button: HTMLButtonElement | null = null
  private map: MaptilerMap | null = null
  private unsubscribe: (() => void) | null = null

  onAdd(map: MaptilerMap): HTMLElement {
    this.map = map

    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.title = 'Toggle 3D terrain'
    this.button.addEventListener('click', this.handleClick)
    this.container.appendChild(this.button)

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
      const exaggeration = store.customExaggeration
        ? store.terrainExaggeration
        : DEFAULT_TERRAIN_EXAGGERATION
      this.map.enableTerrain(exaggeration)

      if (this.map.getPitch() < 30) {
        this.map.easeTo({ pitch: 60, duration: 500 })
      }
    } else {
      this.map.disableTerrain()
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
