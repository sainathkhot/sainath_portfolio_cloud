import { Text } from '@react-three/drei'
import { useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FONTS } from '../lib/fonts'

export type Word = { t: string; serif?: boolean }
export type Row = { l?: Word; r?: Word }

type Props = {
  rows: Row[]
  mode: 'split' | 'stack'
  avail: number            // world width available at this depth
  fill?: number            // fraction of avail to fill
  gap: number              // split gap in world units (unscaled)
  lineHeight?: number
  color?: string
  shadow?: string
  maxScale?: number
  onLayout?: (o: { ox: number; sc: number; height: number }) => void
} & JSX.IntrinsicElements['group']

// Measures every word once troika has laid it out, then sets the block to fill the frame.
export function Headline({ rows, mode, avail, fill = 0.9, gap, lineHeight = 1.0, color = '#ffffff', shadow = '#0d3a55', maxScale = 3, onLayout, ...group }: Props) {
  const widths = useRef<Record<string, number>>({})
  const [lay, setLay] = useState<{ sc: number; ox: number } | null>(null)
  const keys: string[] = []
  rows.forEach((r, i) => { if (r.l) keys.push(`${i}l`); if (r.r) keys.push(`${i}r`) })

  const solve = () => {
    if (!keys.every((k) => widths.current[k] != null)) return
    let L = 0, R = 0, W = 0
    rows.forEach((r, i) => {
      const lw = widths.current[`${i}l`] ?? 0, rw = widths.current[`${i}r`] ?? 0
      L = Math.max(L, lw); R = Math.max(R, rw); W = Math.max(W, lw)
    })
    const sc = Math.min(maxScale, mode === 'split' ? (avail * fill - gap) / (L + R) : (avail * fill) / W)
    // ox: x of the gap centre so the whole block is centred on screen
    const ox = mode === 'split' ? ((L - R) / 2) * sc : (-W / 2) * sc
    setLay({ sc, ox })
    onLayout?.({ ox, sc, height: rows.length * lineHeight * sc })
  }
  useLayoutEffect(() => { solve() }, [avail, mode, gap])

  const sync = (k: string) => (m: THREE.Mesh & { textRenderInfo?: { blockBounds: number[] } }) => {
    const b = m.textRenderInfo?.blockBounds
    if (!b) return
    const w = b[2] - b[0]
    if (Math.abs((widths.current[k] ?? -1) - w) > 1e-4) { widths.current[k] = w; solve() }
  }

  const common = (w: Word) => ({
    font: w.serif ? FONTS.serif : FONTS.display,
    fontSize: w.serif ? 1.16 : 1,
    letterSpacing: w.serif ? -0.02 : -0.055,
    color,
    anchorY: 'middle' as const,
    outlineWidth: '9%', outlineBlur: '45%', outlineColor: shadow, outlineOpacity: 0.16,
    'material-toneMapped': false,
  })

  return (
    <group {...group} visible={!!lay}>
      <group position={[lay?.ox ?? 0, 0, 0]}>
        {rows.map((r, i) => (
          <group key={i} position={[0, -i * lineHeight * (lay?.sc ?? 1), 0]}>
            {r.l && (
              <Text {...common(r.l)} scale={lay?.sc ?? 1} anchorX={mode === 'split' ? 'right' : 'left'} position={[mode === 'split' ? -gap / 2 : 0, 0, 0]} onSync={sync(`${i}l`)}>
                {r.l.t}
              </Text>
            )}
            {r.r && (
              <Text {...common(r.r)} scale={lay?.sc ?? 1} anchorX="left" position={[gap / 2, 0, 0]} onSync={sync(`${i}r`)}>
                {r.r.t}
              </Text>
            )}
          </group>
        ))}
      </group>
    </group>
  )
}
