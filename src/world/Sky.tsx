import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { NOISE_TEX, noiseU } from '../lib/glsl'
import { S } from '../store'

export const SUN_DIR = new THREE.Vector3(0.62, 0.42, -1).normalize()

export const skyU = {
  uSun: { value: SUN_DIR.clone() },
  uWarm: { value: 0 },
  uBright: { value: 0 },
  uTint: { value: new THREE.Color('#9CD3E3') },
  uTintAmt: { value: 0 },
  uTime: { value: 0 },
}

const skyFrag = /* glsl */ `
uniform vec3 uSun; uniform float uWarm; uniform float uBright; uniform vec3 uTint; uniform float uTintAmt; uniform float uTime;
varying vec3 vDir;
${NOISE_TEX}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.10, 0.42, 0.70);
  vec3 mid    = vec3(0.27, 0.64, 0.83);
  vec3 horiz  = vec3(0.80, 0.91, 0.95);
  vec3 below  = vec3(0.88, 0.93, 0.94);
  // warm evening palette for the record
  zenith = mix(zenith, vec3(0.33, 0.52, 0.70), uWarm);
  mid    = mix(mid,    vec3(0.80, 0.72, 0.62), uWarm);
  horiz  = mix(horiz,  vec3(0.99, 0.84, 0.62), uWarm);
  below  = mix(below,  vec3(0.98, 0.86, 0.72), uWarm);
  vec3 col = h > 0.0 ? mix(mix(horiz, mid, smoothstep(-0.02, 0.12, h)), zenith, smoothstep(0.1, 0.5, h)) : mix(horiz, below, smoothstep(0.0, -0.3, h));
  // high cirrus wisps
  vec2 sp = d.xz / max(0.18, d.y + 0.25) * 1.4 + vec2(uTime * 0.004, 0.0);
  float w = fbmA(sp * vec2(0.6, 2.2));
  col = mix(col, vec3(1.0), smoothstep(0.55, 0.85, w) * 0.22 * smoothstep(0.05, 0.4, h));
  float sd = max(dot(d, normalize(uSun)), 0.0);
  vec3 sunCol = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.78, 0.48), uWarm);
  col += sunCol * (pow(sd, 6.0) * 0.32 + pow(sd, 60.0) * 0.45 + pow(sd, 900.0) * 1.2);
  col = mix(col, col + uTint * 0.35, uTintAmt);
  col = mix(col, vec3(0.97, 0.98, 0.97), uBright * 0.55 * (1.0 - smoothstep(0.1, 0.9, h) * 0.5));
  gl_FragColor = vec4(col, 1.0);
}`

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

export function Sky() {
  const ref = useRef<THREE.Mesh>(null!)
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: { ...skyU, ...noiseU }, side: THREE.BackSide, depthWrite: false }), [])
  useFrame(({ camera }) => { ref.current.position.copy(camera.position) })
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[400, 48, 24]} />
    </mesh>
  )
}

// A soft cloud veil in front of the lens: how the camera passes through cloud.
export const veilU = { uAmt: { value: 0 }, uTime: { value: 0 }, uWarm: { value: 0 } }
const veilFrag = /* glsl */ `
uniform float uAmt; uniform float uTime; uniform float uWarm;
varying vec2 vUv;
${NOISE_TEX}
void main(){
  vec2 p = vUv * vec2(3.0, 1.8);
  float n = fbmA(p + vec2(uTime * 0.05, uTime * 0.02));
  float n2 = fbmB(p * 2.3 - uTime * 0.03);
  float edge = 1.0 - length(vUv - 0.5) * 1.1;
  float a = smoothstep(0.0, 1.0, uAmt * 1.9 - 0.45 + (n - 0.5) * 0.9 + edge * 0.4 * uAmt);
  vec3 col = mix(vec3(0.88, 0.92, 0.95), vec3(1.0, 0.995, 0.985), smoothstep(0.25, 0.75, n2));
  col = mix(col, col * vec3(1.0, 0.95, 0.88), uWarm);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`

export function Veil() {
  const ref = useRef<THREE.Mesh>(null!)
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: veilFrag, uniforms: { ...veilU, ...noiseU }, transparent: true, depthTest: false, depthWrite: false,
  }), [])
  useFrame(({ camera }) => {
    const m = ref.current
    const cam = camera as THREE.PerspectiveCamera
    m.visible = veilU.uAmt.value > 0.004
    if (!m.visible) return
    m.position.copy(cam.position)
    m.quaternion.copy(cam.quaternion)
    m.translateZ(-0.5)
    const h = 2 * 0.5 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.08
    m.scale.set(h * cam.aspect, h, 1)
  })
  return <mesh ref={ref} material={mat} renderOrder={1000} frustumCulled={false}><planeGeometry args={[1, 1]} /></mesh>
}

// Sunlit specks that wrap around the camera, giving the air depth.
export function Dust() {
  const { size } = useThree()
  const count = S.narrow ? 220 : 520
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const p = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) { p[i * 3] = Math.random() * 24 - 12; p[i * 3 + 1] = Math.random() * 14 - 7; p[i * 3 + 2] = Math.random() * 24 - 12 }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return g
  }, [count])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uPx: { value: size.height }, uWarm: skyU.uWarm, uSpeed: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform vec3 uCam; uniform float uTime; uniform float uPx; uniform float uSpeed; varying float vA;
      void main(){
        vec3 p = position + vec3(uTime * 0.12 * uSpeed, sin(uTime * 0.3 + position.x) * 0.2, 0.0);
        vec3 box = vec3(24.0, 14.0, 24.0);
        p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(uPx * 0.0035 * (8.0 / d), 1.0, 6.0);
        vA = smoothstep(1.0, 3.0, d) * (1.0 - smoothstep(9.0, 12.0, d));
      }`,
    fragmentShader: /* glsl */ `
      uniform float uWarm; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r) * vA * 0.55;
        gl_FragColor = vec4(mix(vec3(1.0), vec3(1.0, 0.86, 0.6), uWarm), a); }`,
  }), [])
  const t = useRef({ acc: 0, speed: 1 })
  useFrame(({ camera }, dt) => {
    mat.uniforms.uCam.value.copy(camera.position)
    t.current.speed += ((S.atmos >= 0 ? 3.5 : 1) - t.current.speed) * 0.04
    if (!S.reduced) t.current.acc += Math.min(dt, 0.05) * t.current.speed
    mat.uniforms.uTime.value = t.current.acc
  })
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />
}
