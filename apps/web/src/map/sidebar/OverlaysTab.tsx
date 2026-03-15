import { useMapStore } from '../../stores/mapStore'
import { Section, Toggle } from './shared'

export default function OverlaysTab() {
  const {
    season,
    topoSource,
    overlayPistes,
    setOverlayPistes,
    overlaySkiTouring,
    setOverlaySkiTouring,
    overlaySnowshoe,
    setOverlaySnowshoe,
  } = useMapStore()

  const isSwisstopo = topoSource === 'swisstopo'

  return (
    <div className="space-y-5">
      <Section title="Map Overlays">
        <Toggle
          label="Ski Pistes"
          checked={overlayPistes}
          onChange={setOverlayPistes}
          hint={season !== 'winter' ? 'Visible in winter mode' : undefined}
        />
        {isSwisstopo && (
          <>
            <Toggle
              label="Ski Touring"
              checked={overlaySkiTouring}
              onChange={setOverlaySkiTouring}
              hint={season !== 'winter' ? 'Visible in winter mode' : undefined}
            />
            <Toggle
              label="Snowshoe Trails"
              checked={overlaySnowshoe}
              onChange={setOverlaySnowshoe}
              hint={season !== 'winter' ? 'Visible in winter mode' : undefined}
            />
          </>
        )}
      </Section>

      {/* Sentinel year selector — hidden until Sentinel Hub is configured (capability-aware cards TODO) */}
    </div>
  )
}
