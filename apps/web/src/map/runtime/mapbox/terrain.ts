import type { Map as MapboxMap, IControl } from 'mapbox-gl'

/**
 * Mapbox 2D/3D camera toggle.
 *
 * Mapbox Standard renders terrain as part of the style — it is always on, so
 * this control does NOT enable/disable terrain. It only tilts the camera so
 * the terrain reads as 3D: 2D = pitch 0 (top-down), 3D = pitch 60.
 *
 * Starts labelled "3D" with the camera flat (no auto-tilt on first paint);
 * the label then tracks the map's actual pitch.
 */
const PITCH_3D = 60
const PITCH_2D = 0
// Above this pitch the view counts as 3D — keeps the label honest when the
// user tilts the map by hand instead of using the button.
const PITCH_3D_THRESHOLD = 10

export class TerrainControl implements IControl {
  private container: HTMLDivElement | null = null
  private button: HTMLButtonElement | null = null
  private map: MapboxMap | null = null
  private is3D = true

  onAdd(map: MapboxMap): HTMLElement {
    this.map = map

    this.container = document.createElement('div')
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.title = 'Toggle 3D view'
    this.button.addEventListener('click', this.handleClick)
    this.container.appendChild(this.button)

    this.updateLabel()
    map.on('pitchend', this.syncFromPitch)

    return this.container
  }

  onRemove(): void {
    this.map?.off('pitchend', this.syncFromPitch)
    this.button?.removeEventListener('click', this.handleClick)
    this.container?.remove()
    this.map = null
    this.container = null
    this.button = null
  }

  private handleClick = (): void => {
    if (!this.map) return
    this.is3D = !this.is3D
    this.updateLabel()
    this.map.easeTo({ pitch: this.is3D ? PITCH_3D : PITCH_2D, duration: 500 })
  }

  // Keep the label in sync when the user tilts the map directly.
  private syncFromPitch = (): void => {
    if (!this.map) return
    const is3D = this.map.getPitch() > PITCH_3D_THRESHOLD
    if (is3D !== this.is3D) {
      this.is3D = is3D
      this.updateLabel()
    }
  }

  private updateLabel(): void {
    if (!this.button) return
    this.button.textContent = this.is3D ? '3D' : '2D'
    this.button.style.fontWeight = '700'
    this.button.style.fontSize = '11px'
    this.button.style.lineHeight = '29px'
  }
}
