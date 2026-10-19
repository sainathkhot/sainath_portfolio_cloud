import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { S } from '../store'

// ---------- canvas-drawn surfaces: software rendered as paper, glass and metal ----------
export const MONO = '"DM Mono", ui-monospace, monospace'
export const SANS = '"DM Sans", system-ui, sans-serif'
export const SERIF = '"Instrument Serif", Georgia, serif'

export function paperGrain(g: CanvasRenderingContext2D, w: number, h: number, base: string, amt = 14) {
  g.fillStyle = base; g.fillRect(0, 0, w, h)
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amt
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
}

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void

const drawPunchCard: Draw = (g, w, h) => {
  paperGrain(g, w, h, '#F1ECDD', 10)
  g.fillStyle = '#E6DCC4'; g.fillRect(0, 0, w, 64)
  g.fillStyle = '#122027'; g.font = `500 26px ${MONO}`; g.fillText('LANGGRAPH', 34, 42)
  g.textAlign = 'right'; g.fillText('STATE', w - 34, 42); g.textAlign = 'left'
  g.font = `700 150px ${SANS}`; g.fillText('12', 30, 230)
  g.font = `500 30px ${MONO}`; g.fillStyle = '#5A747C'; g.fillText('NODE WORKFLOW', 36, 280)
  // punched node grid: 12 nodes, one column each
  for (let c = 0; c < 12; c++) {
    for (let r = 0; r < 6; r++) {
      const x = 44 + c * ((w - 88) / 11), y = 340 + r * 40
      const punched = (r === (c * 5 + 2) % 6) || (c === 7 && r === 1)
      g.fillStyle = punched ? 'rgba(18,32,39,0.92)' : 'rgba(90,116,124,0.35)'
      if (punched) { g.fillRect(x - 6, y - 12, 12, 24) } else { g.font = `400 18px ${MONO}`; g.fillText(String(r), x - 5, y + 6) }
    }
  }
  g.fillStyle = '#F28A28'; g.fillRect(34, h - 70, 70, 8)
  g.fillStyle = '#5A747C'; g.font = `400 20px ${MONO}`; g.fillText('ANALYSE · PLAN · BUILD · REVIEW', 34, h - 30)
}

const drawTaskSheet: Draw = (g, w, h) => {
  paperGrain(g, w, h, '#FAF8F1', 8)
  g.strokeStyle = 'rgba(79,174,213,0.35)'; g.lineWidth = 2
  for (let y = 150; y < h - 30; y += 46) { g.beginPath(); g.moveTo(30, y); g.lineTo(w - 30, y); g.stroke() }
  g.strokeStyle = 'rgba(242,138,40,0.6)'; g.beginPath(); g.moveTo(84, 0); g.lineTo(84, h); g.stroke()
  g.fillStyle = '#122027'; g.font = `500 30px ${MONO}`; g.fillText('AGENT / 05', 104, 70)
  g.font = `italic 400 54px ${SERIF}`; g.fillText('five agents', 104, 128)
  g.font = `400 24px ${MONO}`
  const rows = ['requirements', 'sprint plan', 'code', 'review', 'checkpoint']
  rows.forEach((t, i) => {
    const y = 186 + i * 46
    g.strokeStyle = '#122027'; g.lineWidth = 2; g.strokeRect(104, y - 20, 22, 22)
    if (i < 3) { g.beginPath(); g.moveTo(108, y - 9); g.lineTo(114, y - 2); g.lineTo(124, y - 18); g.stroke() }
    g.fillStyle = i < 3 ? '#5A747C' : '#122027'; g.fillText(t, 144, y)
  })
  g.save(); g.translate(w - 120, h - 110); g.rotate(-0.25)
  g.strokeStyle = 'rgba(242,138,40,0.85)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 66, 0, Math.PI * 2); g.stroke()
  g.fillStyle = 'rgba(242,138,40,0.9)'; g.font = `500 20px ${MONO}`; g.textAlign = 'center'; g.fillText('3 LLMs', 0, -6); g.fillText('ROUTED', 0, 20)
  g.restore()
}

const drawGlass: Draw = (g, w, h) => {
  g.clearRect(0, 0, w, h)
  g.fillStyle = 'rgba(230,246,252,0.28)'; g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1
  for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
  for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12)
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.font = `500 34px ${MONO}`; g.fillText('TRACE / ACTIVE', 30, 62)
  g.fillStyle = '#F28A28'; g.beginPath(); g.arc(w - 46, 50, 10, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3; g.beginPath()
  for (let x = 30; x < w - 30; x += 4) {
    const t = x / w
    const y = h * 0.6 + Math.sin(t * 22) * 18 * Math.sin(t * 3.1) + (t > 0.62 && t < 0.7 ? -54 : 0)
    x === 30 ? g.moveTo(x, y) : g.lineTo(x, y)
  }
  g.stroke()
  g.font = `400 20px ${MONO}`; g.fillText('node 09 / 12 · held for review', 30, h - 34)
}

const drawCheckpoint: Draw = (g, w, h) => {
  paperGrain(g, w, h, '#F3F3EC', 8)
  g.fillStyle = '#F28A28'; g.fillRect(0, 0, 150, h)
  g.fillStyle = '#F3F3EC'
  for (let y = 14; y < h; y += 26) { g.beginPath(); g.arc(150, y, 6, 0, Math.PI * 2); g.fill() }
  g.save(); g.translate(92, h / 2); g.rotate(-Math.PI / 2); g.fillStyle = '#122027'; g.font = `500 28px ${MONO}`; g.textAlign = 'center'; g.fillText('HOLD', 0, 0); g.restore()
  g.fillStyle = '#122027'; g.font = `500 26px ${MONO}`; g.fillText('HUMAN', 186, 70); g.fillText('CHECKPOINT', 186, 104)
  g.font = `italic 400 64px ${SERIF}`; g.fillText('approve?', 186, 190)
  g.strokeStyle = '#122027'; g.lineWidth = 2
  g.strokeRect(186, 222, 30, 30); g.strokeRect(330, 222, 30, 30)
  g.font = `400 22px ${MONO}`; g.fillText('yes', 226, 245); g.fillText('send back', 370, 245)
}

export function useCanvasTexture(draw: Draw, w: number, h: number, transparent = false) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
    return t
  }, [w, h])
  useEffect(() => {
    let alive = true
    const paint = () => {
      if (!alive) return
      const g = (tex.image as HTMLCanvasElement).getContext('2d')!
      if (transparent) g.clearRect(0, 0, w, h)
      draw(g, w, h); tex.needsUpdate = true
    }
    paint()
    Promise.all([document.fonts.load(`500 20px "DM Mono"`), document.fonts.load(`700 20px "DM Sans"`), document.fonts.load(`italic 400 20px "Instrument Serif"`)]).then(paint).catch(() => {})
    return () => { alive = false }
  }, [tex])
  return tex
}

/** paper plane with a gentle curl along x */
function curledPlane(w: number, h: number, curl: number) {
  const g = new THREE.PlaneGeometry(w, h, 24, 4)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2); p.setZ(i, curl * x * x) }
  g.computeVertexNormals()
  return g
}

type FloatProps = { pos: [number, number, number]; rot?: [number, number, number]; depth: number; phase: number; children: React.ReactNode; scale?: number }

/** Drifts on its own clock, parallaxes with the pointer by depth, lifts away as the hero scrolls. */
function Floater({ pos, rot = [0, 0, 0], depth, phase, children, scale = 1 }: FloatProps) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    const t = S.reduced ? 0 : clock.elapsedTime
    const g = ref.current
    const lift = Math.min(1, S.s) // hero progress
    g.position.set(
      pos[0] + Math.sin(t * 0.31 + phase) * 0.12 + S.px * depth * 0.35 + Math.sign(pos[0]) * lift * 2.2,
      pos[1] + Math.sin(t * 0.47 + phase * 2) * 0.16 - S.py * depth * 0.2 + lift * 1.6,
      pos[2],
    )
    g.rotation.set(rot[0] + Math.sin(t * 0.23 + phase) * 0.08, rot[1] + Math.sin(t * 0.19 + phase) * 0.18 + S.px * 0.1, rot[2] + Math.sin(t * 0.29 + phase) * 0.05 + lift * 0.4 * Math.sign(pos[0]))
  })
  return <group ref={ref} scale={scale}>{children}</group>
}

export function HeroArtifacts({ narrow }: { narrow: boolean }) {
  const card = useCanvasTexture(drawPunchCard, 520, 640)
  const sheet = useCanvasTexture(drawTaskSheet, 560, 460)
  const glass = useCanvasTexture(drawGlass, 640, 400, true)
  const check = useCanvasTexture(drawCheckpoint, 600, 290)
  const geos = useMemo(() => ({
    card: curledPlane(1.04, 1.28, 0.08), sheet: curledPlane(1.4, 1.15, -0.1), check: curledPlane(1.5, 0.725, 0.06),
  }), [])
  const sz = 1
  // desktop: place by fraction of the frame half-width at each object's depth, so no aspect ratio crops them differently
  const { size } = useThree()
  const aspect = size.width / size.height
  const X = (fx: number, z: number, _nx: number) => fx * Math.tan(THREE.MathUtils.degToRad(17.5)) * aspect * (9.5 - z)
  // phones: the title owns the top and the copy owns the bottom, so only two objects float beside the figure
  if (narrow) {
    return (
      <group>
        {/* placed by fraction of the frame width at their depth, so they stay inside the frame on any phone or tablet */}
        {/* tablets: the headline runs down to mid-frame, so the token sits low and right, clear of it */}
        <Floater pos={[X(aspect > 0.6 ? 0.72 : -0.7, -2.0, 0), aspect > 0.6 ? -1.2 : 0.4, -2.0]} rot={[1.2, 0.3, 0]} depth={0.3} phase={5.3} scale={0.55}>
          <BrassToken />
        </Floater>
        <Floater pos={[X(-0.66, 0.6, 0), -0.8, 0.6]} rot={[-0.2, 0.5, -0.1]} depth={0.6} phase={2.9} scale={0.42}>
          <mesh>
            <boxGeometry args={[1.6, 1.0, 0.04]} />
            <meshPhysicalMaterial map={glass} transparent opacity={0.92} roughness={0.08} metalness={0} clearcoat={1} clearcoatRoughness={0.05} color="#e9f7fc" />
          </mesh>
        </Floater>
      </group>
    )
  }
  return (
    <group>
      <Floater pos={[X(-0.85, -1.6, -5.2), 2.05, -1.6]} rot={[0.1, 0.35, 0.22]} depth={0.6} phase={0.3} scale={sz}>
        <mesh geometry={geos.card}><meshStandardMaterial map={card} roughness={0.92} side={THREE.DoubleSide} /></mesh>
      </Floater>
      <Floater pos={[X(0.85, -1.2, 5.1), 1.95, -1.2]} rot={[0.15, -0.4, -0.12]} depth={0.7} phase={1.7} scale={sz}>
        <mesh geometry={geos.sheet}><meshStandardMaterial map={sheet} roughness={0.95} side={THREE.DoubleSide} /></mesh>
      </Floater>
      <Floater pos={[X(-0.97, 0.6, -5.5), -0.15, 0.6]} rot={[-0.2, 0.5, -0.1]} depth={1.1} phase={2.9} scale={sz}>
        <mesh>
          <boxGeometry args={[1.6, 1.0, 0.04]} />
          <meshPhysicalMaterial map={glass} transparent opacity={0.92} roughness={0.08} metalness={0} clearcoat={1} clearcoatRoughness={0.05} color="#e9f7fc" />
        </mesh>
      </Floater>
      <Floater pos={[X(0.97, 1.4, 5.3), -0.55, 1.4]} rot={[-0.1, -0.45, 0.14]} depth={1.2} phase={4.1} scale={sz}>
        <mesh geometry={geos.check}><meshStandardMaterial map={check} roughness={0.9} side={THREE.DoubleSide} /></mesh>
      </Floater>
      {/* brass agent token */}
      <Floater pos={[X(0.4, -3.4, 2.6), 2.55, -3.4]} rot={[1.2, 0.3, 0]} depth={0.3} phase={5.3} scale={sz}>
        <BrassToken />
      </Floater>
      {/* graphite model chip */}
      <Floater pos={[X(-0.44, -0.4, -2.2), 2.35, -0.4]} rot={[0.5, 0.6, 0.2]} depth={1.4} phase={6.6} scale={sz * 0.9}>
        <ModelChip />
      </Floater>
      {/* distant paper for depth */}
      <Floater pos={[X(-0.62, -9, -7.2), 0.4, -9]} rot={[0.2, 0.6, 0.3]} depth={0.1} phase={8.1}>
        <mesh geometry={geos.card} scale={0.8}><meshStandardMaterial map={card} roughness={0.9} side={THREE.DoubleSide} transparent opacity={0.9} /></mesh>
      </Floater>
      <Floater pos={[X(0.64, -10, 7.6), -0.6, -10]} rot={[0.1, -0.7, -0.2]} depth={0.1} phase={9.4}>
        <mesh geometry={geos.check} scale={0.8}><meshStandardMaterial map={check} roughness={0.9} side={THREE.DoubleSide} /></mesh>
      </Floater>
    </group>
  )
}

function BrassToken() {
  const face = useCanvasTexture((g, w, h) => {
    g.fillStyle = '#C99A4E'; g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(80,50,10,0.55)'; g.lineWidth = 6
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); g.stroke()
    g.fillStyle = 'rgba(70,44,10,0.75)'; g.textAlign = 'center'
    g.font = `700 150px ${SANS}`; g.fillText('05', w / 2, h / 2 + 30)
    g.font = `500 30px ${MONO}`; g.fillText('AGENTS', w / 2, h / 2 + 90)
  }, 400, 400)
  return (
    <mesh rotation={[0, 0, 0]}>
      <cylinderGeometry args={[0.42, 0.42, 0.09, 64]} />
      <meshStandardMaterial attach="material-0" color="#B8873C" metalness={1} roughness={0.32} />
      <meshStandardMaterial attach="material-1" map={face} metalness={0.9} roughness={0.38} color="#ffe2b0" />
      <meshStandardMaterial attach="material-2" map={face} metalness={0.9} roughness={0.38} color="#ffe2b0" />
    </mesh>
  )
}

function ModelChip() {
  const top = useCanvasTexture((g, w, h) => {
    g.fillStyle = '#18272E'; g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(216,174,97,0.8)'; g.lineWidth = 3; g.strokeRect(24, 24, w - 48, h - 48)
    g.fillStyle = '#D8AE61'; g.font = `500 44px ${MONO}`; g.fillText('LLM / 03', 52, 110)
    g.fillStyle = 'rgba(243,243,236,0.6)'; g.font = `400 24px ${MONO}`; g.fillText('openrouter · ollama', 52, 160)
    g.fillStyle = '#F28A28'; g.beginPath(); g.arc(w - 70, h - 70, 12, 0, Math.PI * 2); g.fill()
  }, 512, 300)
  const pins = useMemo(() => Array.from({ length: 9 }, (_, i) => i), [])
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.0, 0.16, 0.6]} />
        <meshStandardMaterial attach="material-0" color="#1b2a31" roughness={0.5} />
        <meshStandardMaterial attach="material-1" color="#1b2a31" roughness={0.5} />
        <meshStandardMaterial attach="material-2" map={top} roughness={0.45} />
        <meshStandardMaterial attach="material-3" color="#1b2a31" roughness={0.5} />
        <meshStandardMaterial attach="material-4" color="#1b2a31" roughness={0.5} />
        <meshStandardMaterial attach="material-5" color="#1b2a31" roughness={0.5} />
      </mesh>
      {pins.map((i) => (
        <group key={i}>
          <mesh position={[-0.44 + i * 0.11, -0.03, 0.34]}><boxGeometry args={[0.04, 0.03, 0.1]} /><meshStandardMaterial color="#D8AE61" metalness={1} roughness={0.25} /></mesh>
          <mesh position={[-0.44 + i * 0.11, -0.03, -0.34]}><boxGeometry args={[0.04, 0.03, 0.1]} /><meshStandardMaterial color="#D8AE61" metalness={1} roughness={0.25} /></mesh>
        </group>
      ))}
    </group>
  )
}
