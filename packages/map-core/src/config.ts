// Default map viewport — centered on the Alps (Bern/Interlaken area).
// This is a sensible default for the primary target audience (Alpine outdoor sports).

export const DEFAULT_CENTER: [number, number] = [8.2275, 46.8182] // [lng, lat]
export const DEFAULT_ZOOM = 9
export const DEFAULT_PITCH = 0
export const DEFAULT_BEARING = 0

export const MIN_ZOOM = 2
export const MAX_ZOOM = 22

export const DEFAULT_VIEWPORT = {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  pitch: DEFAULT_PITCH,
  bearing: DEFAULT_BEARING,
} as const
