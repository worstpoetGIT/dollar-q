import { describe, it, expect, beforeEach } from 'vitest'
import { nodeDb } from './db-helpers.js'
import { fakeCloud } from './fake-cloud.js'
import { ensureSchema } from '../src/db/schema.js'
import { loadState, importState, saveDiff, getMeta } from '../src/db/repo.js'
import { wipeLocal, dirtyChanges } from '../src/sync/engine.js'
import { createService } from '../src/sync/service.js'
import { createSession } from '../src/sync/session.js'
import { ApiError } from '../src/sync/api.js'
import { sanitize } from '../src/store.js'

const base = () => sanitize(null)
const exp = (id, over = {}) => ({ id, countyId: 'c1', amount: 10, total: 10, accountId: 'a1', currency: 'INR', methodType: 'cash', methodName: '', people: 1, note: '', ts: 1_760_000_000_000, ...over })
const memory = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => m.set(k, v), remove: async (k) => m.delete(k), map: m } }

// a phone with the service running on it. `state` is what the screens would show.
async function phone(cloud, { entered = true, expenses = [] } = {}) {
  const db = nodeDb()
  await ensureSchema(db)
  const holder = { state: { ...base(), entered, expenses } }
  if (entered) await importState(db, holder.state, 5000)
  const store = memory()
  const auth = { codes: new Map(), accounts: new Map(), token: null }
  const api = {
    ...cloud.api,
    requestCode: async (email) => { if (auth.fail) throw new ApiError(503, 'could not send'); auth.codes.set(email.trim().toLowerCase(), '123456'); return { ok: true } },
    verify: async (email, code) => { if (auth.codes.get(email.trim().toLowerCase()) !== code) throw new ApiError(401, 'that code is wrong or has run out'); return { token: 'token-' + email } },
    logout: async () => ({ ok: true }),
    deleteAccount: async () => { cloud.rows.clear(); return { ok: true } },
  }
  const svc = createService({
    getDb: () => db,
    api,
    session: createSession(store),
    flush: async () => {},
    getState: () => holder.state,
    applySynced: () => {},
    clearForCloud: async () => { await wipeLocal(db); holder.state = { ...base(), counties: [], accounts: [], fixed: [], expenses: [] } },
  })
  const me = { db, svc, holder, store, auth, api, st: () => svc.getStatus(), read: () => loadState(db, base()), ids: async () => (await loadState(db, base())).expenses.map((e) => e.id).sort() }
  me.signIn = async (email = 'boss@example.com', code = '123456') => { await svc.sendCode(email); await svc.verifyCode(code) }
  await svc.start()
  return me
}

let cloud
beforeEach(() => { cloud = fakeCloud() })

describe('starting', () => {
  it('shows signed out when there is no login', async () => {
    const p = await phone(cloud)
    expect(p.st().phase).toBe('signedOut')
  })

  it('shows signed in when a login was kept', async () => {
    const p = await phone(cloud)
    await p.signIn()
    p.svc.getStatus()
    const again = createService({ getDb: () => p.db, api: p.api, session: createSession(p.store), flush: async () => {}, getState: () => p.holder.state, applySynced: () => {}, clearForCloud: async () => {} })
    await again.start()
    expect(again.getStatus().phase).toBe('idle')
    expect(again.getStatus().email).toBe('boss@example.com')
  })

  it('is not available where there is no database', async () => {
    const svc = createService({ getDb: () => null, api: {}, session: createSession(memory()), flush: async () => {}, getState: () => ({}), applySynced: () => {}, clearForCloud: async () => {} })
    await svc.start()
    expect(svc.getStatus().phase).toBe('unavailable')
  })
})

describe('signing in with an email code', () => {
  it('asks for a code, then a right code signs in', async () => {
    const p = await phone(cloud)
    await p.svc.sendCode('Boss@Example.com ')
    expect(p.st().phase).toBe('codeSent')
    expect(p.st().email).toBe('boss@example.com')
    await p.svc.verifyCode('123456')
    expect(p.st().phase).toBe('idle')
    expect(await p.store.get('dollarq-session')).toBe('token-boss@example.com')
  })

  it('says so when the email cannot be sent, and stays on the email step', async () => {
    const p = await phone(cloud)
    p.auth.fail = true
    await p.svc.sendCode('boss@example.com')
    expect(p.st().phase).toBe('signedOut')
    expect(p.st().error).toMatch(/could not send the email/i)
  })

  it('a wrong code gives an error and lets you try again', async () => {
    const p = await phone(cloud)
    await p.svc.sendCode('boss@example.com')
    await p.svc.verifyCode('000000')
    expect(p.st().phase).toBe('codeSent')
    expect(p.st().error).toMatch(/wrong/i)
    await p.svc.verifyCode('123456')
    expect(p.st().phase).toBe('idle')
    expect(p.st().error).toBe('')
  })

  it('a phone that is offline says so', async () => {
    const p = await phone(cloud)
    p.api.requestCode = async () => { throw new ApiError(0, 'no connection') }
    await p.svc.sendCode('boss@example.com')
    expect(p.st().error).toMatch(/no connection/i)
  })
})

describe('the first time on an account', () => {
  it('a new account gets everything the phone has', async () => {
    const p = await phone(cloud, { expenses: [exp('e1'), exp('e2')] })
    await p.signIn()
    expect(p.st().phase).toBe('idle')
    expect(cloud.rows.has('expense:e1')).toBe(true)
    expect(cloud.rows.has('expense:e2')).toBe(true)
    expect(await getMeta(p.db, 'account_email')).toBe('boss@example.com')
    expect(await dirtyChanges(p.db)).toHaveLength(0)
  })

  it('a new phone for an account that has data just takes the cloud data, without asking', async () => {
    const first = await phone(cloud, { expenses: [exp('e1'), exp('e2')] })
    await first.signIn()
    const second = await phone(cloud, { entered: false })
    await second.signIn()
    expect(second.st().phase).toBe('idle')
    expect(await second.ids()).toEqual(['e1', 'e2'])
  })

  it('a phone with its own data meeting an account with data has to choose', async () => {
    const first = await phone(cloud, { expenses: [exp('cloud1')] })
    await first.signIn()
    const second = await phone(cloud, { expenses: [exp('mine1')] })
    await second.signIn()
    expect(second.st().phase).toBe('choosing')
    expect(await second.ids()).toEqual(['mine1']) // nothing has changed yet
  })

  it('merging keeps both sides', async () => {
    const first = await phone(cloud, { expenses: [exp('cloud1')] })
    await first.signIn()
    const second = await phone(cloud, { expenses: [exp('mine1')] })
    await second.signIn()
    await second.svc.chooseMerge()
    expect(second.st().phase).toBe('idle')
    expect(await second.ids()).toEqual(['cloud1', 'mine1'])
    expect(cloud.rows.has('expense:mine1')).toBe(true)
  })

  it('replacing drops what the phone had and takes the cloud data', async () => {
    const first = await phone(cloud, { expenses: [exp('cloud1')] })
    await first.signIn()
    const second = await phone(cloud, { expenses: [exp('mine1')] })
    await second.signIn()
    await second.svc.chooseReplace()
    expect(await second.ids()).toEqual(['cloud1'])
    expect(cloud.rows.has('expense:mine1')).toBe(false)
  })

  it('warns when this phone was signed in to a different account before', async () => {
    const first = await phone(cloud, { expenses: [exp('cloud1')] })
    await first.signIn('someone@example.com')
    const second = await phone(cloud, { expenses: [exp('mine1')] })
    await setMetaFor(second, 'account_email', 'old@example.com')
    await second.signIn('someone@example.com')
    expect(second.st().phase).toBe('choosing')
    expect(second.st().pending.other).toBe(true)
  })

  it('signing in again to the same account does not ask anything', async () => {
    const p = await phone(cloud, { expenses: [exp('e1')] })
    await p.signIn()
    await p.svc.signOut()
    expect(p.st().phase).toBe('signedOut')
    await p.signIn()
    expect(p.st().phase).toBe('idle')
    expect(cloud.size()).toBe(1)
  })
})

async function setMetaFor(p, key, value) {
  await p.db.run('insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value', [key, value])
}

describe('keeping in step', () => {
  it('sends a change made on the phone', async () => {
    const p = await phone(cloud, { expenses: [exp('e1')] })
    await p.signIn()
    const prev = p.holder.state
    p.holder.state = { ...prev, expenses: [...prev.expenses, exp('e2')] }
    await saveDiff(p.db, prev, p.holder.state, 9000)
    await p.svc.syncNow()
    expect(cloud.rows.has('expense:e2')).toBe(true)
  })

  it('two calls at once do the work once', async () => {
    const p = await phone(cloud, { expenses: [exp('e1')] })
    await p.signIn()
    const before = cloud.calls.pull
    await Promise.all([p.svc.syncNow(), p.svc.syncNow(), p.svc.syncNow()])
    expect(cloud.calls.pull - before).toBe(1)
  })

  it('no connection: says so, keeps the changes, and works again later', async () => {
    const p = await phone(cloud, { expenses: [exp('e1')] })
    await p.signIn()
    const prev = p.holder.state
    p.holder.state = { ...prev, expenses: [...prev.expenses, exp('e2')] }
    await saveDiff(p.db, prev, p.holder.state, 9000)
    cloud.down.value = true
    await p.svc.syncNow()
    expect(p.st().error).toMatch(/no connection/i)
    expect(p.st().phase).toBe('idle')
    expect(await dirtyChanges(p.db)).toHaveLength(1)
    cloud.down.value = false
    await p.svc.syncNow()
    expect(p.st().error).toBe('')
    expect(cloud.rows.has('expense:e2')).toBe(true)
  })

  it('being signed out by the server forgets the login and asks to sign in again', async () => {
    const p = await phone(cloud, { expenses: [exp('e1')] })
    await p.signIn()
    cloud.api.pull = async () => { throw new ApiError(401, 'not logged in') }
    p.api.pull = cloud.api.pull
    await p.svc.syncNow()
    expect(p.st().phase).toBe('signedOut')
    expect(await p.store.get('dollarq-session')).toBe(null)
    expect(await p.ids()).toEqual(['e1']) // the data on the phone is untouched
  })
})

describe('leaving', () => {
  it('signing out keeps the data on the phone', async () => {
    const p = await phone(cloud, { expenses: [exp('e1')] })
    await p.signIn()
    await p.svc.signOut()
    expect(p.st().phase).toBe('signedOut')
    expect(await p.store.get('dollarq-session')).toBe(null)
    expect(await p.ids()).toEqual(['e1'])
  })

  it('deleting the account removes the cloud copy and forgets the account, but the phone keeps its data', async () => {
    const p = await phone(cloud, { expenses: [exp('e1')] })
    await p.signIn()
    expect(cloud.size()).toBe(1)
    await p.svc.deleteAccount()
    expect(cloud.size()).toBe(0)
    expect(p.st().phase).toBe('signedOut')
    expect(await getMeta(p.db, 'account_email')).toBe('')
    expect(await p.ids()).toEqual(['e1'])
    await p.signIn() // a fresh account later gets everything again
    expect(cloud.rows.has('expense:e1')).toBe(true)
  })
})
