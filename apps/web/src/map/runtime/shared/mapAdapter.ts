/**
 * Minimal map interface that shared code (raster overlays, trip routes)
 * targets instead of a vendor-specific SDK. Each provider runtime
 * implements a factory: createMapboxAdapter(map) / createMaptilerAdapter(map).
 *
 * Provider-specific features (search, weather) use the raw vendor SDK directly.
 */
export interface AppMapAdapter {
  isStyleLoaded(): boolean
  getStyleLayers(): Array<{ id: string; type: string }>
  getSource(id: string): unknown
  addSource(id: string, source: unknown): void
  removeSource(id: string): void
  getLayer(id: string): unknown
  addLayer(layer: unknown, beforeId?: string): void
  removeLayer(id: string): void
  getBounds(): [number, number, number, number]
  getZoom(): number
  flyTo(center: [number, number], zoom?: number): void
  onStyleLoad(cb: () => void): void
  offStyleLoad(cb: () => void): void
  onMoveEnd(cb: () => void): void
  offMoveEnd(cb: () => void): void
  onClick(
    layerId: string,
    cb: (e: { lngLat: [number, number]; features?: unknown[] }) => void,
  ): void
  offClick(layerId: string, cb: (...args: unknown[]) => void): void
}
