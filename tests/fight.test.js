import { describe, it, expect } from 'vitest'
import { poseAt, nextSegment, stances, STANCE, PIN_TIME } from '../src/fight.js'

const seeded = (a) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const roof = { x: -0.2, z: -0.62, y: 0.8 }
const MOVES = ['grapple', 'slam', 'clothesline', 'suplex', 'elbow']
const lengthOf = (move, pin) => {
  // find the end of a segment by asking nextSegment for one of that kind
  for (let i = 0; i < 400; i++) {
    const r = seeded(i + 1)
    const s = nextSegment(move === 'grapple' ? { move: 'slam', swap: false } : { move: 'grapple', swap: false }, r, true)
    if (s.move === move && !!s.pin === pin) return s
  }
  return null
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e

describe('fight: every move starts and ends with both of them standing, facing each other', () => {
  for (const move of MOVES) {
    for (const swap of [false, true]) {
      it(`${move}${swap ? ' (the other one attacks)' : ''}`, () => {
        const s = lengthOf(move, false)
        expect(s, 'a segment of this move exists').not.toBeNull()
        const g = { ...s, swap }
        const st = stances()
        for (const t of [0, g.dur]) {
          const p = poseAt(g, t, { roof })
          for (const [f, want] of [[p.f0, st.f0], [p.f1, st.f1]]) {
            expect(near(f.x, want.x, 1e-6) && near(f.y, 0) && near(f.z, 0)).toBe(true)
            expect(near(Math.sin(f.pitch), 0, 1e-6) && Math.cos(f.pitch) > 0.99).toBe(true) // (a full turn is standing too)
            expect(near(f.yaw, want.yaw, 1e-6)).toBe(true)
            expect(Math.abs(f.arms[0]) + Math.abs(f.arms[1])).toBeLessThan(1e-6)
          }
        }
      })
    }
  }
})

describe('fight: nobody jumps, nobody goes underground', () => {
  for (const move of MOVES) {
    it(`${move}: smooth from frame to frame, always above the floor, never through each other`, () => {
      const s = lengthOf(move, false)
      const g = { ...s, swap: false }
      let last = null
      let worst = { x: 0, y: 0, pitch: 0, arm: 0 }
      for (let t = 0; t <= g.dur; t += 1 / 30) {
        const p = poseAt(g, t, { roof })
        for (const f of [p.f0, p.f1]) {
          expect(Number.isFinite(f.x + f.y + f.z + f.yaw + f.pitch + f.roll + f.arms[0] + f.arms[1] + f.legs[0] + f.legs[1])).toBe(true)
          expect(f.y).toBeGreaterThanOrEqual(-1e-6)
        }
        if (last) for (const [a, b] of [[p.f0, last.f0], [p.f1, last.f1]]) {
          worst.x = Math.max(worst.x, Math.abs(a.x - b.x)); worst.y = Math.max(worst.y, Math.abs(a.y - b.y)); worst.pitch = Math.max(worst.pitch, Math.abs(a.pitch - b.pitch))
          worst.arm = Math.max(worst.arm, Math.abs(a.arms[0] - b.arms[0]), Math.abs(a.arms[1] - b.arms[1]))
        }
        last = p
      }
      expect(worst.x).toBeLessThan(0.14)
      expect(worst.y).toBeLessThan(0.17)
      expect(worst.pitch).toBeLessThan(0.5)
      expect(worst.arm).toBeLessThan(0.5)
    })
  }
})

describe('fight: pins and the count', () => {
  it('after a throw the attacker pins him, the referee counts 1, 2 (3), he kicks out and both get up', () => {
    for (const kick of [2, 3]) {
      let s = null
      for (let i = 1; i < 500 && !s; i++) { const c = nextSegment({ move: 'grapple', swap: false }, seeded(i), true); if (c.pin && c.move === 'slam') s = { ...c, kick } }
      expect(s).not.toBeNull()
      const counts = new Set()
      let lyingAtCount = true
      for (let t = 0; t <= s.dur; t += 1 / 30) {
        const p = poseAt(s, t)
        if (p.count) { counts.add(p.count); if (!p.lying) lyingAtCount = false }
      }
      expect([...counts].sort()).toEqual(kick === 3 ? [1, 2, 3] : [1, 2])
      expect(lyingAtCount).toBe(true)
      const end = poseAt(s, s.dur)
      expect(near(end.f0.x, -STANCE, 1e-3) && near(end.f1.x, STANCE, 1e-3)).toBe(true)
      expect(Math.abs(Math.sin(end.f0.pitch)) + Math.abs(Math.sin(end.f1.pitch))).toBeLessThan(1e-3)
      expect(s.dur).toBeGreaterThan(PIN_TIME)
    }
  })

  it('the elbow drop: he climbs on the roof, jumps, and lands on the man on the floor, who is counted out of it', () => {
    const s = { ...lengthOf('elbow', false), swap: false }
    let onRoof = false, landed = false, counted = false
    for (let t = 0; t <= s.dur; t += 1 / 30) {
      const p = poseAt(s, t, { roof })
      if (near(p.f0.y, roof.y, 0.02) && near(p.f0.x, roof.x, 0.05)) onRoof = true
      if (p.f0.pitch > 1.4 && Math.abs(p.f0.x - p.f1.x) < 0.7 && p.f0.y < 0.5 && p.f1.y < 0.2) landed = true // lying across him
      if (p.count) counted = true
    }
    expect(onRoof).toBe(true)
    expect(landed).toBe(true)
    expect(counted).toBe(true)
  })
})

describe('fight: the match', () => {
  it('goes on as long as it is asked to, with a throw between every two lock-ups, and the elbow only when there is a car roof', () => {
    for (const hasRoof of [true, false]) {
      const rng = seeded(7)
      let prev = null
      const seen = new Set()
      let swaps = 0
      for (let i = 0; i < 60; i++) {
        const s = nextSegment(prev, rng, hasRoof)
        expect(s.dur).toBeGreaterThan(1)
        if (prev) expect(s.move === 'grapple' && prev.move === 'grapple').toBe(false)
        if (prev && prev.move !== 'grapple') expect(s.move).toBe('grapple')
        if (s.swap !== (prev ? prev.swap : false)) swaps++
        seen.add(s.move)
        prev = s
      }
      expect(seen.has('elbow')).toBe(hasRoof)
      expect(seen.has('slam') && seen.has('clothesline') && seen.has('suplex')).toBe(true)
      expect(swaps).toBeGreaterThan(8) // the attacker changes: it goes back and forth
    }
  })
})
