/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
  readonly VITE_MAPTILER_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
