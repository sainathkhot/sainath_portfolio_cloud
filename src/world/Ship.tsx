import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Billboard } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { S, sstep, local, clamp, hash } from '../store'
import { FONTS } from '../lib/fonts'
import { CloudField, cumulus } from './Cloud'

/*
 * Blue Marine — Government Import Permit & Licensing Platform.
 * A container ship sails through the cloud sea with the platform drawn over it as a live network: the four offices
 * (Importer → Director → Assistant Director → Principal Officer), the route an application takes between them, the
 * send-back path, and dashed links down to the consignment they are deciding on. Scrolling the section walks one
 * application through the platform: filed, assigned, document verification, routed, physical verification, sent back,
 * reviewed, approved, and the permit issued, at which point the consignment is marked as cleared.
 * Everything except the ship's gentle motion on the swell is a function of scroll, so it all runs in reverse too.
 */

const SECTION = 5 // p4

// ---------------------------------------------------------------------------------------------------------------
// ship-local frame: +X toward the bow, +Y up, beam along Z. Deck at y = 0, keel at y = −1.05, waterline at y = −0.6

const KEEL = -1.05, WATER = -0.6
const STERN = -4.4, BOW = 4.6
/** half-beam along the hull */
export function beam(x: number) {
  if (x < -3.8) return 0.82 + ((x - STERN) / 0.6) * 0.1
  if (x < 2.0) return 0.92
  if (x < 3.6) return 0.92 - ((x - 2) / 1.6) ** 1.6 * 0.37
  return Math.max(0.015, 0.55 * (1 - ((x - 3.6) / 1.0) ** 0.8))
}
/** deck sheer: the deck rises toward the bow */
const sheer = (x: number) => 0.18 * Math.max(0, (x - 2.4) / 2.2) ** 2
/** the stem rakes forward: upper points of the bow sit further forward */
const rake = (x: number) => 0.45 * clamp((x - 3.5) / 1.1) ** 1.5

const HULL = new THREE.Color('#1f3a4d'), BOOT = new THREE.Color('#121c22'), FOUL = new THREE.Color('#8a3a2b'), DECK = new THREE.Color('#47534f')

function hullGeometry() {
  const rings: THREE.Vector3[][] = [], cols: THREE.Color[][] = []
  const N = 70, SIDE = 18
  for (let k = 0; k <= N; k++) {
    const x0 = STERN + ((BOW - STERN) * k) / N
    const b = beam(x0), dy = sheer(x0)
    const n = 2.4 + 4.2 * (1 - clamp((x0 - 1.5) / 2.8)) * clamp((x0 - STERN) / 0.9) // boxy amidships, finer at the ends
    const depth = -KEEL + dy - 0.35 * clamp((x0 - 3.4) / 1.2) ** 2 // the forefoot rises at the bow
    const ring: THREE.Vector3[] = [], cr: THREE.Color[] = []
    const push = (y: number, z: number, c: THREE.Color) => {
      ring.push(new THREE.Vector3(x0 + rake(x0) * clamp((y - KEEL) / 1.3), y, z)); cr.push(c)
    }
    // port deck edge → round the bottom → starboard deck edge
    for (let i = 0; i <= SIDE; i++) {
      const a = Math.PI + (i / SIDE) * Math.PI
      const c = Math.cos(a), s = Math.sin(a)
      const z = b * Math.sign(c) * Math.abs(c) ** (2 / n)
      const y = dy - depth * Math.abs(s) ** (2 / n)
      push(y, z, y < WATER - 0.03 ? FOUL : y < WATER + 0.03 ? BOOT : HULL)
    }
    // across the deck, starboard → port (the edge points are repeated, so the deck edge stays crisp)
    for (let i = 0; i <= 6; i++) push(dy, b - (2 * b * i) / 6, DECK)
    rings.push(ring); cols.push(cr)
  }
  // transom: close the stern with a flat face (its own copy of the last ring, so the stern edge stays crisp)
  const first = rings[0]
  const c0 = first.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / first.length)
  rings.unshift(first.map((p) => p.clone())); cols.unshift(cols[0].map(() => HULL))
  rings.unshift(first.map(() => c0.clone())); cols.unshift(cols[0])
  const R = rings.length, M = rings[0].length
  const pos = new Float32Array(R * M * 3), col = new Float32Array(R * M * 3)
  rings.forEach((ring, r) => ring.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], (r * M + i) * 3)
    const c = cols[r][i]; col.set([c.r, c.g, c.b], (r * M + i) * 3)
  }))
  const idx: number[] = []
  for (let r = 0; r < R - 1; r++) for (let i = 0; i < M; i++) {
    const a = r * M + i, b = r * M + ((i + 1) % M), c = a + M, d = b + M
    idx.push(a, c, b, b, c, d) // wound so the faces point outward (the rings run port → keel → starboard → deck)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ---------------------------------------------------------------------------------------------------------------
// cargo: stacks of containers from just ahead of the bridge to the bow

const PALETTE = ['#c8742f', '#4c6b78', '#e3ddd0', '#23323b', '#5aa9cc', '#a5503c', '#c9a35f', '#3d5c4e'].map((c) => new THREE.Color(c))
const CL = 0.44, CW = 0.29, CH = 0.25
type Box = { x: number; y: number; z: number; c: THREE.Color }
function stacks(): Box[] {
  const out: Box[] = []
  for (let bx = -2.55; bx < 3.45; bx += CL + 0.04) {
    const b = beam(bx + CL) * 0.92
    const tiers = bx > 2.6 ? 2 : bx > 1.8 ? 3 : 4
    for (let rz = -2; rz <= 2; rz++) {
      const z = rz * (CW + 0.03)
      if (Math.abs(z) + CW / 2 > b) continue
      const h = tiers - (hash(bx * 13 + rz * 7) < 0.18 ? 1 : 0)
      for (let t = 0; t < h; t++) {
        const k = Math.floor(hash(bx * 31 + rz * 17 + t * 5) * PALETTE.length)
        out.push({ x: bx + CL / 2, y: sheer(bx + CL / 2) + CH / 2 + 0.02 + t * (CH + 0.01), z, c: PALETTE[k] })
      }
    }
  }
  return out
}
const CARGO = stacks()
/** the consignment under review: a top-tier container amidships, on the side facing the camera */
const TARGET = (() => {
  let best = CARGO[0], bd = 1e9
  CARGO.forEach((b) => { const d = Math.abs(b.x - 0.4) + Math.abs(b.z - 0.32) * 2 - b.y * 3; if (d < bd) { bd = d; best = b } })
  return best
})()
const TGT_TOP = new THREE.Vector3(TARGET.x, TARGET.y + CH / 2, TARGET.z)

function corrugation() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16
  const g = c.getContext('2d')!
  for (let x = 0; x < 64; x += 4) { g.fillStyle = x % 8 ? '#ffffff' : '#d4d4d4'; g.fillRect(x, 0, 4, 16) }
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, 64, 1); g.fillRect(0, 15, 64, 1)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

// ---------------------------------------------------------------------------------------------------------------
// the network over the ship

// staggered in height and depth so that, with the ship turned toward the camera, no two labels overlap
const NODES = [
  { name: 'IMPORTER', p: new THREE.Vector3(3.15, 2.0, 0.35) },
  { name: 'DIRECTOR', p: new THREE.Vector3(1.2, 2.95, -0.3) },
  { name: 'ASSISTANT\nDIRECTOR', p: new THREE.Vector3(-0.7, 2.15, -0.35) },
  { name: 'PRINCIPAL\nOFFICER', p: new THREE.Vector3(-2.7, 2.8, 0.4) },
]
const arc = (a: THREE.Vector3, b: THREE.Vector3, lift: number, dz = 0) =>
  new THREE.QuadraticBezierCurve3(a.clone(), a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, lift, dz)), b.clone())
/** forward route between consecutive offices (sagging, so it stays clear of the labels above each office),
 *  and the send-back path PO → AD, which dips lower and toward the camera so the two never merge */
const LINKS = [arc(NODES[0].p, NODES[1].p, -0.3), arc(NODES[1].p, NODES[2].p, -0.3), arc(NODES[2].p, NODES[3].p, -0.3)]
const BACK = arc(NODES[3].p, NODES[2].p, -0.85, 0.55)

/** the overlay grid floats just above the stacks */
export const GRID_Y = 1.38
export const GRID_X: [number, number] = [-2.45, 3.25]
export const GRID_Z: [number, number] = [-0.72, 0.72]
export const TARGET_XZ: [number, number] = [TARGET.x, TARGET.z]

/** stage values from the section's progress d */
export function shipStages(d: number) {
  return {
    apply: sstep(0.03, 0.1, d), // the importer files: application → director
    assign: sstep(0.11, 0.17, d), // the director assigns: → AD
    docs: sstep(0.18, 0.28, d), // document verification at the AD: the manifest is scanned along the cargo
    route: sstep(0.29, 0.35, d), // the AD routes it to the PO
    phys: sstep(0.36, 0.44, d), // physical verification: the PO's inspection beam on the container
    back: sstep(0.45, 0.5, d), // sent back to the AD
    review: sstep(0.53, 0.6, d), // reviewed, returned to the PO
    approve: sstep(0.62, 0.67, d),
    permit: sstep(0.68, 0.74, d), // the permit is issued: the consignment is cleared
  }
}
type Stages = ReturnType<typeof shipStages>
/** how lit each forward link is */
export const linkLit = (st: Stages) => [st.apply, st.assign, Math.max(st.route, st.review)]
/** the scan plane's x along the cargo (bow → stern) */
export const scanX = (st: Stages) => 3.6 - st.docs * 6.6

/** where the moving application is: which curve and how far along (null when nothing is in transit) */
function packetOn(st: Stages): [THREE.Curve<THREE.Vector3>, number] | null {
  const run = (v: number) => v > 0.01 && v < 0.99
  if (run(st.apply)) return [LINKS[0], st.apply]
  if (run(st.assign)) return [LINKS[1], st.assign]
  if (run(st.route)) return [LINKS[2], st.route]
  if (run(st.back)) return [BACK, st.back]
  if (run(st.review)) return [LINKS[2], st.review]
  return null
}

/** a point along the forward route (importer → PO), u in [0, 1), in ship space */
export function routePoint(u: number, out: THREE.Vector3) {
  const k = Math.min(2, Math.floor(u * 3))
  return LINKS[k].getPoint(u * 3 - k, out)
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3()
/**
 * The ship's pose inside the system group (shared with the token formation, which rides over the cargo).
 * It sails in from the left as the scene arrives, makes slow headway through the section, and sails on into the
 * cloud as the scene leaves.
 */
export function shipMatrix(time: number, out: THREE.Matrix4) {
  const s = S.s, d = local(SECTION)
  const narrow = S.narrow
  const sway = S.reduced ? 0 : 1
  const enter = sstep(4.94, 5.16, s), leave = sstep(5.8, 5.98, s)
  // phones: the ship sits higher and a little smaller so the whole hull, bridge to bow, stays in the upper half
  const yaw = narrow ? -0.55 : -0.5
  const run = (d - 0.5) * 1.1 - (1 - enter) * 7 + leave * 4
  _p.set((narrow ? -0.3 : 0.05) + Math.cos(yaw) * run, (narrow ? -0.45 : -1.55) + 0.04 * Math.sin(time * 0.7) * sway - leave * 1.6, -0.4 - Math.sin(yaw) * run)
  _q.setFromEuler(_e.set(0.018 * Math.sin(time * 0.5) * sway, yaw, 0.025 * Math.sin(time * 0.62 + 1) * sway + leave * 0.06, 'YXZ'))
  const sc = 1.1
  return out.compose(_p, _q, _s.set(sc, sc, sc))
}

// ---------------------------------------------------------------------------------------------------------------

const C_IDLE = new THREE.Color('#5A747C'), C_LIVE = new THREE.Color('#F28A28'), C_DONE = new THREE.Color('#2a7fa8')
export const C_OK = new THREE.Color('#2f8a5b'), C_BACK = new THREE.Color('#c0503a')

function dashedSegment(a: THREE.Vector3, b: THREE.Vector3) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b])
  g.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, a.distanceTo(b)], 1))
  return g
}

export function Ship({ setStatus }: { setStatus: (t: string) => void }) {
  const hull = useMemo(hullGeometry, [])
  const tex = useMemo(corrugation, [])
  const ship = useRef<THREE.Group>(null!)
  const net = useRef<THREE.Group>(null!)
  const nodeCore = useRef<THREE.Mesh[]>([])
  const nodeRing = useRef<THREE.Mesh[]>([])
  const linkMats = useRef<THREE.MeshBasicMaterial[]>([])
  const backMat = useRef<THREE.MeshBasicMaterial>(null!)
  const dropMats = useRef<THREE.LineDashedMaterial[]>([])
  const packet = useRef<THREE.Mesh>(null!)
  const scan = useRef<THREE.Mesh>(null!)
  const inspect = useRef<THREE.Mesh>(null!)
  const outline = useRef<THREE.LineSegments>(null!)
  const badge = useRef<THREE.Group>(null!)
  const radar = useRef<THREE.Mesh>(null!)
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const geo = useMemo(() => {
    const top = TGT_TOP.clone().add(new THREE.Vector3(0, 0.03, 0))
    const dirB = NODES[3].p.clone().sub(TGT_TOP)
    return {
      box: new RoundedBoxGeometry(CL, CH, CW, 1, 0.012),
      bridge: new RoundedBoxGeometry(0.9, 1.6, 1.55, 2, 0.04),
      funnel: new RoundedBoxGeometry(0.42, 0.8, 0.5, 2, 0.08),
      edges: new THREE.EdgesGeometry(new THREE.BoxGeometry(CL + 0.05, CH + 0.05, CW + 0.05)),
      scanEdge: new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.1, 1.6)),
      drops: NODES.map((n) => dashedSegment(n.p.clone().add(new THREE.Vector3(0, -0.12, 0)), top)),
      beamLen: dirB.length(),
      beamMid: NODES[3].p.clone().lerp(TGT_TOP, 0.5),
      beamQ: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirB.normalize()),
    }
  }, [])
  // spray at the bow and a wake trailing astern; the cloud sea itself swallows the hull below the waterline
  const foam = useMemo(() => [
    ...cumulus({ c: [4.45, WATER - 0.2, 0], w: 1.6, h: 0.45, d: 1.4, n: 18, seed: 501, size: 1.9, flat: 0.6 }),
    ...cumulus({ c: [-6.2, WATER - 0.2, 0], w: 4.4, h: 0.4, d: 1.8, n: 26, seed: 507, size: 1.3, flat: 0.7 }),
  ], [])

  // cargo instances, once
  const setCargo = (m: THREE.InstancedMesh | null) => {
    if (!m || m.userData.filled) return
    const o = new THREE.Object3D()
    CARGO.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, b.c) })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.userData.filled = true
  }

  useFrame(({ clock }) => {
    const d = local(SECTION)
    const time = S.reduced ? 0 : clock.elapsedTime
    const st = shipStages(d)
    shipMatrix(clock.elapsedTime, m4)
    m4.decompose(ship.current.position, ship.current.quaternion, ship.current.scale)
    radar.current.rotation.y = time * 2.2
    // the overlay lifts off and thins as the scene leaves
    const leave = sstep(5.8, 5.95, S.s)
    net.current.visible = leave < 0.99
    net.current.position.y = leave * 1.2
    net.current.scale.setScalar(1 - leave * 0.6)

    // offices: idle (slate), working (copper, pulsing), done (blue), all green once approved;
    // the AD turns red while the application is sent back to it
    const live = d < 0.11 ? 0 : d < 0.18 ? 1 : d < 0.29 ? 2 : d < 0.45 ? 3 : d < 0.53 ? 2 : d < 0.62 ? 3 : -1
    const reached = [st.apply > 0 ? 1 : 0, st.apply, st.assign, st.route]
    const pulse = 0.5 + 0.5 * Math.sin(time * 4)
    const sentBack = st.back > 0.05 && st.review < 0.5
    NODES.forEach((_, k) => {
      const core = nodeCore.current[k], ring = nodeRing.current[k]
      if (!core || !ring) return
      const m = core.material as THREE.MeshStandardMaterial
      const c = m.color
      if (st.approve > 0.5) c.copy(C_OK)
      else if (k === 2 && sentBack) c.copy(C_BACK)
      else if (k === live) c.copy(C_LIVE)
      else if (reached[k] > 0.5) c.copy(C_DONE)
      else c.copy(C_IDLE)
      m.emissive.copy(c); m.emissiveIntensity = k === live ? 0.6 + 0.4 * pulse : 0.3
      ;(ring.material as THREE.MeshBasicMaterial).color.copy(c)
      ring.scale.setScalar(k === live ? 1 + 0.2 * pulse : 1)
    })
    // links light as the application travels them
    const lit = linkLit(st)
    linkMats.current.forEach((mm, k) => {
      if (!mm) return
      mm.color.copy(st.approve > 0.5 ? C_OK : C_DONE)
      mm.opacity = 0.28 + 0.62 * clamp(lit[k] * 1.2)
    })
    backMat.current.opacity = 0.14 + 0.76 * clamp(st.back * 1.5) * (1 - st.review)
    // dashed links from each office down to the consignment it is deciding on
    dropMats.current.forEach((mm, k) => {
      if (!mm) return
      const on = k === live || st.permit > 0.5
      mm.opacity = on ? 0.85 : 0.22
      mm.color.copy(st.permit > 0.5 ? C_OK : k === live ? C_LIVE : C_DONE)
    })
    // the application in transit
    const pk = packetOn(st)
    packet.current.visible = !!pk
    if (pk) pk[0].getPoint(pk[1], packet.current.position)
    ;(packet.current.material as THREE.MeshBasicMaterial).color.copy(pk && pk[0] === BACK ? C_BACK : C_LIVE)
    // document verification: a scan passes along the cargo, bow to stern
    scan.current.visible = st.docs > 0.01 && st.docs < 0.99
    scan.current.position.set(scanX(st), 0.72, 0)
    // physical verification: the principal officer's inspection beam on the container
    const bOn = st.phys * (1 - sstep(0.44, 0.47, d))
    inspect.current.visible = bOn > 0.02
    ;(inspect.current.material as THREE.MeshBasicMaterial).opacity = 0.26 * bOn
    // the consignment's outline: copper while it is examined, red while sent back, green once cleared
    const ol = outline.current
    ol.visible = st.docs > 0.5
    ;(ol.material as THREE.LineBasicMaterial).color.copy(st.permit > 0.5 ? C_OK : sentBack ? C_BACK : C_LIVE)
    ol.scale.setScalar(1 + 0.18 * Math.sin(st.permit * Math.PI))
    // the permit badge rises over the cleared container
    const bg = badge.current
    bg.visible = st.permit > 0.01
    bg.scale.setScalar(Math.max(0.001, st.permit) * (S.narrow ? 1.6 : 1))
    bg.position.set(TGT_TOP.x, TGT_TOP.y + 0.35 + 0.4 * st.permit, TGT_TOP.z)

    setStatus(
      d < 0.11 ? 'Importer applies' : d < 0.18 ? 'Director assigns to AD' : d < 0.29 ? 'Document verification'
      : d < 0.36 ? 'AD routes to PO' : d < 0.45 ? 'Physical verification' : d < 0.53 ? 'Sent back to AD'
      : d < 0.62 ? 'Reviewed · back to PO' : d < 0.68 ? 'Approved' : 'Permit issued · cargo cleared')
  })

  const labelSize = S.narrow ? 0.27 : 0.17
  const cream = '#ebe6db'
  return (
    <group ref={ship}>
      {/* hull */}
      <mesh geometry={hull}><meshStandardMaterial vertexColors roughness={0.55} metalness={0.12} /></mesh>
      {/* deckhouse and bridge at the stern, taller than the stacks so the bridge can see over them; funnel behind */}
      <group position={[-3.55, 0, 0]}>
        <mesh geometry={geo.bridge} position={[0, 0.8, 0]}><meshStandardMaterial color={cream} roughness={0.6} /></mesh>
        {/* bridge windows across the top, cabin windows below */}
        <mesh position={[0.46, 1.4, 0]}><boxGeometry args={[0.02, 0.12, 1.4]} /><meshStandardMaterial color="#16242b" roughness={0.15} metalness={0.4} /></mesh>
        {[0.55, 0.85, 1.12].map((y) => [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55].map((z) => (
          <mesh key={`${y}${z}`} position={[0.46, y, z]}><boxGeometry args={[0.02, 0.06, 0.1]} /><meshStandardMaterial color="#5b7480" roughness={0.3} /></mesh>
        )))}
        {/* bridge wings */}
        <mesh position={[0.12, 1.56, 0]}><boxGeometry args={[0.56, 0.07, 2.12]} /><meshStandardMaterial color={cream} roughness={0.6} /></mesh>
        <mesh position={[0.41, 1.46, 0]}><boxGeometry args={[0.02, 0.11, 2.06]} /><meshStandardMaterial color="#16242b" roughness={0.15} metalness={0.4} /></mesh>
        {/* mast, radome and a turning radar scanner */}
        <mesh position={[-0.08, 1.86, 0]}><cylinderGeometry args={[0.016, 0.022, 0.55, 8]} /><meshStandardMaterial color="#2a3a42" /></mesh>
        <mesh position={[-0.08, 2.16, 0]}><sphereGeometry args={[0.06, 16, 12]} /><meshStandardMaterial color="#f2efe8" roughness={0.5} /></mesh>
        <mesh ref={radar} position={[-0.08, 1.98, 0]}><boxGeometry args={[0.04, 0.025, 0.32]} /><meshStandardMaterial color="#2a3a42" /></mesh>
        {/* funnel with the company band */}
        <mesh geometry={geo.funnel} position={[-0.64, 1.3, 0]}><meshStandardMaterial color="#23323b" roughness={0.5} /></mesh>
        <mesh position={[-0.64, 1.5, 0]}><boxGeometry args={[0.44, 0.09, 0.52]} /><meshStandardMaterial color="#c8742f" roughness={0.5} /></mesh>
      </group>
      {/* forecastle mast */}
      <mesh position={[3.85, 0.42, 0]}><cylinderGeometry args={[0.02, 0.026, 0.7, 8]} /><meshStandardMaterial color="#2a3a42" /></mesh>
      {/* cargo */}
      <instancedMesh ref={setCargo} args={[geo.box, undefined, CARGO.length]} frustumCulled={false}>
        <meshStandardMaterial map={tex} roughness={0.7} metalness={0.08} />
      </instancedMesh>
      {/* the sea of cloud around the hull */}
      <CloudField puffs={foam} renderOrder={1} hazeNear={18} hazeFar={90} />

      {/* ---- the platform, drawn over the ship as a network ---- */}
      <group ref={net}>
        {LINKS.map((c, k) => (
          <mesh key={k} renderOrder={2}>
            <tubeGeometry args={[c, 48, 0.018, 8, false]} />
            <meshBasicMaterial ref={(el) => { if (el) linkMats.current[k] = el }} color="#2a7fa8" transparent opacity={0.3} depthWrite={false} />
          </mesh>
        ))}
        <mesh renderOrder={2}>
          <tubeGeometry args={[BACK, 48, 0.013, 8, false]} />
          <meshBasicMaterial ref={backMat} color="#c0503a" transparent opacity={0.14} depthWrite={false} />
        </mesh>
        {geo.drops.map((g, k) => (
          <lineSegments key={k} geometry={g} renderOrder={2}>
            <lineDashedMaterial ref={(el) => { if (el) dropMats.current[k] = el }} color="#2a7fa8" dashSize={0.07} gapSize={0.06} transparent opacity={0.22} depthWrite={false} />
          </lineSegments>
        ))}
        {NODES.map((n, k) => (
          <group key={k} position={n.p.toArray()}>
            <mesh ref={(el) => { if (el) nodeCore.current[k] = el }}>
              <sphereGeometry args={[0.09, 24, 16]} />
              <meshStandardMaterial color="#5A747C" emissive="#5A747C" emissiveIntensity={0.3} roughness={0.3} />
            </mesh>
            <Billboard>
              <mesh ref={(el) => { if (el) nodeRing.current[k] = el }}>
                <ringGeometry args={[0.15, 0.175, 48]} />
                <meshBasicMaterial color="#5A747C" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
              <Text font={FONTS.mono} fontSize={labelSize} lineHeight={1.15} letterSpacing={0.08} color="#122027"
                outlineWidth={labelSize * 0.12} outlineColor="#f3f6f6" anchorX="center" anchorY="bottom" textAlign="center" position={[0, 0.25, 0]}>
                {n.name}
              </Text>
            </Billboard>
          </group>
        ))}
        <mesh ref={packet} renderOrder={3}><sphereGeometry args={[0.075, 16, 12]} /><meshBasicMaterial color="#F28A28" /></mesh>
        {/* document verification sweep */}
        <mesh ref={scan} rotation={[0, Math.PI / 2, 0]} renderOrder={2}>
          <planeGeometry args={[2.1, 1.6]} />
          <meshBasicMaterial color="#9CD3E3" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
          <lineSegments geometry={geo.scanEdge}><lineBasicMaterial color="#4FAED5" /></lineSegments>
        </mesh>
        {/* physical verification: a cone of light from the principal officer onto the container */}
        <mesh ref={inspect} position={geo.beamMid.toArray()} quaternion={geo.beamQ} renderOrder={2}>
          <cylinderGeometry args={[0.04, 0.3, geo.beamLen, 24, 1, true]} />
          <meshBasicMaterial color="#F28A28" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <lineSegments ref={outline} geometry={geo.edges} position={[TARGET.x, TARGET.y, TARGET.z]}>
          <lineBasicMaterial color="#F28A28" />
        </lineSegments>
        <group ref={badge}>
          <Billboard>
            <mesh position={[0, 0, -0.002]}><planeGeometry args={[1.72, 0.46]} /><meshBasicMaterial color="#2f8a5b" /></mesh>
            <mesh><planeGeometry args={[1.66, 0.4]} /><meshBasicMaterial color="#f4f6f1" /></mesh>
            <Text font={FONTS.mono} fontSize={0.17} letterSpacing={0.1} color="#2f8a5b" anchorX="center" anchorY="middle" position={[0, 0, 0.003]}>PERMIT ISSUED</Text>
          </Billboard>
        </group>
      </group>
    </group>
  )
}
