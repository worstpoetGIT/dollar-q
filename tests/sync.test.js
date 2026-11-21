import { describe, it, expect, beforeEach } from 'vitest'
import { nodeDb } from './db-helpers.js'
import { fakeCloud } from './fake-cloud.js'
import { ensureSchema } from '../src/db/schema.js'
import { loadState, saveDiff, importState, getMeta } from '../src/db/repo.js'
import { syncOnce, dirtyChanges, wipeLocal, markAllDirty } from '../src/sync/engine.js'
import { sanitize } from '../src/store.js'

const base = () => sanitize(null)
const exp = (id, over = {}) => ({ id, countyId: 'c1', amount: 10, total: 10, accountId: 'a1', currency: 'INR', methodType: 'cash', methodName: '', people: 1, note: '', ts: 1_760_000_000_000, ...over })

// a phone: its own database, a clock we control, and the same moves the app makes
let phones = 0
async function phone(cloud, name = 'phone') {
  const db = nodeDb()
  await ensureSchema(db)
  const me = { name, db, state: base(), clock: 1_000_000 + 500 * phones++, accepted: [] } // each phone's clock is a little different, like real ones
  me.tick = (ms = 1000) => { me.clock += ms; return me.clock }
  me.change = async (fn) => { const prev = me.state; me.state = fn(prev); await saveDiff(db, prev, me.state, me.tick()) }
  me.add = (e) => me.change((s) => ({ ...s, expenses: [...s.expenses, e] }))
  me.edit = (id, patch) => me.change((s) => ({ ...s, expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  me.remove = (id) => me.change((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }))
  // after a sync the screen shows what is in the database (in the app, applySynced does this)
  me.sync = async () => {
    const out = await syncOnce({ db, api: cloud.api, flush: async () => {}, getState: () => me.state, patch: (a) => me.accepted.push(...a) })
    me.state = await loadState(db, base())
    return out
  }
  me.read = () => loadState(db, base())
  me.ids = async () => (await me.read()).expenses.map((e) => e.id).sort()
  return me
}

let cloud
beforeEach(() => { cloud = fakeCloud() })

describe('one phone', () => {
  it('sends what it has and marks it sent', async () => {
    const a = await phone(cloud)
    await a.add(exp('e1'))
    expect(await dirtyChanges(a.db)).toHaveLength(1)
    const r = await a.sync()
    expect(r.pushed).toBeGreaterThanOrEqual(1)
    expect(cloud.rows.has('expense:e1')).toBe(true)
    expect(await dirtyChanges(a.db)).toHaveLength(0)
  })

  it('does nothing the second time', async () => {
    const a = await phone(cloud)
    await a.add(exp('e1'))
    await a.sync()
    const n = cloud.rows.size
    const r = await a.sync()
    expect(r.pushed).toBe(0)
    expect(cloud.rows.size).toBe(n)
    expect(a.accepted).toEqual([]) // its own changes coming back are not "new"
  })

  it('an edit made while the data was being sent is still waiting afterwards', async () => {
    const a = await phone(cloud)
    await a.add(exp('e1', { note: 'first' }))
    const realPush = cloud.api.push
    cloud.api.push = async (changes) => { const out = await realPush(changes); await a.edit('e1', { note: 'edited in the middle' }); return out }
    await a.sync()
    cloud.api.push = realPush
    expect(await dirtyChanges(a.db)).toHaveLength(1)
    await a.sync()
    expect(cloud.rows.get('expense:e1').data.note).toBe('edited in the middle')
  })

  it('keeps everything waiting when there is no connection, and sends it later', async () => {
    const a = await phone(cloud)
    await a.add(exp('e1'))
    cloud.down.value = true
    await expect(a.sync()).rejects.toThrow()
    expect(await dirtyChanges(a.db)).toHaveLength(1)
    cloud.down.value = false
    await a.sync()
    expect(cloud.rows.has('expense:e1')).toBe(true)
  })

  it('one record the server will not take does not block the rest', async () => {
    cloud = fakeCloud({ reject: (ch) => ch.id === 'bad' })
    const a = await phone(cloud)
    await a.add(exp('good'))
    await a.add(exp('bad'))
    await a.sync()
    expect(cloud.rows.has('expense:good')).toBe(true)
    expect(await dirtyChanges(a.db)).toHaveLength(0)
    expect(await getMeta(a.db, 'rejected_total')).toBe('1')
  })
})

describe('two phones', () => {
  it('the second one gets what the first one added', async () => {
    const a = await phone(cloud, 'A')
    const b = await phone(cloud, 'B')
    await a.add(exp('e1', { note: 'dinner' }))
    await a.add(exp('e2'))
    await a.sync()
    await b.sync()
    expect(await b.ids()).toEqual(['e1', 'e2'])
    expect((await b.read()).expenses.find((e) => e.id === 'e1').note).toBe('dinner')
    expect((await dirtyChanges(b.db)).length).toBe(0) // not sent back
  })

  it('an edit travels both ways', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    await a.add(exp('e1'))
    await a.sync(); await b.sync()
    await b.edit('e1', { note: 'from B' })
    await b.sync(); await a.sync()
    expect((await a.read()).expenses[0].note).toBe('from B')
  })

  it('a delete travels, and the record does not come back', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    await a.add(exp('e1')); await a.add(exp('e2'))
    await a.sync(); await b.sync()
    await a.remove('e1')
    await a.sync(); await b.sync()
    expect(await b.ids()).toEqual(['e2'])
    await b.sync(); await a.sync()
    expect(await a.ids()).toEqual(['e2'])
  })

  it('the newest edit wins, whichever phone syncs first', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    await a.add(exp('e1'))
    await a.sync(); await b.sync()
    // both change the same expense while offline. B's edit is later.
    a.clock = 5_000_000; b.clock = 9_000_000
    await a.edit('e1', { note: 'A edit' })
    await b.edit('e1', { note: 'B edit (later)' })
    await b.sync() // B first
    await a.sync() // A's older edit must not undo it
    await b.sync()
    expect((await a.read()).expenses[0].note).toBe('B edit (later)')
    expect((await b.read()).expenses[0].note).toBe('B edit (later)')
    expect(cloud.rows.get('expense:e1').data.note).toBe('B edit (later)')
  })

  it('an older edit that arrives late does not undo a newer one on the same phone', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    await a.add(exp('e1')); await a.sync()
    a.clock = 9_000_000
    await a.edit('e1', { note: 'newest, still waiting on A' })
    b.clock = 5_000_000
    await b.sync()
    await b.edit('e1', { note: 'older, from B' })
    await b.sync()
    await a.sync() // A pulls B's older edit; it must not replace A's newer one
    expect((await a.read()).expenses[0].note).toBe('newest, still waiting on A')
    await a.sync()
    expect(cloud.rows.get('expense:e1').data.note).toBe('newest, still waiting on A')
  })

  it('both phones adding different things end with everything', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    await a.add(exp('a1')); await b.add(exp('b1'))
    await a.sync(); await b.sync(); await a.sync()
    expect(await a.ids()).toEqual(['a1', 'b1'])
    expect(await b.ids()).toEqual(['a1', 'b1'])
  })

  it('keeps counties in the order the first phone gave them', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    const county = (id, name) => ({ id, name, group: 'Other', style: 'shop', icon: 'tag', color: '#888888' })
    await a.change((s) => ({ ...s, counties: [county('c9', 'Last'), county('c1', 'First'), county('c5', 'Middle')] }))
    await a.sync(); await b.sync()
    expect((await b.read()).counties.map((c) => c.id)).toEqual(['c9', 'c1', 'c5'])
    expect(b.accepted.some((r) => r.kind === 'county')).toBe(true)
  })

  it('shares the person settings but not the phone settings', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    await a.change((s) => ({ ...s, stateName: 'Shared name', appearance: 'dark', map: 'lego', minimal: true, currency: 'EUR' }))
    await a.sync(); await b.sync()
    const s = await b.read()
    expect(s.stateName).toBe('Shared name')
    expect(s.currency).toBe('EUR')
    expect(s.appearance).toBe('system') // B keeps its own look
    expect(s.map).toBe('city')
    expect(s.minimal).toBe(false)
  })

  it('moves a big pile in pages without missing or repeating any', async () => {
    const a = await phone(cloud)
    const b = await phone(cloud)
    const big = Array.from({ length: 1300 }, (_, i) => exp('x' + i, { ts: 1_760_000_000_000 + i }))
    await a.change((s) => ({ ...s, expenses: big }))
    await a.sync()
    expect(cloud.size()).toBeGreaterThanOrEqual(1300)
    await b.sync()
    const ids = await b.ids()
    expect(ids).toHaveLength(1300)
    expect(new Set(ids).size).toBe(1300)
    expect(cloud.calls.pull).toBeGreaterThan(2) // it really did go page by page
  })
})

describe('the first time on an account', () => {
  it('starting again from the cloud brings down exactly what the cloud has', async () => {
    const a = await phone(cloud)
    await a.add(exp('e1')); await a.add(exp('e2'))
    await a.sync()
    const b = await phone(cloud)
    await b.add(exp('mine-only')) // something this phone had that the cloud does not
    await wipeLocal(b.db)
    b.state = base()
    await b.sync()
    expect(await b.ids()).toEqual(['e1', 'e2'])
  })

  it('merging keeps both: the cloud data and what this phone had', async () => {
    const a = await phone(cloud)
    await a.add(exp('e1')); await a.sync()
    const b = await phone(cloud)
    await importState(b.db, { ...base(), expenses: [exp('mine-only')] }, 1000)
    await markAllDirty(b.db)
    await b.sync(); await a.sync()
    expect(await b.ids()).toEqual(['e1', 'mine-only'])
    expect(await a.ids()).toEqual(['e1', 'mine-only'])
  })

  it('sending the same data from the same phone twice does not duplicate it', async () => {
    const a = await phone(cloud)
    await a.add(exp('e1')); await a.sync()
    await markAllDirty(a.db)
    await a.sync()
    expect(cloud.size()).toBe(1)
    expect(await a.ids()).toEqual(['e1'])
  })
})
