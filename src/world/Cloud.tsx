import * as THREE from 'three'
import { forwardRef, useMemo } from 'react'
import { NOISE_TEX, noiseU } from '../lib/glsl'
import { hash } from '../store'

export type Puff = { x: number; y: number; z: number; s: number; seed: number; shade: number }

// Uniforms shared by every cloud in the world, so light and weather change everywhere at once.
export const cloudShared = {
  uTime: { value: 0 },
  uSunView: { value: new THREE.Vector3(0.5, 0.6, 0.6).normalize() },
  uLit: { value: new THREE.Color(1.0, 0.995, 0.98) },
  uShadow: { value: new THREE.Color(0.70, 0.775, 0.86) },
  uHaze: { value: new THREE.Color(0.80, 0.90, 0.945) },
  uGlow: { value: 0 },
}

const vert = /* glsl */ `
attribute vec4 aPuff;   // xyz centre, w radius
attribute vec2 aInfo;   // seed, shade (0 = cloud base, 1 = top)
uniform float uTime;
varying vec2 vUv; varying float vSeed; varying float vShade; varying float vDist; varying float vNear;
void main(){
  vec3 c = aPuff.xyz;
  float t = uTime * 0.06 + aInfo.x * 6.2831;
  c += vec3(sin(t) * 0.05, cos(t * 0.8) * 0.035, 0.0) * aPuff.w;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float sc = aPuff.w * length(modelMatrix[0].xyz);
  // gentle breathing so puffs never look like stamped sprites
  sc *= 1.0 + 0.035 * sin(uTime * 0.21 + aInfo.x * 40.0);
  mv.xy += position.xy * sc;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy; vSeed = aInfo.x; vShade = aInfo.y; vDist = -mv.z;
  vNear = smoothstep(sc * 0.25, sc * 1.4, -mv.z);
}`

const frag = /* glsl */ `
uniform vec3 uSunView; uniform vec3 uLit; uniform vec3 uShadow; uniform vec3 uHaze;
uniform float uOpacity; uniform float uTime; uniform float uGlow; uniform float uHazeNear; uniform float uHazeFar;
varying vec2 vUv; varying float vSeed; varying float vShade; varying float vDist; varying float vNear;
${NOISE_TEX}
void main(){
  vec2 p = vUv;
  float r = length(p);
  if (r > 1.0) discard;
  vec2 q = p * 1.25 + vec2(vSeed * 31.0, vSeed * 17.0) + vec2(uTime * 0.012, 0.0);
  float n = fbmA(q);
  float n2 = fbmB(q * 2.9 + 4.0);
  // cauliflower edge: a firm silhouette broken by small billows
  float edge = r + (n - 0.5) * 0.42 + (n2 - 0.5) * 0.16;
  float d = 1.0 - smoothstep(0.6, 0.86, edge);
  d *= 0.82 + 0.18 * smoothstep(0.2, 0.7, n2);
  if (d < 0.004) discard;
  float z = sqrt(max(0.0, 1.0 - r * r));
  vec3 nrm = normalize(vec3(p * 0.95 + (vec2(n, n2) - 0.5) * 0.7, z + 0.1));
  float diff = max(dot(nrm, uSunView), 0.0);
  float top = clamp(nrm.y * 0.5 + 0.5, 0.0, 1.0);
  float light = 0.42 + 0.5 * diff + 0.3 * top;
  light *= mix(0.74, 1.06, vShade);
  light *= 0.9 + 0.2 * n2;
  vec3 col = mix(uShadow, uLit, smoothstep(0.3, 0.95, light));
  // silver lining where thin edges face the sun
  float thin = smoothstep(0.62, 0.86, edge);
  float facing = max(dot(normalize(p + 1e-4), normalize(uSunView.xy + 1e-4)), 0.0);
  col += thin * facing * (0.16 + uGlow * 0.2) * vec3(1.0, 0.95, 0.86);
  float haze = smoothstep(uHazeNear, uHazeFar, vDist);
  col = mix(col, uHaze, haze * 0.75);
  gl_FragColor = vec4(col, d * uOpacity * vNear * (1.0 - haze * 0.35));
}`

export function makeCloudMaterial(opacity = 1, hazeNear = 22, hazeFar = 130) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    uniforms: { ...cloudShared, ...noiseU, uOpacity: { value: opacity }, uHazeNear: { value: hazeNear }, uHazeFar: { value: hazeFar } },
  })
}

const quad = new THREE.PlaneGeometry(2, 2)

export function makeCloudGeometry(puffs: Puff[]) {
  const g = new THREE.InstancedBufferGeometry()
  g.index = quad.index
  g.setAttribute('position', quad.getAttribute('position'))
  const sorted = [...puffs].sort((a, b) => a.z - b.z)
  const a = new Float32Array(sorted.length * 4)
  const b = new Float32Array(sorted.length * 2)
  sorted.forEach((p, i) => { a.set([p.x, p.y, p.z, p.s], i * 4); b.set([p.seed, p.shade], i * 2) })
  g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(a, 4))
  g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(b, 2))
  g.instanceCount = sorted.length
  return g
}

type CumulusOpts = { c: [number, number, number]; w: number; h: number; d?: number; n: number; seed: number; size?: number; flat?: number }

/** A cumulus: flat dark base, domed lit top. Units are world units. */
export function cumulus({ c, w, h, d = w * 0.35, n, seed, size = 1, flat = 0.25 }: CumulusOpts): Puff[] {
  const out: Puff[] = []
  for (let i = 0; i < n; i++) {
    const r1 = hash(seed * 97 + i * 13.1), r2 = hash(seed * 31 + i * 7.7), r3 = hash(seed * 11 + i * 3.3), r4 = hash(seed + i * 1.9)
    const x = (r1 * 2 - 1) * (w / 2) * Math.sqrt(r4 * 0.6 + 0.4)
    const xn = x / (w / 2)
    const dome = Math.max(0.08, 1 - xn * xn)
    const hy = Math.pow(r2, 1.35) * h * dome
    const y = c[1] + hy
    const z = c[2] + (r3 * 2 - 1) * d * Math.sqrt(dome)
    const base = hy < h * flat
    const s = size * (w * 0.11) * (0.55 + 0.75 * hash(seed * 5 + i)) * (base ? 1.25 : 1) * (0.7 + 0.5 * dome)
    out.push({ x: c[0] + x, y: base ? c[1] + hy * 0.5 : y, z, s, seed: hash(seed * 3 + i * 0.37), shade: Math.min(1, hy / h + 0.15) })
  }
  return out
}

/** Flat, wide sheet of puffs: a cloud sea / bed seen from above or level. */
export function cloudSea({ c, w, d, n, seed, size = 1 }: { c: [number, number, number]; w: number; d: number; n: number; seed: number; size?: number }): Puff[] {
  const out: Puff[] = []
  for (let i = 0; i < n; i++) {
    const x = c[0] + (hash(seed + i * 1.37) - 0.5) * w
    const z = c[2] + (hash(seed * 2 + i * 2.11) - 0.5) * d
    const y = c[1] + (hash(seed * 3 + i * 0.73) - 0.3) * 0.9 * size
    out.push({ x, y, z, s: size * (1.2 + hash(seed * 4 + i) * 1.6), seed: hash(seed * 5 + i * 0.29), shade: 0.45 + 0.55 * hash(seed * 6 + i) })
  }
  return out
}

type FieldProps = { puffs: Puff[]; opacity?: number; renderOrder?: number; hazeNear?: number; hazeFar?: number } & JSX.IntrinsicElements['group']

export const CloudField = forwardRef<THREE.Mesh, FieldProps>(function CloudField({ puffs, opacity = 1, renderOrder = 0, hazeNear, hazeFar, ...group }, ref) {
  const geo = useMemo(() => makeCloudGeometry(puffs), [puffs])
  const mat = useMemo(() => makeCloudMaterial(opacity, hazeNear, hazeFar), [])
  mat.uniforms.uOpacity.value = opacity
  return (
    <group {...group}>
      <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={renderOrder} />
    </group>
  )
})
