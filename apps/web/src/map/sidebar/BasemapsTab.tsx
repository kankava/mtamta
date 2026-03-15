import { useMapStore, BASEMAP_PRESETS } from '../../stores/mapStore'
import type { BasemapPreset } from '../../stores/mapStore'
import { Section } from './shared'

interface BasemapCard {
  preset: BasemapPreset
  label: string
  flag?: string | undefined
  disabled?: boolean | undefined
  hint?: string | undefined
}

const SATELLITE_CARDS: BasemapCard[] = [
  { preset: 'satellite-summer', label: 'Summer', flag: '\u{1F6F0}\u{FE0F}' },
  {
    preset: 'satellite-winter',
    label: 'Winter',
    flag: '\u{1F6F0}\u{FE0F}',
    disabled: true,
    hint: 'Coming soon',
  },
]

const TOPO_GLOBAL_CARDS: BasemapCard[] = [
  { preset: 'outdoors-summer', label: 'Global Summer', flag: '\u{1F30D}' },
  { preset: 'outdoors-winter', label: 'Global Winter', flag: '\u{1F30D}' },
]

const TOPO_COUNTRY_CARDS: BasemapCard[] = [
  { preset: 'swisstopo', label: 'Switzerland', flag: '\u{1F1E8}\u{1F1ED}' },
  { preset: 'swisstopo-winter', label: 'Switzerland Winter', flag: '\u{1F1E8}\u{1F1ED}' },
  { preset: 'ign', label: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { preset: 'basemap-at', label: 'Austria', flag: '\u{1F1E6}\u{1F1F9}' },
  { preset: 'bkg', label: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' },
  { preset: 'kartverket', label: 'Norway', flag: '\u{1F1F3}\u{1F1F4}' },
  { preset: 'usgs', label: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
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
        <div className="grid grid-cols-2 gap-2">{renderCards(TOPO_GLOBAL_CARDS)}</div>
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <span className="text-[9px] uppercase tracking-wider text-white/20 mb-2 block">
            Country
          </span>
          <div className="grid grid-cols-2 gap-2">{renderCards(TOPO_COUNTRY_CARDS)}</div>
        </div>
      </Section>
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
      className={`group flex flex-col items-center justify-center gap-1 rounded-lg h-[72px] border transition-all duration-150 w-full bg-transparent ${
        disabled
          ? 'border-white/[0.04] opacity-50 cursor-not-allowed'
          : active
            ? 'border-accent bg-accent/10 cursor-pointer'
            : 'border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04] cursor-pointer'
      }`}
    >
      {card.flag && <span className="text-2xl leading-none">{card.flag}</span>}
      <span
        className={`text-[12px] leading-tight text-center transition-colors ${
          active ? 'font-semibold text-accent' : 'text-white/60 group-hover:text-white/80'
        }`}
      >
        {card.label}
      </span>
      {card.hint && <span className="text-[9px] text-white/25 leading-tight">{card.hint}</span>}
    </button>
  )
}
