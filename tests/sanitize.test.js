import { describe, it, expect } from 'vitest'
import { sanitize } from '../src/store.js'

const base = {
  v: 1, entered: true, setupDone: true, stateName: 'Atlas', currency: 'EUR',
  accounts: [{ id: 'a1', name: 'Main', currency: 'EUR' }],
  counties: [{ id: 'c1', name: 'Food', group: 'Food', style: 'shop', icon: 'cart', color: '#e5383b' }],
  expenses: [],
}
const exp = (o) => ({ id: 'e1', countyId: 'c1', accountId: 'a1', currency: 'EUR', methodType: 'cash', people: 1, ts: Date.now(), ...o })

describe('sanitize: bad input never crashes the app', () => {
  it('turns garbage into a fresh, empty state', () => {
    for (const bad of [null, undefined, 'x', 5, [], {}, { v: 2 }]) {
      const s = sanitize(bad)
      expect(s.entered).toBe(false)
      expect(s.expenses).toEqual([])
      expect(s.counties.length).toBeGreaterThan(0)
    }
  })

  it('survives fields of the wrong type', () => {
    const s = sanitize({ v: 1, entered: true, counties: null, expenses: 'x', accounts: 5, methods: null, fixed: {} })
    expect(s.counties.length).toBeGreaterThan(0)
    expect(s.accounts.length).toBe(1)
    expect(s.expenses).toEqual([])
  })

  it('keeps good data as it is', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 12.5 })] })
    expect(s.stateName).toBe('Atlas')
    expect(s.counties[0].name).toBe('Food')
    expect(s.expenses[0].amount).toBe(12.5)
  })

  it('caps text lengths and strips control characters', () => {
    const s = sanitize({ ...base, stateName: 'x'.repeat(100) + '\u0000', expenses: [exp({ amount: 1, note: 'n'.repeat(500) })] })
    expect(s.stateName.length).toBe(28)
    expect(s.expenses[0].note.length).toBe(80)
  })

  it('replaces fake colours, icons, styles and currencies', () => {
    const s = sanitize({ ...base, counties: [{ id: 'c1', name: 'A', group: 'nope', style: 'constructor', icon: '__proto__', color: 'red;background:url(x)' }], accounts: [{ id: 'a1', name: 'M', currency: 'ZZZ' }] })
    expect(s.counties[0].icon).toBe('tag')
    expect(s.counties[0].color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(s.counties[0].style).toBe('shop')
    expect(s.counties[0].group).toBe('Other')
    expect(s.accounts[0].currency).toBe('INR')
  })

  it('clamps absurd amounts instead of trusting them', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 1e300 }), exp({ id: 'e2', amount: -5 }), exp({ id: 'e3', amount: 'many' })] })
    expect(s.expenses.length).toBe(1)
    expect(s.expenses[0].total).toBe(999999999.99)
  })

  it('drops duplicate ids and unusable rows', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 1 }), exp({ amount: 2 }), { amount: 3 }, null, exp({ id: 'bad id!', amount: 4 })] })
    expect(s.expenses.length).toBe(1)
  })

  it('ignores prototype pollution payloads', () => {
    const evil = JSON.parse('{"v":1,"entered":true,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}}}')
    sanitize(evil)
    expect({}.polluted).toBeUndefined()
    expect({}.polluted2).toBeUndefined()
  })

  it('limits how many rows it accepts', () => {
    const many = Array.from({ length: 60000 }, (_, i) => exp({ id: 'e' + i, amount: 1 }))
    expect(sanitize({ ...base, expenses: many }).expenses.length).toBe(50000)
  })
})

describe('sanitize: the split between people (my share of the bill)', () => {
  it('converts an old expense: the whole bill becomes the total, my share becomes the amount', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 30, people: 3 })] })
    expect(s.expenses[0].total).toBe(30)
    expect(s.expenses[0].amount).toBe(10)
    expect(s.expenses[0].people).toBe(3)
  })

  it('rounds the share to cents', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 10, people: 3 })] })
    expect(s.expenses[0].amount).toBe(3.33)
    expect(s.expenses[0].total).toBe(10)
  })

  it('leaves a one-person expense unchanged', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 42.42, people: 1 })] })
    expect(s.expenses[0].amount).toBe(42.42)
    expect(s.expenses[0].total).toBe(42.42)
  })

  it('does not convert twice: running it again changes nothing', () => {
    const once = sanitize({ ...base, expenses: [exp({ amount: 30, people: 3 }), exp({ id: 'e2', amount: 9, people: 2 })] })
    const twice = sanitize(JSON.parse(JSON.stringify(once)))
    expect(twice.expenses).toEqual(once.expenses)
    expect(twice.expenses[0].amount).toBe(10)
  })

  it('rebuilds the share from the total if the two disagree', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 99, total: 30, people: 3 })] })
    expect(s.expenses[0].amount).toBe(10)
  })

  it('keeps the whole bill readable for the History page', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 60, people: 4 })] })
    expect(s.expenses[0].total).toBe(60)
    expect(s.expenses[0].amount).toBe(15)
  })

  it('totals only my shares for a month of old data', () => {
    const s = sanitize({ ...base, expenses: [exp({ amount: 30, people: 3 }), exp({ id: 'e2', amount: 20, people: 1 })] })
    expect(s.expenses.reduce((a, e) => a + e.amount, 0)).toBe(30)
  })
})
