import { describe, it, expect } from 'vitest'
import { levelFor, shareOf } from '../src/util.js'
import { CityScene } from '../src/CityScene.js'

const plan = (L) => CityScene.prototype.plan.call({}, L)

describe('levelFor: how far a county has been built', () => {
  it('is zero until something is spent', () => {
    expect(levelFor(0, 'EUR')).toBe(0)
    expect(levelFor(-5, 'EUR')).toBe(0)
    expect(levelFor(NaN, 'EUR')).toBe(0)
  })

  it('gives even a tiny expense a first level', () => {
    expect(levelFor(0.01, 'EUR')).toBe(1)
  })

  it('never goes down as the amount grows', () => {
    let last = 0
    for (let a = 0.5; a < 5e6; a *= 1.07) {
      const l = levelFor(a, 'EUR')
      expect(l).toBeGreaterThanOrEqual(last)
      last = l
    }
  })

  it('has no ceiling', () => {
    expect(levelFor(1e6, 'EUR')).toBeGreaterThan(levelFor(1e4, 'EUR'))
    expect(levelFor(1e9, 'EUR')).toBeGreaterThan(levelFor(1e6, 'EUR'))
  })

  it('matches the promised sizes', () => {
    expect(levelFor(20, 'EUR')).toBe(3)
    expect(levelFor(70, 'EUR')).toBe(9)
  })

  it('scales each currency to its own money', () => {
    expect(levelFor(1900, 'INR')).toBe(levelFor(20, 'EUR'))
    expect(levelFor(3300, 'JPY')).toBe(levelFor(20, 'EUR'))
    expect(levelFor(20, 'XXX')).toBe(levelFor(20, 'EUR'))
  })
})

describe('shareOf: my equal share of a bill', () => {
  it('divides evenly and rounds to cents', () => {
    expect(shareOf(30, 3)).toBe(10)
    expect(shareOf(10, 3)).toBe(3.33)
    expect(shareOf(100, 1)).toBe(100)
  })
  it('treats a missing or zero head count as one person', () => {
    expect(shareOf(50, 0)).toBe(50)
    expect(shareOf(50, undefined)).toBe(50)
  })
  it('never returns less than one cent', () => {
    expect(shareOf(0.01, 20)).toBe(0.01)
  })
})

describe('plan: what stands on a county lot at each level', () => {
  const sig = (L) => JSON.stringify(plan(L))

  it('starts empty, then a foundation, a hut, the main building, the extras', () => {
    expect(plan(0).found).toBe(false)
    expect(plan(1).found).toBe(true)
    expect(plan(2).hut).toBe(true)
    expect(plan(3).hut).toBe(false)
    expect(plan(3).M).toBe(1)
    expect(plan(4).extras).toBe(true)
  })

  it('changes something at every single level, so each expense visibly builds', () => {
    for (let L = 1; L <= 80; L++) expect(sig(L)).not.toBe(sig(L - 1))
  })

  it('never removes a floor or a building as the level rises (from the main building on)', () => {
    let prev = plan(3)
    for (let L = 4; L <= 120; L++) {
      const p = plan(L)
      expect(p.M).toBeGreaterThanOrEqual(prev.M)
      expect(p.A).toBeGreaterThanOrEqual(prev.A)
      expect(p.B).toBeGreaterThanOrEqual(prev.B)
      prev = p
    }
  })

  it('keeps growing with no limit', () => {
    const total = (p) => p.M + p.A + p.B
    expect(total(plan(300))).toBeGreaterThan(total(plan(100)))
  })
})
