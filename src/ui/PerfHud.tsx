/*
 * Preview-only performance overlay: open the preview with ?perf.
 *
 * Shows live frame timing, the render resolution and draw calls, and runs one scripted scroll path, identical on every
 * device (each leg glides between the same two film positions in the same time), so results from a phone and a
 * laptop can be compared. "Copy report" puts the numbers on the clipboard as text.
 *
 * Built only when vite.config.ts enables the preview tools; production builds of main compile it out.
 */
import { S } from '../store'
import { filmGlide } from './scroll'

type Leg = { leg: string; frames: number; mean: number; p95: number; max: number; over33: number; over50: number; dprs: string }

const PATH: [number, number][] = [
  [0, 1.4], [1.4, 2.5], [2.5, 3.5], [3.5, 4.5], [4.5, 5.5], [5.5, 6.5], [6.5, 7.4], [7.4, 8.4], [8.4, 9.3], [9.3, 9.86], [9.86, 10.95],
  [10.95, 9.3], [9.3, 7.4], [7.4, 5.5], [5.5, 4.5],
]
const LEG_S = 2.4

const q = (a: number[], p: number) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0)

export function mountPerfHud() {
  const box = document.createElement('div')
  box.setAttribute('data-perf-hud', '')
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;max-width:min(94vw,440px);max-height:70vh;overflow:auto;' +
    'font:11px/1.45 ui-monospace,Menlo,monospace;color:#e8f3f6;background:rgba(10,24,32,.88);border-radius:8px;padding:8px 10px;' +
    'pointer-events:auto;-webkit-user-select:text;user-select:text'
  box.innerHTML = '<b>perf</b> <span data-live></span><div data-ctl style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"></div><pre data-out style="margin:6px 0 0;white-space:pre-wrap"></pre>'
  document.body.append(box)
  const live = box.querySelector<HTMLElement>('[data-live]')!, ctl = box.querySelector<HTMLElement>('[data-ctl]')!, out = box.querySelector<HTMLElement>('[data-out]')!
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'font:inherit;color:#0a1820;background:#9cd3e3;border:0;border-radius:4px;padding:5px 8px;cursor:pointer'
    b.onclick = fn
    ctl.append(b)
    return b
  }

  // frame intervals from requestAnimationFrame
  const recent: number[] = []
  let last = 0, rec: number[] | null = null, long50 = 0
  const loop = (t: number) => {
    if (last) {
      const dt = t - last
      recent.push(dt); if (recent.length > 240) recent.shift()
      if (dt > 50) long50++
      rec?.push(dt)
    }
    last = t
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  const info = () => {
    const three = (window as any).__three
    const c = document.querySelector('canvas')
    const r = three?.gl?.info?.render
    return {
      ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 140),
      viewport: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
      renderDpr: S.dpr, canvas: c ? `${c.width}×${c.height}` : '-', loadGpuMs: S.gpuMs,
      draws: r?.calls ?? '-', triangles: r?.triangles ?? '-', touch: S.touch, narrow: S.narrow, reduced: S.reduced,
    }
  }
  const tickLive = () => {
    const a = [...recent].sort((x, y) => x - y)
    const mean = a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
    const i = info()
    live.textContent = `${(1000 / Math.max(1, mean)).toFixed(0)} fps · p95 ${q(a, 0.95).toFixed(1)} ms · >50ms ${long50} · dpr ${i.renderDpr} · ${i.canvas} · draws ${i.draws}`
  }
  window.setInterval(tickLive, 500)

  let report: { info: ReturnType<typeof info>; legs: Leg[]; total?: Omit<Leg, 'leg'> } | null = null
  const sum = (arr: number[], leg: string, dprs: Set<number>): Leg => {
    const a = [...arr].sort((x, y) => x - y)
    return {
      leg, frames: a.length, mean: +(a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(1),
      p95: +q(a, 0.95).toFixed(1), max: +q(a, 1).toFixed(1), over33: a.filter((x) => x > 33.4).length, over50: a.filter((x) => x > 50).length,
      dprs: [...dprs].join('/'),
    }
  }
  const run = async () => {
    out.textContent = 'running the scripted path… keep the page in front and do not touch it'
    await filmGlide(0, 0.01)
    await new Promise((r) => setTimeout(r, 1500))
    const legs: Leg[] = [], all: number[] = [], dprsAll = new Set<number>()
    for (const [a, b] of PATH) {
      await filmGlide(a, 0.01)
      await new Promise((r) => setTimeout(r, 400))
      rec = []
      const dprs = new Set<number>([S.dpr])
      const watch = window.setInterval(() => dprs.add(S.dpr), 100)
      await filmGlide(b, LEG_S)
      window.clearInterval(watch)
      const r = rec; rec = null
      all.push(...r); dprs.forEach((d) => dprsAll.add(d))
      legs.push(sum(r, `${a}→${b}`, dprs))
      out.textContent = legs.map((l) => `${l.leg.padEnd(11)} p95 ${String(l.p95).padStart(5)}  max ${String(l.max).padStart(5)}  >33 ${l.over33}  >50 ${l.over50}`).join('\n')
    }
    const { leg: _l, ...total } = sum(all, 'all', dprsAll)
    report = { info: info(), legs, total }
    out.textContent += `\n\nall legs: mean ${total.mean} ms, p95 ${total.p95} ms, max ${total.max} ms, frames >33ms ${total.over33}, >50ms ${total.over50}, dpr ${total.dprs}`
  }
  btn('Run scripted path', () => { run() })
  btn('Copy report', () => {
    const text = JSON.stringify(report ?? { info: info(), note: 'run the scripted path first' }, null, 1)
    // where the clipboard is unavailable, the report is shown in the panel to select and copy by hand
    const show = () => { out.textContent = text }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => { out.textContent += '\n(copied)' }, show)
    else show()
  })
  btn('Hide', () => { box.remove() })
}
