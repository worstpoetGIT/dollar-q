import { describe, it, expect, beforeEach, vi } from 'vitest'

let store
beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  store = await import('../src/store.js')
  store.setState((s) => ({
    ...s,
    entered: true,
    expenses: [
      { id: 'e1', countyId: 'c1', amount: 10, total: 10, accountId: 'a1', currency: 'INR', methodType: 'cash', methodName: '', people: 1, note: 'one', ts: 1_760_000_000_000 },
      { id: 'e2', countyId: 'c1', amount: 20, total: 20, accountId: 'a1', currency: 'INR', methodType: 'cash', methodName: '', people: 1, note: 'two', ts: 1_760_000_100_000 },
    ],
  }))
})

const remote = (kind, id, data, over = {}) => ({ kind, id, updatedAt: 9_000_000_000_000, deleted: false, data, ...over })
const full = (note, over = {}) => ({ countyId: 'c1', amount: 5, total: 5, accountId: 'a1', currency: 'INR', methodType: 'cash', methodName: '', people: 1, note, ts: 1_760_000_200_000, ...over })

describe('putting what came from the cloud on screen', () => {
  it('adds a new expense', () => {
    const base = store.getState()
    store.applySynced([remote('expense', 'e3', full('from the other phone'))], base)
    expect(store.getState().expenses.map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect(store.getState().expenses[2].note).toBe('from the other phone')
  })

  it('replaces an expense that was edited elsewhere', () => {
    const base = store.getState()
    store.applySynced([remote('expense', 'e1', full('edited elsewhere'))], base)
    const e1 = store.getState().expenses.find((e) => e.id === 'e1')
    expect(e1.note).toBe('edited elsewhere')
    expect(store.getState().expenses).toHaveLength(2)
  })

  it('removes an expense that was deleted elsewhere', () => {
    const base = store.getState()
    store.applySynced([remote('expense', 'e2', {}, { deleted: true })], base)
    expect(store.getState().expenses.map((e) => e.id)).toEqual(['e1'])
  })

  it('does not overwrite an expense the person edited while the sync was running', () => {
    const base = store.getState() // what the sync started from
    store.updateExpense('e1', { countyId: 'c1', amount: 10, accountId: 'a1', note: 'typed during the sync', ts: 1_760_000_000_000 })
    store.applySynced([remote('expense', 'e1', full('older edit from the cloud'))], base)
    expect(store.getState().expenses.find((e) => e.id === 'e1').note).toBe('typed during the sync')
  })

  it('does not bring back an expense the person deleted while the sync was running', () => {
    const base = store.getState()
    store.deleteExpense('e1')
    store.applySynced([remote('expense', 'e1', full('came back?'))], base)
    expect(store.getState().expenses.map((e) => e.id)).toEqual(['e2'])
  })

  it('still applies the other changes when one record was edited meanwhile', () => {
    const base = store.getState()
    store.updateExpense('e1', { countyId: 'c1', amount: 10, accountId: 'a1', note: 'mine', ts: 1_760_000_000_000 })
    store.applySynced([remote('expense', 'e1', full('skipped')), remote('expense', 'e3', full('added'))], base)
    const notes = store.getState().expenses.map((e) => e.note)
    expect(notes).toContain('mine')
    expect(notes).toContain('added')
  })

  it('shares the person settings and leaves this phone settings alone', () => {
    store.setState((s) => ({ ...s, appearance: 'dark', map: 'lego' }))
    const base = store.getState()
    store.applySynced([remote('settings', 'settings', { stateName: 'From cloud', currency: 'EUR', appearance: 'light', map: 'ice' })], base)
    const s = store.getState()
    expect(s.stateName).toBe('From cloud')
    expect(s.currency).toBe('EUR')
    expect(s.appearance).toBe('dark')
    expect(s.map).toBe('lego')
  })

  it('takes the whole ordered list of counties when nobody touched them meanwhile', () => {
    const base = store.getState()
    const reordered = [...base.counties].reverse()
    store.applySynced([remote('county', base.counties[0].id, { name: 'x', pos: 5 })], base, { counties: reordered })
    expect(store.getState().counties.map((c) => c.id)).toEqual(reordered.map((c) => c.id))
  })

  it('leaves the counties alone if the person changed them meanwhile', () => {
    const base = store.getState()
    store.setState((s) => ({ ...s, counties: s.counties.map((c, i) => (i === 0 ? { ...c, name: 'my rename' } : c)) }))
    store.applySynced([remote('county', base.counties[0].id, { name: 'x', pos: 0 })], base, { counties: [...base.counties].reverse() })
    expect(store.getState().counties[0].name).toBe('my rename')
  })

  it('does nothing, and tells nobody, when there is nothing new', () => {
    const seen = []
    const stop = store.onStateChange((src) => seen.push(src))
    const before = store.getState()
    store.applySynced([], before)
    expect(store.getState()).toBe(before)
    expect(seen).toEqual([])
    stop()
  })

  it('tells the screens that something changed', () => {
    const calls = []
    const stop = store.onStateChange((src) => calls.push(src))
    store.applySynced([remote('expense', 'e9', full('x'))], store.getState())
    expect(calls).toEqual(['sync'])
    stop()
  })
})
