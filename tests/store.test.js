import { describe, it, expect, beforeEach } from 'vitest'
import { addExpense, updateExpense, deleteExpense, getState, resetAll } from '../src/store.js'

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
