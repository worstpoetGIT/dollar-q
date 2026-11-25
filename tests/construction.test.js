import { describe, it, expect } from 'vitest'
import { compare, wallBricks, allBricks, timeline, claddingHeight, isWall, pieceMode, KITS, MAX_BRICKS, CRANE_TIME } from '../src/construction.js'

const box = (cx, cy, cz, w, h, d, color = 1) => ({ kind: 'box', cx, cy, cz, w, h, d, bottom: cy - h / 2, top: cy + h / 2, color, upright: true })
const drum = (cx, cy, cz, r, h, color = 1) => ({ kind: 'cyl', cx, cy, cz, rt: r, rb: r, h, seg: 18, bottom: cy - h / 2, top: cy + h / 2, color, upright: true })
const other = (cx, cy, cz, r, h) => ({ kind: 'other', cx, cy, cz, h, w: r * 2, d: r * 2, bottom: cy - h / 2, top: cy + h / 2, color: 2, upright: true })

// the same tower with 2 floors, then with 3 floors (a taller wall, the roof slab moves up)
const tower = (f) => [box(0, (1.6 + 1.35 * f) / 2, 0, 2.6, 1.6 + 1.35 * f, 2.6, 7), box(0, 1.6 + 1.35 * f + 0.11, 0, 2.8, 0.22, 2.8, 8), box(0.6, 1.6 + 1.35 * f + 0.7, 0.6, 0.12, 1.0, 0.12, 9)]
// a stack of floors, one box each (like the lego or war map)
const stack = (f) => [...Array(f)].map((_, i) => box(0, i * 0.62 + 0.29, 0, 3.2, 0.58, 2.8, i % 2 ? 4 : 5)).concat([box(0, f * 0.62 + 0.06, 0, 3.2, 0.12, 2.8, 6)])

describe('construction: what has to be built', () => {
  it('a growing wall only builds the new part, the roof comes off and goes back on top', () => {
    const c = compare(tower(2), tower(3))
    expect(c.walls.length).toBe(1)
    expect(c.walls[0].grown).not.toBeNull()
    expect(c.walls[0].from).toBeCloseTo(1.6 + 1.35 * 2, 5)
    expect(c.walls[0].to).toBeCloseTo(1.6 + 1.35 * 3, 5)
    expect(c.removed.length).toBe(2) // the old roof slab and the antenna
    expect(c.pieces.length).toBe(2) // and the new ones
  })

  it('a stack of floors keeps the old floors and builds the one on top', () => {
    const c = compare(stack(3), stack(4))
    expect(c.kept.length).toBe(3)
    expect(c.walls.length).toBe(1)
    expect(c.walls[0].grown).toBeNull()
    expect(c.walls[0].from).toBeCloseTo(3 * 0.62, 1)
    expect(c.removed.length).toBe(1) // the roof plate
    expect(c.pieces.length).toBe(1)
  })

  it('a building that is new is all built from the ground', () => {
    const c = compare([], tower(1))
    expect(c.kept.length).toBe(0)
    expect(c.walls[0].from).toBeCloseTo(0, 5)
    expect(c.removed.length).toBe(0)
  })

  it('only big boxes and big drums are walls', () => {
    expect(isWall(tower(2)[0])).toBe(true)
    expect(isWall(tower(2)[1])).toBe(false) // a slab
    expect(isWall(tower(2)[2])).toBe(false) // an antenna
    expect(isWall(drum(0, 0.4, 0, 1.5, 0.7))).toBe(true)
    expect(isWall(other(0, 1, 0, 1, 1))).toBe(false)
    expect(isWall(box(-0.6, 10, -0.5, 0.9, 0.5, 0.9))).toBe(false) // a penthouse on a roof: a module for the crane
    expect(pieceMode(box(0, 0.1, 0, 3.5, 0.2, 3.5))).toBe('pour')
    expect(pieceMode(other(0, 3, 0, 1.1, 0.8))).toBe('crane')
    expect(pieceMode(box(0, 1, 1.3, 0.55, 0.8, 0.1))).toBe('crane')
    expect(pieceMode(box(0, 1, 1.3, 0.3, 0.3, 0.1))).toBe('hand')
  })
})

describe('construction: the bricks', () => {
  const wall = { d: box(0, 1.3, 0, 2.6, 2.6, 2.6), from: 0, to: 2.6, grown: null }
  const kit = KITS.city

  it('a wall is hollow bricks, course by course, every other course shifted by half a brick', () => {
    const b = wallBricks(wall, kit)
    const courses = new Set(b.map((x) => x.course))
    expect(courses.size).toBe(Math.round(2.6 / kit.ch))
    const first = b.filter((x) => x.course === 0 && x.side === 0)
    const second = b.filter((x) => x.course === 1 && x.side === 0)
    expect(first.length).toBeGreaterThan(5)
    expect(Math.abs(first[0].along - second[0].along)).toBeGreaterThan(0.02) // the joints do not line up
    expect(new Set(b.map((x) => x.side))).toEqual(new Set([0, 1, 2, 3]))
  })

  it('every brick is inside the wall, just under its surface, and none in the middle', () => {
    for (const x of wallBricks(wall, kit)) {
      expect(Math.abs(x.x)).toBeLessThanOrEqual(1.3 + 1e-9)
      expect(Math.abs(x.z)).toBeLessThanOrEqual(1.3 + 1e-9)
      expect(Math.max(Math.abs(x.x), Math.abs(x.z))).toBeGreaterThan(1.3 - kit.bt - 0.03) // a shell, not a solid block
      expect(x.y).toBeGreaterThan(0)
      expect(x.y).toBeLessThan(2.6)
    }
  })

  it('a round wall is rings of bricks all the way round', () => {
    const w = { d: drum(0, 0.35, 0, 1.5, 0.7), from: 0, to: 0.7, grown: null }
    const b = wallBricks(w, KITS.ocean)
    for (const x of b) expect(Math.hypot(x.x, x.z)).toBeGreaterThan(1.5 - KITS.ocean.bt - 0.03)
    expect(new Set(b.map((x) => x.side))).toEqual(new Set([0, 1, 2, 3]))
    const ring = b.filter((x) => x.course === 0).length
    expect(ring).toBeGreaterThan(20)
  })

  it('never more than the limit: bigger bricks when a building would need too many', () => {
    const big = { d: box(0, 5, 0, 6, 10, 6), from: 0, to: 10, grown: null }
    const { bricks, kit: used } = allBricks([big], KITS.japan)
    expect(bricks.length).toBeLessThanOrEqual(MAX_BRICKS)
    expect(used.bl).toBeGreaterThan(KITS.japan.bl)
  })
})

describe('construction: when it happens', () => {
  const plan = compare(tower(2), tower(3))
  const tl = timeline(plan, KITS.city)

  it('the old roof is lifted off before the first brick is laid', () => {
    expect(tl.removes.length).toBe(2)
    const off = Math.max(...tl.removes.map((r) => r.start + r.dur))
    expect(tl.brickStart).toBeGreaterThan(off)
    expect(Math.min(...tl.bricks.map((b) => b.start))).toBeGreaterThanOrEqual(tl.brickStart)
  })

  it('bricks go on from the bottom up: nothing is laid before the course under it', () => {
    const byLand = [...tl.bricks].sort((a, b) => a.land - b.land)
    let top = -1
    for (const b of byLand) {
      expect(b.y).toBeGreaterThanOrEqual(top - 0.5) // never a brick far above what is already laid
      top = Math.max(top, b.y)
    }
    const lastCourse = Math.max(...tl.bricks.map((b) => b.course))
    expect(tl.bricks.filter((b) => b.course === lastCourse).every((b) => b.land >= tl.bricks.filter((c) => c.course === 0).reduce((m, c) => Math.max(m, c.land), 0))).toBe(true)
  })

  it('the four bricklayers each have their own side and never lay two bricks at once', () => {
    for (let s = 0; s < 4; s++) {
      const mine = tl.bricks.filter((b) => b.side === s).sort((a, b) => a.start - b.start)
      expect(mine.length).toBeGreaterThan(0)
      for (let i = 1; i < mine.length; i++) expect(mine[i].start).toBeGreaterThan(mine[i - 1].start - 1e-9)
      expect(new Set(mine.map((b) => b.start.toFixed(4))).size).toBe(mine.length)
    }
  })

  it('the crane carries one thing at a time, and the roof goes on only after the walls are up', () => {
    const crane = tl.pieces.filter((p) => p.mode === 'crane').sort((a, b) => a.start - b.start)
    for (let i = 1; i < crane.length; i++) expect(crane[i].start).toBeGreaterThanOrEqual(crane[i - 1].start + crane[i - 1].dur - 1e-9)
    const roof = tl.pieces.find((p) => p.d.color === 8)
    expect(roof.mode).toBe('crane')
    expect(roof.start).toBeGreaterThanOrEqual(tl.lastBrick - 1e-9)
    expect(roof.dur).toBeCloseTo(CRANE_TIME, 5)
  })

  it('the finished wall shows up behind the bricklayers and reaches the top when the work is done', () => {
    expect(claddingHeight(tl, 0)).toBeCloseTo(tl.wallBottom, 5)
    let last = -1
    for (let t = 0; t <= tl.end; t += 0.25) {
      const h = claddingHeight(tl, t)
      expect(h).toBeGreaterThanOrEqual(last - 1e-9) // only goes up
      last = h
    }
    expect(claddingHeight(tl, tl.claddingEnd + 0.01)).toBeCloseTo(tl.topAll, 5)
    const mid = tl.brickStart + (tl.lastBrick - tl.brickStart) / 2
    expect(claddingHeight(tl, mid)).toBeLessThan(tl.topAll - 0.3)
  })

  it('a floor takes a while but not forever, and waiting levels speed it up', () => {
    expect(tl.end).toBeGreaterThan(8)
    expect(tl.end).toBeLessThan(30)
    const fast = timeline(plan, KITS.city, 4)
    expect(fast.end).toBeLessThan(tl.end / 2.5)
  })

  it('every map has a kit and builds a floor in a sensible time', () => {
    for (const [name, kit] of Object.entries(KITS)) {
      const t = timeline(compare(stack(2), stack(3)), kit)
      expect(t.bricks.length, name).toBeGreaterThan(30)
      expect(t.end, name).toBeLessThan(40)
    }
    const t = timeline(compare([], tower(5)), KITS.city) // a whole new tall building
    expect(t.bricks.length).toBeLessThanOrEqual(MAX_BRICKS)
    expect(t.end).toBeLessThan(45)
  })
})
