import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mtamta/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@mtamta/map-core': path.resolve(__dirname, '../../packages/map-core/src/index.ts'),
    },
  },
})
