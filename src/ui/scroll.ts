import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { S, measureSections, sstep, filmFromScroll, emit, whenWorldReady, onResolveActive } from '../store'

gsap.registerPlugin(ScrollTrigger, SplitText)

let lenis: Lenis | null = null

/** scroll offset for a film position s (section index + progress) */
function yForFilm(s: number) {
  const n = S.tops.length
  const i = Math.max(0, Math.min(n - 1, Math.floor(s)))
  const f = Math.min(1, s - i)
  const span = i === n - 1 ? (S.heights[i] ?? 0) - S.vh : S.heights[i] ?? 0
  return (S.tops[i] ?? 0) + span * f
}

/** fly the camera to a film position */
export function goToFilm(s: number) {
  const y = yForFilm(s)
  if (lenis) lenis.scrollTo(y, { duration: Math.min(4.2, 1.1 + Math.abs(y - window.scrollY) / 4200), easing: (t) => 1 - Math.pow(1 - t, 4) })
  else window.scrollTo({ top: y })
}

// where each nav item lands, in film units
export const STOPS = { hero: 0, about: 1.45, work: 2.22, toolkit: 7.32, record: 9.4, contact: 11 }
const ACTIVE: [keyof typeof STOPS, number, number][] = [['about', 0.8, 1.95], ['work', 1.95, 6.95], ['toolkit', 6.95, 7.95], ['record', 8.95, 10.05], ['contact', 10.05, 12]]

type FadeEl = { el: HTMLElement; sec: number; f: number[] }

/** Starts scroll, frame fades, reveals, cursor. Returns a cleanup. */
export function startMotion() {
  const off: (() => void)[] = []
  const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
    window.addEventListener(t, fn, o); off.push(() => window.removeEventListener(t, fn, o))
  }

  measureSections()
  if (!S.reduced) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.4 })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (t: number) => lenis?.raf(t * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    off.push(() => { gsap.ticker.remove(raf); lenis?.destroy(); lenis = null })
  }

  const ro = new ResizeObserver(() => { measureSections(); ScrollTrigger.refresh() })
  ro.observe(document.body)
  off.push(() => ro.disconnect())
  on('resize', measureSections)

  // section frames fade with their own progress, so text arrives as the camera does
  const frames: FadeEl[] = []
  const secs = Array.from(document.querySelectorAll('main.film > section'))
  document.querySelectorAll<HTMLElement>('[data-fade]').forEach((el) => {
    frames.push({ el, sec: secs.indexOf(el.closest('section')!), f: el.dataset.fade!.split(',').map(Number) })
  })
  // horizontal milestone tracks: slide by section progress, measured once per resize
  const tracks = Array.from(document.querySelectorAll<HTMLElement>('[data-track]')).map((el) => ({
    el, row: el.firstElementChild as HTMLElement, sec: secs.indexOf(el.closest('section')!),
    r: el.dataset.track!.split(',').map(Number), span: 0,
  }))
  const measureTracks = () => tracks.forEach((t) => { t.span = Math.max(0, t.row.scrollWidth - t.el.clientWidth) })
  measureTracks()
  on('resize', measureTracks)
  document.fonts.ready.then(measureTracks)
  const statusEls = Array.from(document.querySelectorAll<HTMLElement>('[data-status]'))
  const statusText: string[] = []
  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-stop]'))
  let lastActive = ''

  // 'Also built' has one active project, fed by whichever is under the pointer: its row or its 3D object.
  // The row is re-hit-tested every frame because scrolling moves content under a still cursor without any
  // mouseenter/mouseleave. A short grace period lets the pointer travel from a row to its object without a reset.
  const otherFrame = document.querySelector<HTMLElement>('.sec--other .frame')
  let graceUntil = 0, lastActive2 = -2
  const alsoBuilt = () => {
    let row = -1
    // touch has no hover: a tap pins a project instead, and a stale touch point must not count as hovering
    if (!S.touch && otherFrame?.classList.contains('is-live') && S.px0 >= 0) {
      const li = document.elementFromPoint(S.px0, S.py0)?.closest?.('.others li') as HTMLElement | null
      row = li ? Number(li.dataset.i) : -1
    }
    S.rowHover = row
    const now = performance.now()
    let next = row >= 0 ? row : S.specHover >= 0 ? S.specHover : -1
    if (!otherFrame?.classList.contains('is-live')) next = -1
    if (next < 0 && S.atmosPin >= 0 && otherFrame?.classList.contains('is-live')) next = S.atmosPin
    // hover only: a short grace lets the pointer travel from a row to its object. A tap must take effect as given,
    // so on touch there is no grace (it used to hold a just-cleared selection on screen)
    if (!S.touch) {
      if (next >= 0) graceUntil = now + 160
      else if (now < graceUntil && S.atmos >= 0) next = S.atmos
    }
    if (next !== S.atmos) { S.atmos = next; emit() }
    if (next !== lastActive2) { lastActive2 = next; document.body.dataset.hot = next >= 0 ? '1' : '' }
  }

  onResolveActive(alsoBuilt)
  const tick = () => {
    const s = S.ready ? S.s : filmFromScroll(window.scrollY)
    for (const fr of frames) {
      const p = s - fr.sec
      const [a, b, c, d] = fr.f
      const o = sstep(a, b, p) * (1 - sstep(c, d, p))
      const y = (1 - sstep(a, b, p)) * 26 - sstep(c, d, p) * 26
      const vis = o >= 0.005
      fr.el.style.opacity = o.toFixed(3)
      fr.el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
      if ((fr.el.style.visibility !== 'hidden') !== vis) fr.el.style.visibility = vis ? 'visible' : 'hidden'
      const live = o > 0.55
      if (fr.el.classList.contains('is-live') !== live) fr.el.classList.toggle('is-live', live)
    }
    alsoBuilt()
    for (const t of tracks) {
      const p = sstep(t.r[0], t.r[1], s - t.sec)
      t.row.style.transform = `translate3d(${(-p * t.span).toFixed(1)}px, 0, 0)`
    }
    statusEls.forEach((el) => {
      const i = Number(el.dataset.status)
      const t = S.status[i]
      if (t && statusText[i] !== t) {
        statusText[i] = t
        el.textContent = t
        if (!S.reduced) gsap.fromTo(el, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'expo.out' })
        el.parentElement?.classList.toggle('state--hold', /Stopped|Sent back|Escalated/.test(t))
      }
    })
    // ink over bright air (about, the top-down project shots, everything after the toolkit); white over blue sky
    // phones and portrait tablets frame every scene against the pale cloud bed, so past the hero the bar is always ink
    const tone = S.narrow ? (s > 0.9 ? 'ink' : 'light')
      : (s > 0.9 && s < 1.92) || (s > 2.95 && s < 5.0) || s > 7.92 ? 'ink' : 'light'
    if (document.documentElement.dataset.tone !== tone) document.documentElement.dataset.tone = tone
    const act = ACTIVE.find(([, a, b]) => s >= a && s < b)?.[0] ?? ''
    if (act !== lastActive) {
      lastActive = act
      navLinks.forEach((l) => (l.dataset.stop === act ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')))
    }
  }
  gsap.ticker.add(tick)
  off.push(() => gsap.ticker.remove(tick))

  // the curtain lifts once fonts and the world are ready, then the hero chrome arrives
  let alive = true
  Promise.all([document.fonts.ready, whenWorldReady(6000)]).then(() => {
    if (!alive) return
    document.documentElement.classList.add('is-ready')
    if (S.reduced) return
    document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
      const sec = el.closest('section') as HTMLElement
      const split = SplitText.create(el, { type: 'lines,words', mask: 'lines', linesClass: 'ln' })
      gsap.from(split.words, {
        yPercent: 115, duration: 1.15, ease: 'expo.out', stagger: 0.045,
        scrollTrigger: { trigger: sec, start: 'top -6%', toggleActions: 'play none none reverse' },
      })
    })
    gsap.from('.hero__labels span, .hero__loc span, .hero__copy, .hero__cta .btn, .nav > *', { y: 18, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06, delay: 0.35, clearProps: 'transform,opacity' })
    ScrollTrigger.refresh()
  })
  off.push(() => { alive = false; ScrollTrigger.getAll().forEach((t) => t.kill()) })

  off.push(magnetic(), cursor(on))
  return () => off.forEach((f) => f())
}

function magnetic() {
  if (S.touch || S.reduced) return () => {}
  const undo: (() => void)[] = []
  document.querySelectorAll<HTMLElement>('.mag').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      x((e.clientX - r.left - r.width / 2) * 0.28)
      y((e.clientY - r.top - r.height / 2) * 0.35)
    }
    const leave = () => { x(0); y(0) }
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave)
    undo.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave) })
  })
  return () => undo.forEach((f) => f())
}

function cursor(on: <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => void) {
  on('pointermove', (e) => {
    S.px0 = e.clientX; S.py0 = e.clientY
    S.px = (e.clientX / window.innerWidth) * 2 - 1
    S.py = -((e.clientY / window.innerHeight) * 2 - 1)
  }, { passive: true })
  if (S.touch) return () => {}
  const dot = document.createElement('div'); dot.className = 'cur'
  const ring = document.createElement('div'); ring.className = 'cur-ring'
  document.body.append(ring, dot)
  document.documentElement.classList.add('has-cursor')
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08 }), dy = gsap.quickTo(dot, 'y', { duration: 0.08 })
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3.out' }), ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3.out' })
  on('pointermove', (e) => {
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY)
    const t = e.target as HTMLElement
    const hot = !!t.closest?.('[data-cursor], a, button') || document.body.dataset.hot === '1'
    ring.classList.toggle('is-hot', hot)
  }, { passive: true })
  on('pointerdown', () => ring.classList.add('is-down'))
  on('pointerup', () => ring.classList.remove('is-down'))
  // hide the custom cursor when the pointer leaves the window
  const out = (e: MouseEvent) => { if (!e.relatedTarget) { dot.style.opacity = ring.style.opacity = '0' } }
  const over = () => { dot.style.opacity = ring.style.opacity = '' }
  document.addEventListener('mouseout', out); document.addEventListener('mouseover', over)
  return () => {
    dot.remove(); ring.remove(); document.documentElement.classList.remove('has-cursor')
    document.removeEventListener('mouseout', out); document.removeEventListener('mouseover', over)
  }
}

// QA hook, only with ?debug in the URL: jump the film or pin a tool without animation
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  ;(window as any).__film = {
    go(s: number) {
      const y = yForFilm(s)
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y)
      S.snap = true
    },
    pin(id: string | null) { S.pinTool = id as any; emit() },
    atmos(i: number) { S.atmos = i },
  }
}
