import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { addExpense, updateExpense, deleteExpense, getState, resetAll, setState, runFixed } from '../src/store.js'

beforeEach(() => {
  resetAll()
})

const cid = () => getState().counties[0].id

describe('adding an expense for several people', () => {
  it('records the whole bill as the total and only my share as the expense', () => {
    const e = addExpense({ countyId: cid(), amount: 30, people: 3, methodType: 'cash' })
    expect(e.total).toBe(30)
    expect(e.amount).toBe(10)
    expect(e.people).toBe(3)
    expect(getState().expenses[0].amount).toBe(10)
  })

  it('refuses a bad county or a bad amount', () => {
    expect(addExpense({ countyId: 'nope', amount: 5 })).toBeNull()
    expect(addExpense({ countyId: cid(), amount: 0 })).toBeNull()
    expect(addExpense({ countyId: cid(), amount: 'x' })).toBeNull()
    expect(getState().expenses.length).toBe(0)
  })

  it('caps the amount and the head count', () => {
    const e = addExpense({ countyId: cid(), amount: 1e300, people: 500 })
    expect(e.total).toBe(999999999.99)
    expect(e.people).toBe(20)
  })
})

describe('editing an expense', () => {
  it('recomputes my share when the people or the amount change', () => {
    const e = addExpense({ countyId: cid(), amount: 30, people: 3 })
    const u = updateExpense(e.id, { countyId: cid(), amount: 40, people: 4, methodType: 'cash', ts: e.ts })
    expect(u.total).toBe(40)
    expect(u.amount).toBe(10)
    expect(getState().expenses.length).toBe(1)
    expect(getState().expenses[0].amount).toBe(10)
  })

  it('keeps the id and the auto-logged flag, and leaves others alone', () => {
    const a = addExpense({ countyId: cid(), amount: 5 })
    const b = addExpense({ countyId: cid(), amount: 7 })
    const u = updateExpense(a.id, { countyId: cid(), amount: 6, people: 1, methodType: 'cash', ts: a.ts })
    expect(u.id).toBe(a.id)
    expect(getState().expenses.find((x) => x.id === b.id).amount).toBe(7)
  })

  it('does nothing for an unknown id or an invalid edit', () => {
    const a = addExpense({ countyId: cid(), amount: 5 })
    expect(updateExpense('missing', { countyId: cid(), amount: 6 })).toBeNull()
    expect(updateExpense(a.id, { countyId: cid(), amount: -1 })).toBeNull()
    expect(getState().expenses[0].amount).toBe(5)
  })

  it('deleting still works after an edit', () => {
    const a = addExpense({ countyId: cid(), amount: 5 })
    updateExpense(a.id, { countyId: cid(), amount: 6, people: 1, methodType: 'cash', ts: a.ts })
    deleteExpense(a.id)
    expect(getState().expenses.length).toBe(0)
  })
})

describe('History is kept apart per account', () => {
  it('shows only the chosen account, so currencies are never mixed', async () => {
    const { byAccount } = await import('../src/util.js')
    const e = [{ id: '1', accountId: 'a1', currency: 'EUR' }, { id: '2', accountId: 'a2', currency: 'INR' }, { id: '3', accountId: 'a1', currency: 'EUR' }]
    expect(byAccount(e, 'a1').map((x) => x.id)).toEqual(['1', '3'])
    expect(byAccount(e, 'a2').map((x) => x.id)).toEqual(['2'])
    expect(byAccount(e, 'none')).toEqual([])
  })
})

describe('fixed expenses and subscriptions', () => {
  afterEach(() => vi.useRealTimers())
  const setup = (fixed) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 26, 12, 0, 0)) // 26 November 2026
    resetAll()
    const a = getState().accounts[0]
    setState((s) => ({ ...s, fixed: fixed.map((f, i) => ({ id: 'f' + i, name: 'Sub ' + i, amount: 100, accountId: a.id, countyId: s.counties[0].id, methodType: 'bank', methodName: '', ...f })) }))
  }
  const posted = () => getState().expenses.filter((e) => e.fixedId).map((e) => e.id + '@' + new Date(e.ts).toISOString().slice(0, 10)).sort()

  it('logs this month once the day has come, and not twice', () => {
    setup([{ day: 5, lastPosted: null }, { day: 28, lastPosted: null }])
    runFixed(); runFixed()
    expect(getState().expenses.filter((e) => e.fixedId === 'f0')).toHaveLength(1)
    expect(getState().expenses.filter((e) => e.fixedId === 'f1')).toHaveLength(0) // the 28th has not come yet
  })

  it('logs the months the app was not opened in as well, each on its own day', () => {
    setup([{ day: 5, lastPosted: '2026-08' }])
    runFixed()
    expect(posted()).toEqual(['fx-f0-2026-09@2026-09-05', 'fx-f0-2026-10@2026-10-05', 'fx-f0-2026-11@2026-11-05'])
    expect(getState().fixed[0].lastPosted).toBe('2026-11')
  })

  it('a day that does not exist in a short month is the last day of it', () => {
    setup([{ day: 31, lastPosted: '2026-08' }])
    runFixed()
    expect(posted()).toEqual(['fx-f0-2026-09@2026-09-30', 'fx-f0-2026-10@2026-10-31']) // (30 September, 31 October; November waits for the 30th)
    expect(getState().fixed[0].lastPosted).toBe('2026-10')
    vi.setSystemTime(new Date(2026, 10, 30, 12, 0, 0))
    runFixed()
    expect(posted().at(-1)).toBe('fx-f0-2026-11@2026-11-30')
  })

  it('never logs more than a year back, and never makes the same expense twice', () => {
    setup([{ day: 1, lastPosted: '2019-01' }])
    runFixed()
    expect(posted()).toHaveLength(13)
    runFixed()
    expect(posted()).toHaveLength(13)
  })
})
