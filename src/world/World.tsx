import * as THREE from 'three'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { S, markWorldReady, subscribe } from '../store'
import { bakeNoise } from '../lib/glsl'
import { Specimens } from './Specimens'
import { Delivery } from './Delivery'
import { EParking } from './EParking'
import { Sky, Veil, Dust } from './Sky'
import { Film } from './Film'
import { Stage } from './Stage'
import { System } from './System'
import { Workbench } from './Workbench'
import { CloudField, cumulus, cloudSea } from './Cloud'
import { Accent } from './Accent'

/** One-time GPU bake of the noise every cloud samples. */
function NoiseBake() {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => bakeNoise(gl), [gl])
  return null
}

/**
 * Put the whole world on the GPU before anyone scrolls: every scene's shaders compiled, every geometry buffer and
 * texture uploaded, so the first time the camera reaches a scene there is nothing left to build mid-scroll.
 *
 * Everything is drawn once, hidden scenes and off-screen objects included, with the scissor test cut down to a
 * single pixel: the GPU receives the full frame's programs, buffers and textures in exactly the configuration the
 * scroll will use, but shades almost nothing. (The previous warm-up only called compile(), which skipped geometry
 * and every texture but a material's .map, and compiled for every scene's point lights at once, a light count the
 * page never actually shows; see Accent.tsx.) It runs behind the loading curtain, then twice more as late text and
 * textures arrive, so they are caught while the page is at rest.
 */
function Warmup() {
  const { gl, scene, camera } = useThree()
  const n = useRef(0)
  useFrame(() => {
    const f = ++n.current
    if ((f !== 4 && f !== 40 && f !== 140) || gl.getContext().isContextLost()) return
    warmWorld(gl, scene, camera)
    if (f === 4) { gpuBudget(gl, scene, camera); markWorldReady() }
  })
  return null
}

/**
 * Time a few full frames of the opening scene, synchronised with the GPU, while the loading curtain is still up, and
 * propose a starting resolution for this device: if a frame costs more than ~10 ms at the target resolution, scale the
 * pixel count down to fit (App.tsx clamps it between its floor and target). Measured once, at load.
 */
function gpuBudget(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  try {
    const ctx = gl.getContext(), px = new Uint8Array(4), ms: number[] = []
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now()
      gl.render(scene, camera)
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px) // waits for the frame to finish
      ms.push(performance.now() - t0)
    }
    ms.sort((a, b) => a - b)
    const m = ms[1] // the second-best of four: the first may still include driver warm-up
    S.gpuMs = +m.toFixed(1)
    if (m > 10) window.dispatchEvent(new CustomEvent('gpu-budget', { detail: gl.getPixelRatio() * Math.sqrt(10 / m) }))
  } catch { /* keep the default resolution */ }
}

function warmWorld(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const hidden: THREE.Object3D[] = [], culled: THREE.Object3D[] = []
  const seen = new Set<THREE.Texture>()
  const upload = (v: unknown) => { if (v && (v as THREE.Texture).isTexture && !seen.has(v as THREE.Texture)) { seen.add(v as THREE.Texture); gl.initTexture(v as THREE.Texture) } }
  scene.traverse((o) => {
    if (!o.visible) { hidden.push(o); o.visible = true }
    if (o.frustumCulled) { culled.push(o); o.frustumCulled = false }
    const mat = (o as THREE.Mesh).material
    for (const m of mat ? (Array.isArray(mat) ? mat : [mat]) : []) {
      for (const k in m) upload((m as unknown as Record<string, unknown>)[k])
      const u = (m as THREE.ShaderMaterial).uniforms
      if (u) for (const k in u) upload(u[k]?.value)
    }
  })
  const clip = gl.getScissorTest()
  gl.setScissorTest(true)
  gl.setScissor(0, 0, 1, 1)
  try { gl.render(scene, camera) } catch { /* a failed warm-up only costs a hitch later */ }
  gl.setScissorTest(clip)
  hidden.forEach((o) => { o.visible = false })
  culled.forEach((o) => { o.frustumCulled = true })
}

/** Reduced motion renders on demand: wake the loop briefly after any input. */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  const until = useRef(0)
  useEffect(() => {
    if (!S.reduced) return
    const kick = () => { until.current = performance.now() + 1500; invalidate() }
    const evs = ['scroll', 'pointermove', 'pointerdown', 'resize', 'keydown'] as const
    evs.forEach((e) => window.addEventListener(e, kick, { passive: true }))
    const unsub = subscribe(kick)
    kick()
    return () => { evs.forEach((e) => window.removeEventListener(e, kick)); unsub() }
  }, [invalidate])
  useFrame(() => { if (S.reduced && performance.now() < until.current) invalidate() })
  return null
}

/** ?debug only: expose the scene for QA scripts */
function DebugHandle() {
  const { scene, camera, gl } = useThree()
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.has('debug') || (__PREVIEW_TOOLS__ && q.has('perf'))) (window as any).__three = { scene, camera, gl }
  }, [scene, camera, gl])
  return null
}

function Env() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    ;(scene as any).environmentIntensity = 0.55
    return () => { env.dispose(); pm.dispose() }
  }, [gl, scene])
  return null
}

/** Open sky between stages: the about passage, the sea above the cloud deck, the evening horizon. */
function Passages() {
  const n = S.narrow ? 0.55 : 1
  const about = useMemo(() => [
    ...cloudSea({ c: [0, -6, -32], w: 70, d: 30, n: Math.round(120 * n), seed: 301, size: 2.2 }),
    ...cumulus({ c: [-18, -5, -40], w: 16, h: 9, n: Math.round(50 * n), seed: 303 }),
    ...cumulus({ c: [19, -5, -44], w: 18, h: 10, n: Math.round(50 * n), seed: 305 }),
    ...cumulus({ c: [-40, -6, -90], w: 40, h: 14, n: 40, seed: 307, size: 1.1 }),
    ...cumulus({ c: [40, -6, -95], w: 36, h: 12, n: 40, seed: 309, size: 1.1 }),
  ], [])
  const deck = useMemo(() => [
    ...cloudSea({ c: [0, 1.2, -162], w: 90, d: 18, n: Math.round(220 * n), seed: 311, size: 2.0 }),
    ...cumulus({ c: [-30, 0, -215], w: 40, h: 16, n: 50, seed: 313, size: 1.2 }),
    ...cumulus({ c: [26, 0, -225], w: 46, h: 18, n: 50, seed: 315, size: 1.2 }),
    ...cumulus({ c: [0, 0, -260], w: 120, h: 10, d: 20, n: 50, seed: 317, size: 1.4 }),
  ], [])
  return (
    <>
      <AboutGate><CloudField puffs={about} renderOrder={-3} hazeNear={20} hazeFar={160} /></AboutGate>
      <DeckGate><CloudField puffs={deck} renderOrder={-3} hazeNear={14} hazeFar={150} /></DeckGate>
    </>
  )
}

function DeckGate({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => { ref.current.visible = S.s > 7.6 && S.s < 10.4 })
  return <group ref={ref}>{children}</group>
}
function AboutGate({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => { ref.current.visible = S.s > 0.5 && S.s < 2.4 })
  return <group ref={ref}>{children}</group>
}

export function World() {
  return (
    <>
      <Accent />
      <NoiseBake />
      <DebugHandle />
      <Invalidator />
      <Env />
      <hemisphereLight args={['#d6eef8', '#f4e9d8', 1.15]} />
      <directionalLight position={[6, 7, 3]} intensity={2.3} color="#fff2df" />
      <directionalLight position={[-5, 2, 4]} intensity={0.45} color="#bfe2f2" />
      <Film />
      <Sky />
      <Suspense fallback={null}>
        <Stage z={0} variant="hero" index={0} />
        <Passages />
        <System />
        <EParking />
        <Workbench />
        <Specimens />
        <Delivery />
        <Stage z={-190} variant="contact" index={10} />
        <Warmup />
      </Suspense>
      <Dust />
      <Veil />
    </>
  )
}
