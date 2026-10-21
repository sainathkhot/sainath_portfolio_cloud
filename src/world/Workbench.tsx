import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text, QuadraticBezierLine } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { S, damp, emit, hash, subscribe, sstep, toolkitBand } from '../store'
import { claimAccent } from './Accent'
import { FOV } from './Stage'
import { TOOLS, type ToolId } from '../content'
import { FONTS } from '../lib/fonts'
import { CloudField, cumulus, cloudSea } from './Cloud'

const C_TOOL_LIGHT = new THREE.Color('#ffc27a')

export const WB_Z = -140

// Three rows by role (interface · services and data · AI), four columns. Rows are 2.05 apart so a label,
// and a hovered tool's role line, always clear the row below. Rows are offset slightly for an organic read.
const COL = [-4.05, -1.35, 1.35, 4.05]
const ROW = [2.3, 0, -2.3]
const at = (r: number, c: number, dx = 0, z = 0): [number, number, number] => [COL[c] + dx, ROW[r] + 0.35, z]
const LAYOUT: Record<ToolId, [number, number, number]> = {
  typescript: at(0, 0, -0.15, -0.2), react: at(0, 1, -0.15, 0.1), threejs: at(0, 2, -0.15, -0.25), gsap: at(0, 3, -0.15, 0),
  python: at(1, 0, 0.3, 0.15), fastapi: at(1, 1, 0.3, -0.1), postgres: at(1, 2, 0.3, 0.2), docker: at(1, 3, 0.3, -0.15),
  llms: at(2, 0, -0.1, 0), langgraph: at(2, 1, -0.1, 0.2), chromadb: at(2, 2, -0.1, -0.15), ollama: at(2, 3, -0.1, 0.1),
}

// hot = this tool is hovered; wake = a related tool is hovered
const TK: Record<string, { hot: number; wake: number }> = Object.fromEntries(TOOLS.map((t) => [t.id, { hot: 0, wake: 0 }]))

// phones: four rows of three, same role order
const LAYOUT_N: Record<ToolId, [number, number, number]> = {
  typescript: [-1.1, 1.95, 0], react: [0, 2.05, -0.2], threejs: [1.1, 1.95, 0],
  gsap: [-1.1, 0.8, 0.1], python: [0, 0.9, 0], fastapi: [1.1, 0.8, 0.1],
  postgres: [-1.1, -0.35, 0], docker: [0, -0.25, -0.2], llms: [1.1, -0.35, 0],
  langgraph: [-1.1, -1.5, 0.1], chromadb: [0, -1.4, 0], ollama: [1.1, -1.5, 0.1],
}
const pos = (id: ToolId): [number, number, number] => (S.narrow ? LAYOUT_N[id] : LAYOUT[id])
const BASE = () => (S.narrow ? 0.52 : 1)

/** -1 → 1 entry of a node rising out of the cloud bed (0) and sinking back on exit */
const arrive = (ph: number) => sstep(7.05 + ph * 0.07, 7.28 + ph * 0.07, S.s) * (1 - sstep(7.84 + ph * 0.05, 8.0 + ph * 0.05, S.s))

export function Workbench() {
  const { size } = useThree()
  // fit the bench to the frame width; the layout spans ~11.6 units, centred 0.6 right
  // ...and to the free band between title and readout (the bench is ~5.6 units tall)
  const fit = useMemo(() => {
    const b = toolkitBand()
    if (S.narrow) {
      // phones: four rows of three (~3.4 wide, ~5 tall with labels), seen from ~14.7 away
      const visH = 2 * 14.7 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      const visW = visH * (size.width / size.height)
      const fitH = ((b.bottom - b.top) / b.H) * visH / 5.0
      return Math.min(1.25, Math.max(0.6, Math.min((visW * 0.92) / 3.4, fitH)))
    }
    const visH = 2 * 11.5 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const visW = visH * (size.width / size.height)
    const fitH = ((b.bottom - b.top) / b.H) * visH / 7.4
    return Math.min(1, Math.max(0.5, Math.min((visW * 0.92) / 10.4, fitH)))
  }, [size.width, size.height])
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force((n) => n + 1)), [])
  const root = useRef<THREE.Group>(null!)
  const light = useRef<THREE.Object3D>(null!)
  const lightI = useRef(0)
  const bed = useMemo(() => [
    ...cloudSea({ c: [0, -4.1, -6.5], w: 30, d: 10, n: S.narrow ? 60 : 110, seed: 201, size: 1.25 }),
    ...cumulus({ c: [-9, -3, -9], w: 12, h: 6, n: 40, seed: 203 }),
    ...cumulus({ c: [10, -3.5, -10], w: 13, h: 6.5, n: 40, seed: 205 }),
    ...cumulus({ c: [0, -4, -18], w: 34, h: 6, n: 40, seed: 207, size: 1.2 }),
  ], [])
  const wisps = useMemo(() => [
    ...cumulus({ c: [-5.6, -3.3, 2.4], w: 4.5, h: 0.6, n: 12, seed: 209, size: 0.7 }),
    ...cumulus({ c: [5.8, -3.4, 2.2], w: 4.5, h: 0.6, n: 12, seed: 211, size: 0.7 }),
    ...cumulus({ c: [-3.4, 0.6, -3.8], w: 5, h: 0.9, n: 10, seed: 213, size: 0.6 }),
  ], [])
  const banks = useMemo(() => [
    // crossed by the camera between 7.0 and 7.1, and entirely behind it once the bench is in view
    ...cumulus({ c: [-5, -2, 30], w: 13, h: 6, d: 2.5, n: 36, seed: 215 }),
    ...cumulus({ c: [6, -2.5, 32], w: 13, h: 6, d: 2.5, n: 36, seed: 217 }),
  ], [])

  const set = (id: ToolId | null) => {
    S.hoverTool = id
    emit()
    if (id) document.body.dataset.hot = '1'; else delete document.body.dataset.hot
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const on = S.s > 6.95 && S.s < 8.12
    root.current.visible = on
    if (!on) return
    const cur = S.hoverTool ?? S.pinTool
    const rel = cur ? (TOOLS.find((t) => t.id === cur)?.rel as readonly string[]) : []
    for (const t of TOOLS) {
      const k = TK[t.id]
      k.hot = damp(k.hot, cur === t.id ? 1 : 0, 7, dt)
      k.wake = damp(k.wake, rel.includes(t.id) ? 1 : 0, 4, dt)
    }
    if (cur) {
      const p = pos(cur)
      light.current.position.set(p[0], p[1] + 0.7, p[2] + 1.8)
    }
    lightI.current = damp(lightI.current, cur ? 9 : 0, 5, dt)
    claimAccent(light.current, lightI.current, C_TOOL_LIGHT, 7, 1.4)
  })

  const cur = S.hoverTool ?? S.pinTool
  const curTool = TOOLS.find((t) => t.id === cur)

  return (
    <group ref={root} position={[0, 0, WB_Z]}>
      <group scale={fit}>
      <CloudField puffs={bed} renderOrder={-1} hazeNear={16} hazeFar={80} />
      <CloudField puffs={banks} renderOrder={-1} hazeNear={8} hazeFar={80} />
      {/* follows the active tool; lit by the shared accent light (see Accent.tsx) */}
      <object3D ref={light} />
      {TOOLS.map((t) => (
        <ToolNode key={t.id} id={t.id} name={t.name} role={t.role} onHover={set} fit={fit} />
      ))}
      {curTool && curTool.rel.map((r) => {
        const a = pos(curTool.id), b = pos(r as ToolId)
        const mid: [number, number, number] = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + (S.narrow ? 0.45 : 0.9), (a[2] + b[2]) / 2 + 0.9]
        return <Path key={`${curTool.id}-${r}`} start={a} end={b} mid={mid} />
      })}
        {/* foreground wisps scale with the bench, so a small frame doesn't get a wall of cloud in front of it */}
        <CloudField puffs={wisps} renderOrder={6} hazeNear={20} hazeFar={80} opacity={0.75} />
      </group>
    </group>
  )
}

function Path({ start, end, mid }: { start: [number, number, number]; end: [number, number, number]; mid: [number, number, number] }) {
  const ref = useRef<any>(null)
  useFrame((_, dt) => { if (ref.current?.material) ref.current.material.dashOffset -= dt * 0.8 })
  return <QuadraticBezierLine ref={ref} start={start} end={end} mid={mid} color="#F28A28" lineWidth={1.6} dashed dashScale={6} dashSize={0.6} gapSize={0.35} transparent opacity={0.9} />
}

function ToolNode({ id, name, role, onHover, fit }: { id: ToolId; name: string; role: string; onHover: (id: ToolId | null) => void; fit: number }) {
  // when the bench is scaled down to fit a small frame, labels grow back so they stay legible
  const ls = S.narrow ? 1 : Math.min(1.3, Math.pow(1 / fit, 0.6))
  const g = useRef<THREE.Group>(null!)
  const nameRef = useRef<any>(null)
  const roleRef = useRef<any>(null)
  const base = pos(id)
  const ph = hash(id.length * 7.3 + id.charCodeAt(0))
  useFrame(({ clock }) => {
    const k = TK[id]
    const t = S.reduced ? 0 : clock.elapsedTime
    const ar = arrive(ph)
    const sink = (1 - ar) * (S.s < 7.5 ? 2.6 : 3.4)
    g.current.position.set(base[0], base[1] + Math.sin(t * 0.6 + ph * 6) * 0.05 + k.hot * 0.14 + k.wake * 0.06 - sink, base[2] + k.hot * (S.narrow ? 0.35 : 0.55))
    g.current.scale.setScalar(BASE() * (1 + k.hot * 0.08 + k.wake * 0.03) * (0.25 + 0.75 * ar))
    g.current.rotation.z = (1 - ar) * (ph - 0.5) * 0.8
    if (roleRef.current) roleRef.current.fillOpacity = k.hot * ar
    if (nameRef.current) nameRef.current.fillOpacity = ar * ((S.hoverTool || S.pinTool) ? 0.45 + 0.55 * Math.max(k.hot, k.wake) : 0.9)
  })
  return (
    <group ref={g} position={base}>
      <Body id={id} />
      <mesh
        visible={false}
        onPointerOver={(e) => { e.stopPropagation(); onHover(id) }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); S.pinTool = S.pinTool === id ? null : id; onHover(S.touch ? null : id) }}
      >
        <sphereGeometry args={[0.85, 12, 8]} />
      </mesh>
      <Text ref={nameRef} font={FONTS.sans} fontSize={S.narrow ? 0.3 : 0.2 * ls} color="#122027" position={[0, S.narrow ? -0.9 : -0.86, 0]} anchorX="center" anchorY="top" letterSpacing={-0.01}>{name}</Text>
      <Text ref={roleRef} visible={!S.narrow} font={FONTS.mono} fontSize={0.105 * ls} color="#5A747C" position={[0, -0.92 - 0.24 * ls, 0]} anchorX="center" anchorY="top" letterSpacing={0.06} fillOpacity={0}>{role.toUpperCase()}</Text>
    </group>
  )
}

// ---------- the materials ----------
function Body({ id }: { id: ToolId }) {
  switch (id) {
    case 'python': return <PythonBody />
    case 'typescript': return <TypeScriptBody />
    case 'react': return <ReactBody />
    case 'fastapi': return <FastApiBody />
    case 'postgres': return <PostgresBody />
    case 'llms': return <LlmBody />
    case 'chromadb': return <ChromaBody />
    case 'threejs': return <ThreeBody />
    case 'gsap': return <GsapBody />
    case 'docker': return <DockerBody />
    case 'ollama': return <OllamaBody />
    case 'langgraph': return <LangGraphBody />
  }
}

const useTK = (id: ToolId) => TK[id]

/** Python: dense, load-bearing ingots */
function PythonBody() {
  const refs = useRef<THREE.Mesh[]>([])
  const k = useTK('python')
  useFrame(() => refs.current.forEach((m, i) => { if (m) { m.position.y = (i - 1) * (0.27 + (k.hot + k.wake * 0.5) * 0.08); m.rotation.y = (i - 1) * 0.18 * (1 - k.hot) } }))
  const geo = useMemo(() => new RoundedBoxGeometry(0.95, 0.24, 0.62, 3, 0.04), [])
  return (
    <group rotation={[0.25, -0.5, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el }} geometry={geo}>
          <meshStandardMaterial color={i === 1 ? '#2e4a55' : '#1c2b31'} roughness={0.55} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 0.135, 0.312]}><boxGeometry args={[0.95, 0.015, 0.012]} /><meshStandardMaterial color="#D8AE61" metalness={1} roughness={0.2} /></mesh>
    </group>
  )
}

/** TypeScript: thin modular frames that snap into alignment */
function TypeScriptBody() {
  const refs = useRef<THREE.Group[]>([])
  const k = useTK('typescript')
  useFrame(({ clock }) => {
    const t = S.reduced ? 0 : clock.elapsedTime
    refs.current.forEach((g, i) => { if (!g) return; const off = (1 - k.hot) * (0.35 + i * 0.22); g.rotation.set(Math.sin(t * 0.3 + i) * off, Math.cos(t * 0.25 + i) * off, i * 0.2 * (1 - k.hot)); g.position.z = (i - 1.5) * (0.06 + k.hot * 0.12) })
  })
  return (
    <group>
      {[0.95, 0.75, 0.55, 0.35].map((s, i) => (
        <group key={i} ref={(el) => { if (el) refs.current[i] = el }}>
          <Frame size={s} color={i % 2 ? '#ffffff' : '#4FAED5'} />
        </group>
      ))}
    </group>
  )
}
function Frame({ size, color }: { size: number; color: string }) {
  const t = 0.028
  return (
    <group>
      {[[0, size / 2, size, t], [0, -size / 2, size, t], [size / 2, 0, t, size], [-size / 2, 0, t, size]].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0]}><boxGeometry args={[w + t, h + t, t]} /><meshStandardMaterial color={color} roughness={0.35} /></mesh>
      ))}
    </group>
  )
}

/** React: interface surfaces that fan apart */
function ReactBody() {
  const refs = useRef<THREE.Mesh[]>([])
  const k = useTK('react')
  const geo = useMemo(() => new RoundedBoxGeometry(1.0, 0.66, 0.025, 2, 0.012), [])
  useFrame(() => refs.current.forEach((m, i) => { if (m) { m.position.set((i - 1) * (0.1 + k.hot * 0.18), (i - 1) * 0.07, (i - 1) * (0.14 + k.hot * 0.3)) } }))
  const colors = ['#d8ebef', '#ffffff', '#f3f3ec']
  return (
    <group rotation={[-0.15, 0.55, 0.05]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el }} geometry={geo}>
          <meshPhysicalMaterial color={colors[i]} roughness={0.12} clearcoat={1} transparent opacity={i === 2 ? 0.95 : 0.7} />
        </mesh>
      ))}
      <mesh position={[0.32, 0.18, 0.16]}><circleGeometry args={[0.05, 24]} /><meshBasicMaterial color="#F28A28" /></mesh>
      <mesh position={[-0.12, 0.18, 0.16]}><planeGeometry args={[0.5, 0.05]} /><meshBasicMaterial color="#122027" /></mesh>
      <mesh position={[-0.02, 0.04, 0.16]}><planeGeometry args={[0.7, 0.035]} /><meshBasicMaterial color="#9CD3E3" /></mesh>
      <mesh position={[-0.12, -0.08, 0.16]}><planeGeometry args={[0.5, 0.035]} /><meshBasicMaterial color="#9CD3E3" /></mesh>
    </group>
  )
}

/** FastAPI: a service pathway with requests travelling through it */
function FastApiBody() {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(-0.7, -0.25, 0), new THREE.Vector3(-0.3, 0.3, 0.2), new THREE.Vector3(0.15, -0.2, -0.15), new THREE.Vector3(0.7, 0.28, 0)]), [])
  const beads = useRef<THREE.Mesh[]>([])
  const k = useTK('fastapi')
  const clk = useRef(0)
  useFrame((_, dt) => {
    clk.current += Math.min(dt, 0.05) * (0.25 + k.hot * 0.9 + k.wake * 0.3) * (S.reduced ? 0.2 : 1)
    beads.current.forEach((b, i) => { if (b) curve.getPoint((clk.current + i / 4) % 1, b.position) })
  })
  return (
    <group>
      <mesh><tubeGeometry args={[curve, 80, 0.05, 12, false]} /><meshPhysicalMaterial color="#9CD3E3" transparent opacity={0.55} roughness={0.1} clearcoat={1} /></mesh>
      <mesh position={[-0.72, -0.25, 0]}><sphereGeometry args={[0.09, 20, 16]} /><meshStandardMaterial color="#122027" /></mesh>
      <mesh position={[0.72, 0.28, 0]}><sphereGeometry args={[0.09, 20, 16]} /><meshStandardMaterial color="#122027" /></mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(el) => { if (el) beads.current[i] = el }}><sphereGeometry args={[0.045, 12, 10]} /><meshStandardMaterial color="#F28A28" emissive="#F28A28" emissiveIntensity={0.7} /></mesh>
      ))}
    </group>
  )
}

/** PostgreSQL: data layers that open up */
function PostgresBody() {
  const refs = useRef<THREE.Mesh[]>([])
  const k = useTK('postgres')
  useFrame(({ clock }) => {
    const t = S.reduced ? 0 : clock.elapsedTime
    refs.current.forEach((m, i) => { if (m) { m.position.y = (i - 2.5) * (0.1 + k.hot * 0.09 + k.wake * 0.03); m.rotation.y = t * 0.15 * (i % 2 ? 1 : -1) } })
  })
  return (
    <group rotation={[0.35, 0, 0]}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el }}>
          <cylinderGeometry args={[0.46, 0.46, 0.055, 48]} />
          <meshStandardMaterial color={i % 2 ? '#4FAED5' : '#F3F3EC'} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/** LLMs: a form that keeps re-forming */
function LlmBody() {
  const k = useTK('llms')
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#f1e6d4', roughness: 0.35, metalness: 0.05, emissive: new THREE.Color('#F28A28'), emissiveIntensity: 0 })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = { value: 0 }
      sh.uniforms.uAmp = { value: 0.1 }
      m.userData.sh = sh
      sh.vertexShader = 'uniform float uT; uniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = position + normal * uAmp * (sin(position.x * 4.0 + uT) * sin(position.y * 5.0 + uT * 1.3) * sin(position.z * 4.5 + uT * 0.7));`)
    }
    return m
  }, [])
  const ref = useRef<THREE.Mesh>(null!)
  const clk = useRef(0)
  useFrame((_, dt) => {
    clk.current += Math.min(dt, 0.05) * (0.6 + k.hot * 2.2) * (S.reduced ? 0.1 : 1)
    const sh = mat.userData.sh
    if (sh) { sh.uniforms.uT.value = clk.current; sh.uniforms.uAmp.value = 0.08 + k.hot * 0.07 + k.wake * 0.03 }
    mat.emissiveIntensity = k.hot * 0.25 + k.wake * 0.1
    ref.current.rotation.set(clk.current * 0.2, clk.current * 0.3, 0)
  })
  return <mesh ref={ref} material={mat} scale={1.05}><torusKnotGeometry args={[0.42, 0.13, 200, 24, 2, 3]} /></mesh>
}

/** ChromaDB: a semantic field that pulls into clusters */
function ChromaBody() {
  const k = useTK('chromadb')
  const n = 420
  const { geo, home, centre } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const p = new Float32Array(n * 3), home = new Float32Array(n * 3), centre = new Float32Array(n * 3), c = new Float32Array(n * 3)
    const cs = [[-0.3, 0.2, 0.1], [0.32, -0.1, -0.15], [0.05, -0.35, 0.3]]
    const pal = [new THREE.Color('#4FAED5'), new THREE.Color('#122027'), new THREE.Color('#F28A28')]
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) home[i * 3 + a] = (hash(i * 3.1 + a * 7) - 0.5) * 1.3
      const ci = i % 3
      for (let a = 0; a < 3; a++) centre[i * 3 + a] = cs[ci][a] + (hash(i * 5.7 + a) - 0.5) * 0.28
      pal[ci].toArray(c, i * 3)
    }
    p.set(home)
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return { geo: g, home, centre }
  }, [])
  const grp = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => {
    const t = S.reduced ? 0 : clock.elapsedTime
    const pull = Math.min(1, 0.15 + k.hot * 0.85 + k.wake * 0.35)
    const arr = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < n * 3; i++) arr[i] = home[i] + (centre[i] - home[i]) * pull + Math.sin(t * 0.7 + i) * 0.012
    geo.attributes.position.needsUpdate = true
    grp.current.rotation.y = t * 0.12
  })
  return (
    <group ref={grp}>
      <points geometry={geo}><pointsMaterial size={0.045} vertexColors sizeAttenuation transparent opacity={0.9} /></points>
      <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(1.35, 1.35, 1.35)]} /><lineBasicMaterial color="#ffffff" transparent opacity={0.6} /></lineSegments>
    </group>
  )
}

/** Three.js: nested spatial geometry */
function ThreeBody() {
  const refs = useRef<THREE.LineSegments[]>([])
  const k = useTK('threejs')
  const geos = useMemo(() => [new THREE.IcosahedronGeometry(0.6, 0), new THREE.OctahedronGeometry(0.4, 0), new THREE.TetrahedronGeometry(0.24, 0)].map((g) => new THREE.EdgesGeometry(g)), [])
  useFrame((_, dt) => refs.current.forEach((m, i) => { if (m) { const sp = (S.reduced ? 0.05 : 0.25) * (1 + k.hot * 2) * (i % 2 ? -1 : 1) * (1 + i * 0.4); m.rotation.x += dt * sp; m.rotation.y += dt * sp * 0.7 } }))
  return (
    <group>
      {geos.map((g, i) => (
        <lineSegments key={i} ref={(el) => { if (el) refs.current[i] = el }} geometry={g}>
          <lineBasicMaterial color={i === 1 ? '#F28A28' : i === 0 ? '#122027' : '#4FAED5'} />
        </lineSegments>
      ))}
    </group>
  )
}

/** GSAP: motion trajectories, each bead on its own ease */
const EASES = [
  (x: number) => 1 - Math.pow(1 - x, 3),
  (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) },
  (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
]
function GsapBody() {
  const k = useTK('gsap')
  const curves = useMemo(() => [0, 1, 2].map((i) => new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.7, -0.35 + i * 0.12, 0), new THREE.Vector3(-0.1 + i * 0.1, 0.55 - i * 0.1, i * 0.1), new THREE.Vector3(0.7, -0.1 + i * 0.18, 0))), [])
  const lines = useMemo(() => curves.map((c, i) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(48)), new THREE.LineBasicMaterial({ color: i === 1 ? '#122027' : '#5A747C', transparent: true, opacity: 0.7 }))), [curves])
  const beads = useRef<THREE.Mesh[]>([])
  const clk = useRef(0)
  useFrame((_, dt) => {
    clk.current += Math.min(dt, 0.05) * (0.35 + k.hot * 0.6) * (S.reduced ? 0.15 : 1)
    beads.current.forEach((b, i) => { if (!b) return; const x = (clk.current + i * 0.27) % 1.2; curves[i].getPoint(EASES[i](Math.min(1, x)), b.position) })
  })
  return (
    <group rotation={[0, -0.3, 0.1]}>
      {lines.map((l, i) => <primitive key={i} object={l} />)}
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { if (el) beads.current[i] = el }}><sphereGeometry args={[0.06, 16, 12]} /><meshStandardMaterial color="#F28A28" emissive="#F28A28" emissiveIntensity={0.5} /></mesh>
      ))}
    </group>
  )
}

/** Docker: modules held in a container */
function DockerBody() {
  const k = useTK('docker')
  const refs = useRef<THREE.Mesh[]>([])
  const geo = useMemo(() => new RoundedBoxGeometry(0.3, 0.3, 0.3, 2, 0.03), [])
  useFrame(({ clock }) => {
    const t = S.reduced ? 0 : clock.elapsedTime
    refs.current.forEach((m, i) => {
      if (!m) return
      const x = (i & 1) - 0.5, y = ((i >> 1) & 1) - 0.5, z = ((i >> 2) & 1) - 0.5
      const sp = 0.36 + k.hot * 0.06
      m.position.set(x * sp, y * sp, z * sp)
      const lit = k.hot * Math.max(0, Math.sin(t * 4 - i * 0.8))
      ;(m.material as THREE.MeshStandardMaterial).emissiveIntensity = lit * 0.7
    })
  })
  return (
    <group rotation={[0.4, 0.6, 0]}>
      <mesh><boxGeometry args={[0.95, 0.95, 0.95]} /><meshPhysicalMaterial color="#e6f5fa" transparent opacity={0.22} roughness={0.05} clearcoat={1} depthWrite={false} /></mesh>
      <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(0.95, 0.95, 0.95)]} /><lineBasicMaterial color="#ffffff" /></lineSegments>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el }} geometry={geo}>
          <meshStandardMaterial color={i % 3 === 0 ? '#4FAED5' : '#1c2b31'} roughness={0.4} emissive="#F28A28" emissiveIntensity={0} />
        </mesh>
      ))}
    </group>
  )
}

/** Ollama: a heavy local node, anchored */
function OllamaBody() {
  const k = useTK('ollama')
  const ring = useRef<THREE.Mesh>(null!)
  const led = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(({ clock }, dt) => {
    const t = S.reduced ? 0 : clock.elapsedTime
    ring.current.rotation.z += Math.min(dt, 0.05) * (0.2 + k.hot * 1.5)
    led.current.emissiveIntensity = 0.6 + (k.hot + k.wake) * (0.6 + 0.6 * Math.sin(t * 5))
  })
  return (
    <group>
      <mesh scale={[1, 0.62, 1]}><sphereGeometry args={[0.48, 48, 32]} /><meshStandardMaterial color="#1a272d" roughness={0.6} metalness={0.15} /></mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.3, 0, 0]} position={[0, -0.12, 0]}><torusGeometry args={[0.66, 0.025, 12, 96]} /><meshStandardMaterial color="#D8AE61" metalness={1} roughness={0.25} /></mesh>
      <mesh position={[0.2, 0.2, 0.36]}><sphereGeometry args={[0.04, 16, 12]} /><meshStandardMaterial ref={led} color="#F28A28" emissive="#F28A28" emissiveIntensity={0.6} /></mesh>
    </group>
  )
}

/** LangGraph: twelve nodes, one of them a checkpoint, with a run moving through them */
const LG_NODES: [number, number, number][] = [
  [-0.62, 0.05, 0], [-0.32, 0.42, 0.1], [-0.32, -0.32, -0.1], [-0.02, 0.6, -0.15], [-0.02, 0.12, 0.2], [-0.02, -0.5, 0.05],
  [0.28, 0.38, 0.05], [0.28, -0.18, -0.2], [0.52, 0.62, 0.1], [0.52, 0.02, 0.15], [0.52, -0.5, -0.05], [0.8, 0.05, 0],
]
const LG_EDGES = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7], [6, 8], [6, 9], [7, 9], [7, 10], [8, 11], [9, 11], [10, 11]]
const LG_RUN = [0, 1, 4, 7, 9, 11]
const LG_HOLD = 9
function LangGraphBody() {
  const k = useTK('langgraph')
  const lines = useMemo(() => {
    const p: number[] = []
    LG_EDGES.forEach(([a, b]) => p.push(...LG_NODES[a], ...LG_NODES[b]))
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#5A747C', transparent: true, opacity: 0.8 }))
  }, [])
  const runner = useRef<THREE.Mesh>(null!)
  const hold = useRef<THREE.MeshStandardMaterial>(null!)
  const clk = useRef(0)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    clk.current += Math.min(dt, 0.05) * (0.3 + k.hot * 0.9 + k.wake * 0.2) * (S.reduced ? 0.2 : 1)
    const n = LG_RUN.length - 1
    const tt = (clk.current % 1.25) / 1.0 // a pause at the end of each run
    const f = Math.min(n - 1e-4, tt * n), i = Math.floor(f), u = f - i
    const a = LG_NODES[LG_RUN[i]], b = LG_NODES[LG_RUN[i + 1]]
    // the run waits at the checkpoint node
    const atHold = LG_RUN[i + 1] === LG_HOLD ? Math.min(1, u * 1.6) : u
    v.set(a[0] + (b[0] - a[0]) * atHold, a[1] + (b[1] - a[1]) * atHold, a[2] + (b[2] - a[2]) * atHold)
    runner.current.position.copy(v)
    hold.current.emissiveIntensity = 0.2 + (LG_RUN[i + 1] === LG_HOLD && u > 0.6 ? 0.9 : 0) + k.hot * 0.3
  })
  return (
    <group rotation={[0.15, -0.35, 0]}>
      <primitive object={lines} />
      {LG_NODES.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[i === LG_HOLD ? 0.075 : 0.055, 16, 12]} />
          {i === LG_HOLD
            ? <meshStandardMaterial ref={hold} color="#D8AE61" emissive="#F28A28" emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
            : <meshStandardMaterial color={i === 0 || i === 11 ? '#122027' : '#F3F3EC'} roughness={0.4} />}
        </mesh>
      ))}
      <mesh position={LG_NODES[LG_HOLD]}><torusGeometry args={[0.12, 0.008, 8, 40]} /><meshStandardMaterial color="#D8AE61" metalness={1} roughness={0.25} /></mesh>
      <mesh ref={runner}><sphereGeometry args={[0.04, 12, 10]} /><meshStandardMaterial color="#F28A28" emissive="#F28A28" emissiveIntensity={0.8} /></mesh>
    </group>
  )
}
