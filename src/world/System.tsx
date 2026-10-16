import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { S, sstep, local, damp, hash, clamp, lerp, copyEdge } from '../store'
import { FOV } from './Stage'
import { CloudField, cumulus, cloudSea } from './Cloud'
import { FONTS } from '../lib/fonts'

export const SYS_Z = -60
const TAU = Math.PI * 2

// Agentic Agile geometry
const SRC = new THREE.Vector3(-3.95, 0, 0)
const BR_Y = [-1.7, -0.85, 0, 0.85, 1.7]
const BR_Z = [0.7, -0.6, 0.95, -0.75, 0.25]
const GATE_X = 4.25

// Chatbot geometry
const LAYER_Y = [1.9, 0.95, 0, -0.95, -1.9]
const LAYERS = ['QUESTION', 'INTENT', 'SEMANTIC RETRIEVAL', 'NL TO SQL', 'RESULT']

// Blue Marine geometry: four roles, one forward route, a bypass and two ways back
const ROLES = [
  { name: 'IMPORTER', p: new THREE.Vector3(-4.5, -0.35, 0.4) },
  { name: 'DIRECTOR', p: new THREE.Vector3(-1.5, 0.45, -0.5) },
  { name: 'ASSISTANT\nDIRECTOR', p: new THREE.Vector3(1.5, -0.45, 0.3) },
  { name: 'PRINCIPAL\nOFFICER', p: new THREE.Vector3(4.5, 0.35, -0.3) },
]
const top = (v: THREE.Vector3, dz = 0) => v.clone().add(new THREE.Vector3(0, 0.27, dz))
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const curve = (pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts, false, 'centripetal')
// Importer → Director → AD → PO
const ROUTE = curve([top(ROLES[0].p), V3(-3, 0.75, 0.1), top(ROLES[1].p), V3(0, -0.15, -0.2), top(ROLES[2].p), V3(3, 0.6, 0.15), top(ROLES[3].p)])
// Director → PO directly, over the AD
const BYPASS = curve([top(ROLES[1].p), V3(0.0, 2.25, 0.45), V3(3.0, 2.15, 0.35), top(ROLES[3].p)])
// PO → AD: send-back
const BACK = curve([top(ROLES[3].p), V3(4.0, 1.35, -1.05), V3(2.2, 1.25, -1.0), top(ROLES[2].p)])
// AD → Director: escalation
const ESC = curve([top(ROLES[2].p), V3(0.9, 1.05, -1.35), V3(-0.9, 1.45, -1.45), top(ROLES[1].p)])
const PATHS = [ROUTE, BYPASS, BACK, ESC]

const C_CREAM = new THREE.Color('#F3F3EC')
const C_WHITE = new THREE.Color('#ffffff')
const C_GRAPH = new THREE.Color('#2a3c44')
const C_SLATE = new THREE.Color('#5A747C')
const C_SKY = new THREE.Color('#4FAED5')
const C_CYAN = new THREE.Color('#9CD3E3')
const C_COPPER = new THREE.Color('#F28A28')
const C_GOLD = new THREE.Color('#D8AE61')
const C_RED = new THREE.Color('#b9503a')

const tmpV = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpM = new THREE.Matrix4()
const tmpS = new THREE.Vector3()
const A = new THREE.Vector3(), B = new THREE.Vector3(), ctrl = new THREE.Vector3(), dir = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1)
const rA = new THREE.Euler(), rB = new THREE.Euler()
const cA = new THREE.Color(), cB = new THREE.Color()
const LIFT = new THREE.Vector3(0, 0.12, 0)

// path: 0 forward, 1 bypass, 2 send-back, 3 escalation
type Tok = { h1: number; h2: number; h3: number; b: number; k: number; col: number; row: number; r: number; ang: number; path: number }

/** The four formations span ~10.8 world units. Scale them to the free space beside the copy. */
function useFit() {
  const { size } = useThree()
  return useMemo(() => {
    const aspect = size.width / size.height
    const visW = 2 * 13.5 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect
    const free = S.narrow ? 1 : Math.max(0.4, (size.width - copyEdge() - 28) / size.width)
    return clamp((visW * free * 0.95) / 10.8, 0.33, 0.95)
  }, [size.width, size.height])
}

export function System() {
  const sysScale = useFit()
  const N = S.narrow ? 240 : 380
  const toks = useMemo<Tok[]>(() => Array.from({ length: N }, (_, i) => {
    const h1 = hash(i * 1.13 + 3), h2 = hash(i * 2.71 + 5), h3 = hash(i * 0.37 + 9)
    const k = i % 5, j = Math.floor(i / 5)
    return { h1, h2, h3, b: i % 5, k, col: j % 14, row: Math.floor(j / 14), r: 5.3 * Math.sqrt(hash(i * 3.3 + 1)), ang: i * 2.39996, path: i % 8 < 3 ? [2, 3, 1][i % 8] : 0 }
  }), [N])
  const cand = useMemo(() => {
    let best = 0, bd = 1e9
    toks.forEach((t, i) => { const d = Math.abs(t.r - 2.3) + (Math.cos(t.ang) > 0.4 ? 0 : 5) + (Math.sin(t.ang) > 0 ? 0 : 2); if (d < bd) { bd = d; best = i } })
    return best
  }, [toks])

  const inst = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new RoundedBoxGeometry(0.17, 0.17, 0.07, 2, 0.025), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.05, color: '#ffffff' }), [])

  const root = useRef<THREE.Group>(null!)
  const gA = useRef<THREE.Group>(null!), gB = useRef<THREE.Group>(null!), gC = useRef<THREE.Group>(null!), gD = useRef<THREE.Group>(null!)
  const gate = useRef<THREE.Mesh>(null!), gateLight = useRef<THREE.PointLight>(null!)
  const layerRefs = useRef<THREE.Group[]>([])
  const layerMats = useRef<THREE.MeshStandardMaterial[]>([])
  const probe = useRef<THREE.Mesh>(null!)
  const ringRefs = useRef<THREE.Mesh[]>([])
  const pulse = useRef<THREE.Mesh>(null!)
  const beam = useRef<THREE.Mesh>(null!)
  const packet = useRef<THREE.Mesh>(null!), packetLight = useRef<THREE.PointLight>(null!)
  const tubeMats = useRef<THREE.MeshStandardMaterial[]>([])
  const plinthMats = useRef<THREE.MeshStandardMaterial[]>([])
  const clk = useRef({ a: 0, d: 0, dRate: 1, by: 0, lift: [0, 0, 0, 0, 0] })

  const bed = useMemo(() => [
    ...cloudSea({ c: [0, -3.2, 0], w: 34, d: 22, n: S.narrow ? 70 : 130, seed: 101, size: 1.3 }),
    ...cumulus({ c: [-13, -3, -9], w: 12, h: 5, n: 40, seed: 103 }),
    ...cumulus({ c: [14, -3.5, -11], w: 14, h: 6, n: 40, seed: 105 }),
  ], [])
  // the bank the camera passes through on the way in and out
  const banks = useMemo(() => [
    ...cumulus({ c: [-6, -1, 18], w: 14, h: 5, n: 40, seed: 107 }),
    ...cumulus({ c: [7, -0.5, 20], w: 14, h: 5, n: 40, seed: 109 }),
  ], [])

  const status = (i: number, t: string) => { if (S.status[i] !== t) S.status[i] = t }

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = S.s
    const on = s > 1.82 && s < 6.25
    root.current.visible = on
    if (!on) return
    const time = S.reduced ? 0 : clock.elapsedTime
    const a = local(2), b = local(3), c = local(4), d = local(5)

    // --- clocks: the agent flow freezes at the checkpoint; the permit route can run backwards
    const pause = sstep(0.5, 0.54, a) * (1 - sstep(0.8, 0.84, a))
    clk.current.a += dt * (S.reduced ? 0.25 : 1) * (1 - pause)
    const sendBack = sstep(0.42, 0.45, d) * (1 - sstep(0.6, 0.63, d))
    const bypass = sstep(0.6, 0.64, d) * (1 - sstep(0.8, 0.86, d))
    clk.current.dRate = damp(clk.current.dRate, 1 - 2.1 * sendBack, 5, dt)
    clk.current.d += dt * clk.current.dRate * (S.reduced ? 0.25 : 1)
    clk.current.by += dt * (0.4 + bypass * 1.4) * (S.reduced ? 0.25 : 1)
    const diss = sstep(5.84, 6.0, s)
    const lifts = clk.current.lift
    for (let k = 0; k < 5; k++) lifts[k] = damp(lifts[k], S.hoverLayer === k && s > 2.95 && s < 4.05 ? 1 : 0, 6, dt)

    // --- formation blend
    const edges = [3, 4, 5]

    let from = 0, to = 0, m = 0
    if (s < 2.9) { from = to = 0 }
    else if (s > 5.1) { from = to = 3 }
    else {
      const e = edges.reduce((best, x) => (Math.abs(s - x) < Math.abs(s - best) ? x : best), 3)
      from = e - 3; to = e - 2
      m = sstep(e - 0.1, e + 0.1, s)
      if (m <= 0) to = from; if (m >= 1) from = to
    }

    const cpos = (f: number, i: number, t: Tok, out: THREE.Vector3, rot: THREE.Euler, col: THREE.Color): number => {
      if (f === 0) {
        const u = ((t.h1 + clk.current.a * 0.07) % 1) * 1.16
        if (u <= 1) {
          const env = Math.sin(Math.PI * u)
          out.set(-3.55 + 7.8 * u, BR_Y[t.b] * env + (t.h2 - 0.5) * 0.16 * env + Math.sin(u * 18 + t.h3 * 6) * 0.03, BR_Z[t.b] * env + (t.h3 - 0.5) * 0.16 * env)
        } else out.set(GATE_X + (u - 1) * 12, (t.h2 - 0.5) * 0.05, (t.h3 - 0.5) * 0.05)
        const unfold = sstep(0.03, 0.3, a)
        if (unfold < 1) {
          const th = t.h1 * TAU, ph = Math.acos(2 * t.h2 - 1), rr = 0.95 * Math.cbrt(t.h3)
          tmpV.set(SRC.x + rr * Math.sin(ph) * Math.cos(th), rr * Math.cos(ph), rr * Math.sin(ph) * Math.sin(th))
          out.lerpVectors(tmpV, out, unfold)
        }
        rot.set(t.h1 * 6 + time * 0.4, t.h2 * 6 + time * 0.3, 0)
        col.copy(t.h3 < 0.18 ? C_GRAPH : C_CREAM)
        if (t.b === 2 && t.h3 > 0.8) col.copy(C_SKY)
        col.lerp(C_GOLD, pause * 0.55)
        return 1
      }
      if (f === 1) {
        const lift = lifts[t.k]
        out.set(-2.6 + t.col * 0.4, LAYER_Y[t.k] + 0.07 + Math.sin(time * 1.3 + i) * 0.025 + lift * 0.25, -1.25 + t.row * 0.42 + lift * 0.9)
        rot.set(-Math.PI / 2, 0, 0)
        const active = 1 - clamp(Math.abs(probeLayer(b) - t.k))
        col.copy(t.h3 < 0.2 ? C_SLATE : C_WHITE).lerp(C_COPPER, active * (t.h1 < 0.35 ? 0.9 : 0.15)).lerp(C_GOLD, lift * 0.4)
        return 0.82
      }
      if (f === 2) {
        const x = t.r * Math.cos(t.ang), z = t.r * Math.sin(t.ang) * 0.8
        const ripple = Math.sin(t.r * 2.6 - time * 2.0) * Math.exp(-t.r * 0.28) * 0.18
        out.set(x, -0.75 + 0.22 * Math.sin(x * 0.7 + z * 0.5) + ripple, z)
        rot.set(-Math.PI / 2, 0, t.ang)
        const near = 1 - sstep(1.2, 4.2, t.r)
        col.copy(C_CREAM).lerp(C_CYAN, sstep(3, 5.3, t.r) * 0.7).lerp(C_COPPER, near * sstep(0.15, 0.35, c) * 0.55)
        if (i === cand) {
          const e = sstep(0.3, 0.48, c) * (1 - sstep(0.86, 0.97, c))
          out.y += e * 1.5
          col.lerp(C_COPPER, e)
          rot.set(-Math.PI / 2 + e * 0.6, time * e, t.ang)
          return 0.9 + e * 1.8
        }
        return 0.9
      }
      // f === 3: the permit routes. Forward tokens run backwards while work is being sent back.
      const path = t.path
      const speed = path === 0 ? clk.current.d * 0.06 : path === 1 ? clk.current.by * 0.12 : clk.current.d * -0.05 + t.h2
      const u = (((t.h1 + speed) % 1) + 1) % 1
      PATHS[path].getPoint(path >= 2 ? 1 - u : u, out)
      out.x += (t.h2 - 0.5) * 0.12; out.y += (t.h3 - 0.5) * 0.12 + 0.04; out.z += (t.h1 - 0.5) * 0.12
      rot.set(time * 0.5 + t.h1 * 6, t.h2 * 6, 0)
      if (path >= 2) { col.copy(C_SLATE).lerp(C_RED, sendBack); return 0.5 + sendBack * 0.45 }
      if (path === 1) { col.copy(C_CREAM).lerp(C_COPPER, bypass * 0.85); return 0.45 + bypass * 0.4 }
      col.copy(t.h3 < 0.25 ? C_GRAPH : C_CREAM).lerp(C_COPPER, (1 - sendBack) * (t.h2 < 0.45 ? 0.8 : 0.2))
      return 0.8
    }

    const mesh = inst.current
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      const sA = cpos(from, i, t, A, rA, cA)
      let sc = sA
      if (from !== to) {
        const sB = cpos(to, i, t, B, rB, cB)
        const mi = clamp((m - t.h1 * 0.35) / 0.65)
        const e = mi * mi * (3 - 2 * mi)
        // branches converge on the centre before taking the next shape
        ctrl.set((A.x + B.x) * 0.15, (A.y + B.y) * 0.25 + (to === 3 ? 1.2 : 0), (A.z + B.z) * 0.2)
        const q = 1 - e
        A.set(q * q * A.x + 2 * q * e * ctrl.x + e * e * B.x, q * q * A.y + 2 * q * e * ctrl.y + e * e * B.y, q * q * A.z + 2 * q * e * ctrl.z + e * e * B.z)
        rA.set(lerp(rA.x, rB.x, e), lerp(rA.y, rB.y, e), lerp(rA.z, rB.z, e))
        cA.lerp(cB, e)
        sc = lerp(sA, sB, e) * (1 - Math.sin(Math.PI * e) * 0.35)
      }
      if (diss > 0) {
        // the route lifts away and thins into the cloud the camera is about to enter
        A.x *= 1 - diss * 0.35
        A.y += diss * (1.2 + t.h2 * 3.8)
        A.z += diss * (1.5 + t.h3 * 5.5)
        sc *= 1 - diss * 0.9
      }
      tmpQ.setFromEuler(rA)
      tmpS.setScalar(sc)
      tmpM.compose(A, tmpQ, tmpS)
      mesh.setMatrixAt(i, tmpM)
      mesh.setColorAt(i, cA)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    // --- per-scene apparatus fades in and out with its formation
    const vis = [1 - sstep(2.9, 3.04, s), sstep(2.96, 3.1, s) * (1 - sstep(3.9, 4.04, s)), sstep(3.96, 4.1, s) * (1 - sstep(4.9, 5.04, s)), sstep(4.96, 5.1, s) * (1 - sstep(5.84, 5.97, s))]
    ;[gA, gB, gC, gD].forEach((g, k) => { const v = vis[k]; g.current.visible = v > 0.01; g.current.scale.setScalar(0.001 + v) })

    // A: checkpoint
    const gm = gate.current.material as THREE.MeshStandardMaterial
    gm.emissiveIntensity = 0.15 + pause * 2.2
    gate.current.scale.setScalar(1 + pause * 0.25)
    gateLight.current.intensity = pause * 14 * vis[0]
    status(0, a < 0.12 ? 'One request' : a < 0.38 ? 'Five agents · parallel' : a < 0.5 ? 'Converging' : a < 0.82 ? 'Stopped · human checkpoint' : 'Approved · resuming')

    // B: the question falls through the layers
    const pl = probeLayer(b)
    probe.current.position.set(-3.1, lerp(2.9, -2.6, clamp(pl / 4.6 + 0.02)), -0.2)
    probe.current.rotation.y = time
    layerRefs.current.forEach((g, k) => {
      if (!g) return
      const lift = lifts[k]
      g.position.set(0, LAYER_Y[k] + lift * 0.25, lift * 0.9)
      const act = 1 - clamp(Math.abs(pl - k))
      layerMats.current[k].opacity = 0.16 + act * 0.22 + lift * 0.2
      layerMats.current[k].emissiveIntensity = act * 0.6 + lift * 0.4
    })
    status(1, ['Question', 'Intent', 'Semantic retrieval', 'NL → SQL', 'Result'][Math.max(0, Math.min(4, Math.round(pl)))])

    // C: distance rings ripple out from the job
    ringRefs.current.forEach((r, k) => {
      if (!r) return
      const ph = ((time * 0.18 + k / 4) % 1)
      r.scale.setScalar(0.4 + ph * 5.2)
      ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.5
    })
    const e = sstep(0.3, 0.48, c) * (1 - sstep(0.86, 0.97, c))
    const ct = toks[cand]
    beam.current.visible = e > 0.02
    {
      const cx = ct.r * Math.cos(ct.ang), cz = ct.r * Math.sin(ct.ang) * 0.8
      const cy = -0.75 + 0.22 * Math.sin(cx * 0.7 + cz * 0.5) + e * 1.5
      dir.set(cx, cy + 0.12, cz)
      const len = dir.length()
      beam.current.position.set(0, -0.12, 0).addScaledVector(dir, 0.5 * Math.max(0.01, e))
      beam.current.quaternion.setFromUnitVectors(Z, dir.normalize())
      beam.current.scale.set(1, 1, Math.max(0.01, e) * len)
    }
    pulse.current.scale.setScalar(1 + Math.sin(time * 3) * 0.08)
    status(2, c < 0.28 ? 'Scanning the field' : c < 0.5 ? 'Candidate rising' : c < 0.86 ? 'Matched · nearest fit' : 'Returning to the field')

    // D: one application. Forward, sent back, escalated, reassigned around the AD, verified.
    let back = false
    const seg = (a0: number, a1: number) => sstep(a0, a1, d)
    if (d < 0.17) ROUTE.getPoint(seg(0.04, 0.14) / 3, tmpV)
    else if (d < 0.43) ROUTE.getPoint((1 + seg(0.17, 0.27) + seg(0.27, 0.37)) / 3, tmpV)
    else if (d < 0.52) { BACK.getPoint(seg(0.43, 0.51), tmpV); back = true }
    else if (d < 0.66) { ESC.getPoint(seg(0.52, 0.6), tmpV); back = true }
    else BYPASS.getPoint(seg(0.66, 0.78), tmpV)
    packet.current.position.copy(tmpV).add(LIFT)
    packet.current.rotation.y = time * 0.6
    ;(packet.current.material as THREE.MeshStandardMaterial).emissive.copy(back ? C_RED : C_COPPER)
    packetLight.current.position.copy(packet.current.position)
    packetLight.current.color.copy(back ? C_RED : C_COPPER)
    packetLight.current.intensity = 4 * vis[3]
    const tm = tubeMats.current
    if (tm[1]) { tm[1].emissiveIntensity = 0.1 + bypass * 0.6; tm[1].opacity = 0.4 + bypass * 0.55 }
    if (tm[2]) { tm[2].emissiveIntensity = 0.05 + sendBack * 0.9; tm[2].opacity = 0.3 + sendBack * 0.65 }
    if (tm[3]) { tm[3].emissiveIntensity = 0.05 + sendBack * 0.9; tm[3].opacity = 0.3 + sendBack * 0.65 }
    ROLES.forEach((r, k) => {
      const near = 1 - sstep(0.25, 0.9, packet.current.position.distanceTo(tmpV.copy(r.p).setY(r.p.y + 0.27)))
      plinthMats.current[k].emissiveIntensity = near * 0.35
    })
    status(3,
      d < 0.14 ? 'Importer applies' : d < 0.27 ? 'Director assigns to AD' : d < 0.37 ? 'AD routes to PO' : d < 0.43 ? 'PO verifying'
      : d < 0.52 ? 'Sent back to AD' : d < 0.6 ? 'Escalated to Director' : d < 0.66 ? 'Director reassigns' : d < 0.78 ? 'Reassigned straight to PO' : d < 0.86 ? 'PO verifying' : 'Verified')
  })

  return (
    <group ref={root} position={[0, 0, SYS_Z]}>
      <CloudField puffs={bed} renderOrder={-1} hazeNear={18} hazeFar={90} />
      <CloudField puffs={banks} renderOrder={-1} hazeNear={8} hazeFar={90} />
      <group scale={sysScale}>
        <instancedMesh ref={inst} args={[geo, mat, N]} frustumCulled={false} />

        {/* A — Agentic Agile */}
        <group ref={gA}>
          <mesh position={SRC.toArray()} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.36, 0.36, 0.12, 48]} />
            <meshStandardMaterial color="#1d2c33" roughness={0.4} />
          </mesh>
          {BR_Y.map((y, k) => (
            <group key={k} position={[0, y, BR_Z[k]]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.24, 0.24, 0.08, 40]} />
                <meshStandardMaterial color="#F3F3EC" roughness={0.3} />
              </mesh>
              <mesh>
                <torusGeometry args={[0.3, 0.012, 8, 64]} />
                <meshStandardMaterial color="#D8AE61" metalness={1} roughness={0.25} />
              </mesh>
              <Text font={FONTS.mono} fontSize={0.11} color="#122027" position={[0.36, 0.3, 0]} anchorX="left" anchorY="middle" letterSpacing={0.08}>{`AGENT 0${k + 1}`}</Text>
            </group>
          ))}
          <mesh ref={gate} position={[GATE_X, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.62, 0.055, 16, 96]} />
            <meshStandardMaterial color="#D8AE61" metalness={0.9} roughness={0.25} emissive="#F28A28" emissiveIntensity={0.15} />
          </mesh>
          <pointLight ref={gateLight} position={[GATE_X - 0.4, 0.3, 1.2]} color="#ffb05a" distance={9} decay={1.6} intensity={0} />
          <Text font={FONTS.mono} fontSize={0.13} color="#122027" position={[GATE_X, -0.95, 0]} anchorX="center" letterSpacing={0.08}>HUMAN CHECKPOINT</Text>
          <Text font={FONTS.mono} fontSize={0.13} color="#122027" position={[SRC.x, -0.95, 0]} anchorX="center" letterSpacing={0.08}>ONE REQUEST</Text>
        </group>

        {/* B — AI Chatbot */}
        <group ref={gB}>
          {LAYERS.map((name, k) => (
            <group key={k} ref={(el) => { if (el) layerRefs.current[k] = el }} position={[0, LAYER_Y[k], 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}
                onPointerOver={(e) => { e.stopPropagation(); S.hoverLayer = k; document.body.dataset.hot = '1' }}
                onPointerOut={() => { if (S.hoverLayer === k) S.hoverLayer = -1; delete document.body.dataset.hot }}>
                <planeGeometry args={[6.3, 3.3]} />
                <meshStandardMaterial ref={(el) => { if (el) layerMats.current[k] = el }} color="#e8f6fb" emissive="#F28A28" emissiveIntensity={0} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} roughness={0.15} />
              </mesh>
              <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
                <edgesGeometry args={[new THREE.PlaneGeometry(6.3, 3.3)]} />
                <lineBasicMaterial color="#ffffff" transparent opacity={0.85} />
              </lineSegments>
              <Text font={FONTS.mono} fontSize={0.17} color="#122027" position={[-3.05, 0.02, 1.62]} rotation={[-Math.PI / 2, 0, 0]} anchorX="left" anchorY="bottom" letterSpacing={0.08}>
                {`0${k + 1}  ${name}`}
              </Text>
            </group>
          ))}
          <mesh ref={probe}>
            <octahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#F28A28" emissive="#F28A28" emissiveIntensity={0.6} metalness={0.3} roughness={0.3} />
          </mesh>
        </group>

        {/* C — ShopperMatch */}
        <group ref={gC}>
          <mesh ref={pulse} position={[0, -0.74, 0]}>
            <cylinderGeometry args={[0.32, 0.36, 0.06, 48]} />
            <meshStandardMaterial color="#122027" roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.42, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.6, 8]} />
            <meshStandardMaterial color="#122027" />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <sphereGeometry args={[0.13, 24, 16]} />
            <meshStandardMaterial color="#F28A28" emissive="#F28A28" emissiveIntensity={0.8} />
          </mesh>
          {[1.2, 2.4, 3.6, 4.8].map((r, k) => (
            <mesh key={`f${k}`} position={[0, -0.78, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.8, 1]}>
              <ringGeometry args={[r - 0.01, r + 0.01, 128]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.55} side={THREE.DoubleSide} />
            </mesh>
          ))}
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} ref={(el) => { if (el) ringRefs.current[k] = el }} position={[0, -0.76, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.97, 1.0, 128]} />
              <meshBasicMaterial color="#F28A28" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          ))}
          <mesh ref={beam}>
            <boxGeometry args={[0.02, 0.02, 1]} />
            <meshBasicMaterial color="#F28A28" />
          </mesh>
          <Text font={FONTS.mono} fontSize={0.14} color="#122027" position={[0, -0.82, 0.45]} rotation={[-Math.PI / 2, 0, 0]} anchorX="center" letterSpacing={0.08}>JOB</Text>
        </group>

        {/* D — Blue Marine */}
        <group ref={gD}>
          {ROLES.map((r, k) => (
            <group key={k} position={r.p.toArray()}>
              <mesh>
                <boxGeometry args={[1.4, 0.46, 1.0]} />
                <meshStandardMaterial ref={(el) => { if (el) plinthMats.current[k] = el }} color="#1d2c33" roughness={0.55} metalness={0.1} emissive="#F28A28" emissiveIntensity={0} />
              </mesh>
              <Text font={FONTS.mono} fontSize={0.115} lineHeight={1.2} textAlign="center" color="#F3F3EC" position={[0, -0.01, 0.505]} anchorX="center" anchorY="middle" letterSpacing={0.08}>{r.name}</Text>
            </group>
          ))}
          {PATHS.map((c, k) => (
            <mesh key={k}>
              <tubeGeometry args={[c, k === 0 ? 160 : 100, k === 0 ? 0.03 : 0.022, 10, false]} />
              <meshStandardMaterial
                ref={(el) => { if (el) tubeMats.current[k] = el }}
                color={k >= 2 ? '#b9503a' : '#F28A28'} emissive={k >= 2 ? '#b9503a' : '#F28A28'}
                emissiveIntensity={k === 0 ? 0.25 : 0.05} metalness={k === 0 ? 0.6 : 0.2} roughness={0.35}
                transparent={k > 0} opacity={k === 0 ? 1 : 0.35} depthWrite={k === 0}
              />
            </mesh>
          ))}
          <mesh ref={packet}>
            <boxGeometry args={[0.34, 0.06, 0.24]} />
            <meshStandardMaterial color="#ffffff" emissive="#F28A28" emissiveIntensity={0.5} roughness={0.4} />
          </mesh>
          <pointLight ref={packetLight} distance={4} decay={1.5} intensity={0} />
        </group>
      </group>
    </group>
  )
}

/** where the question is, as a fractional layer index */
function probeLayer(b: number) {
  const k = clamp((b - 0.1) / 0.8) * 4.6
  const f = Math.floor(k), fr = k - f
  return Math.min(4.4, f + sstep(0.45, 1, fr))
}
