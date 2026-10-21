# Sainath Khot — Portfolio

The personal portfolio of Sainath Khot, AI / Product Engineer (Mumbai, India).

The site is a single continuous WebGL "sky world". Scrolling drives one camera through the sky: past the portrait with
a cloud resting over the head, through five project scenes (Agentic Agile, AI Chatbot, ShopperMatch.AI, Blue Marine,
E-Parking), a toolkit workbench, a few smaller projects, a recognition and delivery sequence (a light aircraft tows in two banners), and finally back down
to the portrait for the closing frame. The text sits on editorial frames above the 3D scene; all content is ordinary,
selectable, indexable HTML.

## Stack

- React 18 + TypeScript, built with Vite 5
- Three.js through React Three Fiber and drei
- GSAP (ScrollTrigger, SplitText) and Lenis for scroll and motion
- Self-hosted fonts via Fontsource (DM Sans, Instrument Serif, DM Mono)

## Run it locally

Requires Node.js 18 or newer (developed on Node 22).

```bash
npm ci            # install exact versions from package-lock.json
npm run dev       # development server
npm run build     # type-check, then production build into dist/
npm run preview   # serve dist/ exactly as production will (http://localhost:4173)
```

## Deploy

`dist/` is a fully static site. There are no environment variables, no API calls, no server code and no third-party
requests (fonts are bundled). Asset paths are relative (`base: './'`), so it works at a domain root or under a
sub-path such as GitHub Pages' `/<repo>/`.

| Host | Build command | Output directory |
| --- | --- | --- |
| Vercel | `npm run build` | `dist` |
| Netlify | `npm run build` | `dist` |
| Cloudflare Pages | `npm run build` | `dist` |
| GitHub Pages | build in a workflow, publish `dist` | `dist` |

Caching: everything in `dist/assets/` has a content hash in its filename and can be cached for a year;
`index.html` should be revalidated.

## Content

Every claim, figure and link on the site lives in `src/content.ts`. Nothing else states a fact. Edit that file to
change copy; the scenes read their labels from it where they show any.

## How it is put together

| File | What it does |
| --- | --- |
| `src/store.ts` | The film position `s` (section index + progress, 11 sections), shared state, layout helpers |
| `src/world/Film.tsx` | Camera keyframes along `s`, cloud passes, sky warmth, pointer parallax, lens offsets that centre scenes beside the copy |
| `src/world/Cloud.tsx` | Procedural billboard cumulus; noise from a texture baked once on the GPU (`src/lib/glsl.ts`) |
| `src/world/Stage.tsx` | Portrait, split headline around the figure, the head cloud (opening) and parted clouds (closing) |
| `src/world/System.tsx` | One instanced set of tokens that morphs through the first four projects |
| `src/world/Accent.tsx` | One shared accent point light the gate, booth and toolkit borrow, so the light count (and every shader) never changes mid-scroll |
| `src/world/Ship.tsx` | Blue Marine: a container ship sailing through the cloud sea under a live network of the permit platform (importer → director → AD → PO, send-back path, scan, inspection, permit issued) |
| `src/world/EParking.tsx` | The gate scene: vehicle, ANPR camera, booth, POS, barrier, and the identify → access path |
| `src/world/Workbench.tsx` | Twelve tool objects on a three-row grid; hover, tap or the index wakes related tools |
| `src/world/Specimens.tsx` | One object per "Also built" project; hovering the row or the object selects the same project |
| `src/world/Delivery.tsx` | Recognition & delivery: the aircraft's two passes, banner release, unfurl and settle, all driven by scroll |
| `src/world/Aircraft.ts` | The procedural light aircraft (lofted fuselage, wing and tail; painted livery) |
| `docs/portfolio-visual-baseline.md` | Recorded original values (e.g. the aircraft's size) so visual changes can be undone exactly |
| `src/ui/Overlay.tsx` | All page content and section frames |
| `src/ui/scroll.ts` | Lenis, frame fades, the Also Built hover controller, status lines, cursor, nav state |
| `src/ui/PerfHud.tsx` | Preview builds only: the `?perf` overlay (frame times, render resolution, a scripted scroll path with a copyable report) |
| `preview-tools/` | Preview builds only: `/theme-lab.html`, four test pages for browsers that force their own dark mode |
| `docs/mobile-remediation.md` | Phone and Samsung Internet diagnosis, the approved plan and its constraints |

## Behaviour worth knowing

- A loading curtain lifts once fonts are loaded and every scene's shaders are compiled, so no scene stutters on arrival.
- Render resolution: the screen's own density up to 2×, within a per-frame pixel budget (2.6 M device pixels on phones,
  3.0 M on wide screens). A GPU measurement behind the loading curtain sets the starting value. Later adaptive changes
  wait until the page has been still for about a second, so the canvas is never reallocated mid-transition.
- Touch is decided by the input actually used (the first touch or real mouse movement), not only by media queries:
  Samsung Internet reports a hover-capable pointer on phones.
- Scenes render only while the camera is near them.
- `prefers-reduced-motion`: no smooth scrolling or reveals; the 3D scene renders on demand.
- No WebGL: the opening and closing frames show the portrait and headline as plain HTML; all content stays readable.
- GPU context loss: rendering stops at once, the sky gradient shows, and the world rebuilds shortly after.
- `?debug` in the URL exposes `window.__film` (jump to a film position, pin a tool) for QA. It is absent otherwise.

## Preview-only tools

Builds of any branch other than `main` on Cloudflare Workers Builds (which sets `WORKERS_CI_BRANCH`), and local builds
run with `PREVIEW_TOOLS=1`, include two diagnostics. Production builds of `main` contain neither.

- `/theme-lab.html`: four variants of the same light page (A as the site ships, B a dark page background, C a declared
  dark scheme that keeps the light palette, D a dark scheme). Open it in a browser that forces dark mode to see which
  treatment that browser respects.
- `?perf`: a frame-time overlay. "Run scripted path" glides through the same fifteen film legs, 2.4 s each, on any
  device; "Copy report" copies the per-leg numbers so a phone and a laptop can be compared.

## The carrier: aircraft, or a licensed eagle

The banners are towed in by a light aircraft built in code. To use a licensed, rigged eagle instead, export it as
glTF binary (uncompressed or meshopt-compressed; not Draco), facing +Z, with a flight or flap clip, and save it as
`src/assets/models/eagle.glb`. It is picked up automatically at build time and replaces the aircraft: scaled to fit,
its flight clip scrubbed by distance flown, the banner carried below it. If the model faces another axis, set `GLB_YAW`
in `src/world/Delivery.tsx`. Check the licence permits web display.

## Optional: single-file build

`ARTIFACT=1 npx vite build --outDir dist-artifact && python3 pack.py` produces `artifact/`, a one-page variant with the
bundle and fonts inlined, for hosts that only accept a single HTML file. Normal hosting does not need it.
