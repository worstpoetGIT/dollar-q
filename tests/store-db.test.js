import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nodeDb } from './db-helpers.js'
import { ensureSchema } from '../src/db/schema.js'
import { loadState, counts, getMeta } from '../src/db/repo.js'

// how data looked before the split feature (v0.1.x): the whole bill is in `amount`, no `total`
const oldData = () => ({
  v: 1, entered: true, setupDone: true, stateName: 'Boss', season: 'summer', appearance: 'dark', minimal: false, map: 'japan', currency: 'EUR',
  counties: [
    { id: 'c1', name: 'Home & Rent', group: 'Home', style: 'house', icon: 'home', color: '#e5383b' },
    { id: 'c5', name: 'Groceries', group: 'Food', style: 'market', icon: 'cart', color: '#2d936c' },
  ],
  methods: { bank: ['Revolut'], debit: ['Debit Card 1'], credit: [], cash: true },
  accounts: [{ id: 'a1', name: 'Main', currency: 'INR' }, { id: 'a2', name: 'Ireland', currency: 'EUR' }],
  fixed: [{ id: 'f1', name: 'Hotstar', amount: 699, countyId: 'c1', accountId: 'a1', day: 16, methodType: 'bank', methodName: 'Revolut', lastPosted: '2026-11' }],
  expenses: [
    { id: 'old1', countyId: 'c5', amount: 30, accountId: 'a2', currency: 'EUR', methodType: 'bank', methodName: 'Revolut', people: 3, note: 'dinner', ts: 1_762_000_000_000, fixedId: null },
    { id: 'old2', countyId: 'c1', amount: 699, accountId: 'a1', currency: 'INR', methodType: 'bank', methodName: 'Revolut', people: 1, note: 'Hotstar', ts: 1_762_500_000_000, fixedId: 'f1' },
    { id: 'old3', countyId: 'c5', amount: 8.96, accountId: 'a2', currency: 'EUR', methodType: 'cash', methodName: '', people: 1, note: '', ts: 1_762_100_000_000, fixedId: null },
  ],
})

let db
let store

// start the app fresh, the way a phone does: whatever is in saved storage is loaded, then the database opens
async function startApp(opener = async () => db) {
  vi.resetModules()
  store = await import('../src/store.js')
  await store.startDatabase(opener)
  return store
}

beforeEach(async () => {
  localStorage.clear()
  db = nodeDb()
  await ensureSchema(db)
})

describe('first start of the new version, with data from the old one', () => {
  it('moves everything into the database and changes nothing for the user', async () => {
    localStorage.setItem('dollar-q:v1', JSON.stringify(oldData()))
    const before = JSON.stringify(JSON.parse(localStorage.getItem('dollar-q:v1')))
    await startApp()
    const s = store.getState()
    expect(s.expenses).toHaveLength(3)
    expect(await counts(db)).toEqual({ counties: 2, accounts: 2, fixed: 1, expenses: 3 })
    expect(await getMeta(db, 'legacy_imported')).toBeTruthy()
    // the old saved copy is still there, untouched, for going back
    expect(localStorage.getItem('dollar-q:v1')).toBeTruthy()
    expect(before).toBe(JSON.stringify(JSON.parse(before)))
  })

  it('applies the share rule to old data on the way in (the 30 dinner for 3 becomes 10)', async () => {
    localStorage.setItem('dollar-q:v1', JSON.stringify(oldData()))
    await startApp()
    const dinner = (await loadState(db, store.getState())).expenses.find((e) => e.id === 'old1')
    expect(dinner.total).toBe(30)
    expect(dinner.amount).toBe(10)
    expect(dinner.people).toBe(3)
  })

  it('keeps every setting, account and county in the same order', async () => {
    localStorage.setItem('dollar-q:v1', JSON.stringify(oldData()))
    await startApp()
    const s = await loadState(db, store.getState())
    expect(s.stateName).toBe('Boss')
    expect(s.map).toBe('japan')
    expect(s.counties.map((c) => c.id)).toEqual(['c1', 'c5'])
    expect(s.accounts.map((a) => a.currency)).toEqual(['INR', 'EUR'])
    expect(s.fixed[0].lastPosted).toBe('2026-11')
    expect(s.methods.bank).toEqual(['Revolut'])
  })

  it('does nothing for someone who has never used the app', async () => {
    await startApp()
    expect(store.getState().entered).toBe(false)
    expect(await getMeta(db, 'legacy_imported')).toBeTruthy()
  })
})

describe('after that', () => {
  beforeEach(() => { localStorage.setItem('dollar-q:v1', JSON.stringify(oldData())) })

  it('writes every change into the database, in order', async () => {
    await startApp()
    const e = store.addExpense({ countyId: 'c5', amount: 60, accountId: 'a2', people: 2, note: 'tea', ts: Date.now() })
    store.updateExpense('old3', { countyId: 'c5', amount: 9.5, accountId: 'a2', note: 'edited', ts: 1_762_100_000_000 })
    store.deleteExpense('old1')
    await store.flushDatabase()
    const s = await loadState(db, store.getState())
    expect(s.expenses.map((x) => x.id)).toContain(e.id)
    expect(s.expenses.find((x) => x.id === e.id).amount).toBe(30) // my share of 60 for 2
    expect(s.expenses.find((x) => x.id === 'old3').note).toBe('edited')
    expect(s.expenses.find((x) => x.id === 'old1')).toBeUndefined()
    expect((await db.all("select deleted from expenses where id = 'old1'"))[0].deleted).toBe(1)
  })

  it('the next start loads the same data from the database, even if the saved copy is gone', async () => {
    await startApp()
    store.addExpense({ countyId: 'c5', amount: 5, accountId: 'a2', note: 'later', ts: Date.now() })
    await store.flushDatabase()
    const ids = store.getState().expenses.map((e) => e.id).sort()
    localStorage.clear() // iOS cleared its web storage
    await startApp()
    expect(store.getState().expenses.map((e) => e.id).sort()).toEqual(ids)
    expect(store.getState().stateName).toBe('Boss')
  })

  it('a change made while the database was still opening is not lost', async () => {
    await startApp() // first start, imports
    await store.flushDatabase()
    vi.resetModules()
    store = await import('../src/store.js')
    store.addExpense({ countyId: 'c5', amount: 7, accountId: 'a2', note: 'too early', ts: Date.now() })
    await store.startDatabase(async () => db)
    await store.flushDatabase()
    expect((await loadState(db, store.getState())).expenses.some((e) => e.note === 'too early')).toBe(true)
  })

  it('the monthly subscription gets the same id on every phone', async () => {
    await startApp()
    store.setState((s) => ({ ...s, fixed: s.fixed.map((f) => ({ ...f, day: 1, lastPosted: '2000-01' })) }))
    store.runFixed()
    const ids = store.getState().expenses.filter((e) => e.fixedId === 'f1' && e.id.startsWith('fx-')).map((e) => e.id)
    expect(ids).toHaveLength(1)
    expect(ids[0]).toMatch(/^fx-f1-\d{4}-\d{2}$/)
    expect(ids[0].length).toBeLessThanOrEqual(24)
  })
})

describe('when the database misbehaves', () => {
  beforeEach(() => { localStorage.setItem('dollar-q:v1', JSON.stringify(oldData())) })

  it('keeps working from the saved copy if the database cannot start', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await startApp(async () => { throw new Error('plugin missing') })
    expect(store.getState().expenses).toHaveLength(3)
    store.addExpense({ countyId: 'c5', amount: 1, accountId: 'a2', note: 'still works', ts: Date.now() })
    expect(store.getState().expenses).toHaveLength(4)
    err.mockRestore()
  })

  it('never loses a change when a database write fails, and rebuilds the database next start', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await startApp()
    const real = db.tx
    db.tx = () => Promise.reject(new Error('disk full'))
    store.addExpense({ countyId: 'c5', amount: 11, accountId: 'a2', note: 'kept anyway', ts: Date.now() })
    await store.flushDatabase()
    expect(store.getState().expenses.some((e) => e.note === 'kept anyway')).toBe(true) // the app is fine
    expect(JSON.parse(localStorage.getItem('dollar-q:v1')).expenses.some((e) => e.note === 'kept anyway')).toBe(true) // so is the saved copy
    expect(localStorage.getItem('dollar-q:v1:db-broken')).toBe('1')
    db.tx = real
    await startApp() // the next start
    expect((await loadState(db, store.getState())).expenses.some((e) => e.note === 'kept anyway')).toBe(true)
    expect(localStorage.getItem('dollar-q:v1:db-broken')).toBe(null)
    err.mockRestore()
  })

  it('refuses to trust a database copy that does not match, and keeps the saved data', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const lying = nodeDb()
    await ensureSchema(lying)
    const realRun = lying.run
    lying.tx = async (fn) => fn({ ...lying, run: async (sql, p) => (/insert into expenses/.test(sql) ? undefined : realRun(sql, p)) }) // drops the expenses
    await startApp(async () => lying)
    expect(store.getState().expenses).toHaveLength(3)
    expect(await getMeta(lying, 'legacy_imported')).toBe(null) // not marked as moved
    err.mockRestore()
  })
})
