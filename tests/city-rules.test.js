import { describe, it, expect } from 'vitest'
import { TREES_PER_LOT, treesLeft, treeSpot, ROAD_CLEAR } from '../src/cityRules.js'

describe('trees around a county', () => {
  it('an empty county keeps every tree', () => {
    expect(treesLeft(0)).toBe(TREES_PER_LOT)
  })

  it('every floor costs one or two trees, and a new building (every fifth floor) costs two', () => {
    for (let level = 0; level < 12; level++) {
      const cut = treesLeft(level) - treesLeft(level + 1)
      if (treesLeft(level) === 0) { expect(cut).toBe(0); continue } // nothing left to cut
      expect(cut).toBeGreaterThanOrEqual(1)
      expect(cut).toBeLessThanOrEqual(2)
      if ((level + 1) % 5 === 0 && treesLeft(level) >= 2) expect(cut).toBe(2)
    }
  })

  it('never goes up as the county grows, never below zero, and runs out for a busy county', () => {
    let last = Infinity
    for (let level = 0; level <= 200; level++) {
      const t = treesLeft(level)
      expect(t).toBeLessThanOrEqual(last)
      expect(t).toBeGreaterThanOrEqual(0)
      last = t
    }
    expect(treesLeft(8)).toBe(0)
    expect(treesLeft(200)).toBe(0)
  })

  it('shrinking a county (a new month, expenses deleted) plants the trees again', () => {
    expect(treesLeft(1)).toBeGreaterThan(treesLeft(9))
    expect(treesLeft(0)).toBe(TREES_PER_LOT)
  })

  it('trees never stand over a pavement: every tree of every lot is well away from both roads, and inside the quadrant of its lot', () => {
    const cells = [[4.9, 4.9], [11.1, 4.9], [4.9, 11.1], [11.1, 11.1], [17.3, 4.9], [4.9, 17.3]]
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      for (const [cx, cz] of cells) {
        const x0 = sx * cx, z0 = sz * cz
        const spots = Array.from({ length: TREES_PER_LOT }, (_, k) => treeSpot(x0, z0, k))
        for (const [x, z] of spots) {
          expect(Math.abs(x)).toBeGreaterThanOrEqual(ROAD_CLEAR - 1e-9)
          expect(Math.abs(z)).toBeGreaterThanOrEqual(ROAD_CLEAR - 1e-9)
          expect(Math.sign(x)).toBe(sx)
          expect(Math.sign(z)).toBe(sz)
          expect(Math.hypot(x - x0, z - z0)).toBeGreaterThan(1.9) // not on top of the building
          expect(Math.abs(x - x0)).toBeLessThan(2.6)
          expect(Math.abs(z - z0)).toBeLessThan(2.6) // and still in its own plot
        }
        for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1])).toBeGreaterThan(0.7)
      }
    }
  })

  it('copes with nonsense levels', () => {
    expect(treesLeft(-5)).toBe(TREES_PER_LOT)
    expect(treesLeft(NaN)).toBe(TREES_PER_LOT)
    expect(treesLeft(2.9)).toBe(treesLeft(2))
  })
})

import { roadTaken, ROAD_TAKEN_MAX, accidentWeights, pickLot, accidentChance, fightGoesOn, MAX_ACCIDENTS, accidentIsDue, ACCIDENT_EVERY_MS } from '../src/cityRules.js'

describe('the road in front of a county', () => {
  it('stays full width for an empty county and gets narrower with every floor, but never closes', () => {
    expect(roadTaken(0)).toBe(0)
    let last = 0
    for (let level = 1; level <= 200; level++) {
      const taken = roadTaken(level)
      expect(taken).toBeGreaterThanOrEqual(last)
      expect(taken).toBeLessThan(ROAD_TAKEN_MAX + 1e-9)
      last = taken
    }
    expect(roadTaken(5)).toBeGreaterThan(0.1)
    expect(roadTaken(200)).toBeGreaterThan(ROAD_TAKEN_MAX - 0.01)
    expect(3 - 2 * ROAD_TAKEN_MAX).toBeGreaterThan(2) // even with both sides at the most, two lanes still fit
  })

  it('copes with nonsense levels', () => {
    expect(roadTaken(-4)).toBe(0)
    expect(roadTaken(NaN)).toBe(0)
  })
})

describe('where the accidents happen', () => {
  const c = (spent, level, group = 'Food') => ({ spent, level, group })
  const road = [true, true, true, true]

  it('the county you spend the most in has the most accidents', () => {
    const w = accidentWeights([c(300, 12), c(100, 12), c(50, 12), c(10, 12)], road)
    expect(w[0]).toBeGreaterThan(w[1])
    expect(w[1]).toBeGreaterThan(w[2])
    expect(w[2]).toBeGreaterThan(w[3])
  })

  it('Gulliver never has accidents, even when it is the biggest spend, and it does not count in anybody else\'s share', () => {
    const w = accidentWeights([c(900, 15, 'Gulliver'), c(100, 12), c(100, 12)], road)
    expect(w[0]).toBe(0)
    const without = accidentWeights([null, c(100, 12), c(100, 12)], road)
    expect(w[1]).toBeCloseTo(without[1], 10)
  })

  it('a county with no road in front, an empty county, or no spending at all has none', () => {
    expect(accidentWeights([c(100, 12), c(100, 12)], [false, true])[0]).toBe(0)
    expect(accidentWeights([c(0, 0), c(100, 12)], [true, true])[0]).toBe(0)
    expect(accidentWeights([null, null], [true, true])).toEqual([0, 0])
    expect(accidentWeights([c(0, 0), c(0, 0)], [true, true])).toEqual([0, 0])
  })

  it('a narrower road makes accidents more likely than a wide one for the same spending', () => {
    const w = accidentWeights([c(100, 2), c(100, 20)], [true, true])
    expect(w[1]).toBeGreaterThan(w[0])
  })

  it('picks a lot by weight, never one with weight zero, and says -1 when nothing can happen', () => {
    expect(pickLot([0, 0, 0], 0.5)).toBe(-1)
    expect(pickLot([], 0.5)).toBe(-1)
    expect(pickLot([0, 5, 0], 0.01)).toBe(1)
    expect(pickLot([0, 5, 0], 0.999)).toBe(1)
    const counts = [0, 0, 0]
    for (let i = 0; i < 3000; i++) counts[pickLot([1, 0, 3], (i + 0.5) / 3000)]++
    expect(counts[1]).toBe(0)
    expect(counts[2]).toBeGreaterThan(counts[0] * 2.5)
  })

  it('no danger, no accident; more danger, a better chance; never certain', () => {
    expect(accidentChance(0, 1)).toBe(0)
    expect(accidentChance(0.2, 1)).toBeLessThan(accidentChance(1, 1))
    expect(accidentChance(1, 1)).toBeLessThan(1)
    expect(accidentChance(-3, 1)).toBe(0)
    expect(accidentChance(1, 8)).toBeGreaterThan(0.6)
  })

  it('a fight goes on while the county has spending, and stops when it comes down to zero', () => {
    expect(fightGoesOn(120)).toBe(true)
    expect(fightGoesOn(0.01)).toBe(true)
    expect(fightGoesOn(0)).toBe(false)
    expect(fightGoesOn(-5)).toBe(false)
  })

  it('there is a small limit on how many crashes can be going at once', () => {
    expect(MAX_ACCIDENTS).toBe(2)
  })
})

import { assessSpending, ASSESS_DAYS } from '../src/cityRules.js'

describe('where the fights are allowed (ten days to understand where the money goes)', () => {
  const DAY = 864e5
  const now = new Date(2026, 10, 25, 12).getTime()
  const counties = [{ id: 'misc', group: 'Other' }, { id: 'food', group: 'Food' }, { id: 'rent', group: 'Gulliver' }]
  const e = (countyId, amount, daysAgo, currency = 'EUR') => ({ countyId, amount, currency, ts: now - daysAgo * DAY })

  it('decides nothing until the history reaches back ten days', () => {
    expect(ASSESS_DAYS).toBe(10)
    expect(assessSpending([], counties, 'EUR', now)).toEqual({ ready: false, top: null })
    expect(assessSpending([e('misc', 500, 2), e('food', 10, 1)], counties, 'EUR', now)).toEqual({ ready: false, top: null })
    expect(assessSpending([e('misc', 500, 9.9)], counties, 'EUR', now).ready).toBe(false)
  })

  it('after ten days the county with the most spending in the last ten days is the one', () => {
    const r = assessSpending([e('food', 5, 12), e('misc', 300, 3), e('food', 120, 2), e('misc', 40, 1)], counties, 'EUR', now)
    expect(r).toEqual({ ready: true, top: 'misc' })
  })

  it('old spending does not count: only the last ten days decide', () => {
    const r = assessSpending([e('misc', 9000, 40), e('food', 10, 11), e('food', 25, 2), e('misc', 5, 1)], counties, 'EUR', now)
    expect(r.top).toBe('food')
  })

  it('Gulliver (rent, investments, gifts) is never the one, however big', () => {
    const r = assessSpending([e('misc', 5, 14), e('rent', 9000, 3), e('food', 30, 2)], counties, 'EUR', now)
    expect(r.top).toBe('food')
  })

  it('only the chosen currency counts, a tie goes to the earlier county, and nothing spent recently means no county', () => {
    expect(assessSpending([e('misc', 5, 14), e('food', 900, 2, 'INR')], counties, 'EUR', now).top).toBe(null)
    expect(assessSpending([e('food', 5, 14), e('misc', 50, 2), e('food', 50, 3)], counties, 'EUR', now).top).toBe('misc')
    expect(assessSpending([e('food', 5, 14)], counties, 'EUR', now)).toEqual({ ready: true, top: null })
  })

  it('copes with junk', () => {
    expect(() => assessSpending([{ countyId: 'x', amount: 5, currency: 'EUR', ts: NaN }, e('misc', 5, 12)], counties, 'EUR', now)).not.toThrow()
  })
})

describe('an accident every four hours', () => {
  const H = 60 * 60 * 1000
  it('is six a day: one four hours after the last, not before', () => {
    expect(ACCIDENT_EVERY_MS).toBe(4 * H)
    expect(24 * H / ACCIDENT_EVERY_MS).toBe(6)
    const now = 1_000 * H
    expect(accidentIsDue(now, now - 3.99 * H, 50)).toBe(false)
    expect(accidentIsDue(now, now - 4 * H, 50)).toBe(true)
    expect(accidentIsDue(now, now - 9 * H, 50)).toBe(true)
  })
  it('the first one comes as soon as the street is ready, and a clock that was set back does not stop them for ever', () => {
    expect(accidentIsDue(5 * H, 0, 10)).toBe(true)
    expect(accidentIsDue(5 * H, 50 * H, 10)).toBe(true)
  })
  it('they stop when the county has no spending this month', () => {
    expect(accidentIsDue(100 * H, 0, 0)).toBe(false)
    expect(accidentIsDue(100 * H, 10 * H, -3)).toBe(false)
    expect(accidentIsDue(100 * H, 10 * H, 0.01)).toBe(true)
  })
})
