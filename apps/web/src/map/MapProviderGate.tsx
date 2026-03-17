import { useMapStore } from '../stores/mapStore'
import type { MapProvider } from '@mtamta/map-core'

/** Providers whose runtime is implemented. Updated as milestones land. */
const IMPLEMENTED_PROVIDERS: ReadonlySet<MapProvider> = new Set(['mapbox', 'maptiler'])

const PROVIDERS: Array<{
  id: MapProvider
  label: string
  description: string
}> = [
  {
    id: 'mapbox',
    label: 'Mapbox',
    description: 'Mapbox GL JS — seasonal styles, Mapbox search, directions',
  },
  {
    id: 'maptiler',
    label: 'MapTiler',
    description: 'MapTiler SDK — built-in terrain, geocoding, weather APIs',
  },
]

export default function MapProviderGate() {
  const setMapProvider = useMapStore((s) => s.setMapProvider)

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1a]">
      <div className="w-full max-w-sm px-6">
        <h2 className="text-lg font-semibold text-white/90 text-center mb-1">
          Choose Map Engine
        </h2>
        <p className="text-xs text-white/40 text-center mb-6">
          You can switch anytime in Settings
        </p>
        <div className="flex flex-col gap-3">
          {PROVIDERS.map((p) => {
            const available = IMPLEMENTED_PROVIDERS.has(p.id)
            return (
              <button
                key={p.id}
                disabled={!available}
                onClick={() => setMapProvider(p.id)}
                className={`w-full rounded-xl border px-5 py-4 text-left transition-colors ${
                  available
                    ? 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer'
                    : 'border-white/5 bg-white/[0.02] cursor-not-allowed'
                }`}
              >
                <span
                  className={`block text-sm font-medium ${available ? 'text-white/90' : 'text-white/30'}`}
                >
                  {p.label}
                  {!available && (
                    <span className="ml-2 text-[10px] font-normal text-white/20">
                      Coming soon
                    </span>
                  )}
                </span>
                <span
                  className={`block text-xs mt-1 ${available ? 'text-white/40' : 'text-white/20'}`}
                >
                  {p.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
