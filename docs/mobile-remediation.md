# Mobile remediation: diagnosis, approved plan and constraints

Branch `feat/mobile-refinement` (PR #1). Plan approved 2026-10-21 with the constraints below. Results are recorded in
the PR description and in the review package that accompanies the implementation.

## Diagnosis (from the phone recording, the code and captures)

| # | Problem | Cause | Status |
|---|---|---|---|
| 1 | Charcoal panels in dark mode | Samsung Internet's forced dark mode transforms the page's CSS colours. The loading curtain (a plain light CSS gradient) renders charcoal; switching the phone to light renders the same page light; the WebGL canvas is never darkened. Samsung ignores `color-scheme` and `prefers-color-scheme` by default. | Confirmed |
| 2 | Washed-out text in dark mode (Toolkit, Record) | Same: dark text is turned light; where text has no surface of its own it ends up light on light cloud. | Confirmed |
| 3 | Desktop cursor rings at touch points, "Hover …" wording, Also Built rows stuck dimmed | Samsung Internet reports a hover-capable pointer, so `(hover: none)` is false and the site behaved as if a mouse were attached. | Confirmed |
| 4 | Floating ^ over content | Samsung Internet's own scroll-to-top button; the site has no such control. | Confirmed |
| 5 | Artwork with no text; empty cloud passages | Phone frame fade windows left ~40% of a screen of scroll per project boundary (and longer passages elsewhere) with no copy. | Confirmed |
| 6 | Scene squeezed on small phones | Full copy (header, body, facts) is ~520–580 px at 375×812. | Confirmed |
| 7 | Toolkit grid and copy overlap | The bench's band was measured only on resize; selecting a tool grows the readout. | Confirmed |
| 8 | Ship pops in on desktop | Visibility switched at s≈4.966 while the ship's entry pose was already inside the camera view; exit cut at 5.97 while still visible. | Confirmed |
| 9 | Phone: 217 ms freeze on first Toolkit tap | Whole-Toolkit React re-render and first mount (shader compile) of the relation lines. | Hypothesis → verify |
| 10 | Laptop stutter | Not reproducible here (no GPU). Prime suspect: higher render resolution (up to ~1.8×) through heavy cloud overdraw, plus resolution changes reallocating the canvas mid-scroll. | Hypothesis → measure on device |

## Approved approach

1. **Phone composition.** Nav at top; the scene in the band between nav and copy; copy anchored at the bottom. Each
   project has two states: on arrival the header (number, category, name, headline) with a large scene; as the
   section scrolls the copy surface rises to reveal description, facts and status, and the camera re-frames the scene
   into the smaller band (lens zoom and offset fitted to each scene's own projected size). Copy taller than its panel
   scrolls within the panel under a feathered edge. One continuous copy surface spans the five projects.
2. **Section treatments.** Stable Toolkit band and readout; Also Built accordion without reserved space; text
   surfaces for every text group; CTA recomposed; Samsung's ^ button kept clear of text.
3. **Type.** Body 16 px / 1.55; headlines 32–40 px; labels 12 px; facts 18 px; WCAG AA contrast on actual surfaces.
4. **Samsung forced dark.** Keep `only light` (Chrome honours it); add a real dark-scheme rule that keeps the light
   palette (Samsung's adaptive mode honours it); preview-only theme lab to compare treatments on the actual phone;
   graceful fallback: every text group on its own surface so forced dark yields light text on dark surfaces, never
   light on light.
5. **Ship.** Entry and exit paths computed from the live camera so the ship is fully outside the view when its
   visibility changes; tokens and network follow the same pose.
6. **Performance.** Render-quality budget chosen during loading and changed only while the page is idle; lower
   desktop pixel budget; no backdrop blur over the canvas; scoped React updates; relation lines mounted once; an
   optional `?perf` overlay with a scripted scroll path for comparable on-device numbers.

## Constraints recorded with the approval

1. **Mobile project transitions** must feel natural and cinematic. The project title or other meaningful content
   stays visible during transitions; no empty clouds while waiting for the description; no abrupt layout shifts, no
   text disappearing unexpectedly, no unnecessary blank scroll. All project information stays accessible.
   Reduced-motion preferences are respected.
2. **Samsung dark mode.** Implement the theme lab in the preview and use it to identify the best practical treatment.
   Turning off dark mode is not the first answer. Retain the light cloud aesthetic; implement the best graceful
   fallback where Samsung overrides colours; be explicit about what a website cannot control.
3. **Ship.** Fully outside the camera's visible bounds whenever its visibility switches. Entry, exit, asset
   readiness, network effects and reverse scrolling verified. The first visible frame never shows the ship mid-view.
4. **Performance.** No higher quality at the cost of stutter. Quality budget chosen during loading or while idle,
   never by reallocating the canvas during a transition. Keep the shader and texture optimisations. Use the `?perf`
   overlay for comparable results from the phone and the laptop; separate measured results from hypotheses.
5. **Preview-only tools.** `/theme-lab.html` and `?perf` are excluded from production builds (Cloudflare builds of
   `main`, and local builds unless explicitly requested). No unnecessary changes to `wrangler.jsonc`, deployment
   configuration or dependencies.
6. **Visual acceptance** from actual rendered screenshots: readable type, connected artwork and copy, no washed-out
   content, no controls over text, both appearance settings as far as the browser permits.
7. **Final verification.** Full viewport and section matrix, ship in both directions, production build, before/after
   screenshots, headless checks clearly separated from physical-device testing.

## How the preview tools are excluded from production

`vite.config.ts` includes them only when `WORKERS_CI_BRANCH` (set by Cloudflare Workers Builds) names a branch other
than `main`, or when `PREVIEW_TOOLS=1` is set for a local build. A production build of `main` contains neither the
theme lab nor the overlay code. Before merging, the tools can also be deleted outright: they live in
`preview-tools/` and `src/ui/PerfHud.tsx`.

## Results (2026-10-22)

Every check below ran headless: Chromium with SwiftShader (a CPU renderer) in a cloud container, the production build
of this branch against the build of `d060058` (the branch before this pass). It verifies layout, behaviour and what
the code does each frame. It does not show how smooth a real GPU feels, and it is not Samsung Internet itself. What
still needs a real phone and laptop is listed at the end.

### Root causes

| Problem | Cause | Evidence |
|---|---|---|
| Charcoal panels; washed-out text in dark mode | Samsung Internet's default dark mode rewrites page colours and ignores `color-scheme`. Text without a surface of its own turned light over the light canvas sky (canvas is never darkened). | Phone recording; emulation below. Chrome honours the site's `only light` (verified). |
| Cursor rings, "Hover" wording, rows stuck dimmed | Samsung Internet reports a hover-capable pointer, so the site treated the phone as a mouse device. | Code path; emulation below |
| Floating ^ over content | Samsung Internet's own scroll-to-top button | Recording |
| Empty clouds, scenes squeezed by copy | Phone fade windows left long passages with no copy; full copy was 520–580 px tall at 375×812 | Captures |
| Toolkit grid over copy | Bench band measured only on resize; landscape band a sliver | Captures |
| Ship pops in / cuts out (desktop) | Visibility switched at s≈4.966 with the hull already in view; exit cut at 5.97 while visible | Frame captures of `d060058` |
| Freeze on Toolkit taps | Relation lines mounted, and their material compiled, on tap; whole-Toolkit re-render | Measured: see Performance |
| Laptop stutter | Mid-scroll resolution changes reallocating the canvas, and a 4.2 M pixel budget through heavy cloud overdraw | The reallocations and their long tasks are measured headless; that they explain the laptop's stutter is still a hypothesis until `?perf` runs on it |

### Viewports and sections

Captured at 375×812, 390×844, 430×932 (18 film positions each, including both sides of each project boundary),
667×375, 844×390, 768×1024, 1280×800 and 1440×900 (13 positions each). At every position: no horizontal overflow, no
element outside the viewport, no console errors.

Phone project transitions: each project arrives with its head (number, category, name, headline, live status) and a
large scene; its panel rises to reveal the detail while the scene re-frames above it; it settles back to its head, and
the next title takes over just before the boundary, so at the boundary itself (where the formations morph) the next
title is already in place. The copy area is empty only between 0.965 and 0.975 of a section, about 2% of a screen of
scroll. With reduced motion the full panel shows throughout.

### Appearance

| Mode | Result |
|---|---|
| Light | As designed at all sizes |
| Chrome, phone in dark mode (`prefers-color-scheme: dark`), with and without Chrome's automatic dark mode | Identical to light (mean pixel difference ≤ 6/255, from cloud motion): the page's `only light` is honoured |
| Samsung Internet's dark mode, emulated (its user agent; `color-scheme` stripped as Samsung ignores it; Blink's automatic dark mode on; `prefers-color-scheme` reporting light, as Samsung does) | Before: light text left on the light sky in Toolkit, Also Built, Record and Contact. After: every text group on its own surface, which turns dark under light text. Checked at 375, 390, 844×390, 667×375, 768×1024 and 1280×800 |

A website cannot switch Samsung Internet's default dark mode off. `/theme-lab.html` (preview builds) shows on the phone
whether any declaration is respected; if one is, the site can adopt it and keep its light design there.

### Ship

Stepped through the entry and the exit in 0.01 steps, scrolling down and back up, waiting for drawn frames at each step,
at 1440×900, 1280×800, 844×390, 390×844 and 375×812. The check measures the hull's box from its own geometry (meshes,
cargo, every wake and spray puff with its radius) and samples its surface against the view volume of the camera that
drew the frame.

- Every visibility switch (4.78/4.79 and 6.00, both directions, all five sizes) happened with no part of the box in view.
- The first frame that shows any of the hull has it at the left edge (1440×900: s 4.91, NDC x −1 to −0.96; 390×844:
  s 4.93, −1 to −0.87). The last frame on the way out has it at the right edge (s 5.94–5.95). Reverse scrolling mirrors
  both.
- No shader program is compiled and no texture uploaded when the ship's scene is reached (checked at every section, after
  the load-time warm-up, at 390×844 and 1280×800).

### Performance (headless, CPU-rendered)

Frame times under SwiftShader are seconds per frame at laptop size and say nothing about a real GPU, so they are not
compared here. These are behaviours, measured over the same scroll legs (4.5 → 10.95 and back, first visit and repeat):

| | Laptop-size 1280×800 @2× | Phone 390×844 @3× (touch) |
|---|---|---|
| Canvas reallocations during scroll | 3 → 0 (2560 → 2240 → 1920 → 1715 px wide, before) | 3 → 0 (780 → 682 → 585 → 522) |
| Long main-thread tasks during scroll | 24,542 ms → 57 ms | 1,299 ms → 0 |
| Shader programs linked during scroll | 0 → 0 | 1 → 0 |
| Texture uploads during scroll | 0 → 0 | 0 → 0 |

First Toolkit taps on a phone (390×844): before, the second and third taps compiled shaders (2 and 4 compiles) with
long tasks of 537–1,255 ms; after, no compiles and no long tasks on any tap.

The `?perf` overlay ran its scripted path end to end at both sizes; the render resolution stayed constant through
every leg.

### Input, controls and accessibility

- Samsung-style input (its user agent; the page told the pointer can hover, as Samsung Internet reports; input as
  touches): before any input the custom cursor stays hidden; the first touch switches to touch behaviour (no cursor,
  "Tap" wording); tapping an Also Built row opens it and tapping again closes it with no row left dimmed; a real mouse
  moving switches back.
- Text under the nav's controls: none at any of 19 positions at 375×812, 390×844, 667×375 and 844×390. With Samsung
  Internet's user agent, copy also stays clear of the bottom band where its scroll-to-top button floats (none at 19
  positions; copy scrolling inside a project panel fades out above that band).
- Desktop mouse (1280×800): the cursor appears once the mouse moves; hovering a 3D tool, an index entry and an Also
  Built row each still drives its selection.
- Reduced motion (390×844) and no WebGL (390×844, 1280×800): no overflow, no errors; without WebGL the opening and
  closing frames show the portrait and headline as HTML.
- Keyboard (1280×800): 33 focus stops, every one inside the viewport with a visible focus outline. Focusing a control in
  a section that isn't showing brings the film there; under SwiftShader (seconds per frame) one stop, Email, was
  measured 6 s after focus, before its frame had finished fading in.

### Build and production exclusion

- `npm run build` passes. `wrangler.jsonc`, `package.json` and the lockfile are unchanged from `d060058`.
- Built with `WORKERS_CI_BRANCH=main`: no `theme-lab`, no overlay code (26 files). With
  `WORKERS_CI_BRANCH=feat/mobile-refinement`: the theme lab (5 pages) and the overlay chunk are included. A local build
  without `PREVIEW_TOOLS=1` includes neither. On production `/theme-lab.html` falls through to the site.

### Still to verify on real devices

Nothing here ran on a phone GPU, in Samsung Internet itself, or on the laptop that stutters. Before merging:

1. **Samsung Internet, phone in dark mode:** open `/theme-lab.html` on the preview and screenshot the four tiles (and
   each opened on its own). If any tile stays light, the site can adopt that declaration. Then scroll the site: text
   should sit on surfaces everywhere, never light on light.
2. **Samsung Internet, light mode:** no cursor ring after touching, "Tap" wording, Also Built rows open and close, the
   ^ button never over text at rest.
3. **Phone and laptop, `?perf`:** open the preview with `?perf`, wait for the page, tap "Run scripted path" and leave
   the device untouched for about a minute, then "Copy report". The same fifteen legs run on both devices; the report
   lists frame times per leg and the render resolution, which should not change during the run.
4. **Ship on the laptop:** scroll into and out of Blue Marine in both directions; the hull should always enter from
   the left edge and leave past the right.
