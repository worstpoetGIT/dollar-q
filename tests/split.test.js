import { describe, it, expect, beforeEach } from 'vitest'
import { splitShares, shareFor, shareOf } from '../src/util.js'
import { addExpense, updateExpense, getState, resetAll, sanitize } from '../src/store.js'
import { nodeDb } from './db-helpers.js'
import { ensureSchema, MIGRATIONS } from '../src/db/schema.js'
import { loadState, saveDiff, importState } from '../src/db/repo.js'
import { dirtyChanges } from '../src/sync/engine.js'

const sum = (a) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100

describe('splitting one bill unevenly', () => {
  it('turns percentages into amounts (50 split 32 / 24 / 44)', () => {
    expect(splitShares(50, { mode: 'percent', parts: [32, 24, 44] })).toEqual([16, 12, 22])
  })

  it('takes exact amounts when they add up to the total (16 + 12 + 22 = 50)', () => {
    expect(splitShares(50, { mode: 'amount', parts: [16, 12, 22] })).toEqual([16, 12, 22])
  })

  it('refuses amounts that are a cent short or over, and percentages that miss 100', () => {
    expect(splitShares(50, { mode: 'amount', parts: [16, 12, 21.99] })).toBeNull()
    expect(splitShares(50, { mode: 'amount', parts: [16, 12, 22.01] })).toBeNull()
    expect(splitShares(50, { mode: 'percent', parts: [32, 24, 43.99] })).toBeNull()
    expect(splitShares(50, { mode: 'percent', parts: [32, 24, 44.01] })).toBeNull()
  })

  it('always adds up to the total to the cent, even when percentages do not cut evenly', () => {
    const shares = splitShares(10, { mode: 'percent', parts: [33.33, 33.33, 33.34] })
    expect(sum(shares)).toBe(10)
    const odd = splitShares(0.1, { mode: 'percent', parts: [50, 50] })
    expect(sum(odd)).toBe(0.1)
    for (let i = 0; i < 200; i++) {
      const total = Math.round(Math.random() * 100000) / 100 + 0.02
      const a = Math.round(Math.random() * 9998 + 1) / 100
      const out = splitShares(total, { mode: 'percent', parts: [a, Math.round((100 - a) * 100) / 100] })
      if (out) expect(sum(out)).toBe(Math.round(total * 100) / 100)
    }
  })

  it('gives the leftover cent to the biggest remainder, earlier person first on a tie', () => {
    // 0.05 split 50/50: 2.5 cents each, so the first person gets the extra cent
    expect(splitShares(0.05, { mode: 'percent', parts: [50, 50] })).toEqual([0.03, 0.02])
  })

  it('refuses zero, negative, missing or silly parts and head counts', () => {
    for (const parts of [[0, 100], [-10, 110], [50, null], [50, NaN], [100], [], 'x']) {
      expect(splitShares(50, { mode: 'percent', parts })).toBeNull()
    }
    expect(splitShares(50, { mode: 'percent', parts: Array(21).fill(100 / 21) })).toBeNull()
    expect(splitShares(50, { mode: 'nope', parts: [50, 50] })).toBeNull()
    expect(splitShares(50, null)).toBeNull()
  })

  it('refuses a split where somebody would get less than a cent', () => {
    expect(splitShares(0.01, { mode: 'percent', parts: [50, 50] })).toBeNull()
  })

  it('shareFor is my part of the split, or an equal share when there is none', () => {
    expect(shareFor(50, 3, { mode: 'percent', parts: [32, 24, 44] })).toBe(16)
    expect(shareFor(30, 3, null)).toBe(shareOf(30, 3))
    expect(shareFor(30, 3, { mode: 'percent', parts: [10, 10] })).toBe(10) // a split that does not work falls back to equal
  })
})

describe('saving an expense with an uneven split', () => {
  beforeEach(() => resetAll())
  const cid = () => getState().counties[0].id

  it('keeps the whole math in the record and counts only my share', () => {
    const e = addExpense({ countyId: cid(), amount: 50, split: { mode: 'amount', parts: [16, 12, 22] } })
    expect(e.total).toBe(50)
    expect(e.amount).toBe(16)
    expect(e.people).toBe(3)
    expect(e.split).toEqual({ mode: 'amount', parts: [16, 12, 22] })
    expect(getState().expenses[0].amount).toBe(16)
  })

  it('works for percentages too', () => {
    const e = addExpense({ countyId: cid(), amount: 50, split: { mode: 'percent', parts: [32, 24, 44] } })
    expect(e.amount).toBe(16)
    expect(e.split.mode).toBe('percent')
  })

  it('does not save a split that is not fully settled', () => {
    expect(addExpense({ countyId: cid(), amount: 50, split: { mode: 'amount', parts: [16, 12, 20] } })).toBeNull()
    expect(addExpense({ countyId: cid(), amount: 50, split: { mode: 'percent', parts: [50, 40] } })).toBeNull()
    expect(getState().expenses.length).toBe(0)
  })

  it('ignores the people count when a split is given, the split decides', () => {
    const e = addExpense({ countyId: cid(), amount: 50, people: 7, split: { mode: 'amount', parts: [20, 30] } })
    expect(e.people).toBe(2)
  })

  it('edits an uneven split, and goes back to equal by dropping it', () => {
    const e = addExpense({ countyId: cid(), amount: 50, split: { mode: 'amount', parts: [16, 12, 22] } })
    const a = updateExpense(e.id, { countyId: cid(), amount: 60, split: { mode: 'percent', parts: [50, 25, 25] } })
    expect(a.amount).toBe(30)
    expect(a.split.parts).toEqual([50, 25, 25])
    const b = updateExpense(e.id, { countyId: cid(), amount: 60, people: 3 })
    expect(b.amount).toBe(20)
    expect(b.split).toBeUndefined()
    expect(getState().expenses[0].split).toBeUndefined()
  })

  it('an old equal expense is untouched', () => {
    const e = addExpense({ countyId: cid(), amount: 30, people: 3 })
    expect(e.split).toBeUndefined()
    expect(e.amount).toBe(10)
  })
})

describe('a split coming from a backup or another phone', () => {
  const raw = (split) => ({
    v: 1,
    entered: true,
    counties: [{ id: 'c1', name: 'Home', group: 'Home', style: 'house', icon: 'home', color: '#e5383b' }],
    accounts: [{ id: 'a1', name: 'Main', currency: 'EUR' }],
    expenses: [{ id: 'e1', countyId: 'c1', accountId: 'a1', amount: 99, total: 50, people: 1, currency: 'EUR', methodType: 'cash', note: '', ts: 1_760_000_000_000, split }],
  })

  it('keeps a good split and works the share out again from it', () => {
    const e = sanitize(raw({ mode: 'amount', parts: [16, 12, 22] })).expenses[0]
    expect(e.amount).toBe(16)
    expect(e.people).toBe(3)
    expect(e.split).toEqual({ mode: 'amount', parts: [16, 12, 22] })
  })

  it('throws away a split that does not add up, and falls back to an equal share', () => {
    const e = sanitize(raw({ mode: 'amount', parts: [16, 12, 99] })).expenses[0]
    expect(e.split).toBeUndefined()
    expect(e.people).toBe(1)
    expect(e.amount).toBe(50)
  })

  it('throws away junk without crashing', () => {
    for (const bad of ['x', 5, [], { mode: 'percent' }, { mode: 'percent', parts: 'a' }, { parts: [1, 2] }]) {
      expect(() => sanitize(raw(bad))).not.toThrow()
      expect(sanitize(raw(bad)).expenses[0].split).toBeUndefined()
    }
  })
})

describe('the split in the phone database and in sync', () => {
  const state = () => {
    const s = sanitize(null)
    s.counties = [{ id: 'c1', name: 'Home', group: 'Home', style: 'house', icon: 'home', color: '#e5383b' }]
    s.accounts = [{ id: 'a1', name: 'Main', currency: 'EUR' }]
    s.expenses = [
      { id: 'e1', countyId: 'c1', accountId: 'a1', amount: 16, total: 50, people: 3, currency: 'EUR', methodType: 'cash', methodName: '', note: '', ts: 1_760_000_000_000, fixedId: null, split: { mode: 'amount', parts: [16, 12, 22] } },
      { id: 'e2', countyId: 'c1', accountId: 'a1', amount: 10, total: 30, people: 3, currency: 'EUR', methodType: 'cash', methodName: '', note: '', ts: 1_760_000_001_000, fixedId: null },
    ]
    return s
  }

  it('comes back from the database exactly as saved, and an equal one stays without a split', async () => {
    const db = nodeDb()
    await ensureSchema(db)
    await importState(db, state())
    const back = await loadState(db, sanitize(null))
    expect(back.expenses[0].split).toEqual({ mode: 'amount', parts: [16, 12, 22] })
    expect(back.expenses[1].split).toBeUndefined()
  })

  it('saves a split added or removed later', async () => {
    const db = nodeDb()
    await ensureSchema(db)
    const s0 = state()
    await importState(db, s0)
    const s1 = { ...s0, expenses: [{ ...s0.expenses[0], split: undefined, amount: 16.67, people: 3 }, s0.expenses[1]] }
    delete s1.expenses[0].split
    await saveDiff(db, s0, s1, 2_000)
    expect((await loadState(db, sanitize(null))).expenses[0].split).toBeUndefined()
  })

  it('sends the split to the server as an object, not as text', async () => {
    const db = nodeDb()
    await ensureSchema(db)
    await importState(db, state())
    const changes = (await dirtyChanges(db)).map((d) => d.change)
    const e1 = changes.find((c) => c.id === 'e1')
    expect(e1.data.split).toEqual({ mode: 'amount', parts: [16, 12, 22] })
    expect(changes.find((c) => c.id === 'e2').data.split).toBeUndefined()
  })

  it('upgrades a version 1 database, keeping its expenses', async () => {
    const db = nodeDb()
    await db.tx(async (c) => { for (const sql of MIGRATIONS[0]) await c.run(sql); await c.run("insert into meta (key, value) values ('schema_version', '1')") })
    await db.run("insert into expenses (id, county_id, account_id, amount, total, people, currency, method_type, method_name, note, ts, fixed_id, updated_at, deleted, dirty) values ('old', 'c1', 'a1', 10, 30, 3, 'EUR', 'cash', '', '', 1760000000000, null, 5, 0, 0)")
    await ensureSchema(db)
    const rows = await db.all('select id, split from expenses')
    expect(rows).toEqual([{ id: 'old', split: null }])
    expect((await db.all("select value from meta where key = 'schema_version'"))[0].value).toBe('2')
  })
})
