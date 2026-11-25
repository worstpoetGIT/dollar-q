import { describe, it, expect } from 'vitest'
import { TREES_PER_LOT, treesLeft } from '../src/cityRules.js'

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
    expect(treesLeft(3)).toBeGreaterThan(treesLeft(9))
    expect(treesLeft(0)).toBe(TREES_PER_LOT)
  })

  it('copes with nonsense levels', () => {
    expect(treesLeft(-5)).toBe(TREES_PER_LOT)
    expect(treesLeft(NaN)).toBe(TREES_PER_LOT)
    expect(treesLeft(2.9)).toBe(treesLeft(2))
  })
})

import { roadTaken, ROAD_TAKEN_MAX, accidentWeights, pickLot, accidentChance, fightGoesOn, MAX_ACCIDENTS } from '../src/cityRules.js'

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
    expect(accidentChance(1, 15)).toBeGreaterThan(0.6)
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
