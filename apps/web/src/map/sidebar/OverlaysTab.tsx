import { useMapStore } from '../../stores/mapStore'

const SENTINEL_MIN_YEAR = 2018

export default function OverlaysTab() {
  const {
    baseLayer,
    season,
    topoSource,
    overlayPistes,
    setOverlayPistes,
    overlaySkiTouring,
    setOverlaySkiTouring,
    overlaySnowshoe,
    setOverlaySnowshoe,
    sentinelYear,
    setSentinelYear,
  } = useMapStore()

  const isSwisstopo = topoSource === 'swisstopo'
  const currentYear = new Date().getFullYear()

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

      {baseLayer === 'satellite' && (
        <Section title="Seasonal Satellite">
          <label className="flex items-center justify-between text-sm text-white/60">
            <span>Year</span>
            <select
              value={sentinelYear}
              onChange={(e) => setSentinelYear(parseInt(e.target.value))}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-accent/50"
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
        </Section>
      )}
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

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string | undefined
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div>
        <span className="text-sm text-white/80 group-hover:text-white transition-colors">
          {label}
        </span>
        {hint && <span className="block text-[10px] text-white/25 mt-0.5">{hint}</span>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[22px] w-10 items-center rounded-full transition-colors duration-150 cursor-pointer border-none ${
          checked ? 'bg-accent' : 'bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
            checked ? 'translate-x-[21px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </label>
  )
}
