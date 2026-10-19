# Portfolio visual baseline

Values recorded so that visual changes can be undone exactly. Each entry names the source file and the values as
they stood before the change, and says how to restore them.

---

## Aircraft (Recognition & Delivery) — size before the 2026-10-19 enlargement

Recorded from `main` at commit `b00e41a` ("Configure Cloudflare static asset deployment"), before any change on the
`feat/mobile-refinement` branch.

### Object identity

| | |
| --- | --- |
| Model builder | `buildCraft()` in `src/world/Aircraft.ts` (procedural; no external model file) |
| Scene object | `craft.root` (a `THREE.Group`), mounted inside the `carrier` group in `Delivery()` in `src/world/Delivery.tsx` |
| Per-frame transform | `carrierPose()` in `src/world/Delivery.tsx` sets `position`, orientation (`lookAt` + bank) and **uniform scale** on the carrier group every frame |

### Model geometry (local units, before scaling)

Local frame: +Z forward, +Y up, wings along X. These are the source constants in `src/world/Aircraft.ts`; the model
itself was not changed.

| Part | Extent |
| --- | --- |
| Fuselage | z = −1.005 (tail cap) to 0.935 (cowling face); stations `FZ`/`FW`/`FT`/`FB`/`FC` |
| Spinner tip | z = 0.935 + 0.132 = 1.067 |
| Overall length | ≈ 2.07 (≈ 2.0 nominal) |
| Wing | spanwise 0.10 → 1.46 per side, root chord 0.44, tip chord 0.20, 5° dihedral, 2.5° washout |
| Wingspan | ≈ 2.92 (nav lights at x = ±1.462) |
| Height | wheel bottom y ≈ −0.337 to fin tip y ≈ 0.44 |
| Propeller disc | radius 0.40, centred at (0, −0.015, 0.965) |
| Tow hook | local (0, 0.035, −0.99) — `Craft.tow` |

### Scale per pass (`layout()` in `src/world/Delivery.tsx`)

`craft` is the uniform scale applied to the model for each pass; `drop` is how far below the flight line the towed
bundle rides (in model units, multiplied by `craft`).

| Layout | Pass 1 `craft` | Pass 2 `craft` | `drop` (pass 1, pass 2) |
| --- | --- | --- | --- |
| Wide screens (`narrow = false`) | **1.2** | **1.4** | 0.42, 0.16 |
| Phones (`narrow = true`) | **0.7** | **0.29** | 0.42, 0.16 |

The second pass flies at a different depth (desktop z ≈ −172, phone z ≈ −153.4), so its scale differs to keep a
similar apparent size. With a licensed `eagle.glb` present, both values are multiplied by 1.1 (`crafts` in `Delivery()`).

### Values derived from the scale (all multiplied by the pass's `craft`)

| Behaviour | Formula (in `carrierPose()` / the frame loop) |
| --- | --- |
| Tow length (bundle trails along the flight path) | 2.15 × craft, measured along the path |
| Bundle drop below the path | drop × craft |
| Lift after release | +0.16 × craft over u ∈ [release, release + 0.3] |
| Nose-up after release | −0.06 rad, rising over 0.1 u and settling by 0.36 u |
| Idle bob | 0.025 × sin(0.9 t) world units (not scaled) |
| Bank | clamp(rate × 0.12, −0.3, 0.3) rad |
| Tow rope radius | 0.0055 × craft; shackle ring torus (0.03, 0.009) × craft |
| Towed bundle scale | banner scale × (craft of the pass ÷ craft of pass 1), easing to 1 as it settles |

### Approximate on-screen size at the baseline

Measured from rendered 1440×900 screenshots of the baseline build: the first pass reads about 150 px nose to tail as
it crosses the frame; the second pass about 70% of that, since it flies farther back.

### Values after the enlargement (`CRAFT_SIZE = 1.1`)

| Layout | Pass 1 `craft` | Pass 2 `craft` |
| --- | --- | --- |
| Wide screens | 1.2 → **1.32** | 1.4 → **1.54** |
| Phones | 0.7 → **0.77** | 0.29 → **0.319** |

With `eagle.glb` present the eagle factor (×1.1) still applies on top. Paths, timing, banner sizes and the
release/settle choreography are unchanged; tow length, drop, lift and rope scale with the craft as before.

Checked on the built site by reading the carrier group's scale from the scene (`?debug`) and projecting the
aircraft's bounds to the screen, baseline build vs branch build, at the same scroll positions:

| Viewport | Position | Scale (before → after) | On-screen diagonal, px (before → after) |
| --- | --- | --- | --- |
| 1440×900 | s 9.25 (pass 1) | 1.2 → 1.32 | 270 → 293 |
| 1440×900 | s 9.6 (pass 2) | 1.4 → 1.54 | 184 → 204 |
| 900×600 | s 9.25 (pass 1) | 1.2 → 1.32 | 179 → 198 |
| 900×600 | s 9.6 (pass 2) | 1.4 → 1.54 | 123 → 137 |
| 390×844 | s 9.25 (pass 1) | 0.7 → 0.77 | 137 → 154 |
| 390×844 | s 9.6 (pass 2) | 0.29 → 0.319 | 126 → 138 |

The diagonal is the projected bounding box, so it also moves a little with the aircraft's bank and heading at that
instant; the scale column is the exact change.

### How to restore the original size

The enlargement is applied by one multiplier, `CRAFT_SIZE`, in `src/world/Delivery.tsx`. Set it back to `1` to
restore every value above exactly (`craft` per pass, tow length, drop, lift, rope and shackle all derive from it).
The per-pass `craft` values in `layout()` were left at their baseline numbers.
