import { describe, it, expect } from 'vitest'
import { monthSpending, isGulliver, GULLIVER, ymOf } from '../src/util.js'
import { GROUPS, DEFAULT_COUNTIES, MAX_COUNTIES, sanitize } from '../src/store.js'

const ts = new Date(2026, 10, 15, 12).getTime()
const ym = ymOf(ts)
const counties = [
  { id: 'rent', name: 'Rent', group: 'Gulliver' },
  { id: 'food', name: 'Food', group: 'Food' },
  { id: 'cafe', name: 'Cafe', group: 'Food' },
]
const e = (id, countyId, amount, over = {}) => ({ id, countyId, amount, currency: 'EUR', ts, ...over })

describe('Gulliver: the big rare things', () => {
  it('is a group counties can be in, and the setup list offers it', () => {
    expect(GROUPS).toContain(GULLIVER)
    expect(isGulliver({ group: 'Gulliver' })).toBe(true)
    expect(isGulliver({ group: 'Food' })).toBe(false)
    expect(isGulliver(undefined)).toBe(false)
  })

  it('new users get Home & Rent, Investments and Gifts under Gulliver, and still no more than 12 counties', () => {
    const g = DEFAULT_COUNTIES.filter(isGulliver).map((c) => c.name)
    expect(g).toEqual(['Home & Rent', 'Investments', 'Gifts'])
    expect(DEFAULT_COUNTIES.length).toBeLessThanOrEqual(MAX_COUNTIES)
    expect(new Set(DEFAULT_COUNTIES.map((c) => c.id)).size).toBe(DEFAULT_COUNTIES.length)
  })

  it('a county saved in the Gulliver group stays there (it is not turned into Other)', () => {
    const s = sanitize({ v: 1, counties: [{ id: 'c1', name: 'Rent', group: 'Gulliver', style: 'house', icon: 'home', color: '#e5383b' }] })
    expect(s.counties[0].group).toBe('Gulliver')
  })

  it('existing counties are left exactly as they are (no automatic move for people who already use the app)', () => {
    const s = sanitize({ v: 1, counties: [{ id: 'c1', name: 'Home & Rent', group: 'Home', style: 'house', icon: 'home', color: '#e5383b' }] })
    expect(s.counties[0].group).toBe('Home')
  })
})

describe('this month, without Gulliver', () => {
  it('the total leaves out Gulliver and Gulliver has its own total', () => {
    const r = monthSpending([e('1', 'rent', 800), e('2', 'food', 30), e('3', 'cafe', 12.5)], counties, 'EUR', ym)
    expect(r.total).toBe(42.5)
    expect(r.gulliver).toBe(800)
  })

  it('every county still gets its own amount and count, Gulliver ones too (their buildings grow like any other)', () => {
    const r = monthSpending([e('1', 'rent', 800), e('2', 'rent', 100), e('3', 'food', 30)], counties, 'EUR', ym)
    expect(r.per.rent).toEqual({ spent: 900, count: 2 })
    expect(r.per.food).toEqual({ spent: 30, count: 1 })
    expect(r.per.cafe).toBeUndefined()
  })

  it('only the chosen month and currency count', () => {
    const lastMonth = new Date(2026, 9, 15).getTime()
    const r = monthSpending([e('1', 'food', 10), e('2', 'food', 99, { ts: lastMonth }), e('3', 'food', 77, { currency: 'INR' }), e('4', 'rent', 5, { ts: lastMonth })], counties, 'EUR', ym)
    expect(r.total).toBe(10)
    expect(r.gulliver).toBe(0)
  })

  it('an expense in a county that was removed counts as normal spending, not Gulliver', () => {
    const r = monthSpending([e('1', 'gone', 20)], counties, 'EUR', ym)
    expect(r.total).toBe(20)
    expect(r.gulliver).toBe(0)
  })

  it('nothing at all gives zeros', () => {
    expect(monthSpending([], counties, 'EUR', ym)).toEqual({ per: {}, total: 0, gulliver: 0 })
  })
})

describe('up to 24 counties', () => {
  const county = (i) => ({ id: 'c' + i, name: 'County ' + i, group: 'Food', style: 'shop', icon: 'tag', color: '#e5383b' })

  it('allows 24 and no more (the map has 24 lots)', () => {
    expect(MAX_COUNTIES).toBe(24)
    expect(sanitize({ v: 1, counties: Array.from({ length: 24 }, (_, i) => county(i + 1)) }).counties.length).toBe(24)
    expect(sanitize({ v: 1, counties: Array.from({ length: 40 }, (_, i) => county(i + 1)) }).counties.length).toBe(24)
  })

  it('13 or more counties all keep their own place: nothing is dropped or merged', () => {
    const s = sanitize({ v: 1, counties: Array.from({ length: 18 }, (_, i) => county(i + 1)) })
    expect(s.counties.map((c) => c.id)).toEqual(Array.from({ length: 18 }, (_, i) => 'c' + (i + 1)))
  })
})
