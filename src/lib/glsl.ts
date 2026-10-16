import * as THREE from 'three'
export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
`

// ---------- baked noise ----------
// Two channels of tileable 5-octave value-noise fbm, baked once on the GPU into a 512² texture.
// Shaders sample it instead of evaluating fbm per fragment, which matters under heavy cloud overdraw.
export const NOISE_PERIOD = 6.0
export const noiseU = { uNoise: { value: (() => { const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); t.needsUpdate = true; return t })() as THREE.Texture } }

export const NOISE_TEX = /* glsl */ `
uniform sampler2D uNoise;
float fbmA(vec2 p){ return texture2D(uNoise, p * ${(1 / 6).toFixed(6)}).r; }
float fbmB(vec2 p){ return texture2D(uNoise, p * ${(1 / 6).toFixed(6)}).g; }
`

const bakeFrag = /* glsl */ `
varying vec2 vUv;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p, float per, vec2 seed){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h(mod(i, per) + seed), b = h(mod(i + vec2(1, 0), per) + seed), c = h(mod(i + vec2(0, 1), per) + seed), d = h(mod(i + vec2(1, 1), per) + seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, float per, vec2 seed){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * vn(p, per, seed); p *= 2.0; per *= 2.0; a *= 0.5; seed += 7.13; }
  return v;
}
void main(){
  vec2 p = vUv * ${NOISE_PERIOD.toFixed(1)};
  gl_FragColor = vec4(fbm(p, ${NOISE_PERIOD.toFixed(1)}, vec2(0.0)), fbm(p, ${NOISE_PERIOD.toFixed(1)}, vec2(41.7, 13.1)), 0.0, 1.0);
}`

/** Bake the noise texture with this renderer. Returns a disposer. */
export function bakeNoise(gl: THREE.WebGLRenderer) {
  const rt = new THREE.WebGLRenderTarget(512, 512, {
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: true, depthBuffer: false, colorSpace: THREE.NoColorSpace,
  })
  const scene = new THREE.Scene()
  const mat = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: bakeFrag, depthTest: false, depthWrite: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  quad.frustumCulled = false
  scene.add(quad)
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const prev = gl.getRenderTarget()
  gl.setRenderTarget(rt)
  gl.render(scene, cam)
  gl.setRenderTarget(prev)
  quad.geometry.dispose(); mat.dispose()
  noiseU.uNoise.value = rt.texture
  return () => rt.dispose()
}
