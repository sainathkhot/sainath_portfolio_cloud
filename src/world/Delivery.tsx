import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { S, sstep, clamp, lerp } from '../store'
import { FONTS } from '../lib/fonts'
import { BANNERS } from '../content'
import { CloudField, cumulus } from './Cloud'
import { buildCraft } from './Aircraft'

/*
 * Recognition & Delivery.
 * A light aircraft crosses the evening sky twice, right to left and back, each time towing a folded banner. It lets
 * the banner go; the banner glides down with a tilt, unfolds, unrolls and hangs still. Everything is a pure function
 * of the film position, so scrolling back plays the same sequence in reverse and there are no stranded states.
 *
 * Carrier: the aircraft is built here from smooth primitives (an aircraft is clean, machined form, which reads as real
 * at this size; a procedural bird never did). If a licensed, rigged eagle is placed at src/assets/models/eagle.glb
 * (glTF binary, uncompressed or meshopt, facing +Z, with a flight clip), it is used instead and carries the banner in its talons.
 */

const found = import.meta.glob('../assets/models/eagle.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const EAGLE_GLB: string | null = Object.values(found)[0] ?? null
/** yaw (radians) that turns the drop-in model so it faces +Z, if it was exported facing another way */
const GLB_YAW = 0

const REC = 9 // record section index
/**
 * Aircraft size multiplier, applied to every pass. 1 restores the original size recorded in
 * docs/portfolio-visual-baseline.md (per-pass `craft` values in layout() are the baseline numbers).
 */
const CRAFT_SIZE = 1.1
const Z = -156 // banner plane
// banner sizes (top rod centre is the origin). The second banner carries more text, so it is a little wider and
// taller than the first; phones get a narrower, taller cloth so the type can stay large
type Dims = { w: number; h: number }
const dimsFor = (narrow: boolean): [Dims, Dims] => narrow ? [{ w: 2.9, h: 2.35 }, { w: 3.0, h: 2.65 }] : [{ w: 3.4, h: 2.5 }, { w: 3.55, h: 2.72 }]
let RING_Y = 0.62 // suspension ring above the rod
const setRing = (narrow: boolean) => { RING_Y = narrow ? 0.38 : 0.62 }
const SLEEVE = 0.12 // cloth folded over the rod
const POINT = 0.22 // depth of the pointed hem

// timeline, in record-section progress p = S.s - 9
const PH = [
  { from: 0.03, to: 0.39 }, // pass 1: right → left, banner A
  // a held beat: the first banner hangs alone and can be read before the aircraft returns
  { from: 0.47, to: 0.83 }, // pass 2: left → right, banner B
]
const FALL = 0.12 // release → hanging still
const FADE_OUT: [number, number] = [9.9, 9.97] // banners thin before the camera glides on between them

type Anchor = { pos: THREE.Vector3; yaw: number; tilt: number }
type Layout = {
  paths: THREE.CatmullRomCurve3[]; anchors: Anchor[]; scale: number
  craft: [number, number] // per pass: the return pass flies at a different depth, so its scale keeps its apparent size
  drop: [number, number] // how far below the line of flight the towed bundle rides
  release: [(u: number, hold: THREE.Vector3) => number, (u: number, hold: THREE.Vector3) => number]
  banks: [number, number, number][]
}

// a stand-in for the film camera during the record hold (it barely moves: z −145.5 → −146.5), used to place
// routes and release points in screen terms so they hold at every aspect ratio
function holdCamera(aspect: number) {
  const c = new THREE.PerspectiveCamera(35, aspect, 0.1, 900)
  c.position.set(0, 4.6, -146.1); c.lookAt(0, 4.4, -170); c.updateMatrixWorld(); c.updateProjectionMatrix()
  return c
}
/** world point at depth z under screen fraction (fx, fy) from the top-left */
function onScreen(cam: THREE.PerspectiveCamera, fx: number, fy: number, z: number) {
  const d = new THREE.Vector3(fx * 2 - 1, 1 - fy * 2, 0.5).unproject(cam).sub(cam.position).normalize()
  return cam.position.clone().addScaledVector(d, (z - cam.position.z) / d.z)
}
function toScreen(cam: THREE.PerspectiveCamera, p: THREE.Vector3) {
  const n = p.clone().project(cam)
  return [(n.x + 1) / 2, (1 - n.y) / 2] as const
}
/** bottom of the record headline, as a fraction of the viewport (layout position, unaffected by its fade transform) */
function headlineBottom() {
  const h = document.querySelector<HTMLElement>('.frame--record h2')
  return h ? (h.offsetTop + h.offsetHeight) / window.innerHeight : 0.25
}

function layout(narrow: boolean, aspect: number): Layout {
  const k = narrow ? 0.45 : 1
  const [dA, dB] = dimsFor(narrow)
  const visW = 2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * 9.6 * aspect
  const spanA = dA.w + 0.35, spanB = dB.w + 0.35 // cloth plus finials
  const cam = holdCamera(aspect)
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * k, y, z)
  const far = narrow ? 16 : 24 // start and finish just out of frame, so the aircraft never pops in or out
  // first pass: right → left, behind the banner plane and below the headline (unchanged)
  const p1 = new THREE.CatmullRomCurve3([
    v(far, 8.6, -188), v(14, 7.9, -178), v(8, 6.7, -168), v(3.2, 6.25, -163), v(0, 6.15, -162), v(-3.6, 6.3, -163), v(-8, 6.9, -168), v(-14, 7.6, -178), v(-far, 8.4, -188),
  ], false, 'centripetal')
  const rel1 = (_u: number, h: THREE.Vector3) => h.x - 0.6 * k

  if (narrow) {
    const sc = Math.min((visW * 0.92) / spanA, 0.95)
    const top = 6.05
    const A = new THREE.Vector3(0, top, Z), B = new THREE.Vector3(0, top - dA.h * sc - RING_Y * sc - 0.12, Z)
    // second pass on a phone: the cards stack, so the open sky is the lower half, where the second card will hang.
    // the aircraft crosses it left → right, in front of the cloud deck and well clear of the first card's foot,
    // and lets go just before the centre; the bundle then settles back and down into the lower position
    const aFoot = toScreen(cam, new THREE.Vector3(0, top - dA.h * sc, Z))[1]
    const fy = aFoot + 0.075
    const zp = -153.4
    const p2 = new THREE.CatmullRomCurve3([
      onScreen(cam, -0.4, fy + 0.02, zp), onScreen(cam, 0.05, fy + 0.01, zp), onScreen(cam, 0.4, fy, zp),
      onScreen(cam, 0.8, fy - 0.01, zp), onScreen(cam, 1.15, fy - 0.025, zp - 0.4), onScreen(cam, 1.5, fy - 0.04, zp - 1.0),
    ], false, 'centripetal')
    return {
      paths: [p1, p2], scale: sc, craft: [0.7, 0.29], drop: [0.42, 0.16],
      anchors: [{ pos: A, yaw: 0, tilt: 0.22 }, { pos: B, yaw: 0, tilt: -0.22 }],
      release: [rel1, (_u, h) => toScreen(cam, h)[0] - 0.4],
      banks: [[-6.4, 7.4, -178], [6.6, 7.8, -179]],
    }
  }

  const sc = Math.min(1.12, (visW * 0.93 - 0.5) / (spanA + spanB))
  const A = new THREE.Vector3(-(0.25 + (spanA / 2) * sc), 4.82, Z)
  const B = new THREE.Vector3(0.25 + (spanB / 2) * sc, 4.72, Z)
  // second pass on wide screens: left → right through the open band between the headline and the first card's
  // ring, so the whole aircraft, its line and the bundle stay in clear sky; past the first card it eases down,
  // lets go over the right half, then climbs away to the right
  const ringA = toScreen(cam, new THREE.Vector3(A.x, A.y + RING_Y * sc, Z))[1]
  const yb = (headlineBottom() + ringA) / 2
  const zp = -172 // far enough back that the whole aircraft fits the band with room above and below
  const p2 = new THREE.CatmullRomCurve3([
    onScreen(cam, -0.14, yb, zp), onScreen(cam, 0.05, yb, zp), onScreen(cam, 0.3, yb, zp),
    onScreen(cam, 0.52, yb + 0.012, zp), onScreen(cam, 0.68, yb + 0.02, zp), onScreen(cam, 0.86, yb - 0.05, zp - 2),
    onScreen(cam, 1.3, yb - 0.14, zp - 12),
  ], false, 'centripetal')
  return {
    paths: [p1, p2], scale: sc, craft: [1.2, 1.4], drop: [0.42, 0.16],
    anchors: [{ pos: A, yaw: 0.08, tilt: 0.22 }, { pos: B, yaw: -0.08, tilt: -0.22 }],
    release: [rel1, (_u, h) => toScreen(cam, h)[0] - 0.58],
    banks: [[-14, 7.4, -178], [14.5, 7.9, -179]],
  }
}

// ---------------------------------------------------------------------------------------------------------------
// banners: parchment cloth with a sleeve over a brass rod, a fine gold hem line, a pointed foot

function silhouette(g: CanvasRenderingContext2D, W: number, H: number, inset: number, bh: number) {
  // straight sides, softly radiused corners, a shallow symmetrical point
  const pd = (POINT / bh) * H, r = 0.035 * W
  const i = inset
  g.beginPath()
  g.moveTo(i, i)
  g.lineTo(W - i, i)
  g.lineTo(W - i, H - pd - r - i * 0.4)
  g.quadraticCurveTo(W - i, H - pd - i * 0.4 + r * 0.25, W - i - r, H - pd - i * 0.4 + r * (pd / (W / 2)))
  g.lineTo(W / 2, H - i * 1.1)
  g.lineTo(i + r, H - pd - i * 0.4 + r * (pd / (W / 2)))
  g.quadraticCurveTo(i, H - pd - i * 0.4 + r * 0.25, i, H - pd - r - i * 0.4)
  g.closePath()
}

function clothTexture({ w: BW, h: BH }: Dims) {
  const W = 2048, H = Math.round(2048 * BH / BW)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  const u = W / BW // px per world unit
  silhouette(g, W, H, 2, BH)
  g.save(); g.clip()
  const base = g.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0, '#f8f3e8'); base.addColorStop(1, '#f2eadb')
  g.fillStyle = base; g.fillRect(0, 0, W, H)
  // the faintest laid-paper texture
  let s = 17
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let y = 0; y < H; y += 3) { g.fillStyle = `rgba(120,95,55,${0.006 + rnd() * 0.01})`; g.fillRect(0, y, W, 1) }
  for (let k = 0; k < 900; k++) { g.strokeStyle = `rgba(120,95,55,${0.03 + rnd() * 0.03})`; g.lineWidth = 1; const x = rnd() * W, y = rnd() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 6); g.stroke() }
  // soft edge falloff, as light falls off across a hanging cloth
  const vg = g.createLinearGradient(0, 0, W, 0)
  vg.addColorStop(0, 'rgba(110,80,40,0.07)'); vg.addColorStop(0.08, 'rgba(110,80,40,0)'); vg.addColorStop(0.92, 'rgba(110,80,40,0)'); vg.addColorStop(1, 'rgba(110,80,40,0.07)')
  g.fillStyle = vg; g.fillRect(0, 0, W, H)
  // sleeve: the cloth folded over the rod, with the shadow of the fold beneath
  const sh = SLEEVE * u
  const sg = g.createLinearGradient(0, 0, 0, sh)
  sg.addColorStop(0, '#e6dac2'); sg.addColorStop(0.55, '#efe5d1'); sg.addColorStop(1, '#e9ddc6')
  g.fillStyle = sg; g.fillRect(0, 0, W, sh)
  const fold = g.createLinearGradient(0, sh, 0, sh + 18)
  fold.addColorStop(0, 'rgba(90,65,30,0.16)'); fold.addColorStop(1, 'rgba(90,65,30,0)')
  g.fillStyle = fold; g.fillRect(0, sh, W, 18)
  g.restore()
  // a fine gold line just inside the edge, and the edge itself
  g.strokeStyle = 'rgba(190,150,80,0.95)'; g.lineWidth = 3
  silhouette(g, W, H, 0.075 * u, BH); g.stroke()
  g.beginPath(); g.moveTo(0.075 * u, sh + 0.035 * u); g.lineTo(W - 0.075 * u, sh + 0.035 * u); g.stroke()
  g.strokeStyle = 'rgba(160,120,60,0.55)'; g.lineWidth = 3
  silhouette(g, W, H, 2, BH); g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

function shadowTexture({ w: BW, h: BH }: Dims) {
  const pad = 80, W = 512, H = Math.round(512 * BH / BW)
  const c = document.createElement('canvas'); c.width = W + pad * 2; c.height = H + pad * 2
  const g = c.getContext('2d')!
  g.filter = 'blur(26px)'
  g.translate(pad, pad); silhouette(g, W, H, 0, BH); g.fillStyle = 'rgba(90,55,25,1)'; g.fill()
  const t = new THREE.CanvasTexture(c)
  return { t, kx: (W + pad * 2) / W, ky: (H + pad * 2) / H }
}

const panelVert = /* glsl */ `
uniform float uWave, uPhase, uOpen, uH;
varying vec2 vUv; varying float vShade;
void main() {
  vUv = uv;
  vec3 p = position;
  float hang = 1.0 - uv.y;
  float a = uv.x * 7.0 + uPhase + uv.y * 2.5;
  p.z += uWave * (sin(a) * 0.6 + sin(uv.x * 13.0 - uPhase * 1.3) * 0.22) * (0.25 + hang);
  // at rest the cloth bows very slightly, so light across it is not perfectly flat
  float bow = (uv.x - 0.5) * (uv.x - 0.5);
  vShade = 1.0 + uWave * 1.6 * cos(a) - bow * 0.12;
  p.y = max(p.y, -uH * uOpen); // unroll from the top rod
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`
const panelFrag = /* glsl */ `
uniform sampler2D map; uniform float uOpen, uOpacity;
varying vec2 vUv; varying float vShade;
void main() {
  float cut = 1.0 - uOpen;
  if (vUv.y < cut - 0.002) discard;
  vec4 c = texture2D(map, vUv);
  float edge = smoothstep(cut, cut + 0.03, vUv.y);
  vec3 col = c.rgb * clamp(vShade, 0.78, 1.12) * mix(0.84, 1.0, edge);
  gl_FragColor = vec4(col, c.a * 0.97 * uOpacity * smoothstep(cut - 0.002, cut + 0.002, vUv.y));
  #include <colorspace_fragment>
}`

type BannerRefs = {
  g: THREE.Group; inner: THREE.Group; panel: THREE.ShaderMaterial; roll: THREE.Mesh; texts: THREE.Group
  hang: THREE.Group; shadow: THREE.MeshBasicMaterial; mats: THREE.Material[]
}

function acornGeo() {
  // a turned brass finial, pointing along +x
  const pts = [[0.001, 0], [0.026, 0.0], [0.03, 0.012], [0.022, 0.02], [0.036, 0.045], [0.034, 0.072], [0.02, 0.095], [0.008, 0.112], [0.012, 0.12], [0.001, 0.13]]
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 20).rotateZ(-Math.PI / 2)
}

function Banner({ which, refs, dims }: { which: 0 | 1; refs: React.MutableRefObject<BannerRefs | null>; dims: Dims }) {
  const { w: BW, h: BH } = dims
  const g = useRef<THREE.Group>(null!)
  const inner = useRef<THREE.Group>(null!)
  const roll = useRef<THREE.Mesh>(null!)
  const texts = useRef<THREE.Group>(null!)
  const hang = useRef<THREE.Group>(null!)
  const tex = useMemo(() => clothTexture(dims), [dims])
  const sh = useMemo(() => shadowTexture(dims), [dims])
  const geo = useMemo(() => new THREE.PlaneGeometry(BW, BH, 36, 44).translate(0, -BH / 2, 0), [BW, BH])
  const panel = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: panelVert, fragmentShader: panelFrag, transparent: true, side: THREE.DoubleSide,
    uniforms: { map: { value: tex }, uWave: { value: 0 }, uPhase: { value: 0 }, uOpen: { value: 1 }, uOpacity: { value: 1 }, uH: { value: BH } },
  }), [tex])
  const brass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#c8a159', metalness: 0.85, roughness: 0.28, clearcoat: 0.4, transparent: true }), [])
  const cord = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b39257', roughness: 0.6, metalness: 0.3, transparent: true }), [])
  const cloth = useMemo(() => new THREE.MeshStandardMaterial({ color: '#efe6d3', roughness: 0.9, transparent: true }), [])
  const shadow = useMemo(() => new THREE.MeshBasicMaterial({ map: sh.t, transparent: true, opacity: 0.16, depthWrite: false }), [sh])
  const acorn = useMemo(acornGeo, [])
  useEffect(() => {
    refs.current = { g: g.current, inner: inner.current, panel, roll: roll.current, texts: texts.current, hang: hang.current, shadow, mats: [brass, cord, cloth] }
    return () => { refs.current = null }
  }, [panel, brass, cord, cloth, shadow, refs])

  // ---- layout: both cards share one grid. Eyebrow, three rows, hairline dividers; a metric column on the left card,
  // a right-aligned date column on the right card
  const ph = S.narrow
  const B2 = which === 1 // the experience card: more lines, so more room between them
  const pad = ph ? (B2 ? 0.25 : 0.22) : (B2 ? 0.35 : 0.32)
  const L = -BW / 2 + pad, R = BW / 2 - pad, iw = BW - 2 * pad
  const ink = '#122027', slate = '#526a72', copper = '#a8581b'
  const eyebrowY = -(SLEEVE + 0.25)
  const y0 = B2 ? -0.93 : -0.86
  const step = B2 ? (ph ? 0.6 : 0.62) : (ph ? 0.52 : 0.54)
  const rows = [0, 1, 2].map((i) => y0 - i * step)
  const col = ph ? 0.72 : 0.98
  const f = ph
    ? { eyebrow: 0.08, mark: 0.26, title: 0.13, detail: 0.1, role: 0.158, org: 0.106, year: 0.096, edu: 0.11 }
    : { eyebrow: 0.078, mark: 0.3, title: 0.132, detail: 0.098, role: 0.172, org: 0.106, year: 0.096, edu: 0.124 }
  const RO = 7
  const rule = (y: number, key: string) => (
    <mesh key={key} position={[0, y, 0]} renderOrder={6}><planeGeometry args={[iw, 0.005]} /><meshBasicMaterial color="#c9a866" transparent opacity={0.55} /></mesh>
  )
  const dividers = [0, 1].map((i) => rule(rows[i] - step / 2, `d${i}`))
  const rec = BANNERS.recognition, path = BANNERS.path
  const finX = BW / 2 + 0.07
  return (
    <group ref={g}>
      <group ref={inner}>
        {/* soft contact shadow behind the cloth */}
        <mesh material={shadow} position={[0.05, -BH / 2 - 0.08, -0.06]} renderOrder={4}>
          <planeGeometry args={[BW * sh.kx, BH * sh.ky]} />
        </mesh>
        {/* hardware: rod, collars, turned finials; cords to a ring */}
        <mesh material={brass} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.022, 0.022, BW + 0.12, 16]} /></mesh>
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <mesh material={brass} position={[sx * (BW / 2 + 0.035), 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.028, 0.008, 8, 20]} /></mesh>
            <mesh material={brass} geometry={acorn} position={[sx * finX, 0, 0]} scale={[sx, 1, 1]} />
          </group>
        ))}
        <group ref={hang}>
          {[-1, 1].map((sx) => {
            const a = new THREE.Vector3(sx * (BW / 2 - 0.16), 0.02, 0), b = new THREE.Vector3(0, RING_Y - 0.04, 0)
            const d = b.clone().sub(a), len = d.length()
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
            return (
              <mesh key={sx} material={cord} position={a.clone().lerp(b, 0.5)} quaternion={q}><cylinderGeometry args={[0.0045, 0.0045, len, 6]} /></mesh>
            )
          })}
          <mesh material={brass} position={[0, RING_Y, 0]}><torusGeometry args={[0.042, 0.009, 10, 28]} /></mesh>
        </group>
        <mesh geometry={geo} material={panel} position={[0, -0.005, 0.004]} renderOrder={5} />
        <mesh ref={roll} material={cloth} rotation={[0, 0, Math.PI / 2]} renderOrder={5}><cylinderGeometry args={[1, 1, BW, 18]} /></mesh>
        <group ref={texts} position={[0, -0.005, 0.016]}>
          <Text renderOrder={RO} font={FONTS.mono} fontSize={f.eyebrow} letterSpacing={0.18} color={copper} anchorX="left" anchorY="middle" position={[L, eyebrowY, 0]}>
            {(which === 0 ? rec.eyebrow : path.eyebrow).toUpperCase()}
          </Text>
          {dividers}
          {which === 0
            ? rec.items.map((it, i) => (
                <group key={it.title}>
                  <Text renderOrder={RO} font={FONTS.display} fontSize={f.mark} letterSpacing={-0.045} color={ink} anchorX="left" anchorY="middle" position={[L - 0.012, rows[i] - 0.02, 0]}>{it.mark}</Text>
                  <Text renderOrder={RO} font={FONTS.display} fontSize={f.title} letterSpacing={-0.012} color={ink} anchorX="left" anchorY="bottom" maxWidth={iw - col} position={[L + col, rows[i] + 0.005, 0]}>{it.title}</Text>
                  <Text renderOrder={RO} font={FONTS.sans} fontSize={f.detail} lineHeight={1.2} color={slate} anchorX="left" anchorY="top" maxWidth={iw - col} position={[L + col, rows[i] - 0.04, 0]}>{it.detail}</Text>
                </group>
              ))
            : (
              <>
                {path.roles.map((r, i) => (
                  <group key={r.title}>
                    <Text renderOrder={RO} font={FONTS.display} fontSize={f.role} letterSpacing={-0.018} color={ink} anchorX="left" anchorY="bottom" position={[L, rows[i] + 0.005, 0]}>{r.title}</Text>
                    <Text renderOrder={RO} font={FONTS.sans} fontSize={f.org} color={slate} anchorX="left" anchorY="top" position={[L, rows[i] - 0.055, 0]}>{r.org}</Text>
                    <Text renderOrder={RO} font={FONTS.mono} fontSize={f.year} letterSpacing={0.06} color={copper} anchorX="right" anchorY="top" position={[R, rows[i] - 0.06, 0]}>{r.when}</Text>
                  </group>
                ))}
                <Text renderOrder={RO} font={FONTS.sans} fontSize={f.edu} lineHeight={1.15} color={ink} anchorX="left" anchorY="bottom" maxWidth={iw} position={[L, rows[2] + 0.005, 0]}>{path.education.title}</Text>
                <Text renderOrder={RO} font={FONTS.sans} fontSize={f.org} color={slate} anchorX="left" anchorY="top" position={[L, rows[2] - 0.055, 0]}>{path.education.org}</Text>
                <Text renderOrder={RO} font={FONTS.mono} fontSize={f.year} letterSpacing={0.06} color={copper} anchorX="right" anchorY="top" position={[R, rows[2] - 0.06, 0]}>{path.education.when}</Text>
              </>
            )}
        </group>
      </group>
    </group>
  )
}

function setTextOpacity(g: THREE.Group, a: number) {
  g.visible = a > 0.004
  g.traverse((o) => {
    const t = o as THREE.Object3D & { fillOpacity?: number }
    if (t.fillOpacity !== undefined) { if (Math.abs(t.fillOpacity - a) > 0.003) t.fillOpacity = a; return }
    const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
    if (m && (o as THREE.Mesh).isMesh) m.opacity = 0.55 * a
  })
}

// ---------------------------------------------------------------------------------------------------------------
// optional licensed eagle

function useGlbEagle() {
  const [model, setModel] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer | null; dur: number } | null>(null)
  useEffect(() => {
    if (!EAGLE_GLB) return
    let off = false
    ;(async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ])
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(EAGLE_GLB)
      if (off) return
      const root = gltf.scene
      root.rotation.y = GLB_YAW
      const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3())
      const k = 2.6 / Math.max(size.x, size.y, size.z)
      const wrap = new THREE.Group(); wrap.add(root); root.scale.setScalar(k)
      root.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(k))
      root.traverse((o) => { (o as THREE.Mesh).frustumCulled = false })
      let mixer: THREE.AnimationMixer | null = null, dur = 1
      const clip = gltf.animations.find((a) => /fly|flap|flight|glide/i.test(a.name)) ?? gltf.animations[0]
      if (clip) { mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); dur = clip.duration }
      setModel({ root: wrap, mixer, dur })
    })().catch((e) => console.warn('eagle.glb could not be loaded; using the aircraft', e))
    return () => { off = true }
  }, [])
  return model
}

// ---------------------------------------------------------------------------------------------------------------

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _q = new THREE.Vector3()
const _o = new THREE.Object3D()

const _ht = new THREE.Vector3(), _ta = new THREE.Vector3(), _tb = new THREE.Vector3()
const heading = (t: THREE.Vector3) => Math.atan2(t.x, t.z)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Carrier pose at path parameter u, and where the towed banner is held.
 * Banking follows the rate of turn measured over a window either side of u, so it rolls in and out smoothly instead
 * of snapping at the curve's control points. The towed bundle rides on the flight path itself, a fixed rope-length
 * behind the aircraft (not rigidly behind the tail), so it follows the aircraft's track through every turn.
 * The tangent at the bundle is left in _ht.
 */
function carrierPose(path: THREE.CatmullRomCurve3, u: number, scale: number, eagle: boolean, out: THREE.Object3D, hold: THREE.Vector3, drop = 0.42) {
  path.getPointAt(u, _p); path.getTangentAt(u, _t)
  const w = 0.035
  path.getTangentAt(Math.max(0, u - w), _ta); path.getTangentAt(Math.min(1, u + w), _tb)
  const rate = wrap(heading(_tb) - heading(_ta)) / (Math.min(1, u + w) - Math.max(0, u - w))
  out.position.copy(_p)
  out.up.set(0, 1, 0)
  out.lookAt(_q.copy(_p).add(_t))
  out.rotateZ(clamp(rate * 0.12, -0.3, 0.3)) // coordinated bank into the turn
  out.scale.setScalar(scale)
  if (eagle) { hold.copy(_p); hold.y -= 0.42 * scale; _ht.copy(_t); return _t }
  const len = path.getLength(), ub = u - (2.15 * scale) / len
  if (ub >= 0) { path.getPointAt(ub, hold); path.getTangentAt(ub, _ht) }
  else { path.getPointAt(0, hold); path.getTangentAt(0, _ht); hold.addScaledVector(_ht, ub * len) }
  hold.y -= drop * scale
  return _t
}

/** first point along the path where the towed bundle reaches its release mark (f crosses zero) */
function releaseU(path: THREE.CatmullRomCurve3, f: (u: number, h: THREE.Vector3) => number, scale: number, eagle: boolean, drop: number) {
  const h = new THREE.Vector3()
  let best = 0.5, d = 1e9
  for (let i = 0; i <= 600; i++) {
    const u = i / 600
    carrierPose(path, u, scale, eagle, _o, h, drop)
    const e = Math.abs(f(u, h))
    if (e < d) { d = e; best = u }
  }
  return best
}

export function Delivery() {
  const narrow = S.narrow
  setRing(narrow) // before the banners render
  const dims = useMemo(() => dimsFor(narrow), [narrow])
  const size = useThree((st) => st.size)
  const aspect = size.width / Math.max(1, size.height)
  const L = useMemo(() => layout(narrow, aspect), [narrow, aspect])
  const glb = useGlbEagle()
  const isEagle = !!glb
  const crafts = useMemo(() => L.craft.map((c) => c * CRAFT_SIZE * (isEagle ? 1.1 : 1)), [L, isEagle])
  const rel = useMemo(() => [0, 1].map((i) => releaseU(L.paths[i], L.release[i], crafts[i], isEagle, L.drop[i])), [L, crafts, isEagle])
  const craft = useMemo(buildCraft, [])
  useEffect(() => () => craft.dispose(), [craft])
  const root = useRef<THREE.Group>(null!)
  const carrier = useRef<THREE.Group>(null!)
  const towLine = useRef<THREE.InstancedMesh>(null!)
  const shackle = useRef<THREE.Mesh>(null!)
  const bA = useRef<BannerRefs | null>(null)
  const bB = useRef<BannerRefs | null>(null)
  const banks = useMemo(() => L.banks.flatMap((c, i) => cumulus({ c, w: narrow ? 6 : 9, h: 3.6, d: 3, n: narrow ? 26 : 40, seed: 401 + i * 2, size: 1.05 })), [L, narrow])
  const v = useMemo(() => ({ hold: new THREE.Vector3(), tail: new THREE.Vector3(), a: new THREE.Vector3(), d: new THREE.Vector3(), P: [0, 1, 2, 3].map(() => new THREE.Vector3()), up: new THREE.Vector3(0, 1, 0), tan: new THREE.Vector3(), htan: new THREE.Vector3(), mid: new THREE.Vector3(), s0: new THREE.Vector3(), s1: new THREE.Vector3(), o: new THREE.Object3D() }), [])

  useEffect(() => {
    if (!glb) return
    craft.root.visible = false
    carrier.current.add(glb.root)
    return () => { carrier.current?.remove(glb.root); craft.root.visible = true }
  }, [glb, craft])

  /** the tow line: a rope in short segments along a gentle sag, so it hangs rather than reading as a rod */
  const SEGS = 16
  let lineScale = crafts[0]
  const line = (a: THREE.Vector3, b: THREE.Vector3, show: boolean) => {
    const m = towLine.current
    m.visible = show
    if (!show) return
    const len = a.distanceTo(b)
    v.mid.copy(a).lerp(b, 0.5); v.mid.y -= 0.08 * len
    const at = (t: number, out: THREE.Vector3) => out.copy(a).multiplyScalar((1 - t) * (1 - t)).addScaledVector(v.mid, 2 * t * (1 - t)).addScaledVector(b, t * t)
    for (let i = 0; i < SEGS; i++) {
      at(i / SEGS, v.s0); at((i + 1) / SEGS, v.s1)
      v.d.subVectors(v.s1, v.s0)
      v.o.position.copy(v.s0).addScaledVector(v.d, 0.5)
      v.o.scale.set(lineScale, v.d.length(), lineScale)
      v.o.quaternion.setFromUnitVectors(v.up, v.d.normalize())
      v.o.updateMatrix(); m.setMatrixAt(i, v.o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }

  useFrame(({ clock }) => {
    const s = S.s
    const on = s > 8.95 && s < 9.98
    root.current.visible = on
    if (!on) return
    const p = s - REC
    const t = clock.elapsedTime

    // ---- the carrier, on whichever pass is live
    const k = p < (PH[0].to + PH[1].from) / 2 ? 0 : 1
    const u = clamp((p - PH[k].from) / (PH[k].to - PH[k].from))
    const flying = u > 0.0005 && u < 0.9995
    const c = carrier.current
    c.visible = flying
    const tan = v.tan
    const craftScale = crafts[k]
    lineScale = craftScale
    if (flying) {
      tan.copy(carrierPose(L.paths[k], u, craftScale, isEagle, c, v.hold, L.drop[k])); v.htan.copy(_ht)
      c.position.y += 0.025 * Math.sin(t * 0.9) // a little air
      // relieved of the banner's drag, the aircraft lifts and eases its nose up for a moment, then flies on
      const ur = rel[k]
      c.position.y += 0.16 * craftScale * sstep(ur, ur + 0.3, u)
      c.rotateX(-0.06 * (sstep(ur, ur + 0.1, u) - sstep(ur + 0.14, ur + 0.36, u)))
      if (glb?.mixer) glb.mixer.setTime(((u * L.paths[k].getLength() * 0.37) % 1) * glb.dur)
      craft.prop.rotation.z = t * 9
      c.updateMatrixWorld(true)
      v.tail.copy(craft.tow).applyMatrix4(c.matrixWorld)
    }

    // ---- banners
    const fade = 1 - sstep(FADE_OUT[0], FADE_OUT[1], s)
    const bs = [bA.current, bB.current]
    let towTo: THREE.Vector3 | null = null
    for (let i = 0; i < 2; i++) {
      const b = bs[i]
      if (!b) continue
      const pRel = PH[i].from + rel[i] * (PH[i].to - PH[i].from)
      const pLand = pRel + FALL
      const a = L.anchors[i]
      const sc = L.scale
      // a bundle towed on the nearer or farther pass is scaled with its aircraft, then grows to full size as it settles
      const ratio = crafts[i] / crafts[0]
      const fl = clamp((p - pRel) / FALL), fe = 1 - (1 - fl) * (1 - fl) // same easing as the glide, so size tracks distance
      b.g.scale.setScalar(sc * (p < pRel ? ratio : lerp(ratio, 1, fe)))
      if (p < PH[i].from) { b.g.visible = false; continue }
      b.g.visible = fade > 0.004
      let wUnfold = 0.16, open = 0.08, wave = 0, phase = 0, roll = 0, yaw = 0, hangA = 0
      if (p < pRel) {
        // carried: the ring on the tow line (or in the talons), the bundle lying along the line of flight
        if (k === i && flying) {
          let dx = v.htan.x, dz = v.htan.z
          if (dx < 0) { dx = -dx; dz = -dz }
          yaw = Math.atan2(-dz, dx)
          b.g.position.copy(v.hold) // the line is shackled to the middle of the rod
          towTo = v.hold
        } else b.g.visible = false
        roll = 0.04 * Math.sin(t * 2.1)
      } else {
        // released: a deterministic glide from the hold point to the anchor
        const f = clamp((p - pRel) / (pLand - pRel))
        const path = L.paths[i]
        carrierPose(path, rel[i], crafts[i], isEagle, _o, v.a, L.drop[i]); const T0 = _ht.clone()
        const [P0, P1, P2, P3] = v.P
        P0.copy(v.a)
        // carry-through and the final settle are scaled with the pass, so a near, small bundle doesn't overshoot
        const r = crafts[i] / crafts[0]
        P1.copy(P0).addScaledVector(T0, 1.3 * r)
        P3.copy(a.pos); P2.copy(P3); P2.y += 0.8 * r * r
        const tt = 1 - (1 - f) * (1 - f), it = 1 - tt
        b.g.position.set(0, 0, 0)
          .addScaledVector(P0, it * it * it).addScaledVector(P1, 3 * it * it * tt).addScaledVector(P2, 3 * it * tt * tt).addScaledVector(P3, tt * tt * tt)
        let dx = T0.x, dz = T0.z
        if (dx < 0) { dx = -dx; dz = -dz }
        yaw = lerp(Math.atan2(-dz, dx), a.yaw, sstep(0.1, 0.9, f))
        roll = a.tilt * sstep(0, 0.25, f) * (1 - sstep(0.5, 1, f)) + 0.04 * Math.sin(t * 2.1) * (1 - sstep(0, 0.3, f)) + 0.05 * Math.sin(f * 9) * sstep(0, 0.1, f) * (1 - sstep(0.35, 0.95, f))
        wUnfold = lerp(0.16, 1, sstep(0.06, 0.42, f))
        open = lerp(0.08, 1, sstep(0.3, 0.9, f))
        wave = 0.1 * sstep(0.05, 0.2, f) * (1 - sstep(0.55, 1, f))
        phase = f * 16
        hangA = sstep(0.75, 1, f)
      }
      b.g.rotation.set(0, yaw, roll)
      b.inner.scale.set(wUnfold, 1, 1)
      b.panel.uniforms.uOpen.value = open
      b.panel.uniforms.uWave.value = wave
      b.panel.uniforms.uPhase.value = phase
      b.panel.uniforms.uOpacity.value = fade
      b.mats.forEach((m) => { m.opacity = fade })
      b.shadow.opacity = 0.16 * fade * sstep(0.85, 1, open) * (1 - wave * 8)
      // the hanging cords and ring belong to the delivered banner only: they draw up as it comes to rest.
      // while towed, the bundle is held by the tow line's shackle at the middle of the rod, so the two never mix
      b.hang.visible = hangA > 0.01
      b.hang.scale.y = Math.max(0.01, hangA)
      const rr = 0.035 + 0.075 * (1 - open)
      b.roll.visible = open < 0.995
      b.roll.scale.set(rr, 1, rr)
      b.roll.position.set(0, -0.005 - dims[i].h * open, 0.004)
      const txt = p < pLand ? 0 : sstep(pLand, pLand + 0.03, p)
      setTextOpacity(b.texts, txt * fade)
    }
    // tow line: shackled to the rod while towing; at release the shackle opens and the line is wound in,
    // so once the banner is delivered the aircraft flies on clean
    const sh = shackle.current
    if (flying && !isEagle) {
      if (towTo) {
        line(v.tail, towTo, true)
        sh.visible = true; sh.position.copy(towTo); sh.scale.setScalar(craftScale)
        sh.rotation.set(0, Math.atan2(tan.x, tan.z), 0)
      } else {
        const ur = rel[k], left = 1 - sstep(ur, ur + 0.12, u)
        sh.visible = left > 0.02
        v.a.copy(v.tail).addScaledVector(tan, -1.2 * left * craftScale); v.a.y -= 0.36 * left * craftScale
        line(v.tail, v.a, left > 0.02)
        sh.position.copy(v.a); sh.scale.setScalar(craftScale * Math.max(0.3, left))
        sh.rotation.set(0, Math.atan2(tan.x, tan.z), 0)
      }
    } else { line(v.tail, v.tail, false); sh.visible = false }
  })

  return (
    <group ref={root}>
      <CloudField puffs={banks} renderOrder={8} hazeNear={14} hazeFar={120} />
      <group ref={carrier}><primitive object={craft.root} /></group>
      <instancedMesh ref={towLine} args={[undefined, undefined, 16]} visible={false} frustumCulled={false}>
        <cylinderGeometry args={[0.0055, 0.0055, 1.02, 6]} />
        <meshStandardMaterial color="#2f2b28" roughness={0.75} />
      </instancedMesh>
      {/* the tow shackle: a small dark swivel where the line meets the rod, distinct from the brass hanging ring */}
      <mesh ref={shackle} visible={false}>
        <torusGeometry args={[0.03, 0.009, 8, 18]} />
        <meshStandardMaterial color="#2a2c2e" roughness={0.35} metalness={0.8} />
      </mesh>
      <Banner which={0} refs={bA} dims={dims[0]} />
      <Banner which={1} refs={bB} dims={dims[1]} />
    </group>
  )
}
