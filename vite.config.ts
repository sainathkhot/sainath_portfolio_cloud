import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ARTIFACT=1 builds one self-contained bundle (the claude.ai page cannot load extra script files).
// The normal build splits vendors into long-cacheable chunks.
const single = process.env.ARTIFACT === '1'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1400,
    sourcemap: false,
    rollupOptions: single ? { output: { inlineDynamicImports: true } } : {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/three\/(build|src)/.test(id)) return 'three'
          if (/@react-three|troika|three-stdlib|three-mesh-bvh|camera-controls|maath|meshline/.test(id)) return 'r3f'
          if (/gsap|lenis/.test(id)) return 'motion'
          if (/react|scheduler/.test(id)) return 'react'
        },
      },
    },
  },
})
