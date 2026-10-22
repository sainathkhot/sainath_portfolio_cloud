import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { S, damp, sstep, hash, togglePin, hovers } from '../store'
import { FOV } from './Stage'
import { useCanvasTexture, paperGrain, MONO, SANS, type Draw } from './Artifacts'

// "Also built": one small object per project floats above the cloud deck beside the list.
// Hovering a row brings its object forward and turns it to face the camera; the others step back into the haze.
// The DOM row reveal and this motion share a ~0.5 s time constant so text and object arrive together.
export const SPEC_Z = -151 // in front of the cloud deck, which starts at z -153
const OFFSETS: [number, number][] = [[-0.82, 0.48], [0.82, 0.36], [0, -0.7]]
const N = OFFSETS.length
const W = [0, 0, 0] // selection weight per object
const REST_YAW = [-0.35, -0.5, -0.3]
// raycastable but never drawn
const HIT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
let NONE = 1 // 1 while nothing is selected

/** rise out of the deck on entry, sink back on exit */
const arrival = () => sstep(7.98, 8.22, S.s) * (1 - sstep(8.82, 8.97, S.s))

export function Specimens() {
  const { size } = useThree()
  const root = useRef<THREE.Group>(null!)
  const items = useRef<THREE.Group[]>([])
  const base = useMemo(() => {
    const aspect = size.width / size.height
    const hw = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect * 9
    // phones: centred in the band the list leaves free at the top (from under the nav to ~27% down, styles.css)
    if (S.narrow) {
      const visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 9.6
      const f = (72 + 0.135 * size.height) / size.height // fraction of the frame height, from the top
      return new THREE.Vector3(0, 4.05 + (1 - 2 * f) * (visH / 2), SPEC_Z)
    }
    return new THREE.Vector3(Math.min(0.55 * hw, 3.0), 4.25, SPEC_Z)
  }, [size.width, size.height])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const ar = arrival()
    // the set rises out of the deck as one group and is simply absent outside its section: no stray half-states
    const on = S.s > 7.9 && S.s < 9.12 && ar > 0.01
    root.current.visible = on
    if (!on) { if (S.specHover >= 0) S.specHover = -1; return }
    root.current.position.set(base.x + S.px * 0.25, base.y - (1 - ar) * 2.2 + S.py * 0.12, base.z)
    root.current.scale.setScalar((S.narrow ? 0.66 : 1.3) * ar)
    NONE = damp(NONE, S.atmos < 0 ? 1 : 0, 6, dt)
    for (let i = 0; i < N; i++) {
      W[i] = damp(W[i], S.atmos === i ? 1 : 0, 6, dt)
      const g = items.current[i]
      if (!g) continue
      // phones: the list fills the frame, so the objects sit in one row above it
      const [ox, oy] = S.narrow ? [(i - 1) * 1.05, 0] : OFFSETS[i]
      const away = Math.max(0, 1 - NONE - W[i]) // another project is chosen
      // the chosen object comes to the centre; the others recede and are gone, rather than lingering as fragments.
      // each object scales as one piece, so its parts never collapse independently
      g.position.set(ox * (1 - W[i]) * (1 + away * 0.6), oy * (1 - W[i]) * (1 + away * 0.6), W[i] * 0.9 - away * 1.2)
      const sc = 0.66 * NONE + 1.25 * W[i]
      g.scale.setScalar(Math.max(0.0001, sc))
      g.visible = sc > 0.03
      g.rotation.y = REST_YAW[i] * (1 - W[i]) + 0.25 * W[i]
    }
  })

  const set = (i: number) => (el: THREE.Group | null) => { if (el) items.current[i] = el }
  // the object half of the two-way hover: it reports itself, scroll.ts resolves the shared active project
  const hit = (i: number) => (
    <mesh
      material={HIT}
      onPointerOver={(e) => { e.stopPropagation(); if (hovers(e)) S.specHover = i }}
      onPointerOut={() => { if (S.specHover === i) S.specHover = -1 }}
      // a tap on a list row (or a link) is handled by that element, so one gesture is only ever one toggle
      onClick={(e) => { e.stopPropagation(); if (S.touch && !(e.nativeEvent.target as Element)?.closest?.('.others, a, button')) togglePin(i) }}
    >
      <sphereGeometry args={[0.72, 16, 12]} />
    </mesh>
  )
  return (
    <group ref={root} position={base}>
      <group ref={set(0)}><ReconBody />{hit(0)}</group>
      <group ref={set(1)}><FinSageBody />{hit(1)}</group>
      <group ref={set(2)}><CallsBody />{hit(2)}</group>
    </group>
  )
}

/** Recon: an intelligence report, its pages fanning open */
const drawReport: Draw = (g, w, h) => {
  paperGrain(g, w, h, '#FAF8F1', 8)
  g.fillStyle = '#122027'; g.font = `500 22px ${MONO}`; g.fillText('COMPANY BRIEF', 34, 52)
  g.fillStyle = '#4FAED5'; g.fillRect(34, 70, 120, 6)
  g.font = `700 54px ${SANS}`; g.fillStyle = '#122027'; g.fillText('Recon', 34, 140)
  g.fillStyle = 'rgba(18,32,39,0.18)'
  for (let i = 0; i < 9; i++) g.fillRect(34, 176 + i * 30, (w - 68) * (0.55 + 0.45 * hash(i * 3.1)), 9)
  g.save(); g.translate(w - 92, h - 84); g.rotate(-0.2)
  g.strokeStyle = 'rgba(242,138,40,0.9)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke()
  g.fillStyle = 'rgba(242,138,40,0.95)'; g.font = `500 22px ${MONO}`; g.textAlign = 'center'; g.fillText('< 60 s', 0, 8)
  g.restore()
}
function ReconBody() {
  const tex = useCanvasTexture(drawReport, 400, 520)
  const pages = useRef<THREE.Mesh[]>([])
  const scan = useRef<THREE.Mesh>(null!)
  const geo = useMemo(() => new THREE.PlaneGeometry(0.8, 1.04), [])
  useFrame(() => {
    const w = W[0]
    pages.current.forEach((m, i) => { if (m) { m.rotation.z = (i - 1) * (0.06 + w * 0.2); m.position.set((i - 1) * (0.05 + w * 0.22), 0, (i - 1) * 0.03) } })
    // one pass of the scan line as the report is opened, then it rests at the foot of the page
    scan.current.position.y = 0.5 - sstep(0.15, 0.95, w) * 0.98
    ;(scan.current.material as THREE.MeshBasicMaterial).opacity = w * 0.8
  })
  return (
    <group rotation={[-0.12, -0.35, 0.05]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { if (el) pages.current[i] = el }} geometry={geo}>
          <meshStandardMaterial map={tex} roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh ref={scan} position={[0, 0, 0.06]}>
        <planeGeometry args={[0.86, 0.012]} />
        <meshBasicMaterial color="#F28A28" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

/** FinSage: transactions stacked into a running ledger of bars */
function FinSageBody() {
  const bars = useRef<THREE.Mesh[]>([])
  const geo = useMemo(() => new RoundedBoxGeometry(0.12, 1, 0.12, 2, 0.02), [])
  const heights = useMemo(() => Array.from({ length: 7 }, (_, i) => 0.25 + 0.6 * hash(i * 7.7 + 2)), [])
  useFrame(() => {
    const w = W[1]
    bars.current.forEach((m, i) => {
      if (!m) return
      // always a complete chart: at rest the bars stand at 70% of their values; chosen, they rise to full in a
      // gentle left-to-right wave and hold. No bar ever drops below a readable height
      const grow = sstep(i * 0.06, i * 0.06 + 0.55, w)
      const h = heights[i] * 1.05 * (0.7 + 0.3 * grow)
      m.scale.y = Math.max(0.05, h)
      m.position.y = -0.42 + m.scale.y / 2
    })
  })
  return (
    <group rotation={[0.18, -0.5, 0]}>
      <mesh position={[0, -0.46, 0]}>
        <boxGeometry args={[1.12, 0.06, 0.4]} />
        <meshStandardMaterial color="#1b2a31" roughness={0.5} />
      </mesh>
      {heights.map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) bars.current[i] = el }} geometry={geo} position={[-0.45 + i * 0.15, 0, 0]}>
          <meshStandardMaterial color={i === 5 ? '#F28A28' : i % 2 ? '#D8AE61' : '#F3F3EC'} metalness={i % 2 ? 0.7 : 0.05} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

const INK = new THREE.Color('#2a3d45'), SKY = new THREE.Color('#4FAED5')
/**
 * Call Transcription: a recorded waveform. Chosen, a playhead sweeps it once; the bars it has passed turn ink
 * (transcribed), and the transcript and its translation (two ink lines and a copper one) draw out beneath as one group.
 * The waveform never breaks apart, and the transcript group is hidden entirely whenever it isn't shown.
 */
function CallsBody() {
  const n = 26
  const bars = useRef<THREE.Mesh[]>([])
  const head = useRef<THREE.Mesh>(null!)
  const lines = useRef<THREE.Group>(null!)
  const geo = useMemo(() => new RoundedBoxGeometry(0.035, 1, 0.035, 1, 0.012), [])
  const amps = useMemo(() => Array.from({ length: n }, (_, i) => 0.08 + 0.42 * Math.abs(Math.sin(i * 1.7 + 0.6) * Math.sin(i * 0.43 + 1.1))), [])
  const mats = useMemo(() => Array.from({ length: n }, () => new THREE.MeshStandardMaterial({ color: '#4FAED5', roughness: 0.4 })), [])
  const LW = [1.15, 0.9, 1.0] // transcript line lengths
  useFrame(() => {
    const w = W[2]
    const sweep = sstep(0.05, 0.85, w) * 1.1 - 0.05
    bars.current.forEach((m, i) => {
      if (!m) return
      const x = -0.65 + (i / (n - 1)) * 1.3
      m.position.set(x, 0.12, 0)
      m.scale.set(1, amps[i], 1)
      const done = sstep(0, 0.06, sweep - i / (n - 1))
      mats[i].color.copy(SKY).lerp(INK, done * 0.85)
    })
    head.current.visible = w > 0.02 && sweep < 1
    head.current.position.x = -0.65 + Math.min(1, Math.max(0, sweep)) * 1.3
    const lg = sstep(0.35, 1, w)
    lines.current.visible = lg > 0.01
    lines.current.children.forEach((c, k) => { c.scale.x = Math.max(0.001, sstep(k * 0.15, 0.7 + k * 0.1, lg)) })
  })
  return (
    <group rotation={[0, -0.3, 0]}>
      {amps.map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) bars.current[i] = el }} geometry={geo} material={mats[i]} />
      ))}
      <mesh ref={head} position={[0, 0.12, 0.03]}><boxGeometry args={[0.012, 0.62, 0.012]} /><meshBasicMaterial color="#F28A28" /></mesh>
      <group ref={lines} position={[-0.65, -0.32, 0]}>
        {LW.map((l, k) => (
          <group key={k} position={[0, -k * 0.11, 0]}>
            {/* drawn from the left edge, like a line of text being written */}
            <mesh position={[l / 2, 0, 0]}>
              <boxGeometry args={[l, 0.024, 0.02]} />
              <meshStandardMaterial color={k === 2 ? '#F28A28' : '#2a3d45'} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
