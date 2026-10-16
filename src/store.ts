import { SECTIONS, type ToolId } from './content'

type Listener = () => void

const mq = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches

// One mutable state object read by both the WebGL world and the DOM layer every frame.
export const S = {
  s: 0, // film position: section index + progress within section
  vh: typeof window !== 'undefined' ? window.innerHeight : 800,
  tops: [] as number[],
  heights: [] as number[],
  px: 0, py: 0, // pointer, -1..1
  hoverTool: null as ToolId | null,
  pinTool: null as ToolId | null,
  hoverLayer: -1,
  atmos: -1,
  narrow: mq('(max-aspect-ratio: 4/5)') || mq('(max-width: 760px)'),
  touch: mq('(hover: none)'),
  reduced: mq('(prefers-reduced-motion: reduce)'),
  low: false, // set when performance drops
  status: ['', '', '', '', ''] as string[], // live state line for each project scene
  ready: false,
  snap: false, // jump the film without easing (used by the test hook)
  noGL: false, // no WebGL: the frames carry a static portrait and headline instead
  rowHover: -1,   // 'Also built' row under the pointer
  specHover: -1,  // 'Also built' 3D object under the pointer
  atmosPin: -1,   // touch: tapped project
  px0: -1, py0: -1, // last pointer position in client px
}

const listeners = new Set<Listener>()
export const subscribe = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const emit = () => listeners.forEach((l) => l())

// 'Also built' selection on touch. A tap is an explicit command, so it is resolved at once (not on the next animation
// tick, and without the hover grace period), and both the row and the 3D object go through this one function.
let resolveActive: (() => void) | null = null
export const onResolveActive = (fn: () => void) => { resolveActive = fn }
/** select project i, or clear it if it is already the selected one */
export function togglePin(i: number) {
  S.atmosPin = S.atmosPin === i ? -1 : i
  resolveActive?.()
  emit()
}

export function measureSections() {
  S.vh = window.innerHeight
  S.tops = []; S.heights = []
  for (const id of SECTIONS) {
    const el = document.getElementById(id)
    if (!el) continue
    const r = el.getBoundingClientRect()
    S.tops.push(r.top + window.scrollY)
    S.heights.push(r.height)
  }
}

export function filmFromScroll(y: number) {
  const n = S.tops.length
  if (!n) return 0
  for (let i = n - 1; i >= 0; i--) {
    if (y >= S.tops[i]) {
      // the last section can only scroll until its bottom meets the viewport bottom
      const span = i === n - 1 ? S.heights[i] - S.vh : S.heights[i]
      const p = (y - S.tops[i]) / Math.max(1, span)
      return Math.min(n, i + Math.min(1, p))
    }
  }
  return 0
}

export const sectionTop = (i: number) => S.tops[i] ?? 0

// ---------- shared math ----------
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt))
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
/** progress inside section i, 0..1 (clamped) */
export const local = (i: number) => clamp(S.s - i)
/** bump: 1 at c, 0 beyond w */
export const bump = (x: number, c: number, w: number) => 1 - sstep(0, w, Math.abs(x - c))

/** right edge (px) of the project copy column; the 3D scene frames itself in the space beyond it */
export function copyEdge() {
  if (S.narrow) return 0
  const el = document.querySelector('.sec--p1 .work')
  return el ? el.getBoundingClientRect().right : 0
}

// ---------- readiness: fonts parsed, textures uploaded, every scene's shaders compiled ----------
let readyResolve: (() => void) | null = null
const readyP = new Promise<void>((r) => { readyResolve = r })
export function markWorldReady() { readyResolve?.(); readyResolve = null }
export function whenWorldReady(timeoutMs: number) {
  return Promise.race([readyP, new Promise<void>((r) => window.setTimeout(r, timeoutMs))])
}

/** free vertical band (px) between the toolkit title and its readout, where the bench should sit */
export function toolkitBand() {
  const h = document.querySelector('.tk__head')?.getBoundingClientRect()
  const f = document.querySelector('.tk__foot')?.getBoundingClientRect()
  const H = window.innerHeight
  if (!h || !f || S.narrow) return { top: 0, bottom: H, H }
  return { top: h.bottom + 8, bottom: f.top - 8, H }
}
