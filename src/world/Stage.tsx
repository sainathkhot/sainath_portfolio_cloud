import * as THREE from 'three'
import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import portraitUrl from '../portrait.webp'
import { S, sstep, local, damp } from '../store'
import { CloudField, cumulus, type Puff } from './Cloud'
import { Headline, type Row } from './Headline'
import { HeroArtifacts } from './Artifacts'

export const CAM_DIST = 9.5
export const FOV = 35
const TEXT_Z = -2.2

// ---------- portrait material: the photo, lit by this sky ----------
const portraitVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const portraitFrag = /* glsl */ `
uniform sampler2D map; uniform vec2 uTexel; uniform float uShadowY; uniform float uShadowAmt; uniform float uFade; uniform float uWarm; uniform float uOpacity; uniform float uRim;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.25) discard;
  float o = 4.0;
  float aR = texture2D(map, vUv + vec2(uTexel.x * o, -uTexel.y * o * 0.5)).a;
  float aU = texture2D(map, vUv + vec2(0.0, uTexel.y * o)).a;
  float aL = texture2D(map, vUv - vec2(uTexel.x * o, 0.0)).a;
  float rimSun = smoothstep(0.2, 0.9, c.a - aR) * 0.8 + smoothstep(0.2, 0.9, c.a - aU) * 0.45;
  float rimSky = smoothstep(0.2, 0.9, c.a - aL);
  vec3 col = c.rgb;
  // aerial grade: cool the shadows toward the sky, warm the sun side
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, col * vec3(0.93, 0.99, 1.07) + vec3(0.015, 0.03, 0.05), (1.0 - lum) * 0.6);
  col *= mix(0.93, 1.05, smoothstep(0.15, 0.95, vUv.x));
  vec3 sun = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.72, 0.42), uWarm);
  col += rimSun * sun * 0.28 * uRim + rimSky * vec3(0.55, 0.78, 0.92) * 0.1 * uRim;
  // the head cloud casts a soft cool shadow
  float sh = smoothstep(uShadowY - 0.09, uShadowY + 0.06, vUv.y);
  col = mix(col, col * vec3(0.76, 0.83, 0.94), sh * uShadowAmt);
  col = mix(col, col * vec3(1.05, 0.97, 0.9), uWarm * 0.4);
  float a = smoothstep(0.3, 0.92, c.a) * smoothstep(0.0, uFade, vUv.y) * uOpacity;
  gl_FragColor = vec4(col, a);
}`

type Variant = 'hero' | 'contact'

const HERO_ROWS: Row[] = [{ l: { t: 'Build' }, r: { t: 'what' } }, { l: { t: 'survives' }, r: { t: 'reality.', serif: true } }]
const HERO_ROWS_N: Row[] = [{ l: { t: 'Build what' } }, { l: { t: 'survives' } }, { l: { t: 'reality.', serif: true } }]
// balanced columns ("Let's build" | "something") keep the figure centred in the closing frame
const END_ROWS: Row[] = [{ l: { t: "Let's build" }, r: { t: 'something' } }, { r: { t: 'real.', serif: true } }]
const END_ROWS_N: Row[] = [{ l: { t: "Let's build" } }, { l: { t: 'something' } }, { l: { t: 'real.', serif: true } }]

const IMG_ASPECT = 687 / 1135

export function Stage({ z, variant, index }: { z: number; variant: Variant; index: number }) {
  const { size } = useThree()
  const narrow = S.narrow
  const aspect = size.width / size.height
  const tex = useTexture(portraitUrl)
  useMemo(() => { tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8; tex.needsUpdate = true }, [tex])

  // frame geometry at the portrait plane and the text plane
  const vh0 = 2 * CAM_DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
  const vw0 = vh0 * aspect
  const textDist = CAM_DIST - TEXT_Z
  const vwText = vw0 * (textDist / CAM_DIST)
  const end = variant === 'contact'
  // closing frame: a slightly smaller figure that balances the text group rather than headlining the frame
  const H = narrow ? vh0 * (end ? (aspect > 0.6 ? 0.58 : 0.47) : 0.6) : vh0 * (end ? 0.9 : 0.98)
  const W = H * IMG_ASPECT

  const [gapX, setGapX] = useState(0)
  // hero: the figure stands in the gap of the split headline. closing: it stands in the right third, beside the text
  const px = end ? vw0 * (narrow ? (aspect > 0.6 ? 0.2 : 0.1) : 0.27) : narrow ? vw0 * 0.14 : gapX * (CAM_DIST / textDist)
  // desktop: crown of the head sits ~22% down the frame; phone: figure stands at the bottom edge
  const py = narrow ? -vh0 / 2 + H / 2 - 0.15 : vh0 * 0.28 - H * 0.49
  const headX = px - W * 0.035
  const headTop = py + H * (narrow ? 0.43 : 0.49)
  const textY = narrow ? vh0 * 0.33 * (textDist / CAM_DIST) : (py + H * 0.36) * (textDist / CAM_DIST)
  const gapWorld = W * 0.74 * (textDist / CAM_DIST)

  const portraitMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: portraitVert, fragmentShader: portraitFrag, transparent: true, depthWrite: true,
    uniforms: {
      map: { value: tex }, uTexel: { value: new THREE.Vector2(1 / 687, 1 / 1135) },
      uShadowY: { value: 0.9 }, uShadowAmt: { value: variant === 'hero' ? 0.55 : 0 }, uFade: { value: 0.16 },
      uWarm: { value: 0 }, uOpacity: { value: 1 }, uRim: { value: 1 },
    },
  }), [tex])

  // ---------- clouds ----------
  const head = useMemo(() => {
    const all = cumulus({ c: [0, -0.35, 0], w: 2.9, h: 1.05, d: 0.75, n: S.narrow ? 26 : 38, seed: 7, size: 1.05, flat: 0.3 })
    // rise a few puffs over the crown and keep the face clear at rest
    const back: Puff[] = [], front: Puff[] = []
    all.forEach((p) => (p.z < 0.12 ? back : front).push(p))
    front.forEach((p) => { p.y += 0.15 })
    return { back, front }
  }, [])
  const parted = useMemo(() => [
    ...cumulus({ c: [-2.6, -2.2, -3.4], w: 3.2, h: 1.2, d: 0.6, n: 22, seed: 41, size: 1 }),
    ...cumulus({ c: [2.7, -2.0, -3.6], w: 3.4, h: 1.3, d: 0.6, n: 24, seed: 43, size: 1 }),
  ], [])
  const waist = useMemo(() => cumulus({ c: [0, -0.6, 0], w: 13, h: 1.25, d: 1.4, n: S.narrow ? 36 : 56, seed: variant === 'hero' ? 11 : 13, size: 0.82, flat: 0.5 }), [])
  const banks = useMemo(() => variant === 'hero' ? [
    ...cumulus({ c: [-17, -8, -24], w: 18, h: 7, n: S.narrow ? 36 : 60, seed: 21, size: 1 }),
    ...cumulus({ c: [18, -8.5, -28], w: 20, h: 8, n: S.narrow ? 36 : 60, seed: 23, size: 1 }),
    ...cumulus({ c: [0, -12, -44], w: 70, h: 5, d: 10, n: S.narrow ? 40 : 60, seed: 25, size: 1.1 }),
    ...cumulus({ c: [-34, -2, -70], w: 30, h: 9, n: 30, seed: 27, size: 1 }),
    ...cumulus({ c: [30, -3, -80], w: 26, h: 8, n: 30, seed: 29, size: 1 }),
  ] : [
    ...cumulus({ c: [-14, -5, -20], w: 20, h: 6, n: S.narrow ? 36 : 60, seed: 61, size: 1 }),
    ...cumulus({ c: [15, -5.5, -22], w: 18, h: 6.5, n: S.narrow ? 36 : 60, seed: 63, size: 1 }),
    ...cumulus({ c: [0, -8, -34], w: 56, h: 4, d: 10, n: 60, seed: 65, size: 1.1 }),
  ], [])

  const root = useRef<THREE.Group>(null!)
  const headGrp = useRef<THREE.Group>(null!)
  const textGrp = useRef<THREE.Group>(null!)
  const partedGrp = useRef<THREE.Group>(null!)
  const portrait = useRef<THREE.Mesh>(null!)
  const st = useRef({ hx: 0, hy: 0, appear: -1 })

  useFrame((_, dt) => {
    const p = local(index)
    // only render while the camera is near this stage
    // the closing figure is visible from the start of the record, far ahead, so the glide has somewhere to go
    const near = variant === 'hero' ? S.s < 1.25 : S.s > 10.18
    root.current.visible = near
    if (!near) return
    const u = portraitMat.uniforms
    st.current.hx = damp(st.current.hx, S.px, 3, dt)
    st.current.hy = damp(st.current.hy, S.py, 3, dt)
    if (variant === 'hero') {
      // the cloud settles down over the face, swells, then swallows the camera
      const sink = sstep(0.1, 0.62, p)
      const swell = sstep(0.55, 0.95, p)
      const hg = headGrp.current
      hg.position.set(headX + st.current.hx * 0.14, headTop + 0.05 - sink * H * 0.13 + swell * 0.6, 0)
      hg.scale.setScalar((H / 5.6) * (1 + sink * 0.45 + swell * 2.4))
      u.uShadowY.value = 0.9 - sink * 0.14
      u.uShadowAmt.value = 0.45 + sink * 0.25
      textGrp.current.position.y = textY + p * (narrow ? 0.45 : 1.2)
      // the camera climbs through the headline plane: let the letters thin into the cloud first
      fadeText(textGrp.current, 1 - sstep(0.56, 0.78, p))
    } else {
      // the figure stays hidden through the record and the cloud passage; it emerges as the camera comes out under the deck
      const appear = sstep(10.22, 10.5, S.s)
      if (appear !== st.current.appear) {
        st.current.appear = appear
        root.current.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined
          if (m && (m as any).uniforms?.uOpacity) m.uniforms.uOpacity.value = appear
        })
      }
      const open = sstep(0.05, 0.6, p)
      partedGrp.current.position.set(headX, headTop - 0.1, 0)
      partedGrp.current.scale.set((H / 5.6) * (1 + open * 0.9), H / 5.6, H / 5.6)
      u.uWarm.value = 0.25 * (1 - open)
      textGrp.current.position.y = textY + (1 - sstep(0, 0.5, p)) * -0.6
      // the closing words are page text (left column), so there is no 3D headline to fade here
    }
  })

  const textColor = variant === 'hero' ? '#ffffff' : '#122027'
  const textShadow = variant === 'hero' ? '#0b3a57' : '#ffffff'

  return (
    <group ref={root} position={[0, 0, z]}>
      <CloudField puffs={banks} renderOrder={-2} hazeNear={14} hazeFar={110} />
      <group ref={textGrp} position={[0, textY, TEXT_Z]}>
        {variant === 'hero' && <Headline
          key={`${narrow}`}
          rows={variant === 'hero' ? (narrow ? HERO_ROWS_N : HERO_ROWS) : (narrow ? END_ROWS_N : END_ROWS)}
          mode={narrow ? 'stack' : 'split'}
          avail={vwText}
          fill={narrow ? 0.86 : 0.9}
          gap={narrow ? 0 : gapWorld}
          lineHeight={narrow ? 0.98 : 1.02}
          color={textColor}
          shadow={textShadow}
          onLayout={({ ox }) => setGapX(ox)}
        />}
      </group>
      {variant === 'hero' && (
        <group ref={headGrp} position={[headX, headTop, 0]}>
          <CloudField puffs={head.back} renderOrder={1} hazeNear={60} hazeFar={200} />
        </group>
      )}
      <mesh ref={portrait} position={[px, py, 0]} material={portraitMat} renderOrder={2}>
        <planeGeometry args={[W, H]} />
      </mesh>
      {variant === 'hero' ? (
        <HeadFront headX={headX} headTop={headTop} puffs={head.front} sourceRef={headGrp} />
      ) : (
        <group ref={partedGrp} position={[headX, headTop, 0]}>
          <CloudField puffs={parted} renderOrder={-1} hazeNear={60} hazeFar={200} />
        </group>
      )}
      <CloudField puffs={waist} position={[end ? px : px * 0.5, py - H * 0.3, 1.1]} renderOrder={4} hazeNear={60} hazeFar={200} />
      {variant === 'hero' && <HeroArtifacts narrow={narrow} />}
    </group>
  )
}

/** troika text exposes fillOpacity/outlineOpacity; fade a whole headline without touching layout */
function fadeText(g: THREE.Group, a: number) {
  g.visible = a > 0.01
  g.traverse((o) => {
    const t = o as THREE.Object3D & { fillOpacity?: number; outlineOpacity?: number }
    if (t.fillOpacity !== undefined && Math.abs(t.fillOpacity - a) > 0.004) { t.fillOpacity = a; t.outlineOpacity = 0.16 * a }
  })
}

/** Front half of the head cloud. Mirrors the back half's transform but draws after the portrait. */
function HeadFront({ headX, headTop, puffs, sourceRef }: { headX: number; headTop: number; puffs: Puff[]; sourceRef: React.MutableRefObject<THREE.Group> }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => {
    const s = sourceRef.current
    if (!s) return
    ref.current.position.copy(s.position)
    ref.current.scale.copy(s.scale)
  })
  return (
    <group ref={ref} position={[headX, headTop, 0]}>
      <CloudField puffs={puffs} renderOrder={3} hazeNear={60} hazeFar={200} />
    </group>
  )
}
