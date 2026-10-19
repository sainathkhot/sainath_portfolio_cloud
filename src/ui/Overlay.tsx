import { useEffect, useRef, useState } from 'react'
import { LINKS, PERSON, PROJECTS, OTHER_WORK, BANNERS, SECTION_VH, TOOLS, type Headline as H, type ToolId } from '../content'
import { S, subscribe, emit, togglePin } from '../store'
import { goToFilm, STOPS } from './scroll'
import portraitUrl from '../portrait.webp'

const Head = ({ parts, className }: { parts: H; className?: string }) => (
  <h2 className={className} data-split>
    {parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p} </span> : <em key={i}>{p.em}</em>))}
  </h2>
)

const sec = (id: keyof typeof SECTION_VH) => ({ id, style: { height: `${SECTION_VH[id]}vh` } as React.CSSProperties })
const go = (s: number) => (e: React.MouseEvent) => { e.preventDefault(); goToFilm(s) }

function useStore() {
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force((n) => n + 1)), [])
}

export function Nav() {
  return (
    <header className="nav">
      <a href="#hero" className="nav__mark" onClick={go(STOPS.hero)} data-cursor>
        <span className="nav__name">{PERSON.name}</span>
        <span className="nav__role">{PERSON.role}</span>
      </a>
      <nav className="nav__links" aria-label="Sections">
        <a href="#p1" data-stop="work" onClick={go(STOPS.work)} data-cursor>Work</a>
        <a href="#about" data-stop="about" onClick={go(STOPS.about)} data-cursor>About</a>
        <a href="#toolkit" data-stop="toolkit" onClick={go(STOPS.toolkit)} data-cursor>Toolkit</a>
        <a href="#record" data-stop="record" onClick={go(STOPS.record)} data-cursor>Record</a>
        <a href="#contact" data-stop="contact" onClick={go(STOPS.contact)} data-cursor>Contact</a>
      </nav>
      <a href="#contact" className="nav__talk" onClick={go(STOPS.contact)}>Let's talk</a>
    </header>
  )
}

const setTool = (id: ToolId | null) => {
  S.hoverTool = id
  emit()
}

function ToolReadout() {
  useStore()
  const id = S.hoverTool ?? S.pinTool
  const t = TOOLS.find((x) => x.id === id)
  return (
    <div className="readout" aria-live="polite">
      {t ? (
        <>
          <p className="eyebrow">Selected</p>
          <p className="readout__name">{t.name}</p>
          <p className="readout__role">{t.role}</p>
          <p className="readout__rel"><span className="eyebrow">Wakes</span> {t.rel.map((r) => TOOLS.find((x) => x.id === r)?.name).join(' · ')}</p>
        </>
      ) : (
        <>
          <p className="eyebrow">{S.touch ? 'Tap a material' : 'Hover a material'}</p>
          <p className="readout__role">Each one wakes the tools it works with.</p>
        </>
      )}
    </div>
  )
}

/** The same twelve tools as a quiet text rail: keyboard, screen readers, and thumbs on small screens. */
function ToolIndex() {
  useStore()
  const cur = S.hoverTool ?? S.pinTool
  return (
    <nav className="tk__rail" aria-label="Toolkit">
      <p className="eyebrow">Index</p>
      <ul>
        {TOOLS.map((t) => (
          <li key={t.id}>
            <button
              type="button" data-cursor
              aria-pressed={S.pinTool === t.id}
              className={cur === t.id ? 'is-on' : ''}
              onMouseEnter={() => setTool(t.id)} onMouseLeave={() => setTool(null)}
              onFocus={() => setTool(t.id)} onBlur={() => setTool(null)}
              onClick={() => { S.pinTool = S.pinTool === t.id ? null : t.id; emit() }}
            >{t.name}</button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function OtherList() {
  // The active project lives in the store (S.atmos) and is driven by the pointer controller in scroll.ts,
  // which hit-tests both these rows and the 3D objects. Rows only render it. Touch and keyboard pin a project.
  useStore()
  const on = S.atmos
  const pin = (i: number) => togglePin(i)
  return (
    <ol className={`others${on >= 0 ? ' has-on' : ''}`}>
      {OTHER_WORK.map((w, i) => (
        <li
          key={w.id} data-i={i} tabIndex={0} data-cursor
          className={on === i ? 'is-on' : ''}
          aria-expanded={on === i} aria-pressed={S.touch ? on === i : undefined}
          onClick={() => { if (S.touch) pin(i) }}
          // a tap both focuses and clicks: on touch only the click (toggle) counts, or the focus pin would be undone at once
          onFocus={() => { if (!S.touch) { S.atmosPin = i; emit() } }} onBlur={() => { if (!S.touch && S.atmosPin === i) { S.atmosPin = -1; emit() } }}
        >
          <span className="others__num">{String(i + 1).padStart(2, '0')}</span>
          <span className="others__name">{w.name}</span>
          <span className="others__desc">{w.desc}</span>
          <span className="others__more">
            <span className="others__inner">
              {w.metric && <span className="others__metric"><b>{w.metric[0]}</b> {w.metric[1]}</span>}
              <span className="others__stack">{w.stack}</span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Recognition & Delivery: the banners are drawn in the world; the same facts are here as text for everyone. */
function Record() {
  const { recognition: r, path: p } = BANNERS
  const list = (
    <>
      <li><b>{r.eyebrow}</b><ul>{r.items.map((x) => <li key={x.title}>{x.mark}: {x.title}, {x.detail}</li>)}</ul></li>
      <li><b>{p.eyebrow}</b><ul>
        {p.roles.map((x) => <li key={x.title}>{x.title}, {x.org} ({x.when})</li>)}
        <li>{p.education.title}, {p.education.org} ({p.education.when})</li>
      </ul></li>
    </>
  )
  return S.noGL ? <ul className="rec__still">{list}</ul> : <ul className="sr">{list}</ul>
}

/** Without WebGL the hero and closing frames still get the portrait and headline, as plain DOM. */
function StillFrame({ lines, em, light }: { lines: string[]; em: string; light?: boolean }) {
  return (
    <div className={`still${light ? ' still--light' : ''}`} aria-hidden="true">
      {lines.length > 0 && <p className="still__title">{lines.map((l) => <span key={l}>{l}</span>)}<em>{em}</em></p>}
      <img className="still__img" src={portraitUrl} alt="" />
    </div>
  )
}

function CopyEmail() {
  const [done, setDone] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const copy = () => {
    const sel = () => { const r = document.createRange(); if (ref.current) { r.selectNodeContents(ref.current); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r) } }
    try {
      navigator.clipboard.writeText(LINKS.email).then(() => { setDone(true); setTimeout(() => setDone(false), 1800) }, sel)
    } catch { sel() }
  }
  return (
    <p className="contact__addr">
      <span ref={ref}>{LINKS.email}</span>
      <button type="button" className="copy" onClick={copy} data-cursor>{done ? 'Copied' : 'Copy'}</button>
    </p>
  )
}

export function Overlay() {
  const projects = PROJECTS
  return (
    <main className="film">
      {/* 0 — HERO */}
      <section {...sec('hero')} className="sec sec--hero">
        <div className="frame" data-fade="-1,0,0.16,0.34">
          <h1 className="sr">{PERSON.name}, {PERSON.role}. Build what survives reality.</h1>
          {S.noGL && <StillFrame lines={['Build what', 'survives']} em="reality." light />}
          <div className="hero__loc"><span>{PERSON.location}</span><span>Working globally</span></div>
          <div className="hero__foot">
            <div className="hero__labels"><span>Agentic AI</span><span>Full-stack</span><span>Production systems</span></div>
            <p className="hero__copy">I build AI systems, products and workflows that move beyond the demo, into real interfaces, real operations and real people.</p>
            <div className="hero__cta">
              <a href="#p1" className="btn btn--solid mag" data-cursor onClick={go(STOPS.work)}>See the work</a>
              <a href="#contact" className="btn mag" data-cursor onClick={go(STOPS.contact)}>Let's talk</a>
            </div>
          </div>
          <div className="scrollcue" aria-hidden="true"><span>Scroll</span><i /></div>
        </div>
      </section>

      {/* 1 — ABOUT */}
      <section {...sec('about')} className="sec sec--about">
        <div className="frame frame--center" data-fade="0.1,0.26,0.74,0.9">
          <p className="eyebrow">Principle</p>
          <h2 className="display" data-split>Software is invisible. <br />The consequences <em>aren't.</em></h2>
          <p className="lede">A queue that stalls, an agent that guesses, a permit sent the wrong way. The systems below are drawn as the shapes they actually take, so you can see where a decision happens and who makes it.</p>
        </div>
      </section>

      {/* 2-6 — PROJECTS */}
      {projects.map((p, i) => (
        <section key={p.id} {...sec(p.id)} className={`sec sec--work sec--${p.id}`}>
          <div className="frame frame--work" data-fade="0.05,0.16,0.87,0.97">
            <div className="work">
              <p className="eyebrow eyebrow--row"><span>{String(i + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}</span><span>{p.label}</span>{'status' in p && <span className="tag">{p.status}</span>}</p>
              <p className="work__name">{p.name}<span>{p.sub}</span></p>
              <Head parts={p.headline} className="work__head" />
              <p className="work__body">{p.body}</p>
              <dl className="facts">
                {p.facts.map(([v, k]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
              </dl>
              {'note' in p && <p className="work__note">{p.note}</p>}
              <p className="work__stack">{p.stack}</p>
            </div>
            <div className="state" aria-hidden="true"><i /><span data-status={i}>&nbsp;</span></div>
            {p.id === 'p2' && <p className="hint">{S.touch ? 'Layers light as the question passes' : 'Hover a layer to lift it'}</p>}
          </div>
        </section>
      ))}

      {/* 7 — TOOLKIT */}
      <section {...sec('toolkit')} className="sec sec--toolkit">
        <div className="frame frame--toolkit" data-fade="0.06,0.18,0.86,0.96">
          <div className="tk__head">
            <p className="eyebrow">Toolkit</p>
            <h2 className="display display--sm" data-split>The cloud <em>workbench.</em></h2>
          </div>
          <div className="tk__foot">
            <ToolReadout />
            <ToolIndex />
          </div>
        </div>
      </section>

      {/* 8 — OTHER WORK */}
      <section {...sec('other')} className="sec sec--other">
        <div className="frame frame--other" data-fade="0.1,0.22,0.8,0.94">
          <div className="other__head">
            <p className="eyebrow">Also built</p>
            <p className="other__hint">{S.touch ? 'Tap a project' : 'Hover a project'}</p>
          </div>
          <OtherList />
        </div>
      </section>

      {/* 9 — RECOGNITION & DELIVERY */}
      <section {...sec('record')} className="sec sec--record">
        <div className="frame frame--record" data-fade="0.02,0.1,0.88,0.94">
          <div className="rec__intro">
            <p className="eyebrow">Record</p>
            <h2 className="display display--sm" data-split>Recognition <em>&amp; delivery.</em></h2>
          </div>
          <Record />
        </div>
      </section>

      {/* 10 — CONTACT */}
      <section {...sec('contact')} className="sec sec--contact">
        <div className="frame frame--contact" data-fade="0.4,0.6,2,3">
          {S.noGL && <StillFrame lines={[]} em="" />}
          <div className="contact">
            <h2 className="display cta__title">Let's build <br />something <em>real.</em></h2>
            <p className="contact__copy">AI products, operational systems and interfaces with a point of view.</p>
            <div className="contact__links">
              <a className="link link--solid mag" href={`mailto:${LINKS.email}`} data-cursor>Email</a>
              <a className="link mag" href={LINKS.linkedin} target="_blank" rel="noreferrer" data-cursor>LinkedIn</a>
              <a className="link mag" href={LINKS.github} target="_blank" rel="noreferrer" data-cursor>GitHub</a>
            </div>
            <CopyEmail />
          </div>
          <footer className="foot"><span>© 2026 {PERSON.name}</span><span>{PERSON.location} · Working globally</span></footer>
        </div>
      </section>
    </main>
  )
}
