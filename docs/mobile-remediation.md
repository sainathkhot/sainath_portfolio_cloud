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
