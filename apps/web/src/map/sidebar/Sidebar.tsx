import { useAuthStore } from '../../stores/authStore'
import { useMapStore } from '../../stores/mapStore'
import type { SidebarTab } from '../../stores/mapStore'
import BasemapsTab from './BasemapsTab'
import OverlaysTab from './OverlaysTab'
import SettingsTab from './SettingsTab'

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'basemaps', label: 'Basemaps' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'settings', label: 'Settings' },
]

/** Insets from edges — sidebar floats symmetrically on the right side */
const INSET_TOP = 'top-3'
const INSET_BOTTOM = 'bottom-60'

export default function Sidebar() {
  const { sidebarOpen, sidebarTab, setSidebarOpen, setSidebarTab } = useMapStore()
  const { user, signOut } = useAuthStore()
  const tabIndex = TABS.findIndex((t) => t.id === sidebarTab)

  return (
    <>
      {/* Collapsed toggle — dark glass pill on right edge */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className={`absolute ${INSET_TOP} right-3 z-10 mt-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/80 backdrop-blur-md text-white/70 hover:text-white hover:bg-slate-900/90 shadow-lg cursor-pointer border-none transition-all duration-150`}
          title="Open sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3l-5 5 5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* Sidebar — dark frosted glass, right side, inset from top/bottom */}
      <div
        className={`absolute ${INSET_TOP} ${INSET_BOTTOM} right-0 z-10 w-80 bg-slate-900/92 backdrop-blur-xl flex flex-col transition-transform duration-200 ease-out rounded-l-xl ${
          sidebarOpen
            ? 'translate-x-0 shadow-[-4px_0_24px_rgba(0,0,0,0.3)]'
            : 'translate-x-full shadow-none'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/[0.08] cursor-pointer border-none bg-transparent text-white/40 hover:text-white/70 transition-colors"
              title="Close sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-sm font-semibold text-white tracking-tight">mtamta</span>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <>
                <span className="text-[11px] text-white/40">{user.display_name}</span>
                <button
                  onClick={() => signOut()}
                  className="text-[11px] text-white/40 hover:text-white/70 border border-white/10 rounded-md px-2 py-0.5 bg-transparent cursor-pointer transition-colors"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tab bar with sliding pill indicator */}
        <div className="relative flex border-b border-white/[0.06]">
          <div
            className="absolute top-1 bottom-1 rounded-md bg-white/[0.08] transition-all duration-200 ease-out"
            style={{
              width: `${100 / TABS.length}%`,
              left: `${(tabIndex * 100) / TABS.length}%`,
            }}
          />
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSidebarTab(tab.id)}
              className={`relative flex-1 py-2.5 text-xs font-medium cursor-pointer border-none bg-transparent z-[1] transition-colors ${
                sidebarTab === tab.id ? 'text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content — scrollable with styled scrollbar */}
        <div className="sidebar-scroll flex-1 overflow-y-auto p-4">
          {sidebarTab === 'basemaps' && <BasemapsTab />}
          {sidebarTab === 'overlays' && <OverlaysTab />}
          {sidebarTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </>
  )
}
