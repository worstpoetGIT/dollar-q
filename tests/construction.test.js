import { describe, it, expect } from 'vitest'
import { compare, wallBricks, allBricks, timeline, timelineWithin, BUILD_SECONDS, paintEdge, isWall, pieceMode, openingsOf, windowPanes, frameOf, siteOf, KITS, MAX_BRICKS, CRANE_TIME, FLOOR_H } from '../src/construction.js'

const box = (cx, cy, cz, w, h, d, color = 1) => ({ kind: 'box', cx, cy, cz, w, h, d, bottom: cy - h / 2, top: cy + h / 2, color, upright: true })
const drum = (cx, cy, cz, r, h, color = 1) => ({ kind: 'cyl', cx, cy, cz, rt: r, rb: r, h, seg: 18, bottom: cy - h / 2, top: cy + h / 2, color, upright: true })
const other = (cx, cy, cz, r, h) => ({ kind: 'other', cx, cy, cz, h, w: r * 2, d: r * 2, bottom: cy - h / 2, top: cy + h / 2, color: 2, upright: true })

// the same tower with 2 floors, then with 3 floors (a taller wall, the roof slab moves up)
const tower = (f) => [{ ...box(0, (1.6 + 1.35 * f) / 2, 0, 2.6, 1.6 + 1.35 * f, 2.6, 7), win: { floors: f * 2, cols: 3, glass: 0x203a5a } }, box(0, 1.6 + 1.35 * f + 0.11, 0, 2.8, 0.22, 2.8, 8), box(0.6, 1.6 + 1.35 * f + 0.7, 0.6, 0.12, 1.0, 0.12, 9)]
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
    const b = wallBricks(w, KITS.ice)
    for (const x of b) expect(Math.hypot(x.x, x.z)).toBeGreaterThan(1.5 - KITS.ice.bt - 0.03)
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

  it('the old roof is lifted off before anything else is built', () => {
    expect(tl.removes.length).toBe(2)
    const off = Math.max(...tl.removes.map((r) => r.start + r.dur))
    expect(tl.brickStart).toBeGreaterThan(off)
    expect(Math.min(...tl.frame.map((p) => p.start))).toBeGreaterThanOrEqual(off - 1e-9)
    expect(Math.min(...tl.bricks.map((b) => b.start))).toBeGreaterThanOrEqual(tl.brickStart)
  })

  it('bricks go on from the bottom up: nothing is laid before the course under it', () => {
    const byLand = [...tl.bricks].sort((a, b) => a.land - b.land)
    let top = -1
    for (const b of byLand) {
      expect(b.y).toBeGreaterThanOrEqual(top - 0.5) // never a brick far above what is already laid
      top = Math.max(top, b.y)
    }
  })

  it('the four bricklayers each have their own side and never lay two bricks at once', () => {
    for (let s = 0; s < 4; s++) {
      const mine = tl.bricks.filter((b) => b.side === s).sort((a, b) => a.start - b.start)
      expect(mine.length).toBeGreaterThan(0)
      expect(new Set(mine.map((b) => b.start.toFixed(4))).size).toBe(mine.length)
    }
  })

  it('the crane carries one thing at a time (floor decks and roof alike), and the roof goes on only after the walls are up', () => {
    const crane = [...tl.frame.filter((p) => p.mode === 'crane'), ...tl.pieces.filter((p) => p.mode === 'crane')].sort((a, b) => a.start - b.start)
    expect(crane.length).toBeGreaterThan(1)
    for (let i = 1; i < crane.length; i++) expect(crane[i].start).toBeGreaterThanOrEqual(crane[i - 1].start + crane[i - 1].dur - 1e-9)
    const roof = tl.pieces.find((p) => p.d.color === 8)
    expect(roof.mode).toBe('crane')
    expect(roof.start).toBeGreaterThanOrEqual(tl.lastBrick - 1e-9)
    expect(roof.dur).toBeCloseTo(CRANE_TIME, 5)
  })

  it('painting starts at the top once the walls, windows and roof are done, and comes down to the bottom', () => {
    const roof = tl.pieces.find((p) => p.d.color === 8)
    expect(tl.paintStart).toBeGreaterThanOrEqual(Math.max(tl.lastBrick, tl.windowsEnd, roof.start + roof.dur) - 1e-9)
    expect(paintEdge(tl, 0)).toBeGreaterThan(tl.topAll) // nothing painted yet
    let last = Infinity
    for (let t = 0; t <= tl.end; t += 0.25) {
      const e = paintEdge(tl, t)
      expect(e).toBeLessThanOrEqual(last + 1e-9) // only goes down
      last = e
    }
    expect(paintEdge(tl, tl.paintEnd + 0.01)).toBeCloseTo(tl.wallBottom, 5)
    expect(tl.end).toBeGreaterThan(tl.paintEnd)
  })

  it('a floor takes a while but not forever, and waiting levels speed it up', () => {
    expect(tl.end).toBeGreaterThan(15)
    expect(tl.end).toBeLessThan(60)
    const fast = timeline(plan, KITS.city, 4)
    expect(fast.end).toBeLessThan(tl.end / 2.5)
  })

  it('every map has a kit and builds a floor in a sensible time', () => {
    for (const [name, kit] of Object.entries(KITS)) {
      const t = timeline(compare(stack(2), stack(3)), kit)
      expect(t.bricks.length, name).toBeGreaterThan(30)
      expect(t.end, name).toBeLessThan(60)
    }
    const t = timeline(compare([], tower(5)), KITS.city) // a whole new tall building
    expect(t.bricks.length).toBeLessThanOrEqual(MAX_BRICKS)
    expect(t.end).toBeLessThan(150)
  })
})

describe('construction: windows are gaps in the wall and fitted afterwards', () => {
  const plan = compare(tower(2), tower(3))
  const tl = timeline(plan, KITS.city)
  const wall = plan.walls[0]

  it('only the windows of the new part are built, one in every cell of the new rows, on all four sides', () => {
    const o = openingsOf(wall)
    expect(o.length).toBeGreaterThan(0)
    expect(o.length % (3 * 4)).toBe(0) // columns x sides
    for (const w of o) { expect(w.y0).toBeGreaterThanOrEqual(wall.from - 1e-6); expect(w.y1).toBeLessThanOrEqual(wall.to + 1e-6) }
    expect(new Set(o.map((w) => w.side))).toEqual(new Set([0, 1, 2, 3]))
  })

  it('no brick is laid where a window goes', () => {
    const o = openingsOf(wall)
    const without = wallBricks({ ...wall, d: { ...wall.d, win: undefined } }, KITS.city)
    const bricks = wallBricks(wall, KITS.city)
    expect(bricks.length).toBeLessThan(without.length)
    for (const b of bricks) {
      const c = b.side % 2 === 0 ? b.x : b.z
      for (const w of o) if (w.side === b.side) {
        const across = Math.min(c + b.sx / 2, w.a1) - Math.max(c - b.sx / 2, w.a0)
        const up = Math.min(b.y + b.sy / 2, w.y1) - Math.max(b.y - b.sy / 2, w.y0)
        expect(across > b.sx * 0.45 && up > b.sy * 0.45).toBe(false)
      }
    }
  })

  it('a window pane sits in each gap, flush with the wall, and is fitted after the wall around it is laid', () => {
    const panes = windowPanes(plan.walls)
    expect(panes.length).toBe(openingsOf(wall).length)
    for (const p of panes) {
      expect(p.glass).toBe(0x203a5a)
      const out = Math.max(Math.abs(p.x), Math.abs(p.z))
      expect(out).toBeGreaterThan(1.3 - 1e-9) // on the face of the wall (2.6 wide)
      expect(out).toBeLessThan(1.3 + 0.02)
    }
    for (const p of tl.panes) {
      const done = tl.courseEnd.find(([top]) => top >= p.top - 0.05)
      expect(p.start).toBeGreaterThanOrEqual(done[1] - 1e-9)
      expect(p.start + p.dur).toBeLessThanOrEqual(tl.paintStart + 1e-9)
    }
    expect(tl.panes.every((p, i) => i === 0 || p.start >= tl.panes[i - 1].start - 1e-9)).toBe(true) // lowest first
  })

  it('maps whose buildings have no painted windows build no panes', () => {
    expect(windowPanes(compare(stack(2), stack(3)).walls).length).toBe(0)
  })
})

describe('construction: the frame and the site', () => {
  const plan = compare(tower(2), tower(3))
  const tl = timeline(plan, KITS.city)

  it('every floor has columns, beams and a deck the crane lays', () => {
    const f = frameOf(plan.walls[0])
    expect(f.levels).toBe(Math.round(1.35 / FLOOR_H))
    for (let i = 1; i <= f.levels; i++) {
      const parts = f.parts.filter((p) => p.level === i)
      expect(parts.filter((p) => p.type === 'col').length).toBeGreaterThanOrEqual(4)
      expect(parts.filter((p) => p.type === 'beam').length).toBe(4)
      expect(parts.filter((p) => p.type === 'deck').length).toBe(1)
    }
    expect(tl.frame.filter((p) => p.type === 'deck').every((p) => p.mode === 'crane')).toBe(true)
    expect(tl.frame.filter((p) => p.type === 'col').every((p) => p.mode === 'pour')).toBe(true)
  })

  it('a tall wall gets a frame floor for every 1.3 or so, one after the other', () => {
    const t = timeline(compare([], tower(5)), KITS.city)
    const decks = t.frame.filter((p) => p.type === 'deck').sort((a, b) => a.y - b.y)
    expect(decks.length).toBe(Math.round((1.6 + 1.35 * 5) / FLOOR_H))
    for (let i = 1; i < decks.length; i++) expect(decks[i].start).toBeGreaterThanOrEqual(decks[i - 1].start + decks[i - 1].dur - 1e-9)
  })

  it('a course of bricks never starts before the frame of its floor is up', () => {
    const t = timeline(compare([], tower(3)), KITS.city)
    const decks = t.frame.filter((p) => p.type === 'deck').sort((a, b) => a.y - b.y)
    for (const b of t.bricks) {
      const deck = decks.find((d) => d.y + 0.035 >= b.y - 0.05)
      expect(b.start).toBeGreaterThanOrEqual(deck.start + deck.dur - 1e-9)
    }
  })

  it('a new building gets a fence, then a pit, then a footing, and only then the frame; a floor on top of one that stands gets none', () => {
    const fresh = timeline(compare([], tower(2)), KITS.city)
    expect(fresh.site.fence.length).toBeGreaterThan(8)
    const lastFence = Math.max(...fresh.site.fence.map((f) => f.start))
    expect(fresh.site.pit.start).toBeGreaterThan(lastFence - 1e-9)
    expect(fresh.site.footing.start).toBeGreaterThanOrEqual(fresh.site.pit.start + fresh.site.pit.dur - 1e-9)
    expect(Math.min(...fresh.frame.map((p) => p.start))).toBeGreaterThanOrEqual(fresh.site.footing.start + fresh.site.footing.dur - 1e-9)
    expect(timeline(plan, KITS.city).site).toBeNull()
    expect(siteOf(plan.walls)).toBeNull()
  })
})

describe('construction: the whole build takes seven seconds', () => {
  const cases = {
    'a floor on a classic tower': compare(tower(2), tower(3)),
    'a whole new tall tower': compare([], tower(5)),
    'a new small building': compare([], tower(1)),
    'a floor on a stack (lego, war, court)': compare(stack(2), stack(3)),
  }
  for (const [name, plan] of Object.entries(cases)) {
    for (const [map, kit] of Object.entries(KITS)) {
      it(`${name} on the ${map} map: first to last in ${BUILD_SECONDS} seconds, in the same order`, () => {
        const tl = timelineWithin(plan, kit)
        expect(tl.end).toBeGreaterThan(BUILD_SECONDS - 0.4)
        expect(tl.end).toBeLessThan(BUILD_SECONDS + 0.4)
        // still the same steps in the same order
        if (plan.removed.length) expect(tl.brickStart).toBeGreaterThan(Math.max(...tl.removes.map((r) => r.start + r.dur)))
        if (tl.site) expect(tl.site.footing.start).toBeGreaterThan(tl.site.pit.start)
        if (tl.frame.length) expect(Math.min(...tl.frame.map((p) => p.start))).toBeGreaterThanOrEqual(tl.site ? tl.site.footing.start - 1e-9 : 0)
        expect(tl.paintStart).toBeGreaterThanOrEqual(tl.lastBrick - 1e-9)
        expect(tl.end).toBeGreaterThan(tl.paintEnd)
        const crane = [...tl.frame.filter((p) => p.mode === 'crane'), ...tl.pieces.filter((p) => p.mode === 'crane')].sort((a, b) => a.start - b.start)
        for (let i = 1; i < crane.length; i++) expect(crane[i].start).toBeGreaterThanOrEqual(crane[i - 1].start + crane[i - 1].dur - 1e-9)
      })
    }
  }
})

describe('construction: a big jump in spending is built in one go', () => {
  // a county that went from a small kiosk to three buildings and a tower of ten floors in one expense
  const before = [box(0, 0.3, 0, 1.4, 0.6, 1.4, 3)]
  const after = [
    ...tower(10), box(3.4, 1.0, 1.0, 2.2, 2.0, 2.0, 11), box(3.4, 2.1, 1.0, 2.4, 0.2, 2.2, 12), box(-3.4, 0.9, 1.3, 2.0, 1.8, 1.8, 13), box(-3.4, 1.9, 1.3, 2.2, 0.2, 2.0, 14),
    box(0, 0.05, 3.2, 2.0, 0.1, 0.5, 15),
  ]
  const plan = compare(before, after)

  it('every floor and every building is part of the same plan', () => {
    expect(plan.walls.length).toBe(3) // the tower and the two other buildings
    expect(plan.pieces.length).toBeGreaterThan(3)
    expect(plan.removed.length).toBe(1) // the old kiosk comes down
  })

  for (const [map, kit] of Object.entries(KITS)) {
    it(`on the ${map} map it still takes the same seven seconds (not floor after floor), in order`, () => {
      const tl = timelineWithin(plan, kit)
      expect(tl.end).toBeGreaterThan(BUILD_SECONDS - 0.4)
      expect(tl.end).toBeLessThan(BUILD_SECONDS + 0.4)
      expect(tl.bricks.length).toBeLessThanOrEqual(MAX_BRICKS)
      expect(tl.site).not.toBeNull()
      expect(tl.frame.filter((p) => p.type === 'deck').length).toBeGreaterThan(6)
      // all the buildings go up at the same time: the first brick of every wall is laid before the last brick of the tallest one
      const first = (w) => Math.min(...tl.bricks.filter((b) => b.wall === w).map((b) => b.start))
      const last = Math.max(...tl.bricks.map((b) => b.land))
      for (let w = 0; w < plan.walls.length; w++) expect(first(w)).toBeLessThan(last - 1)
      const crane = [...tl.frame.filter((p) => p.mode === 'crane'), ...tl.pieces.filter((p) => p.mode === 'crane')].sort((a, b) => a.start - b.start)
      for (let i = 1; i < crane.length; i++) expect(crane[i].start).toBeGreaterThanOrEqual(crane[i - 1].start + crane[i - 1].dur - 1e-9)
      expect(tl.paintStart).toBeGreaterThanOrEqual(tl.lastBrick - 1e-9)
    })
  }
})
