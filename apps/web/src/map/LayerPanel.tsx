import { useMapStore } from '../stores/mapStore'
import {
  MIN_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION_STEP,
  TOPO_SOURCES,
  getTopoSource,
} from '@mtamta/map-core'
import type { BaseLayer, TopoSourceId } from '@mtamta/map-core'

const BASE_LAYERS: { id: BaseLayer; label: string }[] = [
  { id: 'outdoors', label: 'Topographic' },
  { id: 'satellite', label: 'Satellite' },
]

const SENTINEL_MIN_YEAR = 2018

/**
 * Floating layer control panel.
 * - Base layer radio buttons (mutually exclusive)
 * - 3D terrain toggle with exaggeration slider
 * - Topo map source selector with opacity control
 * - Overlay toggles (pistes, ski touring, snowshoe)
 * - Seasonal satellite year selector
 */
export default function LayerPanel() {
  const {
    baseLayer,
    setBaseLayer,
    terrainEnabled,
    setTerrainEnabled,
    terrainExaggeration,
    setTerrainExaggeration,
    season,
    topoSource,
    topoSourceManual,
    topoOpacity,
    setTopoSource,
    setTopoOpacity,
    resetTopoSourceAuto,
    overlayPistes,
    setOverlayPistes,
    overlaySkiTouring,
    setOverlaySkiTouring,
    overlaySnowshoe,
    setOverlaySnowshoe,
    sentinelYear,
    setSentinelYear,
  } = useMapStore()

  const currentYear = new Date().getFullYear()
  const isWinter = season === 'winter'
  const isOutdoors = baseLayer === 'outdoors'
  const isSwisstopo = topoSource === 'swisstopo'

  const handleTopoChange = (value: string) => {
    if (value === 'auto') {
      resetTopoSourceAuto()
    } else {
      setTopoSource((value || null) as TopoSourceId | null, true)
    }
  }

  const activeTopoSource = topoSource ? getTopoSource(topoSource) : null

  return (
    <div style={panelStyle}>
      <div style={sectionStyle}>
        <strong style={headingStyle}>Base Layer</strong>
        {BASE_LAYERS.map((layer) => (
          <label key={layer.id} style={radioLabelStyle}>
            <input
              type="radio"
              name="baseLayer"
              value={layer.id}
              checked={baseLayer === layer.id}
              onChange={() => setBaseLayer(layer.id)}
            />
            {layer.label}
          </label>
        ))}
      </div>

      <div style={sectionStyle}>
        <strong style={headingStyle}>Terrain</strong>
        <label style={radioLabelStyle}>
          <input
            type="checkbox"
            checked={terrainEnabled}
            onChange={(e) => setTerrainEnabled(e.target.checked)}
          />
          3D Terrain
        </label>
        {terrainEnabled && (
          <div style={{ marginTop: '4px' }}>
            <label style={{ fontSize: '12px', color: '#666' }}>
              Exaggeration: {terrainExaggeration.toFixed(1)}x
              <input
                type="range"
                min={MIN_TERRAIN_EXAGGERATION}
                max={MAX_TERRAIN_EXAGGERATION}
                step={TERRAIN_EXAGGERATION_STEP}
                value={terrainExaggeration}
                onChange={(e) => setTerrainExaggeration(parseFloat(e.target.value))}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </label>
          </div>
        )}
      </div>

      {isOutdoors && (
        <div style={sectionStyle}>
          <strong style={headingStyle}>Topo Map</strong>
          <select
            value={topoSourceManual ? (topoSource ?? '') : 'auto'}
            onChange={(e) => handleTopoChange(e.target.value)}
            style={selectStyle}
          >
            <option value="auto">
              Auto-detect{!topoSourceManual && topoSource ? ` (${topoSource})` : ''}
            </option>
            <option value="">None</option>
            {TOPO_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.country || 'Global'})
              </option>
            ))}
          </select>
          {topoSource && (
            <>
              <label style={{ fontSize: '12px', color: '#666', marginTop: '4px', display: 'block' }}>
                Opacity: {Math.round(topoOpacity * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={topoOpacity}
                  onChange={(e) => setTopoOpacity(parseFloat(e.target.value))}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </label>
              {activeTopoSource && (
                <div
                  style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}
                  dangerouslySetInnerHTML={{ __html: activeTopoSource.attribution }}
                />
              )}
            </>
          )}
        </div>
      )}

      {isWinter && (
        <div style={sectionStyle}>
          <strong style={headingStyle}>Overlays</strong>
          <label style={radioLabelStyle}>
            <input
              type="checkbox"
              checked={overlayPistes}
              onChange={(e) => setOverlayPistes(e.target.checked)}
            />
            Ski Pistes
          </label>
          {isSwisstopo && (
            <>
              <label style={radioLabelStyle}>
                <input
                  type="checkbox"
                  checked={overlaySkiTouring}
                  onChange={(e) => setOverlaySkiTouring(e.target.checked)}
                />
                Ski Touring
              </label>
              <label style={radioLabelStyle}>
                <input
                  type="checkbox"
                  checked={overlaySnowshoe}
                  onChange={(e) => setOverlaySnowshoe(e.target.checked)}
                />
                Snowshoe Trails
              </label>
            </>
          )}
        </div>
      )}

      {baseLayer === 'satellite' && (
        <div style={sectionStyle}>
          <strong style={headingStyle}>Seasonal Satellite</strong>
          <label style={{ fontSize: '12px', color: '#666' }}>
            Year:
            <select
              value={sentinelYear}
              onChange={(e) => setSentinelYear(parseInt(e.target.value))}
              style={{ ...selectStyle, marginLeft: '6px' }}
            >
              {Array.from({ length: currentYear - SENTINEL_MIN_YEAR + 1 }, (_, i) => {
                const year = currentYear - i
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                )
              })}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '40px',
  right: '10px',
  background: 'white',
  borderRadius: '8px',
  padding: '12px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  zIndex: 1,
  minWidth: '180px',
  fontSize: '14px',
  maxHeight: 'calc(100vh - 100px)',
  overflowY: 'auto',
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '8px',
}

const headingStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '12px',
  textTransform: 'uppercase',
  color: '#888',
  letterSpacing: '0.5px',
}

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 0',
  cursor: 'pointer',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px',
  fontSize: '13px',
  borderRadius: '4px',
  border: '1px solid #ccc',
}
