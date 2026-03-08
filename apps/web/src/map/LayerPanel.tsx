import { useMapStore } from '../stores/mapStore'
import {
  MIN_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION_STEP,
} from '@mtamta/map-core'
import type { BaseLayer } from '@mtamta/map-core'

const BASE_LAYERS: { id: BaseLayer; label: string }[] = [
  { id: 'outdoors', label: 'Topographic' },
  { id: 'satellite', label: 'Satellite' },
]

/**
 * Floating layer control panel.
 * - Base layer radio buttons (mutually exclusive)
 * - 3D terrain toggle with exaggeration slider
 */
export default function LayerPanel() {
  const {
    baseLayer,
    setBaseLayer,
    terrainEnabled,
    setTerrainEnabled,
    terrainExaggeration,
    setTerrainExaggeration,
  } = useMapStore()

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
  minWidth: '160px',
  fontSize: '14px',
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
