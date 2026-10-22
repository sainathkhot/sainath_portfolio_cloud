import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// ARTIFACT=1 builds one self-contained bundle (the claude.ai page cannot load extra script files).
// The normal build splits vendors into long-cacheable chunks.
const single = process.env.ARTIFACT === '1'

// Preview-only diagnostics (the theme lab in preview-tools/ and the ?perf overlay in src/ui/PerfHud.tsx). Cloudflare
// Workers Builds names the branch it builds in WORKERS_CI_BRANCH: the tools are built for preview branches and never
// for main. Local builds leave them out unless PREVIEW_TOOLS=1.
const branch = process.env.WORKERS_CI_BRANCH
const previewTools = branch ? branch !== 'main' : process.env.PREVIEW_TOOLS === '1'

/** copy preview-tools/ into the build output (preview builds only) */
function previewToolsPlugin(): Plugin {
  const root = 'preview-tools'
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  return {
    name: 'preview-tools',
    apply: 'build',
    generateBundle() {
      for (const file of walk(root)) this.emitFile({ type: 'asset', fileName: relative(root, file), source: readFileSync(file) })
    },
  }
}

export default defineConfig({
  plugins: [react(), ...(previewTools ? [previewToolsPlugin()] : [])],
  define: { __PREVIEW_TOOLS__: JSON.stringify(previewTools) },
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
