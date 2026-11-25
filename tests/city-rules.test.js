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
