import { describe, it, expect, beforeEach } from 'vitest'
import { nodeDb } from './db-helpers.js'
import { ensureSchema, MIGRATIONS } from '../src/db/schema.js'
import { loadState, saveDiff, importState, isEmpty, counts, getMeta, setMeta } from '../src/db/repo.js'
import { sanitize } from '../src/store.js'

const base = () => sanitize(null)
const bySort = (list) => [...list].sort((a, b) => (a.ts - b.ts) || a.id.localeCompare(b.id))

// a state with a bit of everything
function sample() {
  const s = base()
  s.entered = true
  s.setupDone = true
  s.stateName = 'Mine'
  s.map = 'lego'
  s.counties = [
    { id: 'c1', name: 'Home', group: 'Home', style: 'house', icon: 'home', color: '#e5383b' },
    { id: 'c2', name: 'Cafes', group: 'Food', style: 'cafe', icon: 'coffee', color: '#3a86ff' },
    { id: 'c3', name: 'Transit', group: 'Other', style: 'depot', icon: 'bus', color: '#8338ec' },
  ]
  s.accounts = [{ id: 'a1', name: 'Main', currency: 'INR' }, { id: 'a2', name: 'Ireland', currency: 'EUR' }]
  s.fixed = [{ id: 'f1', name: 'iCloud', amount: 75, countyId: 'c1', accountId: 'a1', day: 5, methodType: 'bank', methodName: 'Revolut', lastPosted: null }]
  s.expenses = [
    { id: 'e1', countyId: 'c2', amount: 10, total: 30, accountId: 'a2', currency: 'EUR', methodType: 'bank', methodName: 'Revolut', people: 3, note: 'dinner', ts: 1_760_000_000_000, fixedId: null },
    { id: 'e2', countyId: 'c1', amount: 75, total: 75, accountId: 'a1', currency: 'INR', methodType: 'bank', methodName: '', people: 1, note: '', ts: 1_760_100_000_000, fixedId: 'f1' },
    { id: 'e3', countyId: 'c3', amount: 12.5, total: 12.5, accountId: 'a2', currency: 'EUR', methodType: 'cash', methodName: '', people: 1, note: 'bus', ts: 1_759_900_000_000, fixedId: null },
  ]
  return s
}

let db
beforeEach(async () => {
  db = nodeDb()
  await ensureSchema(db)
})

describe('schema', () => {
  it('creates every table and remembers its version', async () => {
    const names = (await db.all("select name from sqlite_master where type = 'table' order by name")).map((r) => r.name)
    for (const t of ['meta', 'counties', 'accounts', 'fixed_expenses', 'expenses', 'settings']) expect(names).toContain(t)
    expect(await getMeta(db, 'schema_version')).toBe(String(MIGRATIONS.length))
  })

  it('can run again without changing anything', async () => {
    await importState(db, sample())
    await ensureSchema(db)
    expect((await counts(db)).expenses).toBe(3)
  })
})

describe('moving a whole state in and out', () => {
  it('gives back exactly what went in', async () => {
    const s = sample()
    expect(await isEmpty(db)).toBe(true)
    await importState(db, s)
    expect(await isEmpty(db)).toBe(false)
    const back = await loadState(db, base())
    expect(back.counties).toEqual(s.counties)
    expect(back.accounts).toEqual(s.accounts)
    expect(back.fixed).toEqual(s.fixed.map((f) => ({ ...f, lastPosted: undefined })).map(({ lastPosted, ...rest }) => rest)) // a missing value stays missing
    expect(back.expenses).toEqual(bySort(s.expenses).map(({ fixedId, ...e }) => (fixedId ? { ...e, fixedId } : e)))
    expect(back.stateName).toBe('Mine')
    expect(back.map).toBe('lego')
    expect(back.methods).toEqual(s.methods)
    expect(back.entered).toBe(true)
  })

  it('keeps the order of the counties (it decides where they are on the map)', async () => {
    const s = sample()
    s.counties = [s.counties[2], s.counties[0], s.counties[1]]
    await importState(db, s)
    expect((await loadState(db, base())).counties.map((c) => c.id)).toEqual(['c3', 'c1', 'c2'])
  })

  it('marks everything as waiting to be sent', async () => {
    await importState(db, sample())
    expect((await db.all('select count(*) as n from expenses where dirty = 1'))[0].n).toBe(3)
  })

  it('keeps numbers exact: no rounding on the way', async () => {
    const s = sample()
    s.expenses[0].amount = 333.33
    s.expenses[0].total = 999.99
    await importState(db, s)
    const e = (await loadState(db, base())).expenses.find((x) => x.id === 'e1')
    expect(e.amount).toBe(333.33)
    expect(e.total).toBe(999.99)
  })
})

describe('keeping the database in step with the state', () => {
  async function started() {
    const s = sample()
    await importState(db, s)
    await db.run('update expenses set dirty = 0')
    await db.run('update counties set dirty = 0')
    return s
  }

  it('writes nothing when nothing changed', async () => {
    const s = await started()
    expect(await saveDiff(db, s, { ...s })).toBe(0)
  })

  it('writes only the expense that was added', async () => {
    const s = await started()
    const e = { id: 'e9', countyId: 'c1', amount: 5, total: 5, accountId: 'a1', currency: 'INR', methodType: 'cash', methodName: '', people: 1, note: 'tea', ts: 1_760_200_000_000, fixedId: null }
    expect(await saveDiff(db, s, { ...s, expenses: [...s.expenses, e] }, 5000)).toBe(1)
    const row = (await db.all("select * from expenses where id = 'e9'"))[0]
    expect(row.dirty).toBe(1)
    expect(row.updated_at).toBe(5000)
    expect((await db.all('select count(*) as n from expenses where dirty = 1'))[0].n).toBe(1)
  })

  it('writes only the expense that was edited', async () => {
    const s = await started()
    const edited = { ...s.expenses[0], note: 'changed' }
    const next = { ...s, expenses: s.expenses.map((e) => (e.id === 'e1' ? edited : e)) }
    expect(await saveDiff(db, s, next, 7000)).toBe(1)
    expect((await db.all("select note, dirty, updated_at from expenses where id = 'e1'"))[0]).toEqual({ note: 'changed', dirty: 1, updated_at: 7000 })
  })

  it('keeps a deleted expense as a mark that it is deleted, and does not load it again', async () => {
    const s = await started()
    expect(await saveDiff(db, s, { ...s, expenses: s.expenses.filter((e) => e.id !== 'e2') }, 8000)).toBe(1)
    const row = (await db.all("select deleted, dirty, updated_at from expenses where id = 'e2'"))[0]
    expect(row).toEqual({ deleted: 1, dirty: 1, updated_at: 8000 })
    expect((await loadState(db, base())).expenses.map((e) => e.id)).not.toContain('e2')
    expect((await counts(db)).expenses).toBe(2)
  })

  it('brings back an expense that was deleted and added again with the same id', async () => {
    const s = await started()
    const without = { ...s, expenses: s.expenses.filter((e) => e.id !== 'e2') }
    await saveDiff(db, s, without, 8000)
    await saveDiff(db, without, s, 9000)
    expect((await loadState(db, base())).expenses.map((e) => e.id)).toContain('e2')
    expect((await db.all("select deleted from expenses where id = 'e2'"))[0].deleted).toBe(0)
  })

  it('notices when counties are moved around', async () => {
    const s = await started()
    const next = { ...s, counties: [s.counties[1], s.counties[0], s.counties[2]] }
    expect(await saveDiff(db, s, next)).toBe(2)
    expect((await loadState(db, base())).counties.map((c) => c.id)).toEqual(['c2', 'c1', 'c3'])
  })

  it('saves a changed setting, and only when it changed', async () => {
    const s = await started()
    expect(await saveDiff(db, s, { ...s, appearance: 'dark' })).toBe(1)
    expect((await loadState(db, base())).appearance).toBe('dark')
    expect(await saveDiff(db, { ...s, appearance: 'dark' }, { ...s, appearance: 'dark' })).toBe(0)
  })

  it('is all or nothing: a bad record in a batch saves none of it', async () => {
    const s = await started()
    const good = { ...s.expenses[0], id: 'g1' }
    const bad = { ...s.expenses[0], id: 'b1', amount: null } // not allowed to be empty
    await expect(saveDiff(db, s, { ...s, expenses: [...s.expenses, good, bad] })).rejects.toThrow()
    expect((await counts(db)).expenses).toBe(3)
  })

  it('handles a big pile of expenses quickly', async () => {
    const s = base()
    s.expenses = Array.from({ length: 20000 }, (_, i) => ({ id: 'x' + i, countyId: 'c1', amount: 1 + i / 100, total: 1 + i / 100, accountId: 'a1', currency: 'INR', methodType: 'cash', methodName: '', people: 1, note: '', ts: 1_700_000_000_000 + i, fixedId: null }))
    const t0 = Date.now()
    await importState(db, s)
    const added = { ...s.expenses[0], id: 'new' }
    await saveDiff(db, s, { ...s, expenses: [...s.expenses, added] })
    expect((await loadState(db, base())).expenses.length).toBe(20001)
    expect(Date.now() - t0).toBeLessThan(8000)
  })
})

describe('meta', () => {
  it('stores small notes for later, like where syncing got to', async () => {
    expect(await getMeta(db, 'cursor')).toBe(null)
    await setMeta(db, 'cursor', 42)
    await setMeta(db, 'cursor', 43)
    expect(await getMeta(db, 'cursor')).toBe('43')
  })
})
