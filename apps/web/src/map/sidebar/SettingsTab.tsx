import { useMapStore } from '../../stores/mapStore'
import {
  MIN_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION_STEP,
} from '@mtamta/map-core'
import { Section, Toggle } from './shared'

const PROVIDER_LABELS: Record<string, string> = {
  mapbox: 'Mapbox GL JS',
  maptiler: 'MapTiler SDK',
}

export default function SettingsTab() {
  const {
    mapProvider,
    setMapProvider,
    customExaggeration,
    setCustomExaggeration,
    terrainExaggeration,
    setTerrainExaggeration,
    projection,
    setProjection,
  } = useMapStore()

  return (
    <div className="space-y-5">
      <Section title="Terrain">
        <Toggle
          label="Custom exaggeration"
          checked={customExaggeration}
          onChange={setCustomExaggeration}
        />

        {customExaggeration && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/40">Exaggeration</span>
              <span className="text-xs font-medium text-accent">
                {terrainExaggeration.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={MIN_TERRAIN_EXAGGERATION}
              max={MAX_TERRAIN_EXAGGERATION}
              step={TERRAIN_EXAGGERATION_STEP}
              value={terrainExaggeration}
              onChange={(e) => setTerrainExaggeration(parseFloat(e.target.value))}
              className="sidebar-slider w-full"
            />
          </div>
        )}
      </Section>

      <Section title="Map Engine">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/80">
            {mapProvider ? PROVIDER_LABELS[mapProvider] ?? mapProvider : 'None'}
          </span>
          <button
            onClick={() => setMapProvider(null)}
            className="text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
          >
            Change
          </button>
        </div>
      </Section>

      <Section title="Projection">
        <div className="flex gap-2">
          {(['mercator', 'globe'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProjection(p)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors border ${
                projection === p
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
              }`}
            >
              <span className="text-sm leading-none">
                {p === 'mercator' ? '\u{1F5FA}\u{FE0F}' : '\u{1F30D}'}
              </span>
              {p === 'mercator' ? 'Flat' : 'Globe'}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}
