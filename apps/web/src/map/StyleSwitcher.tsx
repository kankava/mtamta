import { useMapStore } from '../stores/mapStore'
import type { Season } from '@mtamta/map-core'

/**
 * Winter/Summer mode toggle button.
 * In Phase 2 this is a placeholder — both modes resolve to the same
 * Mapbox Outdoors style. The toggle mechanism and store wiring is
 * what matters; custom styles come later.
 */
export default function StyleSwitcher() {
  const { season, setSeason } = useMapStore()

  const toggle = () => {
    const next: Season = season === 'summer' ? 'winter' : 'summer'
    setSeason(next)
  }

  return (
    <button
      onClick={toggle}
      style={buttonStyle}
      title={`Switch to ${season === 'summer' ? 'winter' : 'summer'} mode`}
    >
      {season === 'summer' ? 'Winter' : 'Summer'}
    </button>
  )
}

// bottom-left, above Mapbox ScaleControl. NavBar is top-left, Mapbox controls are top-right.
const buttonStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '40px',
  left: '10px',
  background: 'white',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 16px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
  zIndex: 1,
}
