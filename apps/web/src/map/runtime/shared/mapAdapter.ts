/**
 * Minimal map interface that shared code (raster overlays, trip routes)
 * targets instead of a vendor-specific SDK. Each provider runtime
 * implements a factory: createMapboxAdapter(map) / createMaptilerAdapter(map).
 *
 * Provider-specific features (search, weather) use the raw vendor SDK directly.
 */
export interface AppMapAdapter {
  isStyleLoaded(): boolean
  getSource(id: string): unknown
  addSource(id: string, source: unknown): void
  removeSource(id: string): void
  getLayer(id: string): unknown
  /**
   * Add a layer. `opts.slot` requests placement below map labels: the Mapbox
   * adapter maps it to a Mapbox Standard slot; the MapTiler adapter derives an
   * equivalent `beforeId` (first symbol layer).
   */
  addLayer(layer: unknown, opts?: { slot?: string }): void
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
