import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { S, measureSections, sstep, clamp, lerp, filmFromScroll, emit, whenWorldReady, onResolveActive, SHORT_LANDSCAPE } from '../store'

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

/** preview tools (?perf): glide to a film position at a constant speed over a fixed time, for repeatable measurements */
export function filmGlide(s: number, seconds: number) {
  return new Promise<void>((done) => {
    const y = yForFilm(s)
    if (lenis) lenis.scrollTo(y, { duration: seconds, easing: (t) => t, lock: true, force: true, onComplete: () => done() })
    else { window.scrollTo(0, y); window.setTimeout(done, seconds * 1000) }
  })
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

type FadeEl = { el: HTMLElement; sec: number; f: number[]; fn: number[] | null; o?: string; t?: string; op?: number }

/**
 * A project's copy on a phone. The panel's head (number, category, name, headline, live status) arrives with the
 * section; as the section scrolls, the panel rises to reveal the detail (description, facts, stack), and copy taller
 * than the panel scrolls inside it under a feathered edge. Near the end the panel settles back to its head, so the
 * next project's title crossfades in over the same place while the scene morphs above. Everything is a function of
 * scroll position (it runs backwards exactly) and is applied as transforms and opacity: no layout during the scroll.
 */
type WorkEl = {
  fr: FadeEl; clip: HTMLElement; work: HTMLElement; head: HTMLElement; detail: HTMLElement; hint: HTMLElement | null
  m: { topA: number; topB: number; over: number; bandTop: number; overL: number }
  w?: string; c?: string; d?: string
}

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
    frames.push({
      el, sec: secs.indexOf(el.closest('section')!), f: el.dataset.fade!.split(',').map(Number),
      // phones and portrait tablets use their own windows: shorter passages without copy
      fn: el.dataset.fadeNarrow ? el.dataset.fadeNarrow.split(',').map(Number) : null,
    })
  })

  // ---- project copy layout (phones: the two-state panel; short landscape: the column scrolls when too tall)
  const nav = document.querySelector<HTMLElement>('.nav')
  const bed = document.querySelector<HTMLElement>('.copybed')
  const shortLand = window.matchMedia(SHORT_LANDSCAPE)
  const works: WorkEl[] = frames.filter((f) => f.el.classList.contains('frame--work')).map((fr) => ({
    fr,
    clip: fr.el.querySelector<HTMLElement>('.work__clip')!, work: fr.el.querySelector<HTMLElement>('.work')!,
    head: fr.el.querySelector<HTMLElement>('.work__head')!, detail: fr.el.querySelector<HTMLElement>('.work__detail')!,
    hint: fr.el.querySelector<HTMLElement>('.hint'),
    m: { topA: 0, topB: 0, over: 0, bandTop: 0, overL: 0 },
  }))
  const measureWorks = () => {
    const navB = nav ? nav.getBoundingClientRect().bottom : 60
    for (const w of works) {
      const H = w.fr.el.clientHeight
      if (S.narrow) {
        // the bottom margin, plus the panel's foot band that fades copy out above it (styles.css, .frame--work::after)
        const safe = (parseFloat(getComputedStyle(w.fr.el).paddingBottom) || 0) + 18
        const pad = parseFloat(getComputedStyle(w.work).paddingTop) || 0
        const headH = w.head.offsetHeight + pad, fullH = w.work.offsetHeight
        const hintB = w.hint && w.hint.offsetHeight ? w.hint.offsetTop + w.hint.offsetHeight : 0
        const bandTop = Math.max(navB, hintB) + 8
        // the scene always keeps at least a third of the frame (and never less than 200px)
        const topMin = bandTop + Math.max(H * 0.34, 200)
        const topA = Math.max(topMin, H - safe - headH)
        const topB = Math.max(topMin, Math.min(topA, H - safe - fullH))
        w.m = { topA, topB, over: Math.max(0, fullH - (H - safe - topB)), bandTop, overL: 0 }
      } else {
        w.m = { topA: 0, topB: 0, over: 0, bandTop: 0, overL: shortLand.matches ? Math.max(0, w.work.offsetHeight - w.clip.clientHeight) : 0 }
      }
    }
  }
  measureWorks()
  on('resize', measureWorks)
  document.fonts.ready.then(measureWorks)
  const wro = new ResizeObserver(() => measureWorks())
  works.forEach((w) => { wro.observe(w.work); wro.observe(w.fr.el) })
  off.push(() => wro.disconnect())
  const put = (w: WorkEl, k: 'w' | 'c' | 'd', el: HTMLElement, prop: 'transform' | 'opacity', v: string) => {
    if (w[k] !== v) { w[k] = v; el.style[prop] = v }
  }
  let bedO = '', bedT = ''
  const layoutWorks = (s: number) => {
    let sw = 0, top = 0, band = 0
    for (const w of works) {
      const p = s - w.fr.sec, m = w.m
      if (S.narrow) {
        // reveal (0 = head only, 1 = head and detail) and the inner scroll; reduced motion: the full panel throughout,
        // scrolling like a page
        const r = S.reduced ? 1 : sstep(0.12, 0.28, p) * (1 - sstep(0.8, 0.9, p))
        const i = S.reduced ? clamp((p - 0.08) / 0.8) : sstep(0.32, 0.78, p) * r
        const t = lerp(m.topA, m.topB, r)
        put(w, 'c', w.clip, 'transform', `translate3d(0, ${t.toFixed(1)}px, 0)`)
        put(w, 'w', w.work, 'transform', `translate3d(0, ${(-i * m.over).toFixed(1)}px, 0)`)
        put(w, 'd', w.detail, 'opacity', r.toFixed(3))
        const o = w.fr.op ?? 0
        if (o > 0.001) { sw += o; top += o * t; band += o * m.bandTop }
      } else {
        // short landscape: a column taller than the frame scrolls through the middle of the section
        const i = m.overL > 0 ? sstep(0.3, 0.8, p) : 0
        put(w, 'w', w.work, 'transform', i > 0 ? `translate3d(0, ${(-i * m.overL).toFixed(1)}px, 0)` : '')
        put(w, 'c', w.clip, 'transform', '')
        put(w, 'd', w.detail, 'opacity', '')
      }
    }
    if (S.narrow && sw > 0.001) {
      // the shared surface follows the panels, weighted by how much of each is showing (continuous across boundaries)
      S.copyTop = top / sw; S.bandTop = band / sw
    } else if (!S.narrow) S.copyTop = -1
    if (bed) {
      const o = S.narrow ? sstep(1.93, 1.985, s) * (1 - sstep(6.93, 6.985, s)) : 0
      const ov = o.toFixed(3), tv = o > 0 ? `translate3d(0, ${S.copyTop.toFixed(1)}px, 0)` : bedT
      if (ov !== bedO) { bedO = ov; bed.style.opacity = ov }
      if (tv !== bedT) { bedT = tv; bed.style.transform = tv }
    }
  }
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

  // keyboard: Tab into a frame that isn't on screen (the toolkit index, the Also Built rows, the contact links...)
  // and the film jumps to where that frame is fully shown, so the focused control is visible
  on('focusin', (e) => {
    const fr = frames.find((f) => f.el.contains(e.target as Node))
    if (!fr || Number(fr.el.style.opacity || 0) > 0.5) return
    const [, b, c] = S.narrow && fr.fn ? fr.fn : fr.f
    // (projects on phones: the middle of the section, where the panel shows its detail)
    const y = yForFilm(fr.sec + (fr.el.classList.contains('frame--work') && S.narrow ? 0.5 : (b + c) / 2))
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y)
    S.snap = true
  })
  let lastY = -1
  const tick = () => {
    if (window.scrollY !== lastY) { lastY = window.scrollY; S.lastScrollT = performance.now() }
    const s = S.ready ? S.s : filmFromScroll(window.scrollY)
    for (const fr of frames) {
      const p = s - fr.sec
      const [a, b, c, d] = S.narrow && fr.fn ? fr.fn : fr.f
      const o = sstep(a, b, p) * (1 - sstep(c, d, p))
      fr.op = o
      // phones: project titles rise only a little as they crossfade; their panel does the travelling
      const amp = S.narrow && fr.fn && fr.el.classList.contains('frame--work') ? 10 : 26
      const y = S.reduced ? 0 : (1 - sstep(a, b, p)) * amp - sstep(c, d, p) * amp
      // write only what changed: a dozen frames restyled every tick is style work the scroll doesn't need
      const os = o.toFixed(3), ts = `translate3d(0, ${y.toFixed(1)}px, 0)`
      if (fr.o !== os) { fr.o = os; fr.el.style.opacity = os }
      if (fr.t !== ts) { fr.t = ts; fr.el.style.transform = ts }
      // frames that aren't showing are transparent but stay in the tab order (they take no pointer: see .is-live),
      // so a keyboard user can Tab on into the next section; focusing inside one brings the film there (focusin below)
      const live = o > 0.55
      if (fr.el.classList.contains('is-live') !== live) fr.el.classList.toggle('is-live', live)
    }
    layoutWorks(s)
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
      const fr = frames.find((f) => f.el.contains(el))
      const split = SplitText.create(el, { type: 'lines,words', mask: 'lines', linesClass: 'ln' })
      gsap.from(split.words, {
        yPercent: 115, duration: 1.15, ease: 'expo.out', stagger: 0.045,
        // the headline sets off as its frame starts to show: phones and portrait tablets fade some frames in before
        // their section begins (the project titles hand over just before the boundary), so start from that window
        scrollTrigger: {
          trigger: sec, toggleActions: 'play none none reverse', invalidateOnRefresh: true,
          start: () => (S.narrow && fr?.fn && fr.fn[0] < 0 ? `top ${Math.round((0.01 - fr.fn[0]) * sec.offsetHeight)}px` : 'top -6%'),
        },
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
  if (S.reduced) return () => {}
  const undo: (() => void)[] = []
  document.querySelectorAll<HTMLElement>('.mag').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
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

/** The kind of input actually in use: the first touch or real mouse movement decides, whatever the media queries said. */
function setTouch(touch: boolean) {
  const root = document.documentElement
  root.classList.toggle('is-touch', touch)
  root.classList.toggle('has-cursor', !touch && !S.reduced)
  if (S.touch === touch) return
  S.touch = touch
  if (touch) { S.hoverTool = null; S.hoverLayer = -1; S.specHover = -1; S.px = S.py = 0 }
  emit()
}

function cursor(on: <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => void) {
  setTouch(S.touch)
  document.documentElement.classList.toggle('ua-samsung', S.samsung)
  on('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true) }, { passive: true })
  on('pointermove', (e) => {
    if (e.pointerType === 'touch') { setTouch(true); return } // a finger is not a pointer to follow
    if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouch(false)
    S.px0 = e.clientX; S.py0 = e.clientY
    S.px = (e.clientX / window.innerWidth) * 2 - 1
    S.py = -((e.clientY / window.innerHeight) * 2 - 1)
  }, { passive: true })
  if (S.reduced) return () => {}
  // the custom cursor exists on every device but only shows while the input is a mouse (html.has-cursor)
  const dot = document.createElement('div'); dot.className = 'cur'
  const ring = document.createElement('div'); ring.className = 'cur-ring'
  document.body.append(ring, dot)
  // unseen until the mouse first moves, then placed at the pointer (not flown in from the corner of the window)
  dot.style.opacity = ring.style.opacity = '0'
  let placed = false
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08 }), dy = gsap.quickTo(dot, 'y', { duration: 0.08 })
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3.out' }), ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3.out' })
  on('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    if (!placed) { placed = true; gsap.set([dot, ring], { x: e.clientX, y: e.clientY }); dot.style.opacity = ring.style.opacity = '' }
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY)
    const t = e.target as HTMLElement
    const hot = !!t.closest?.('[data-cursor], a, button') || document.body.dataset.hot === '1'
    ring.classList.toggle('is-hot', hot)
  }, { passive: true })
  on('pointerdown', () => ring.classList.add('is-down'))
  on('pointerup', () => ring.classList.remove('is-down'))
  // hide the custom cursor when the pointer leaves the window
  const out = (e: MouseEvent) => { if (!e.relatedTarget) { dot.style.opacity = ring.style.opacity = '0' } }
  const over = () => { if (placed) dot.style.opacity = ring.style.opacity = '' }
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
    get s() { return S.s },
  }
}
