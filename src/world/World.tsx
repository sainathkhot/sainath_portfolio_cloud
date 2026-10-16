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

/** One-time GPU bake of the noise every cloud samples. */
function NoiseBake() {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => bakeNoise(gl), [gl])
  return null
}

/**
 * Compile every scene's shaders and upload every texture once, behind the loading curtain,
 * so the first time the camera reaches a scene there is no compile hitch.
 */
function Warmup() {
  const { gl, scene, camera } = useThree()
  const n = useRef(0)
  useFrame(() => {
    n.current++
    if (n.current !== 4 || gl.getContext().isContextLost()) return
    const hidden: THREE.Object3D[] = []
    scene.traverse((o) => {
      if (!o.visible) { hidden.push(o); o.visible = true }
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && !Array.isArray(m) && m.map) gl.initTexture(m.map)
    })
    try { gl.compile(scene, camera) } catch { /* a failed warm-up only costs a hitch later */ }
    hidden.forEach((o) => { o.visible = false })
    markWorldReady()
  })
  return null
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
  const { scene, camera } = useThree()
  useEffect(() => { if (new URLSearchParams(location.search).has('debug')) (window as any).__three = { scene, camera } }, [scene, camera])
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
