import { useMapStore } from '../../stores/mapStore'
import {
  MIN_TERRAIN_EXAGGERATION,
  MAX_TERRAIN_EXAGGERATION,
  TERRAIN_EXAGGERATION_STEP,
} from '@mtamta/map-core'

export default function SettingsTab() {
  const {
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
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-sm text-white/80 group-hover:text-white transition-colors">
            Custom exaggeration
          </span>
          <button
            role="switch"
            aria-checked={customExaggeration}
            onClick={() => setCustomExaggeration(!customExaggeration)}
            className={`relative inline-flex h-[22px] w-10 items-center rounded-full transition-colors duration-150 cursor-pointer border-none ${
              customExaggeration ? 'bg-accent' : 'bg-white/15'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                customExaggeration ? 'translate-x-[21px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </label>

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

      <Section title="Projection">
        <div className="flex gap-2">
          {(['mercator', 'globe'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProjection(p)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors border ${
                projection === p
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
              }`}
            >
              {p === 'mercator' ? 'Flat' : 'Globe'}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2.5">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}
