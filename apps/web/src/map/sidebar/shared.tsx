export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2.5">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function Toggle({
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
