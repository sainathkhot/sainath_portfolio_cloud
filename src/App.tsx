import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { World } from './world/World'
import { Overlay, Nav } from './ui/Overlay'
import { startMotion } from './ui/scroll'
import { S, markWorldReady } from './store'
import { FOV, CAM_DIST } from './world/Stage'

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    const ctx = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    ctx?.getExtension('WEBGL_lose_context')?.loseContext() // release the probe context right away
    return !!ctx
  } catch { return false }
}

export function App() {
  const gl = useMemo(() => { const ok = hasWebGL(); S.noGL = !ok; return ok }, [])
  // big screens and retina panels: start modest, let the monitor raise resolution if frames allow
  const maxDpr = Math.min(window.devicePixelRatio || 1, S.narrow ? 1.6 : 1.75, 3600 / Math.max(1, window.innerWidth))
  const [dpr, setDpr] = useState(Math.min(maxDpr, 1.3))
  const [layoutKey, setLayoutKey] = useState(0)
  const [lost, setLost] = useState(false)

  useEffect(() => startMotion(), [])
  useEffect(() => { if (!gl) markWorldReady() }, [gl])
  // recompose the world when the frame changes between landscape and portrait
  useEffect(() => {
    const mq = window.matchMedia('(max-aspect-ratio: 4/5), (max-width: 760px)')
    const on = () => { S.narrow = mq.matches; setLayoutKey((k) => k + 1) }
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  return (
    <>
      <div className="stage" aria-hidden="true">
        {gl && !lost ? (
          <Canvas
            key={layoutKey}
            flat
            dpr={dpr}
            frameloop={S.reduced ? 'demand' : 'always'}
            camera={{ fov: FOV, near: 0.1, far: 900, position: [0, 0.1, CAM_DIST] }}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
            eventSource={document.getElementById('root')!}
            eventPrefix="client"
            onCreated={({ gl: r, setFrameloop }) => {
              const el = r.domElement
              // three learns of a lost context from an async event; until then render() and compile() would still try to
              // build shaders on a dead context. The context itself knows synchronously, so ask it first.
              const ctx = r.getContext()
              const render = r.render.bind(r)
              r.render = ((...args: Parameters<typeof render>) => { if (!ctx.isContextLost()) render(...args) }) as typeof r.render
              const compile = r.compile.bind(r)
              r.compile = ((...args: Parameters<typeof compile>) => (ctx.isContextLost() ? new Set() : compile(...args))) as typeof r.compile
              // if the GPU drops the context (driver reset, too many tabs): stop drawing at once, show the sky, rebuild shortly
              el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setFrameloop('never'); setLost(true) }, { once: true })
            }}
          >
            <PerformanceMonitor
              onDecline={() => { S.low = true; setDpr((d) => Math.max(0.85, d - 0.25)) }}
              onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.15))}
              flipflops={4}
              onFallback={() => setDpr(1)}
            />
            <World />
          </Canvas>
        ) : (
          <div className="nogl" />
        )}
      </div>
      {lost && <ContextRestorer onRestore={() => { setLost(false); setLayoutKey((k) => k + 1) }} />}
      <div className="grain" aria-hidden="true" />
      <div className="curtain" aria-hidden="true"><span>Sainath Khot</span><i /></div>
      <Nav />
      <Overlay />
    </>
  )
}

/** After a context loss, try to rebuild the world a moment later. */
function ContextRestorer({ onRestore }: { onRestore: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(() => { if (hasWebGL()) onRestore() }, 1500)
    return () => window.clearTimeout(id)
  }, [onRestore])
  return null
}
