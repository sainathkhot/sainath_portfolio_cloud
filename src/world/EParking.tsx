import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { S, sstep, local, clamp, damp, copyEdge } from '../store'
import { FONTS } from '../lib/fonts'
import { CloudField, cumulus, cloudSea } from './Cloud'
import { useCanvasTexture, MONO } from './Artifacts'
import { FOV } from './Stage'

// E-Parking: one vehicle at one gate, from plate to barrier.
// A single-lane entry floats on the cloud bed; the market's canopies sit in the haze behind it.
export const EP_Z = -100
const SECTION = 6

const STOP_X = -0.45                       // car centre when it waits at the stop line
const CAM_HEAD = new THREE.Vector3(3.0, 1.45, -1.05)
const PLATE = new THREE.Vector3(STOP_X + 1.03, -0.27, 0)
const NODES = {
  identify: CAM_HEAD.clone().add(new THREE.Vector3(0, 0.22, 0)),
  classify: new THREE.Vector3(STOP_X, 0.75, 0),
  fee: new THREE.Vector3(1.32, 0.95, -1.62),
  pay: new THREE.Vector3(0.82, 0.55, -1.5),
  access: new THREE.Vector3(1.95, 0.62, -1.28),
}
const PATH = new THREE.CatmullRomCurve3([
  NODES.identify, new THREE.Vector3(1.2, 1.35, -0.4), NODES.classify, new THREE.Vector3(0.6, 1.15, -1.0),
  NODES.fee, NODES.pay, new THREE.Vector3(1.5, 0.75, -1.35), NODES.access,
], false, 'centripetal')
// fraction of the path at each node, by nearest sample
const nodeT = (v: THREE.Vector3) => {
  let best = 0, bd = 1e9
  for (let i = 0; i <= 200; i++) { const d = PATH.getPoint(i / 200).distanceTo(v); if (d < bd) { bd = d; best = i / 200 } }
  return best
}
const T = { identify: 0, classify: nodeT(NODES.classify), fee: nodeT(NODES.fee), pay: nodeT(NODES.pay), access: 1 }

const C_COPPER = new THREE.Color('#F28A28')
const tmp = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)

/** the story, as a function of section progress e */
function phases(e: number) {
  return {
    arrive: sstep(0.03, 0.27, e),
    identify: sstep(0.27, 0.33, e),
    classify: sstep(0.38, 0.44, e),
    fee: sstep(0.5, 0.56, e),
    pay: sstep(0.62, 0.68, e),
    access: sstep(0.74, 0.84, e),
    leave: sstep(0.86, 1.0, e),
  }
}

function useFit() {
  const { size } = useThree()
  return useMemo(() => {
    const aspect = size.width / size.height
    const visW = 2 * 11.5 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect
    const free = S.narrow ? 1 : Math.max(0.4, (size.width - copyEdge() - 28) / size.width)
    return clamp((visW * free * 0.95) / 9.4, 0.3, 0.95)
  }, [size.width, size.height])
}

export function EParking() {
  const fit = useFit()
  const root = useRef<THREE.Group>(null!)
  const car = useRef<THREE.Group>(null!)
  const wheels = useRef<THREE.Mesh[]>([])
  const arm = useRef<THREE.Group>(null!)
  const cone = useRef<THREE.Mesh>(null!)
  const plateMat = useRef<THREE.MeshStandardMaterial>(null!)
  const bracket = useRef<THREE.LineSegments>(null!)
  const screenMat = useRef<THREE.MeshStandardMaterial>(null!)
  const posMat = useRef<THREE.MeshStandardMaterial>(null!)
  const bead = useRef<THREE.Mesh>(null!)
  const trail = useRef<THREE.Mesh>(null!)
  const glow = useRef<THREE.PointLight>(null!)
  const labels = useRef<Record<string, any>>({})
  const st = useRef({ carX: -4.4, prevX: -4.4, beadT: 0 })

  const bed = useMemo(() => [
    ...cloudSea({ c: [0, -3.3, -5], w: 32, d: 13, n: S.narrow ? 70 : 120, seed: 401, size: 1.3 }),
    ...cumulus({ c: [-13, -3, -10], w: 12, h: 5, n: 40, seed: 403 }),
    ...cumulus({ c: [13, -3.4, -12], w: 14, h: 6, n: 40, seed: 405 }),
  ], [])
  // the bank the camera descends through on arrival
  const banks = useMemo(() => [
    ...cumulus({ c: [-6, -1.2, 17], w: 14, h: 5, n: 36, seed: 407 }),
    ...cumulus({ c: [7, -1, 19], w: 14, h: 5, n: 36, seed: 409 }),
  ], [])
  // wisps that drift across the lane's ends so it dissolves into the sky instead of ending
  const ends = useMemo(() => [
    ...cumulus({ c: [-4.0, -1.0, 0.3], w: 4.0, h: 1.2, d: 1.8, n: 18, seed: 411, size: 0.9 }),
    ...cumulus({ c: [5.4, -1.0, 0.2], w: 4.0, h: 1.2, d: 1.8, n: 18, seed: 413, size: 0.9 }),
    // a low bank in front of the market roofs so they read as distance, not props
    ...cumulus({ c: [-1, -1.4, -5.6], w: 14, h: 1.2, d: 1.2, n: 26, seed: 415, size: 0.9 }),
  ], [])

  const plateTex = useCanvasTexture((g, w, h) => {
    g.fillStyle = '#F3F3EC'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#122027'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8)
    g.fillStyle = '#122027'; g.font = `500 54px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('ABC 123 XY', w / 2, h / 2 + 3)
  }, 360, 100)
  const armTex = useCanvasTexture((g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#F3F3EC' : '#F28A28'; g.fillRect((i * w) / 8, 0, w / 8, h) }
  }, 256, 16)

  const geo = useMemo(() => ({
    lane: new RoundedBoxGeometry(8.6, 0.16, 2.3, 2, 0.05),
    island: new RoundedBoxGeometry(2.6, 0.22, 0.9, 2, 0.05),
    body: new RoundedBoxGeometry(2.05, 0.4, 0.92, 4, 0.14),
    cabin: new RoundedBoxGeometry(1.08, 0.36, 0.82, 4, 0.13),
    booth: new RoundedBoxGeometry(0.62, 1.12, 0.5, 3, 0.06),
    head: new RoundedBoxGeometry(0.42, 0.2, 0.22, 3, 0.05),
    wheel: new THREE.CylinderGeometry(0.17, 0.17, 0.14, 24),
    box: new THREE.EdgesGeometry(new THREE.BoxGeometry(2.35, 0.95, 1.12)),
    hall: new THREE.CylinderGeometry(0.85, 0.85, 5.2, 3, 1),
  }), [])
  const dash = useMemo(() => Array.from({ length: 4 }, (_, i) => -3.0 + i * 1.1).filter((x) => x < 0.4), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = S.s
    const on = s > 5.9 && s < 7.12
    root.current.visible = on
    if (!on) return
    const e = local(SECTION)
    const ph = phases(e)

    // vehicle: decelerate to the stop line, wait, then pull through once the barrier is up
    const x = -4.4 + (STOP_X + 4.4) * (1 - Math.pow(1 - ph.arrive, 3)) + ph.leave * ph.leave * 7
    st.current.prevX = st.current.carX
    st.current.carX = x
    car.current.position.x = x
    const roll = (x - st.current.prevX) / 0.17
    wheels.current.forEach((w) => { if (w) w.rotation.y -= roll })
    car.current.position.y = Math.sin(x * 3) * 0.004 // a little life on the road

    // identify: the camera's cone finds the plate
    const scan = ph.identify * (1 - ph.access * 0.85)
    const c = cone.current
    c.visible = scan > 0.01
    tmp.copy(PLATE).setX(x + 1.03)
    const len = CAM_HEAD.distanceTo(tmp)
    c.position.copy(CAM_HEAD).lerp(tmp, 0.5)
    c.quaternion.setFromUnitVectors(up, tmp.sub(CAM_HEAD).normalize().negate())
    c.scale.set(1, len, 1)
    ;(c.material as THREE.MeshBasicMaterial).opacity = 0.32 * scan
    plateMat.current.emissiveIntensity = scan * 0.9

    // classify: a bracket closes around the vehicle
    const b = bracket.current
    b.position.x = x
    b.scale.setScalar(1.12 - ph.classify * 0.12)
    ;(b.material as THREE.LineBasicMaterial).opacity = ph.classify * (1 - ph.leave)
    b.visible = ph.classify > 0.01

    // fee and payment light the booth; access lifts the arm
    screenMat.current.emissiveIntensity = 0.08 + ph.fee * 0.9 * (1 - ph.leave)
    posMat.current.emissiveIntensity = ph.pay * 1.1 * (1 - ph.leave)
    arm.current.rotation.x = -ph.access * 1.15 * (1 - sstep(0.96, 1.0, e))
    glow.current.intensity = (ph.fee * 2.2 + ph.pay * 2.5) * (1 - ph.leave)

    // the path: a bead carries the decision from camera to barrier
    const target = ph.access > 0.5 ? T.access : ph.pay > 0.5 ? T.pay : ph.fee > 0.5 ? T.fee : ph.classify > 0.5 ? T.classify : 0
    st.current.beadT = damp(st.current.beadT, target, 2.6, dt)
    PATH.getPoint(st.current.beadT, bead.current.position)
    bead.current.visible = ph.identify > 0.5 && ph.leave < 0.6
    ;(trail.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.5 * ph.identify * (1 - ph.leave)

    const lv = labels.current
    const show = (k: string, v: number) => { const t = lv[k]; if (t) { t.fillOpacity = v; t.visible = v > 0.01 } }
    const after = 1 - ph.leave
    show('identify', ph.identify * after * (0.45 + 0.55 * (1 - ph.classify)))
    show('classify', ph.classify * after * (0.45 + 0.55 * (1 - ph.fee)))
    show('fee', ph.fee * after * (0.45 + 0.55 * (1 - ph.pay)))
    show('pay', ph.pay * after * (0.45 + 0.55 * (1 - ph.access)))
    show('access', ph.access * after)

    const status = e < 0.27 ? 'Vehicle approaching' : e < 0.38 ? 'Plate identified' : e < 0.5 ? 'Vehicle type classified'
      : e < 0.62 ? 'Fee set by vehicle type' : e < 0.74 ? 'Payment at the POS' : e < 0.86 ? 'Barrier raised' : 'Entry complete'
    if (S.status[4] !== status) S.status[4] = status
  })

  const lab = (k: string) => (el: any) => { if (el) labels.current[k] = el }
  const L = (k: keyof typeof NODES, text: string, dx = 0, dy = 0.17) => (
    <Text ref={lab(k)} font={FONTS.mono} fontSize={0.13} color="#122027" letterSpacing={0.08}
      position={[NODES[k].x + dx, NODES[k].y + dy, NODES[k].z]} anchorX="center" anchorY="bottom" fillOpacity={0}>{text}</Text>
  )

  return (
    <group ref={root} position={[0, 0, EP_Z]}>
      <CloudField puffs={bed} renderOrder={-1} hazeNear={18} hazeFar={90} />
      <CloudField puffs={banks} renderOrder={-1} hazeNear={8} hazeFar={90} />
      <group scale={fit} position={[0, S.narrow ? 0.3 : 0, 0]}>
        {/* the lane */}
        <mesh geometry={geo.lane} position={[0.7, -0.62, 0]}>
          <meshStandardMaterial color="#2a383e" roughness={0.85} />
        </mesh>
        {[-1.05, 1.05].map((z) => (
          <mesh key={z} position={[0.7, -0.535, z]}><boxGeometry args={[8.2, 0.01, 0.035]} /><meshStandardMaterial color="#F3F3EC" roughness={0.6} /></mesh>
        ))}
        {dash.map((dx) => (
          <mesh key={dx} position={[dx, -0.535, 0]}><boxGeometry args={[0.55, 0.01, 0.05]} /><meshStandardMaterial color="#F3F3EC" roughness={0.6} transparent opacity={0.75} /></mesh>
        ))}
        <mesh position={[0.95, -0.535, 0]}><boxGeometry args={[0.07, 0.012, 2.05]} /><meshStandardMaterial color="#F28A28" roughness={0.5} /></mesh>

        {/* the gate island: booth, POS, barrier */}
        <mesh geometry={geo.island} position={[1.35, -0.43, -1.62]}>
          <meshStandardMaterial color="#E7E3D7" roughness={0.9} />
        </mesh>
        <group position={[1.32, 0.2, -1.78]}>
          <mesh geometry={geo.booth}><meshStandardMaterial color="#F3F3EC" roughness={0.55} /></mesh>
          <mesh position={[0, 0.6, 0]}><boxGeometry args={[0.72, 0.06, 0.6]} /><meshStandardMaterial color="#1d2c33" roughness={0.5} /></mesh>
          <mesh position={[0, 0.2, 0.252]}>
            <planeGeometry args={[0.42, 0.26]} />
            <meshStandardMaterial ref={screenMat} color="#16252c" emissive="#9CD3E3" emissiveIntensity={0.08} roughness={0.3} />
          </mesh>
          <mesh position={[0, -0.12, 0.252]}><planeGeometry args={[0.16, 0.025]} /><meshStandardMaterial color="#122027" /></mesh>
        </group>
        <group position={[0.82, 0.38, -1.5]} rotation={[-0.5, 0.25, 0]}>
          <mesh><boxGeometry args={[0.14, 0.03, 0.22]} /><meshStandardMaterial color="#1d2c33" roughness={0.4} /></mesh>
          <mesh position={[0, 0.017, -0.03]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.1, 0.11]} />
            <meshStandardMaterial ref={posMat} color="#16252c" emissive="#F28A28" emissiveIntensity={0} />
          </mesh>
        </group>
        <pointLight ref={glow} position={[1.2, 0.9, -0.9]} color="#ffb05a" distance={4.5} decay={1.6} intensity={0} />
        <group position={[1.95, -0.06, -1.28]}>
          <mesh><boxGeometry args={[0.22, 0.86, 0.22]} /><meshStandardMaterial color="#1d2c33" roughness={0.5} /></mesh>
          <group ref={arm} position={[0, 0.34, 0]}>
            <mesh position={[0, 0, 1.18]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[2.36, 0.06, 0.06]} />
              <meshStandardMaterial map={armTex} roughness={0.5} />
            </mesh>
          </group>
        </group>

        {/* the ANPR camera, ahead of the stop line, looking back down the lane */}
        <group position={[3.3, 0, -1.35]}>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.04, 0.05, 2.0, 12]} /><meshStandardMaterial color="#1d2c33" roughness={0.4} metalness={0.3} /></mesh>
          <mesh position={[-0.14, 1.2, 0.15]} rotation={[0.6, 0, 0]}><cylinderGeometry args={[0.025, 0.025, 0.5, 8]} /><meshStandardMaterial color="#1d2c33" /></mesh>
        </group>
        <group position={CAM_HEAD.toArray()} rotation={[0, 0.3, -0.32]}>
          <mesh geometry={geo.head}><meshStandardMaterial color="#F3F3EC" roughness={0.35} /></mesh>
          <mesh position={[-0.215, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.06, 0.06, 0.02, 20]} /><meshStandardMaterial color="#122027" emissive="#F28A28" emissiveIntensity={0.4} /></mesh>
        </group>
        <mesh ref={cone}>
          <coneGeometry args={[0.32, 1, 32, 1, true]} />
          <meshBasicMaterial color="#F28A28" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>

        {/* the vehicle */}
        <group ref={car} position={[-4.4, 0, 0]}>
          <mesh geometry={geo.body} position={[0, -0.23, 0]}><meshPhysicalMaterial color="#35505b" roughness={0.32} metalness={0.25} clearcoat={0.8} clearcoatRoughness={0.2} /></mesh>
          <mesh geometry={geo.cabin} position={[-0.12, 0.12, 0]}><meshPhysicalMaterial color="#cfe4ea" roughness={0.08} clearcoat={1} metalness={0.1} /></mesh>
          {[[-0.62, 0.42], [0.62, 0.42], [-0.62, -0.42], [0.62, -0.42]].map(([wx, wz], i) => (
            <mesh key={i} ref={(el) => { if (el) wheels.current[i] = el }} geometry={geo.wheel} position={[wx, -0.43, wz]} rotation={[Math.PI / 2, 0, 0]}>
              <meshStandardMaterial color="#122027" roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[1.03, -0.27, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.36, 0.1]} />
            <meshStandardMaterial ref={plateMat} map={plateTex} emissive="#F28A28" emissiveIntensity={0} roughness={0.5} />
          </mesh>
          {[-0.3, 0.3].map((hz) => (
            <mesh key={hz} position={[1.028, -0.16, hz]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.16, 0.05]} /><meshStandardMaterial color="#fff6e0" emissive="#fff1cc" emissiveIntensity={0.6} /></mesh>
          ))}
        </group>
        <lineSegments ref={bracket} geometry={geo.box} position={[STOP_X, -0.17, 0]}>
          <lineBasicMaterial color="#F28A28" transparent opacity={0} />
        </lineSegments>

        {/* the decision path */}
        <mesh ref={trail}>
          <tubeGeometry args={[PATH, 120, 0.008, 6, false]} />
          <meshBasicMaterial color="#F28A28" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <mesh ref={bead}><sphereGeometry args={[0.045, 16, 12]} /><meshStandardMaterial color="#F28A28" emissive="#F28A28" emissiveIntensity={0.9} /></mesh>
        {L('identify', '01  IDENTIFY', 0, 0.12)}
        {L('classify', '02  CLASSIFY', 0, 0.06)}
        {L('fee', '03  FEE', 0, 0.12)}
        {L('pay', '04  PAY', -0.12, 0.08)}
        {L('access', '05  ACCESS', 0.35, 0.22)}

        {/* Garki market: long hall roofs far back, half lost in a low bank of cloud */}
        {[[-4.2, -7.2, 1], [1.4, -8.4, 0.85], [6.2, -7.6, 0.95]].map(([hx, hz, sc], i) => (
          <mesh key={i} geometry={geo.hall} position={[hx, -0.75, hz]} rotation={[0, 0, Math.PI / 2]} scale={[sc, 1, sc]}>
            <meshStandardMaterial color={i === 1 ? '#d9b48c' : '#e8dccb'} roughness={0.9} flatShading />
          </mesh>
        ))}
        <CloudField puffs={ends} renderOrder={6} hazeNear={20} hazeFar={90} />
      </group>
    </group>
  )
}
