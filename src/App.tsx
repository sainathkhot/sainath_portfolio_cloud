import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { World } from './world/World'
import { Overlay, Nav } from './ui/Overlay'
import { startMotion } from './ui/scroll'
import { S, markWorldReady, whenWorldReady, NARROW_QUERY } from './store'
import { FOV, CAM_DIST } from './world/Stage'

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    const ctx = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    ctx?.getExtension('WEBGL_lose_context')?.loseContext() // release the probe context right away
    return !!ctx
  } catch { return false }
}

/**
 * Render resolution for this screen.
 *
 * The canvas is drawn at the screen's own pixel density, up to 2 device pixels per CSS pixel (past that the eye gains
 * little and the GPU pays for every pixel) and within a per-frame pixel budget, so a big retina window doesn't shade
 * five million pixels a frame. This replaces a policy that started every screen at 1.3 and capped phones at 1.6: on a
 * 3× phone the scene was drawn at well under half the screen's resolution and stretched to fit, which is why it looked
 * soft. The adaptive step below may lower it when frames can't keep up, but never below the CSS pixel, and on dense
 * screens no lower than two thirds of the target.
 */
function quality() {
  const dpr = window.devicePixelRatio || 1
  const area = Math.max(1, window.innerWidth * window.innerHeight)
  // (wide screens: 3M, down from 4.2M, which let a retina laptop render ~1.8×, about twice the pixels of the 1.3× it
  // once used; the clouds are many translucent layers, so every pixel is shaded several times)
  const budget = S.narrow ? 2.6e6 : 3.0e6 // device pixels per frame
  const target = Math.max(1, Math.min(dpr, 2, Math.sqrt(budget / area)))
  const floor = Math.min(target, Math.max(1, target * 0.67))
  // multisampling only where pixels are coarse: at 1.75+ device pixels per CSS pixel the edges are already fine, and
  // MSAA would only add memory bandwidth (the scarcest thing a phone GPU has)
  return { target: +target.toFixed(2), floor: +floor.toFixed(2), msaa: target < 1.75 }
}

export function App() {
  const gl = useMemo(() => { const ok = hasWebGL(); S.noGL = !ok; return ok }, [])
  const [q, setQ] = useState(quality)
  const [dpr, setDpr] = useState(q.target)
  const [layoutKey, setLayoutKey] = useState(0)
  const [lost, setLost] = useState(false)
  // Every resolution change reallocates the canvas (a visible hitch), so changes are queued and applied only when the
  // page is idle (no scroll for a moment), never in the middle of a transition. At most a few per visit.
  const pending = useRef<number | null>(null)
  const changes = useRef(0)
  const request = (v: number) => { if (changes.current < 4) pending.current = +v.toFixed(2) }
  useEffect(() => {
    S.dpr = q.target
    const id = window.setInterval(() => {
      const v = pending.current
      if (v == null || performance.now() - S.lastScrollT < 900) return
      pending.current = null
      setDpr((d) => { if (Math.abs(d - v) < 0.04) return d; changes.current++; S.dpr = v; return v })
    }, 250)
    return () => window.clearInterval(id)
  }, [])
  // the load-time measurement (World.tsx, behind the curtain) sets the starting resolution for this GPU; it applies at
  // once, while the curtain is still up
  useEffect(() => {
    const on = (e: Event) => {
      const v = +Math.max(q.floor, Math.min(q.target, (e as CustomEvent<number>).detail)).toFixed(2)
      S.dpr = v; setDpr(v)
    }
    window.addEventListener('gpu-budget', on)
    return () => window.removeEventListener('gpu-budget', on)
  }, [q])
  // the adaptive step only starts once the world is built and has settled: loading hitches are not a verdict on the GPU
  const [adapt, setAdapt] = useState(false)
  useEffect(() => {
    let id = 0
    setAdapt(false)
    whenWorldReady(8000).then(() => { id = window.setTimeout(() => setAdapt(true), 3000) })
    return () => window.clearTimeout(id)
  }, [layoutKey])
  // window resized, or moved to a screen with a different density: re-derive the resolution (debounced, and only
  // when it really changes, since every change reallocates the canvas)
  useEffect(() => {
    let id = 0
    const re = () => {
      window.clearTimeout(id)
      id = window.setTimeout(() => {
        const n = quality()
        setQ((o) => (Math.abs(o.target - n.target) > 0.05 || o.floor !== n.floor ? n : o))
        const d = S.dpr || n.target
        if (d > n.target + 0.05 || d < n.floor - 0.05) request(Math.min(n.target, Math.max(n.floor, d)))
      }, 300)
    }
    window.addEventListener('resize', re)
    const dppx = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    dppx.addEventListener('change', re)
    return () => { window.clearTimeout(id); window.removeEventListener('resize', re); dppx.removeEventListener('change', re) }
  }, [])

  useEffect(() => startMotion(), [])
  useEffect(() => { if (!gl) markWorldReady() }, [gl])
  // recompose the world when the frame changes between landscape and portrait
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
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
            gl={{ antialias: q.msaa, alpha: false, powerPreference: 'high-performance', stencil: false }}
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
            {/* adaptive resolution: step down when frames fall short for a couple of seconds, back up when they
                recover; after a few changes it settles where it is (each change reallocates the canvas, itself a hitch) */}
            {adapt && <PerformanceMonitor
              bounds={(hz) => (hz > 90 ? [55, 85] : [44, 57])}
              onDecline={() => request(Math.max(q.floor, (pending.current ?? dpr) - 0.25))}
              onIncline={() => request(Math.min(q.target, (pending.current ?? dpr) + 0.25))}
              flipflops={4}
            />}
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
