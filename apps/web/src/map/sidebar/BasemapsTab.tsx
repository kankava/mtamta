import { useMapStore, BASEMAP_PRESETS } from '../../stores/mapStore'
import type { BasemapPreset } from '../../stores/mapStore'

interface BasemapCard {
  preset: BasemapPreset
  label: string
  gradient: string
  topo: boolean
  tag?: string | undefined
  disabled?: boolean | undefined
  hint?: string | undefined
}

const TOPO_PATTERN =
  'repeating-linear-gradient(0deg, transparent, transparent 6px, rgba(255,255,255,0.07) 6px, rgba(255,255,255,0.07) 7px)'

const SATELLITE_CARDS: BasemapCard[] = [
  {
    preset: 'satellite-summer',
    label: 'Summer',
    gradient: 'linear-gradient(135deg, #065f46, #064e3b)',
    topo: false,
  },
  {
    preset: 'satellite-winter',
    label: 'Winter',
    gradient: 'linear-gradient(135deg, #1e3a5f, #0f172a)',
    topo: false,
    disabled: true,
    hint: 'Coming soon',
  },
]

const TOPO_GLOBAL_CARDS: BasemapCard[] = [
  {
    preset: 'outdoors-summer',
    label: 'Global Summer',
    gradient: 'linear-gradient(135deg, #34d399, #059669)',
    topo: true,
  },
  {
    preset: 'outdoors-winter',
    label: 'Global Winter',
    gradient: 'linear-gradient(135deg, #7dd3fc, #38bdf8)',
    topo: true,
  },
]

const TOPO_COUNTRY_CARDS: BasemapCard[] = [
  {
    preset: 'swisstopo',
    label: 'swisstopo',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    topo: true,
    tag: 'CH',
  },
  {
    preset: 'swisstopo-winter',
    label: 'swisstopo Winter',
    gradient: 'linear-gradient(135deg, #94a3b8, #64748b)',
    topo: true,
    tag: 'CH',
  },
  {
    preset: 'ign',
    label: 'IGN France',
    gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    topo: true,
    tag: 'FR',
  },
  {
    preset: 'basemap-at',
    label: 'basemap.at',
    gradient: 'linear-gradient(135deg, #ef4444, #f97316)',
    topo: true,
    tag: 'AT',
  },
  {
    preset: 'bkg',
    label: 'TopPlusOpen',
    gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    topo: true,
    tag: 'DE',
  },
  {
    preset: 'kartverket',
    label: 'Kartverket',
    gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    topo: true,
    tag: 'NO',
  },
  {
    preset: 'usgs',
    label: 'USGS Topo',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    topo: true,
    tag: 'US',
  },
]

function isActivePreset(
  preset: BasemapPreset,
  state: { baseLayer: string; season: string; topoSource: string | null },
): boolean {
  const config = BASEMAP_PRESETS[preset]
  return (
    state.baseLayer === config.baseLayer &&
    state.season === config.season &&
    state.topoSource === config.topoSource
  )
}

export default function BasemapsTab() {
  const { baseLayer, season, topoSource, selectBasemap } = useMapStore()
  const state = { baseLayer, season, topoSource }

  const renderCards = (cards: BasemapCard[]) =>
    cards.map((card) => (
      <Card
        key={card.preset}
        card={card}
        active={!card.disabled && isActivePreset(card.preset, state)}
        onClick={card.disabled ? undefined : () => selectBasemap(card.preset)}
      />
    ))

  return (
    <div className="space-y-5">
      <Section title="Satellite">
        <div className="grid grid-cols-2 gap-2">{renderCards(SATELLITE_CARDS)}</div>
      </Section>

      <Section title="Topos">
        <div className="grid grid-cols-2 gap-2">
          {renderCards(TOPO_GLOBAL_CARDS)}
          {renderCards(TOPO_COUNTRY_CARDS)}
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
      {children}
    </div>
  )
}

function Card({
  card,
  active,
  onClick,
}: {
  card: BasemapCard
  active: boolean
  onClick: (() => void) | undefined
}) {
  const disabled = card.disabled ?? false

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group relative flex flex-col rounded-xl overflow-hidden border-2 transition-all duration-150 w-full bg-transparent ${
        disabled
          ? 'border-white/[0.04] opacity-50 cursor-not-allowed'
          : active
            ? 'border-accent shadow-[0_0_0_2px_rgba(245,158,11,0.2)] cursor-pointer'
            : 'border-white/[0.08] hover:border-white/20 cursor-pointer'
      }`}
    >
      {/* Gradient thumbnail with topo contour texture */}
      <div
        className={`relative w-full h-14 transition-[filter] duration-150 ${disabled ? 'grayscale' : 'group-hover:brightness-110'}`}
        style={{
          background: card.topo ? `${TOPO_PATTERN}, ${card.gradient}` : card.gradient,
        }}
      >
        {card.tag && (
          <span className="absolute top-1.5 right-1.5 text-[9px] font-bold text-white/60 bg-black/25 rounded px-1 py-px leading-tight">
            {card.tag}
          </span>
        )}
      </div>

      {/* Label */}
      <div className="px-2 py-1.5">
        <span
          className={`text-[11px] leading-tight transition-colors ${
            active ? 'font-semibold text-accent' : 'text-white/50 group-hover:text-white/70'
          }`}
        >
          {card.label}
        </span>
        {card.hint && (
          <span className="block text-[9px] text-white/25 leading-tight">{card.hint}</span>
        )}
      </div>
    </button>
  )
}
