import * as THREE from 'three'

/*
 * A modern four-seat, low-wing light aircraft (proportions after the composite singles of the last two decades),
 * built from lofted cross-sections rather than primitives, so the fuselage, wing and tail have real section shapes.
 *
 * Local frame: +Z forward, +Y up, wings along X. Overall length 2.0, span ~2.9.
 * The livery (windows, cheat-line, panel lines, cowling intakes) is painted into the fuselage's UV space, so the
 * glazing follows the skin exactly; glass is the same surface with low roughness, which is how it reads in photographs.
 */

export type Craft = { root: THREE.Group; prop: THREE.Group; tow: THREE.Vector3; dispose: () => void }

const WHITE = '#e7dfd2' // warm white, kept below clipping so light and shade model the form
const COPPER = '#b4622a'
const INK = '#1f2d34'

// ---------------------------------------------------------------------------------------------------------------
// interpolation and lofting

/** monotone cubic interpolation through (x, y) samples */
function interp(xs: number[], ys: number[], x: number) {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  let i = 0
  while (x > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h
  const d = (j: number) => (ys[j + 1] - ys[j]) / (xs[j + 1] - xs[j])
  const m = (j: number) => {
    if (j === 0) return d(0)
    if (j === n - 1) return d(n - 2)
    const a = d(j - 1), b = d(j)
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b)
  }
  const m0 = m(i) * h, m1 = m(i + 1) * h
  const t2 = t * t, t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1
}

/** a surface through rings of points; ring k becomes v = k / (rings - 1) */
/** flip: reverse the winding, for rings that run clockwise about the direction of travel */
function loft(rings: THREE.Vector3[][], closeRing = true, colors?: THREE.Color[][], flip = false) {
  const R = rings.length, M = rings[0].length
  const cols = closeRing ? M + 1 : M
  const pos = new Float32Array(R * cols * 3), uv = new Float32Array(R * cols * 2)
  const col = colors ? new Float32Array(R * cols * 3) : null
  for (let r = 0; r < R; r++) for (let i = 0; i < cols; i++) {
    const p = rings[r][i % M], k = r * cols + i
    pos.set([p.x, p.y, p.z], k * 3); uv.set([i / (cols - 1), r / (R - 1)], k * 2)
    if (col && colors) { const c = colors[r][i % M]; col.set([c.r, c.g, c.b], k * 3) }
  }
  const idx: number[] = []
  for (let r = 0; r < R - 1; r++) for (let i = 0; i < cols - 1; i++) {
    const a = r * cols + i, b = a + 1, c = a + cols, d = c + 1
    if (flip) idx.push(a, b, c, b, d, c)
    else idx.push(a, c, b, b, c, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function mirrorX(g: THREE.BufferGeometry) {
  const m = g.clone()
  m.scale(-1, 1, 1)
  const idx = m.index!.array as unknown as number[]
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t }
  m.index!.needsUpdate = true
  m.computeVertexNormals()
  return m
}

/** NACA 4-digit section, cosine-spaced, as a closed loop from the trailing edge over the top and back underneath */
function section(thick: number, camber: number, n = 30) {
  const pts: [number, number][] = []
  const at = (x: number, upper: boolean): [number, number] => {
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)
    const p = 0.4, yc = x < p ? (camber / (p * p)) * (2 * p * x - x * x) : (camber / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x)
    return [x, yc + (upper ? yt : -yt)]
  }
  for (let i = n; i >= 0; i--) pts.push(at((1 - Math.cos((i / n) * Math.PI)) / 2, true))
  for (let i = 1; i < n; i++) pts.push(at((1 - Math.cos((i / n) * Math.PI)) / 2, false))
  return pts
}

// ---------------------------------------------------------------------------------------------------------------
// fuselage

// stations along the axis: half-width, height above and below the centreline, centreline height
const FZ = [-1.0, -0.9, -0.65, -0.4, -0.15, 0.05, 0.25, 0.42, 0.56, 0.66, 0.78, 0.86, 0.91, 0.935]
const FW = [0.012, 0.036, 0.066, 0.104, 0.142, 0.158, 0.162, 0.16, 0.152, 0.146, 0.132, 0.11, 0.084, 0.062]
const FT = [0.02, 0.05, 0.078, 0.122, 0.192, 0.232, 0.24, 0.206, 0.152, 0.128, 0.114, 0.098, 0.078, 0.06]
const FB = [0.016, 0.034, 0.056, 0.086, 0.118, 0.136, 0.142, 0.142, 0.138, 0.132, 0.12, 0.1, 0.078, 0.06]
const FC = [0.07, 0.066, 0.05, 0.03, 0.012, 0.004, 0.0, -0.002, -0.006, -0.008, -0.01, -0.012, -0.014, -0.015]
const SEG = 64 // around
/** angle runs from the belly (−π/2) round the right side, over the top and down the left, so the UV seam is underneath */
const th = (i: number) => -Math.PI / 2 + (i / SEG) * Math.PI * 2

function fuselageRing(z: number) {
  const w = interp(FZ, FW, z), ht = interp(FZ, FT, z), hb = interp(FZ, FB, z), cy = interp(FZ, FC, z)
  const n = 2.35 // a little fuller than an ellipse: a cabin, not a tube
  const ring: THREE.Vector3[] = []
  for (let i = 0; i < SEG; i++) {
    const a = th(i), c = Math.cos(a), s = Math.sin(a)
    const x = w * Math.sign(c) * Math.abs(c) ** (2 / n)
    const y = cy + (s > 0 ? ht : hb) * Math.sign(s) * Math.abs(s) ** (2 / n)
    ring.push(new THREE.Vector3(x, y, z))
  }
  return ring
}

function fuselageGeo() {
  const rings: THREE.Vector3[][] = []
  const N = 110
  for (let k = 0; k <= N; k++) {
    // denser stations at the nose and tail where curvature is highest
    const t = k / N, e = 0.5 - 0.5 * Math.cos(t * Math.PI)
    rings.push(fuselageRing(-1.0 + (0.935 + 1.0) * lerp(t, e, 0.45)))
  }
  // close the tail
  const tip = rings[0].map(() => new THREE.Vector3(0, interp(FZ, FC, -1.0), -1.005))
  const g = loft([tip, ...rings], true, undefined, true)
  // v follows the station, so the livery can be painted against z directly
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getZ(i) + 1.005) / 1.94)
  return g
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** the livery, painted in the fuselage's (angle, station) space; returns colour and roughness maps */
function livery() {
  const W = 2048, H = 1024
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const r = document.createElement('canvas'); r.width = W; r.height = H
  const g = c.getContext('2d')!, gr = r.getContext('2d')!
  // map (angle, z) → px. v = 0 is the tail cap row, so the station range is offset by one ring; close enough at 1024 rows
  const X = (a: number) => ((a + Math.PI / 2) / (Math.PI * 2)) * W
  const Y = (z: number) => (1 - (z + 1.005) / 1.94) * H
  g.fillStyle = WHITE; g.fillRect(0, 0, W, H)
  gr.fillStyle = 'rgb(70,70,70)'; gr.fillRect(0, 0, W, H) // paint roughness ≈ 0.27

  const both = (draw: (side: 1 | -1) => void) => { draw(1); draw(-1) }
  /** angle for a side: right side as given, left side mirrored about the top */
  const A = (a: number, side: 1 | -1) => (side === 1 ? a : Math.PI - a)
  const poly = (ctx: CanvasRenderingContext2D, pts: [number, number][], side: 1 | -1) => {
    ctx.beginPath()
    pts.forEach(([a, z], i) => (i ? ctx.lineTo(X(A(a, side)), Y(z)) : ctx.moveTo(X(A(a, side)), Y(z))))
    ctx.closePath()
  }

  // soft occlusion where the wing meets the fuselage, and along the belly
  both((side) => {
    const gx = g.createLinearGradient(0, Y(0.5), 0, Y(-0.15))
    gx.addColorStop(0, 'rgba(120,100,80,0)'); gx.addColorStop(0.5, 'rgba(120,100,80,0.18)'); gx.addColorStop(1, 'rgba(120,100,80,0)')
    g.fillStyle = gx
    const a0 = A(-0.75, side), a1 = A(-0.15, side)
    g.fillRect(Math.min(X(a0), X(a1)), Y(0.5), Math.abs(X(a1) - X(a0)), Y(-0.15) - Y(0.5))
  })
  const belly = g.createLinearGradient(X(-Math.PI / 2), 0, X(-0.4), 0)
  belly.addColorStop(0, 'rgba(110,95,80,0.16)'); belly.addColorStop(1, 'rgba(110,95,80,0)')
  g.fillStyle = belly; g.fillRect(0, 0, X(-0.4), H)
  const belly2 = g.createLinearGradient(W, 0, X(A(-0.4, -1)), 0)
  belly2.addColorStop(0, 'rgba(110,95,80,0.16)'); belly2.addColorStop(1, 'rgba(110,95,80,0)')
  g.fillStyle = belly2; g.fillRect(X(A(-0.4, -1)), 0, W - X(A(-0.4, -1)), H)

  // cheat-line: a copper band that rises gently toward the tail, with an ink pinstripe above it
  both((side) => {
    const top: [number, number][] = [], bot: [number, number][] = [], pin: [number, number][] = [], pinB: [number, number][] = []
    for (let z = 0.86; z >= -0.97; z -= 0.02) {
      const rise = 0.42 * Math.max(0, Math.min(1, (-z - 0.05) / 0.85)) ** 1.4
      const taper = Math.min(1, (0.86 - z) / 0.25) * (z < -0.8 ? (z + 0.97) / 0.17 : 1)
      const mid = -0.18 + rise
      top.push([mid + 0.07 * taper, z]); bot.unshift([mid - 0.03 * taper, z])
      pin.push([mid + 0.115 * taper, z]); pinB.unshift([mid + 0.098 * taper, z])
    }
    g.fillStyle = COPPER; poly(g, [...top, ...bot], side); g.fill()
    g.fillStyle = INK; poly(g, [...pin, ...pinB], side); g.fill()
  })

  // glazing: windscreen, the cabin door window, the rear window; frames are the paint between them
  const glass = (pts: [number, number][], side: 1 | -1) => {
    poly(g, pts, side)
    const zs = pts.map((p) => p[1])
    const gl = g.createLinearGradient(0, Y(Math.max(...zs)), 0, Y(Math.min(...zs)))
    gl.addColorStop(0, '#2e3c44'); gl.addColorStop(0.45, '#1b262c'); gl.addColorStop(0.7, '#33434b'); gl.addColorStop(1, '#202c33')
    g.fillStyle = gl; g.fill()
    poly(gr, pts, side); gr.fillStyle = 'rgb(10,10,10)'; gr.fill()
  }
  both((side) => {
    // windscreen: from the A-pillar over the top; drawn per side up to the centreline, so it meets in one piece
    glass([[0.98, 0.555], [Math.PI / 2 + 0.002, 0.585], [Math.PI / 2 + 0.002, 0.37], [1.04, 0.36], [0.86, 0.43]], side)
    // door window
    glass([[0.36, 0.33], [0.82, 0.355], [0.97, 0.31], [1.0, 0.12], [0.95, 0.04], [0.38, 0.04], [0.33, 0.12]], side)
    // rear window, tapering with the cabin
    glass([[0.4, 0.0], [0.93, 0.0], [0.9, -0.12], [0.7, -0.22], [0.45, -0.2]], side)
    // door seam and cowling seam: faint panel lines
    g.strokeStyle = 'rgba(60,50,40,0.14)'; g.lineWidth = 2
    poly(g, [[0.3, 0.37], [1.06, 0.385], [1.08, 0.02], [0.32, 0.02]], side); g.stroke()
  })
  g.strokeStyle = 'rgba(60,50,40,0.25)'; g.lineWidth = 2
  g.beginPath(); g.moveTo(0, Y(0.64)); g.lineTo(W, Y(0.64)); g.stroke()
  // cowling intakes, low on the nose
  both((side) => {
    g.fillStyle = '#20282c'
    g.beginPath(); g.ellipse(X(A(-0.42, side)), Y(0.905), 26, 16, 0, 0, Math.PI * 2); g.fill()
  })
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
  const rough = new THREE.CanvasTexture(r); rough.anisotropy = 8
  return { tex, rough }
}

// ---------------------------------------------------------------------------------------------------------------
// flying surfaces

type SurfaceSpec = {
  span: [number, number] // spanwise start/end
  chord: (t: number) => number
  le: (t: number) => number // leading edge station (z)
  off: (t: number) => number // out-of-plane offset (dihedral)
  thick: (t: number) => number
  camber: number
  twist?: (t: number) => number
  tipRound: number // spanwise length of the rounded tip
  vertical?: boolean
  color?: (t: number, s: number, upper: boolean) => THREE.Color
}

function surface(sp: SurfaceSpec) {
  const rings: THREE.Vector3[][] = [], colors: THREE.Color[][] = []
  const N = 44
  const [s0, s1] = sp.span
  for (let k = 0; k <= N; k++) {
    const t = k / N
    // stations bunch toward the tip so the rounding is smooth
    const tt = 1 - (1 - t) ** 1.3
    const s = s0 + (s1 - s0) * tt
    const into = Math.max(0, s - (s1 - sp.tipRound)) / sp.tipRound // 0..1 through the tip
    const round = Math.sqrt(Math.max(0, 1 - into * into))
    const u = (s - s0) / (s1 - s0)
    const c0 = sp.chord(u), c = c0 * (0.35 + 0.65 * round)
    const le = sp.le(u) - (c0 - c) * 0.42
    const thick = sp.thick(u) * round
    const tw = sp.twist ? sp.twist(u) : 0
    const pts = section(thick, sp.camber * round)
    const ring: THREE.Vector3[] = [], cr: THREE.Color[] = []
    pts.forEach(([x, y], i) => {
      // rotate about the quarter chord for twist
      const xq = x - 0.25, yy = y
      const xr = xq * Math.cos(tw) - yy * Math.sin(tw) + 0.25, yr = xq * Math.sin(tw) + yy * Math.cos(tw)
      const z = le - xr * c
      const n = yr * c
      ring.push(sp.vertical ? new THREE.Vector3(n, s, z) : new THREE.Vector3(s, sp.off(u) + n, z))
      cr.push(sp.color ? sp.color(u, s, i < pts.length / 2) : new THREE.Color(WHITE))
    })
    rings.push(ring); colors.push(cr)
  }
  // cap the tip with a single point so the surface closes
  const last = rings[rings.length - 1]
  const cx = last.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / last.length)
  rings.push(last.map(() => cx.clone())); colors.push(colors[colors.length - 1])
  return loft(rings, true, colors, !sp.vertical)
}

const cWhite = new THREE.Color(WHITE) // THREE.Color parses hex into the linear working space
const cCopper = new THREE.Color(COPPER)
const shade = (base: THREE.Color, k: number) => base.clone().multiplyScalar(k)

function wingGeo() {
  return surface({
    span: [0.1, 1.46],
    chord: (u) => lerp(0.44, 0.2, u),
    le: (u) => lerp(0.44, 0.355, u),
    off: (u) => -0.105 + (0.1 + u * 1.36) * Math.tan(THREE.MathUtils.degToRad(5)),
    thick: (u) => lerp(0.155, 0.11, u),
    camber: 0.02,
    twist: (u) => -THREE.MathUtils.degToRad(2.5) * u,
    tipRound: 0.07,
    // soft occlusion toward the root, a shade darker underneath
    color: (u, _s, upper) => shade(cWhite, (upper ? 1 : 0.95) * (0.84 + 0.16 * Math.min(1, u * 5))),
  })
}

function stabGeo() {
  return surface({
    span: [0.02, 0.5],
    chord: (u) => lerp(0.22, 0.13, u),
    le: (u) => lerp(-0.72, -0.78, u),
    off: () => 0.062,
    thick: () => 0.1,
    camber: 0,
    tipRound: 0.05,
    color: (u, _s, upper) => shade(cWhite, (upper ? 1 : 0.92) * (0.9 + 0.1 * Math.min(1, u * 4))),
  })
}

function finGeo() {
  return surface({
    span: [0.03, 0.44],
    chord: (u) => interp([0, 0.18, 1], [0.6, 0.36, 0.16], u), // a dorsal fillet blending into the fin
    le: (u) => interp([0, 0.18, 1], [-0.42, -0.66, -0.9], u),
    off: () => 0,
    thick: (u) => lerp(0.08, 0.1, u),
    camber: 0,
    tipRound: 0.04,
    vertical: true,
    color: (_u, s) => (s > 0.24 && s < 0.29 ? cCopper.clone() : s > 0.3 && s < 0.315 ? new THREE.Color(INK) : cWhite.clone()),
  })
}

/** a streamlined wheel fairing: teardrop in plan and side, narrow */
function pantGeo(len: number, h: number, w: number) {
  const rings: THREE.Vector3[][] = []
  const N = 28, M = 24
  for (let k = 0; k <= N; k++) {
    const t = k / N
    const r = Math.sin(Math.PI * Math.pow(t, 0.62)) // blunt nose, long tail
    const z = len * (0.5 - t)
    const ring: THREE.Vector3[] = []
    for (let i = 0; i < M; i++) {
      const a = (i / M) * Math.PI * 2
      ring.push(new THREE.Vector3(Math.cos(a) * w * r, Math.sin(a) * h * r - (1 - r) * h * 0.15, z))
    }
    rings.push(ring)
  }
  return loft(rings)
}

/** a flat, tapered composite gear leg between two points */
function legGeo(a: THREE.Vector3, b: THREE.Vector3, w0: number, w1: number, t: number) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 6, 1).translate(0, 0.5, 0)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * t); p.setZ(i, p.getZ(i) * lerp(w0, w1, y)) }
  g.computeVertexNormals()
  const d = new THREE.Vector3().subVectors(b, a)
  g.scale(1, d.length(), 1)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
  g.applyQuaternion(q).translate(a.x, a.y, a.z)
  return g
}

function propBlurTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(256, 256, 30, 256, 256, 254)
  r.addColorStop(0, 'rgba(30,30,30,0.0)'); r.addColorStop(0.3, 'rgba(30,30,30,0.07)'); r.addColorStop(0.8, 'rgba(30,30,30,0.04)')
  r.addColorStop(0.9, 'rgba(225,190,90,0.11)'); r.addColorStop(0.95, 'rgba(30,30,30,0.03)'); r.addColorStop(1, 'rgba(30,30,30,0)')
  g.fillStyle = r; g.beginPath(); g.arc(256, 256, 254, 0, Math.PI * 2); g.fill()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------------------------------------------------------

export function buildCraft(): Craft {
  const root = new THREE.Group()
  const { tex, rough } = livery()
  const skin = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: tex, roughnessMap: rough, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 })
  const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 })
  const plain = new THREE.MeshPhysicalMaterial({ color: WHITE, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.1 })
  const tyre = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.85 })
  const metal = new THREE.MeshStandardMaterial({ color: '#b9bcbf', roughness: 0.3, metalness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2f33', roughness: 0.5, metalness: 0.4 })

  root.add(new THREE.Mesh(fuselageGeo(), skin))

  const wing = wingGeo()
  root.add(new THREE.Mesh(wing, paint), new THREE.Mesh(mirrorX(wing), paint))
  const stab = stabGeo()
  root.add(new THREE.Mesh(stab, paint), new THREE.Mesh(mirrorX(stab), paint))
  root.add(new THREE.Mesh(finGeo(), paint))


  // navigation lights: red port, green starboard, white tail
  const nav = (c: string, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); root.add(m) }
  const tipY = -0.105 + 1.46 * Math.tan(THREE.MathUtils.degToRad(5))
  nav('#ff4a3a', -1.462, tipY, 0.3); nav('#3bd16f', 1.462, tipY, 0.3); nav('#fff6e0', 0, 0.075, -1.006)

  // fixed tricycle gear: composite main legs from the wing root, slim nose strut, fairings over every wheel
  for (const sx of [1, -1]) {
    const hub = new THREE.Vector3(sx * 0.31, -0.29, 0.2)
    root.add(new THREE.Mesh(legGeo(new THREE.Vector3(sx * 0.12, -0.13, 0.2), hub.clone().add(new THREE.Vector3(-sx * 0.01, 0.05, 0)), 0.07, 0.045, 0.014), plain))
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 22).rotateZ(Math.PI / 2), tyre); wheel.position.copy(hub); root.add(wheel)
    const pant = new THREE.Mesh(pantGeo(0.24, 0.058, 0.036), plain); pant.position.copy(hub).add(new THREE.Vector3(0, 0.012, 0.005)); root.add(pant)
  }
  const nHub = new THREE.Vector3(0, -0.29, 0.72)
  root.add(new THREE.Mesh(legGeo(new THREE.Vector3(0, -0.12, 0.7), nHub.clone().add(new THREE.Vector3(0, 0.04, 0)), 0.025, 0.02, 0.022), metal))
  const nw = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.024, 20).rotateZ(Math.PI / 2), tyre); nw.position.copy(nHub); root.add(nw)
  const np = new THREE.Mesh(pantGeo(0.19, 0.048, 0.03), plain); np.position.copy(nHub).add(new THREE.Vector3(0, 0.01, 0.0)); root.add(np)

  // exhaust stacks and a slim antenna
  for (const sx of [1, -1]) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.05, 10).rotateX(Math.PI / 2 + 0.3), dark); ex.position.set(sx * 0.1, -0.11, 0.6); root.add(ex) }
  const ant = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.018).translate(0, 0.025, 0), dark); ant.position.set(0, 0.2, -0.3); ant.rotation.x = -0.35; root.add(ant)

  // spinner and three-blade propeller; the blades are seen as a faint disc with a hint of each blade, as in a photo
  const prop = new THREE.Group(); prop.position.set(0, -0.015, 0.935); root.add(prop)
  const sp: [number, number][] = [[0.064, 0], [0.064, 0.012], [0.06, 0.04], [0.05, 0.075], [0.034, 0.105], [0.016, 0.125], [0.001, 0.132]]
  const spinner = new THREE.Mesh(new THREE.LatheGeometry(sp.map(([r, y]) => new THREE.Vector2(r, y)), 32).rotateX(Math.PI / 2), plain)
  prop.add(spinner)
  const blur = new THREE.Mesh(new THREE.CircleGeometry(0.4, 64), new THREE.MeshBasicMaterial({ map: propBlurTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }))
  blur.position.z = 0.03; prop.add(blur)
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.6, transparent: true, opacity: 0.1, depthWrite: false })
  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(-0.012, 0.05); bladeShape.bezierCurveTo(-0.03, 0.15, -0.028, 0.32, -0.012, 0.395); bladeShape.lineTo(0.012, 0.395); bladeShape.bezierCurveTo(0.03, 0.3, 0.026, 0.14, 0.012, 0.05)
  const bladeGeo = new THREE.ShapeGeometry(bladeShape)
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(bladeGeo, bladeMat); b.rotation.z = (i / 3) * Math.PI * 2; b.position.z = 0.032; prop.add(b) }

  const dispose = () => root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
  // tow hook: under the tail cone
  return { root, prop, tow: new THREE.Vector3(0, 0.035, -0.99), dispose }
}
