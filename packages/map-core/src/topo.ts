// Topo source catalog — country-specific topographic map tile providers.
// Each source defines XYZ tile URLs, bounding boxes for auto-selection,
// and proxy requirements for rate-limited or API-key-gated services.

import type { Season } from './styles'

export type TopoSourceId =
  | 'swisstopo'
  | 'ign'
  | 'basemap-at'
  | 'bkg'
  | 'kartverket'
  | 'usgs'
  | 'opentopomap'

export interface TopoSourceDef {
  id: TopoSourceId
  name: string
  country: string // ISO 3166-1 alpha-2
  bbox: [number, number, number, number] // [west, south, east, north] — used for auto-selection (findTopoSourceForPoint)
  tileBounds?: [number, number, number, number] // if set, used as Mapbox raster source `bounds` instead of bbox
  tileUrl: string // XYZ template with {z}/{x}/{y}
  winterTileUrl?: string
  attribution: string
  maxZoom: number
  tileSize: 256 | 512
  needsProxy: boolean
  proxyProvider?: string // key for /api/v1/tiles/{provider}/
  winterProxyProvider?: string // separate proxy key for winter tiles (if different upstream)
}

export const TOPO_SOURCES: TopoSourceDef[] = [
  {
    id: 'swisstopo',
    name: 'swisstopo',
    country: 'CH',
    bbox: [5.96, 45.82, 10.49, 47.81], // political bbox for auto-selection
    tileBounds: [5.3, 45.3, 11.4, 48.3], // actual tile coverage (larger than political borders)
    tileUrl:
      'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    winterTileUrl:
      'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',
    attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>',
    maxZoom: 18,
    tileSize: 256,
    needsProxy: true,
    proxyProvider: 'swisstopo',
    winterProxyProvider: 'swisstopo-winter',
  },
  {
    id: 'ign',
    name: 'IGN France',
    country: 'FR',
    bbox: [-5.14, 41.33, 9.56, 51.09],
    tileUrl:
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '&copy; <a href="https://www.ign.fr">IGN</a>',
    maxZoom: 18,
    tileSize: 256,
    needsProxy: true,
    proxyProvider: 'ign',
  },
  {
    id: 'basemap-at',
    name: 'basemap.at',
    country: 'AT',
    bbox: [9.53, 46.37, 17.16, 49.02],
    tileUrl: 'https://maps.wien.gv.at/basemap/bmaphidpi/normal/google3857/{z}/{y}/{x}.jpeg',
    attribution: '&copy; <a href="https://basemap.at">basemap.at</a>',
    maxZoom: 19,
    tileSize: 256,
    needsProxy: false,
  },
  {
    id: 'bkg',
    name: 'TopPlusOpen',
    country: 'DE',
    bbox: [5.87, 47.27, 15.04, 55.06],
    tileUrl:
      'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.bkg.bund.de">BKG</a>',
    maxZoom: 18,
    tileSize: 256,
    needsProxy: false,
  },
  {
    id: 'kartverket',
    name: 'Kartverket',
    country: 'NO',
    bbox: [4.65, 57.96, 31.17, 71.19],
    tileUrl:
      'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no">Kartverket</a>',
    maxZoom: 18,
    tileSize: 256,
    needsProxy: false,
  },
  {
    id: 'usgs',
    name: 'USGS Topo',
    country: 'US',
    bbox: [-125.0, 24.4, -66.9, 49.4], // CONUS political bbox for auto-selection
    tileBounds: [-180, 17, -65, 72], // all of North America (CONUS + Alaska + Hawaii + PR)
    tileUrl:
      'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.usgs.gov">USGS</a>',
    maxZoom: 16,
    tileSize: 256,
    needsProxy: false,
  },
  {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    country: '',
    bbox: [-180, -85, 180, 85],
    tileUrl: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
    tileSize: 256,
    needsProxy: true,
    proxyProvider: 'opentopomap',
  },
]

// --- Overlay sources (pistes, ski touring, snowshoe) ---

export interface OverlaySourceDef {
  id: string
  name: string
  tileUrl: string
  attribution: string
  maxZoom: number
  tileSize: number
  seasonFilter?: Season
  topoSourceFilter?: TopoSourceId
  needsProxy: boolean
}

export const OVERLAY_SOURCES: OverlaySourceDef[] = [
  {
    id: 'pistes',
    name: 'Ski Pistes',
    tileUrl: 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.opensnowmap.org">OpenSnowMap</a>',
    maxZoom: 18,
    tileSize: 256,
    seasonFilter: 'winter',
    needsProxy: false,
  },
  {
    id: 'ski-touring',
    name: 'Ski Touring',
    tileUrl:
      'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo-karto.skitouren/default/current/3857/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>',
    maxZoom: 17,
    tileSize: 256,
    seasonFilter: 'winter',
    topoSourceFilter: 'swisstopo',
    needsProxy: false,
  },
  {
    id: 'snowshoe',
    name: 'Snowshoe Trails',
    tileUrl:
      'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo-karto.schneeschuhrouten/default/current/3857/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>',
    maxZoom: 17,
    tileSize: 256,
    seasonFilter: 'winter',
    topoSourceFilter: 'swisstopo',
    needsProxy: false,
  },
]

/** Check if a point falls within a bounding box */
function pointInBbox(lng: number, lat: number, bbox: [number, number, number, number]): boolean {
  const [west, south, east, north] = bbox
  return lng >= west && lng <= east && lat >= south && lat <= north
}

/**
 * Find the best topo source for a geographic point.
 * Country-specific sources are checked first (smallest bbox = most specific wins).
 * Falls back to null if no country-specific match.
 * OpenTopoMap (global fallback) is excluded from auto-selection.
 */
export function findTopoSourceForPoint(lng: number, lat: number): TopoSourceId | null {
  const candidates = TOPO_SOURCES.filter((s) => s.country !== '' && pointInBbox(lng, lat, s.bbox))
  if (candidates.length === 0) return null

  // Prefer the source with the smallest bounding box (most specific).
  candidates.sort((a, b) => {
    const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1])
    const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1])
    return areaA - areaB
  })
  return candidates[0]!.id
}

/** Look up a topo source definition by ID */
export function getTopoSource(id: TopoSourceId): TopoSourceDef | undefined {
  return TOPO_SOURCES.find((s) => s.id === id)
}

/**
 * Resolve the actual tile URL for a source, considering season and proxy.
 * For proxy sources, returns the backend proxy URL.
 */
export function resolveTopoTileUrl(
  source: TopoSourceDef,
  season: Season,
  apiBaseUrl: string,
): string {
  if (source.needsProxy && source.proxyProvider) {
    const provider =
      season === 'winter' && source.winterProxyProvider
        ? source.winterProxyProvider
        : source.proxyProvider
    return `${apiBaseUrl}/api/v1/tiles/${provider}/{z}/{x}/{y}`
  }
  if (season === 'winter' && source.winterTileUrl) {
    return source.winterTileUrl
  }
  return source.tileUrl
}
