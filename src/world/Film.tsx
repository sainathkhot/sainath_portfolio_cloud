import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { S, bump, damp, sstep, filmFromScroll, copyEdge, toolkitBand, clamp, lerp } from '../store'
import { cloudShared } from './Cloud'
import { skyU, veilU } from './Sky'
import { CAM_DIST } from './Stage'
import { SYS_Z, SYS_FIT } from './System'
import { shipMatrix, SHIP_BOX, SHIP_STATE } from './Ship'
import { EP_Z, EP_FIT } from './EParking'

type K = [s: number, pos: [number, number, number], target: [number, number, number]]

// The film: where the camera is for every point of the scroll.
// s = section index + progress. Sections: 0 hero, 1 about, 2-5 projects, 6 toolkit, 7 other, 8 record, 9 contact.
const KEYS: K[] = [
  [0.0, [0, 0.1, CAM_DIST], [0, 0.15, 0]],
  [0.45, [0, 0.0, CAM_DIST - 1.0], [0, 0.2, 0]],
  [0.8, [0, 1.9, 3.2], [0, 1.9, -8]],
  [1.0, [0, 2.2, -12], [0, 2.0, -30]],
  [1.5, [0, 1.6, -24], [0, 1.9, -40]],
  [1.9, [0, 0.9, -38], [0, 0.2, -60]],
  [2.0, [0, 0.5, -45.5], [0, 0, -60]],
  [2.5, [-1.6, 0.8, -46.5], [0.4, 0, -60]],
  [2.94, [1.2, 1.4, -47.2], [1.2, 0, -60]],
  // the formations change in place; the camera moves with them in low, even arcs rather than hops
  [3.06, [0.6, 2.6, -48.3], [0, -0.1, -60]],
  [3.5, [-2.0, 3.4, -49.2], [0.2, -0.2, -60]],
  [3.94, [0, 4.8, -50.8], [0, -0.5, -60]],
  [4.06, [0, 6.0, -52.4], [0, -0.6, -60]],
  [4.45, [1.4, 4.2, -54.6], [1.5, -0.4, -60]],
  [4.94, [0, 4.6, -51.2], [0, -0.5, -60]],
  [5.06, [0, 2.0, -47.8], [0, 0, -60]],
  [5.5, [-1.2, 1.2, -47.0], [0.2, 0, -60]],
  [5.92, [0, 1.6, -49.5], [0, 0.4, -62]],
  // forward through a thin bank to the E-Parking gate: a glide, not a climb and drop
  [6.0, [0, 3.0, -66], [0.3, 1.2, -100]],
  [6.1, [-2.0, 2.1, -87.6], [0.6, 0.85, -100]],
  [6.5, [-1.0, 1.85, -88.2], [0.7, 0.9, -100]],
  [6.9, [0.4, 2.2, -88.4], [1.2, 0.95, -100]],
  // on over the gate to the workbench
  [7.0, [0, 2.8, -106], [0, 1.0, -140]],
  [7.1, [0, 1.0, -126.5], [0, 0.15, -140]],
  [7.85, [0, 0.9, -128.5], [0, 0.1, -140]],
  [8.02, [0, 3.7, -140], [0, 3.9, -170]],
  [8.5, [-0.2, 4.1, -141.5], [-0.1, 4.0, -170]],
  [8.92, [-0.35, 4.3, -142.6], [-0.2, 4.1, -170]],
  // recognition & delivery: the camera holds almost still so the eagle and banners can be read
  [9.08, [0, 4.6, -145.5], [0, 4.4, -170]],
  [9.95, [0, 4.6, -146.5], [0, 4.4, -170]],
  // then glides between the two banners, down through the deck, to the figure
  [10.2, [0, 2.6, -165], [0, 1.2, -190]],
  [10.5, [0, 0.12, -190 + CAM_DIST + 0.6], [0, 0.15, -190]],
  [11.0, [0, 0.1, -190 + CAM_DIST], [0, 0.15, -190]],
]

const CLOUD_KEY = new THREE.Vector3(0.55, 0.78, 0.5).normalize()
const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
const P = KEYS.map((k) => V(k[1]))
const T = KEYS.map((k) => V(k[2]))

// Time-aware cubic Hermite: tangents are measured per unit of scroll, so speed stays continuous across keys
// even though keys are unevenly spaced. (A plain Catmull-Rom per segment makes the camera lurch at every key.)
const TK = KEYS.map((k) => k[0])
function tangent(pts: THREE.Vector3[], i: number, out: THREE.Vector3) {
  const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 1)
  return out.subVectors(pts[b], pts[a]).divideScalar(Math.max(1e-4, TK[b] - TK[a]))
}
const m0 = new THREE.Vector3(), m1 = new THREE.Vector3()
function hermite(pts: THREE.Vector3[], i: number, u: number, out: THREE.Vector3) {
  const d = TK[i + 1] - TK[i]
  tangent(pts, i, m0); tangent(pts, i + 1, m1)
  // monotone per axis (Fritsch–Carlson): never overshoot a key and drift back, e.g. while the camera holds still
  for (const ax of ['x', 'y', 'z'] as const) {
    const dl = (pts[i + 1][ax] - pts[i][ax]) / d
    if (Math.abs(dl) < 1e-6) { m0[ax] = 0; m1[ax] = 0; continue }
    if (m0[ax] * dl <= 0) m0[ax] = 0; else m0[ax] = Math.sign(dl) * Math.min(Math.abs(m0[ax]), 3 * Math.abs(dl))
    if (m1[ax] * dl <= 0) m1[ax] = 0; else m1[ax] = Math.sign(dl) * Math.min(Math.abs(m1[ax]), 3 * Math.abs(dl))
  }
  const u2 = u * u, u3 = u2 * u
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
  return out.copy(pts[i]).multiplyScalar(h00).addScaledVector(m0, h10 * d).addScaledVector(pts[i + 1], h01).addScaledVector(m1, h11 * d)
}

function sample(s: number, pos: THREE.Vector3, tgt: THREE.Vector3) {
  let i = 0
  while (i < KEYS.length - 2 && s > KEYS[i + 1][0]) i++
  const a = KEYS[i][0], b = KEYS[i + 1][0]
  const u = Math.min(1, Math.max(0, (s - a) / (b - a)))
  hermite(P, i, u, pos); hermite(T, i, u, tgt)
}

// Cloud passes: the lens goes white where the camera flies through cloud.
// Cloud passes: soft, partial washes as the camera moves through thin cloud. Never a full white-out.
const VEILS: [number, number, number][] = [[0.93, 0.11, 0.45], [1.88, 0.1, 0.34], [3.0, 0.07, 0.22], [4.0, 0.07, 0.22], [5.0, 0.07, 0.22], [6.02, 0.09, 0.38], [7.02, 0.09, 0.38], [7.97, 0.06, 0.18], [10.1, 0.08, 0.22]]

export function Film() {
  const { camera, size } = useThree()
  const edge = useRef(0)
  const band = useRef(0)
  const tkLeft = useRef(0)
  // the copy column's right edge and the toolkit's free band, re-read only when the canvas changes size
  useEffect(() => {
    const read = () => {
      edge.current = copyEdge()
      const b = toolkitBand()
      band.current = b.H / 2 - (b.top + b.bottom) / 2
      tkLeft.current = b.left
    }
    read()
    const id = window.setTimeout(read, 400) // after fonts settle
    let live = true
    document.fonts?.ready.then(() => { if (live) read() }) // copy re-wraps once the web fonts arrive
    return () => { live = false; window.clearTimeout(id) }
  }, [size.width, size.height])
  const pos = useRef(new THREE.Vector3()).current
  const tgt = useRef(new THREE.Vector3()).current
  const look = useRef(new THREE.Vector3()).current
  const cur = useRef({ ok: false, sm: 0 })
  const tint = useRef(new THREE.Color())
  const tints = [new THREE.Color('#9CD3E3'), new THREE.Color('#D8AE61'), new THREE.Color('#F3D9B0'), new THREE.Color('#8D6CFF')] // recon, finsage, calls, lab

  useEffect(() => { (camera as THREE.PerspectiveCamera).far = 900; camera.updateProjectionMatrix() }, [camera])

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    // the film position follows the scroll with a little inertia
    const raw = filmFromScroll(window.scrollY)
    cur.current.sm = cur.current.ok && !S.snap ? damp(cur.current.sm, raw, S.reduced ? 30 : 9, dt) : raw
    S.snap = false
    cur.current.ok = true
    const s = (S.s = cur.current.sm)
    S.ready = true

    sample(s, pos, tgt)
    // wide screens: shift the lens (not the camera) so the projects centre in the space right of the copy.
    // A view offset keeps the perspective honest; panning the camera would skew every formation.
    const cam = camera as THREE.PerspectiveCamera
    // the toolkit does the same vertically, centring the bench between its title and its readout
    // phones: the copy owns the lower half, so the projects are lifted into the upper half the same way
    const wProj = sstep(1.9, 2.04, s) * (1 - sstep(6.9, 6.99, s))
    const wOff = S.narrow ? 0 : wProj
    const wTkAll = sstep(7.02, 7.12, s) * (1 - sstep(7.9, 7.98, s))
    const offX = -(edge.current / 2) * wOff
    // phones: the formations are small, so damp the camera's sideways drift to keep them in frame
    if (S.narrow) {
      const k = 1 - 0.6 * sstep(1.9, 2.0, s) * (1 - sstep(6.9, 7.0, s))
      pos.x *= k; tgt.x *= k
    }
    // phones: pull back on the workbench so the four rows fit. No vertical shift here: the band offset above
    // already centres the bench between the title and the index (a lift on top of it pushed the last row
    // into the "Tap a material" line).
    if (S.narrow) {
      const w = sstep(7.04, 7.14, s) * (1 - sstep(7.86, 7.96, s))
      pos.z += 3.2 * w
    }
    // pointer parallax: stronger on the portrait stages, calmer elsewhere
    const stage = Math.max(1 - s / 0.6, s > 10.2 ? 1 : 0)
    const amp = S.touch || S.reduced ? 0 : 0.18 + stage * 0.32
    pos.x += S.px * amp; pos.y += S.py * amp * 0.5
    camera.position.copy(pos)
    look.copy(tgt)
    look.x += S.px * amp * 0.3
    camera.lookAt(look)
    camera.updateMatrixWorld()
    // the lens is decided once the camera is placed: on phones it depends on where each scene projects.
    // Measure through the plain lens (no zoom, no offset), then frame.
    if (cam.zoom !== 1) cam.zoom = 1
    if (cam.view?.enabled) cam.clearViewOffset(); else cam.updateProjectionMatrix()
    // (short landscape: the bench sits right of the readout, so the toolkit shifts sideways as well)
    let offY = band.current * wTkAll, offXp = offX - (tkLeft.current / 2) * wTkAll, zoom = 1
    // phones: each project scene is fitted (zoom) and centred (offset) in the band between the nav and its copy panel
    if (S.narrow && wProj > 0) {
      const f = phoneFrame(s, cam, size.width, size.height)
      zoom = lerp(1, f.z, wProj); offY += f.oy * wProj; offXp += f.ox * wProj
    }
    if (Math.abs(zoom - 1) > 0.001) { cam.zoom = zoom; cam.updateProjectionMatrix() }
    if (Math.abs(offXp) > 0.5 || Math.abs(offY) > 0.5) cam.setViewOffset(size.width, size.height, offXp, offY, size.width, size.height)

    // weather
    const t = clock.elapsedTime
    cloudShared.uTime.value = S.reduced ? 0 : t
    skyU.uTime.value = S.reduced ? 0 : t
    veilU.uTime.value = t
    let veil = 0
    for (const [c, w, a] of VEILS) veil = Math.max(veil, bump(s, c, w) * a)
    veilU.uAmt.value = veil
    // the record warms the sky; the light cools gradually as the glide reaches the figure
    const warm = sstep(8.75, 9.25, s) * (1 - sstep(10.0, 10.75, s))
    skyU.uWarm.value = warm
    veilU.uWarm.value = warm
    skyU.uBright.value = sstep(10.15, 10.75, s) * 0.55 + bump(s, 1.35, 0.4) * 0.25
    // other-work hover: a small change in the air
    const target = S.atmos >= 0 ? tints[S.atmos % tints.length] : tints[0]
    tint.current.lerp(target, 0.05)
    skyU.uTint.value.copy(tint.current)
    skyU.uTintAmt.value = damp(skyU.uTintAmt.value, S.atmos >= 0 ? 0.35 : 0, 4, dt)
    cloudShared.uGlow.value = damp(cloudShared.uGlow.value, S.atmos >= 0 ? 1 : 0, 4, dt)
    cloudShared.uLit.value.setRGB(1.0, 0.988 - warm * 0.07, 0.965 - warm * 0.16)
    cloudShared.uShadow.value.setRGB(0.63 + warm * 0.2, 0.715 - warm * 0.02, 0.81 - warm * 0.1)
    cloudShared.uHaze.value.setRGB(0.80 + warm * 0.18, 0.90 - warm * 0.04, 0.945 - warm * 0.2)
    // the sun's direction in view space, for billboard lighting
    // clouds are key-lit from the upper right, in front of them, so their faces read white
    cloudShared.uSunView.value.copy(CLOUD_KEY).transformDirection(camera.matrixWorldInverse)
  }, -1)
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// phones: frame each project scene in the free space above its copy

/** the core of each formation, in the formations' own units (System.tsx), that the phone framing must keep in view */
const CORE: [number[], number[]][] = [
  [[-4.4, -2.0, -1.0], [4.9, 2.0, 1.0]], // Agentic Agile: source, five branches, the checkpoint gate
  [[-3.15, -2.0, -1.65], [3.15, 2.05, 1.65]], // AI Chatbot: the five layers
  [[-3.2, -0.9, -2.6], [3.2, 1.6, 2.6]], // ShopperMatch: the job, the inner rings, the rising candidate
]
/** E-Parking's lane, car, booth, barrier and camera, in its own fitted units (EParking.tsx) */
const EP_CORE: [number[], number[]] = [[-1.8, -0.7, -2.1], [3.5, 1.9, 1.1]]
const _v = new THREE.Vector3(), _m = new THREE.Matrix4()

/** screen extent (px, top-left = 0) of project j's core through the plain lens: [left, top, right, bottom] */
function span(j: number, s: number, cam: THREE.PerspectiveCamera, W: number, H: number): number[] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let c = 0; c < 8; c++) {
    if (j <= 2) {
      const [a, b] = CORE[j]
      _v.set(c & 1 ? b[0] : a[0], c & 2 ? b[1] : a[1], c & 4 ? b[2] : a[2]).multiplyScalar(SYS_FIT.scale)
      _v.z += SYS_Z
    } else if (j === 3) {
      // the ship and its network at rest (its bob and its sail-in must not move the framing)
      const [a, b] = SHIP_BOX
      shipMatrix(0, _m, SHIP_STATE.fit, s, false)
      _v.set(c & 1 ? b[0] : a[0], c & 2 ? b[1] : a[1], c & 4 ? b[2] : a[2]).applyMatrix4(_m).multiplyScalar(SYS_FIT.scale)
      _v.z += SYS_Z
    } else {
      const [a, b] = EP_CORE
      _v.set(c & 1 ? b[0] : a[0], c & 2 ? b[1] : a[1], c & 4 ? b[2] : a[2]).multiplyScalar(EP_FIT.scale)
      _v.y += 0.3
      _v.z += EP_Z
    }
    _v.applyMatrix4(cam.matrixWorldInverse)
    if (_v.z > -0.5) return null // behind or at the lens: this scene isn't the one in view
    _v.applyMatrix4(cam.projectionMatrix)
    const x = ((_v.x + 1) / 2) * W, y = ((1 - _v.y) / 2) * H
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  return [x0, y0, x1, y1]
}

const _f = { z: 1, ox: 0, oy: 0 }
/**
 * Phones: the lens for a project scene. The scene's core is projected through the plain lens, then zoomed to fill the
 * band between the nav and the copy panel (never past 94% of the width) and offset so it sits centred in that band.
 * The band follows the panel: large while only the project's title shows, smaller once the description is revealed,
 * so the scene re-frames continuously as the copy rises and settles. Blends between neighbouring projects as the
 * formations change. Zoom scales about the frame centre, so with zoom z a point at y moves to H/2 - z(H/2 - y).
 */
function phoneFrame(s: number, cam: THREE.PerspectiveCamera, W: number, H: number) {
  const top = S.bandTop || 72, bottom = S.copyTop > 0 ? S.copyTop + 18 : H * 0.5
  const bh = Math.max(80, bottom - top), bc = (top + bottom) / 2
  const at = (k: number, out: { z: number; ox: number; oy: number }) => {
    const sp = span(Math.max(0, Math.min(4, k)), s, cam, W, H)
    if (!sp) { out.z = 1; out.ox = 0; out.oy = H * 0.25; return out }
    const [x0, y0, x1, y1] = sp
    const z = clamp(Math.min((bh * 0.9) / Math.max(1, y1 - y0), (W * 0.94) / Math.max(1, x1 - x0)), 0.6, 1.7)
    const cy = (y0 + y1) / 2, cx = (x0 + x1) / 2
    out.z = z
    out.oy = H / 2 - z * (H / 2 - cy) - bc
    out.ox = clamp(z * (cx - W / 2), -W * 0.2, W * 0.2)
    return out
  }
  const x = clamp(s - 2, 0, 5), j = Math.round(x)
  const t = sstep(j - 0.1, j + 0.1, x)
  if (t <= 0) return at(j - 1, _f)
  if (t >= 1) return at(j, _f)
  const a = at(j - 1, { z: 1, ox: 0, oy: 0 }), b = at(j, { z: 1, ox: 0, oy: 0 })
  _f.z = lerp(a.z, b.z, t); _f.ox = lerp(a.ox, b.ox, t); _f.oy = lerp(a.oy, b.oy, t)
  return _f
}
