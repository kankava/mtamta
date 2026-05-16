import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@mtamta/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@mtamta/map-core': path.resolve(__dirname, '../../packages/map-core/src/index.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        // Split each provider SDK into its own chunk so an app-code change
        // doesn't bust the (large, rarely-changing) SDK cache. Uses Rolldown's
        // codeSplitting groups rather than manualChunks: the latter folds Vite's
        // preload-helper into the first vendor chunk, which then loads eagerly.
        codeSplitting: {
          groups: [
            // Highest priority: pull Vite's preload runtime into its own chunk
            // so it isn't parked inside a vendor SDK chunk (which the eager
            // entry would then have to import, dragging the SDK in with it).
            {
              name: 'vite-preload',
              priority: 100,
              test: /vite[\\/](preload-helper|modulepreload-polyfill)/,
            },
            { name: 'mapbox-gl', test: /node_modules[\\/]mapbox-gl[\\/]/ },
            { name: 'maptiler-sdk', test: /node_modules[\\/](@maptiler[\\/]sdk|maplibre-gl)[\\/]/ },
          ],
        },
      },
    },
  },
})
