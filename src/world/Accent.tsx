import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

/*
 * One shared accent point light for the whole world.
 *
 * three.js builds every lit material's shader for the number of lights it can see. The agent gate, the E-Parking
 * booth and the toolkit each used to carry their own point light inside a scene that is hidden when off screen, so
 * the number of visible point lights changed as you scrolled from one section to the next, and every visible
 * material recompiled its shader in the middle of the scroll: the stutter between sections. One light that never
 * leaves the scene keeps the count, and so every shader, the same from the first frame to the last.
 */
export const accentLight = new THREE.PointLight('#ffb05a', 0, 5, 1.6)

const claim = { i: 0, pos: new THREE.Vector3(), color: new THREE.Color(), distance: 5, decay: 1.6 }

/**
 * A scene asks for the accent light this frame, at an anchor of its own. The brightest claim wins; it is applied at
 * the start of the next frame (a frame's delay nobody can see).
 */
export function claimAccent(anchor: THREE.Object3D, intensity: number, color: THREE.Color, distance: number, decay: number) {
  if (!(intensity > claim.i)) return
  claim.i = intensity
  anchor.getWorldPosition(claim.pos)
  claim.color.copy(color)
  claim.distance = distance
  claim.decay = decay
}

/** Mount first in the world, so its frame callback runs before the scenes make their claims. */
export function Accent() {
  useFrame(() => {
    const L = accentLight
    L.intensity = claim.i
    if (claim.i > 0) { L.position.copy(claim.pos); L.color.copy(claim.color); L.distance = claim.distance; L.decay = claim.decay }
    claim.i = 0
  })
  return <primitive object={accentLight} />
}
