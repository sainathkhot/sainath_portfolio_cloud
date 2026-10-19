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
| `src/world/Ship.tsx` | Blue Marine: a container ship sailing through the cloud sea under a live network of the permit platform (importer → director → AD → PO, send-back path, scan, inspection, permit issued) |
| `src/world/EParking.tsx` | The gate scene: vehicle, ANPR camera, booth, POS, barrier, and the identify → access path |
| `src/world/Workbench.tsx` | Twelve tool objects on a three-row grid; hover, tap or the index wakes related tools |
| `src/world/Specimens.tsx` | One object per "Also built" project; hovering the row or the object selects the same project |
| `src/world/Delivery.tsx` | Recognition & delivery: the aircraft's two passes, banner release, unfurl and settle, all driven by scroll |
| `src/world/Aircraft.ts` | The procedural light aircraft (lofted fuselage, wing and tail; painted livery) |
| `docs/portfolio-visual-baseline.md` | Recorded original values (e.g. the aircraft's size) so visual changes can be undone exactly |
| `src/ui/Overlay.tsx` | All page content and section frames |
| `src/ui/scroll.ts` | Lenis, frame fades, the Also Built hover controller, status lines, cursor, nav state |

## Behaviour worth knowing

- A loading curtain lifts once fonts are loaded and every scene's shaders are compiled, so no scene stutters on arrival.
- Resolution adapts to measured frame rate (starts at 1.3×, moves between 0.85× and 1.75×).
- Scenes render only while the camera is near them.
- `prefers-reduced-motion`: no smooth scrolling or reveals; the 3D scene renders on demand.
- No WebGL: the opening and closing frames show the portrait and headline as plain HTML; all content stays readable.
- GPU context loss: rendering stops at once, the sky gradient shows, and the world rebuilds shortly after.
- `?debug` in the URL exposes `window.__film` (jump to a film position, pin a tool) for QA. It is absent otherwise.

## The carrier: aircraft, or a licensed eagle

The banners are towed in by a light aircraft built in code. To use a licensed, rigged eagle instead, export it as
glTF binary (uncompressed or meshopt-compressed; not Draco), facing +Z, with a flight or flap clip, and save it as
`src/assets/models/eagle.glb`. It is picked up automatically at build time and replaces the aircraft: scaled to fit,
its flight clip scrubbed by distance flown, the banner carried below it. If the model faces another axis, set `GLB_YAW`
in `src/world/Delivery.tsx`. Check the licence permits web display.

## Optional: single-file build

`ARTIFACT=1 npx vite build --outDir dist-artifact && python3 pack.py` produces `artifact/`, a one-page variant with the
bundle and fonts inlined, for hosts that only accept a single HTML file. Normal hosting does not need it.
