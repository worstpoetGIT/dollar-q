import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { uid, ymOf, shiftYm, daysIn, CURRENCIES, shareFor, splitShares } from './util.js'
import { openNativeDb } from './db/native.js'
import { ensureSchema } from './db/schema.js'
import { loadState, saveDiff, importState, isEmpty, counts, getMeta, setMeta, KINDS as DB_KINDS, settingsOf } from './db/repo.js'
import { SYNCED_SETTINGS, pick } from './sync/engine.js'

const KEY = 'dollar-q:v1'

export const GROUPS = ['Food', 'Home', 'Media', 'Shopping', 'Other']
export const STYLES = ['house', 'tower', 'shop', 'dome', 'market', 'cafe', 'cinema', 'tech', 'depot']
export const PALETTE = ['#e5383b', '#3a86ff', '#8338ec', '#b08968', '#2d936c', '#ff7f50', '#8d6e63', '#118ab2', '#f4a259', '#d62f8b', '#4361ee', '#e056a0']
export const MAX_COUNTIES = 12
export const MAX_ACCOUNTS = 5
export const MAX_SUB = 5

const county = (name, group, style, i, icon) => ({ id: 'c' + (i + 1), name, group, style, icon, color: PALETTE[i % PALETTE.length] })

export const DEFAULT_COUNTIES = [
  county('Home & Rent', 'Home', 'house', 0, 'home'),
  county('Utilities', 'Home', 'tower', 1, 'bolt'),
  county('Subscriptions', 'Media', 'shop', 2, 'repeat'),
  county('Banking', 'Other', 'dome', 3, 'bank'),
  county('Groceries', 'Food', 'market', 4, 'cart'),
  county('Restaurants', 'Food', 'cafe', 5, 'fork'),
  county('Cafes', 'Food', 'cafe', 6, 'coffee'),
  county('Transit', 'Other', 'depot', 7, 'bus'),
  county('Miscellaneous', 'Other', 'market', 8, 'dots'),
  county('Entertainment', 'Media', 'cinema', 9, 'film'),
  county('Electronics', 'Shopping', 'tech', 10, 'chip'),
  county('Fashion', 'Shopping', 'shop', 11, 'shirt'),
]

const initial = () => ({
  v: 1,
  entered: false,
  setupDone: false,
  stateName: '',
  season: 'summer',
  appearance: 'system',
  minimal: false,
  map: 'city',
  currency: 'INR',
  counties: DEFAULT_COUNTIES.map((c) => ({ ...c })),
  methods: { bank: ['Bank 1'], debit: ['Debit Card 1'], credit: [], cash: true },
  accounts: [{ id: 'a1', name: 'Main', currency: 'INR' }],
  expenses: [],
  fixed: [],
})

// saved data can be broken or edited, so every field gets checked when it loads
const MAX_AMOUNT = 999999999.99
const MAX_EXPENSES = 50000
const MAX_FIXED = 50
const ICONS = new Set(['home', 'bolt', 'repeat', 'bank', 'cart', 'fork', 'coffee', 'bus', 'dots', 'film', 'chip', 'shirt', 'tag', 'city'])
const str = (v, max, fallback = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback)
const idOf = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : null)
const num = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback)
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback)
// positive numbers only, huge ones get capped
const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, MAX_AMOUNT) : null)
const arr = (v) => (Array.isArray(v) ? v : [])
const CODES = CURRENCIES.map((c) => c.code)

let migrated = false
export const lastLoadMigrated = () => migrated

// keep an uneven split only when it really works for this total (parts cut to cents, all shares add up)
const splitOf = (raw, total) => {
  if (!raw || typeof raw !== 'object') return null
  const parts = Array.isArray(raw.parts) ? raw.parts.map((p) => (typeof p === 'number' && Number.isFinite(p) ? Math.round(p * 100) / 100 : 0)) : []
  const split = { mode: raw.mode, parts }
  return splitShares(total, split) ? split : null
}

export function sanitize(raw) {
  migrated = false
  const base = initial()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return base
  const seen = new Set()
  const fresh = (id) => { if (!id || seen.has(id)) return null; seen.add(id); return id }

  // bad or missing list: use the defaults
  let counties = (Array.isArray(raw.counties) ? raw.counties : base.counties).slice(0, MAX_COUNTIES).map((c, i) => {
    const id = c && typeof c === 'object' ? fresh(idOf(c.id)) : null
    if (!id) return null
    return {
      id, name: str(c.name, 22, 'County') || 'County', group: oneOf(c.group, GROUPS, 'Other'), style: oneOf(c.style, STYLES, 'shop'),
      icon: ICONS.has(c.icon) ? c.icon : 'tag', color: typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : PALETTE[i % PALETTE.length],
    }
  }).filter(Boolean)

  if (!counties.length) counties = base.counties

  let accounts = arr(raw.accounts).slice(0, MAX_ACCOUNTS).map((a) => {
    const id = a && typeof a === 'object' ? fresh(idOf(a.id)) : null
    return id ? { id, name: str(a.name, 20, 'Account') || 'Account', currency: oneOf(a.currency, CODES, 'INR') } : null
  }).filter(Boolean)
  if (!accounts.length) accounts = base.accounts

  const m = raw.methods && typeof raw.methods === 'object' && !Array.isArray(raw.methods) ? raw.methods : base.methods
  const names = (v) => arr(v).slice(0, MAX_SUB).map((n) => str(n, 22)).filter(Boolean)
  const methods = { bank: names(m.bank), debit: names(m.debit), credit: names(m.credit), cash: m.cash !== false }

  const countyIds = new Set(counties.map((c) => c.id))
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const TYPES = ['bank', 'debit', 'credit', 'cash']
  const now = Date.now()

  const fixed = arr(raw.fixed).slice(0, MAX_FIXED).map((f) => {
    const id = f && typeof f === 'object' ? fresh(idOf(f.id)) : null
    const amount = id ? money(f.amount) : null
    if (!id || amount === null || !countyIds.has(f.countyId)) return null
    return {
      id, name: str(f.name, 40, 'Fixed expense') || 'Fixed expense', amount, countyId: f.countyId,
      accountId: accById.has(f.accountId) ? f.accountId : accounts[0].id, day: Math.round(num(f.day, 1, 31, 1)),
      methodType: oneOf(f.methodType, TYPES, 'bank'), methodName: str(f.methodName, 22),
      lastPosted: typeof f.lastPosted === 'string' && /^\d{4}-\d{2}$/.test(f.lastPosted) ? f.lastPosted : null,
    }
  }).filter(Boolean)
  const fixedIds = new Set(fixed.map((f) => f.id))

  // old expenses only have the whole bill in amount. give them a total and turn amount into my share
  migrated = false
  const expenses = arr(raw.expenses).slice(-MAX_EXPENSES).map((e) => {
    const id = e && typeof e === 'object' ? fresh(idOf(e.id)) : null
    const hasTotal = id ? money(e.total) : null
    const total = id ? (hasTotal !== null ? hasTotal : money(e.amount)) : null
    const ts = id ? num(e.ts, 946684800000, now + 366 * 864e5, null) : null // 2000-01-01 .. a year ahead
    if (!id || total === null || ts === null || typeof e.countyId !== 'string') return null
    if (hasTotal === null) migrated = true
    const acc = accById.get(e.accountId) || accounts[0]
    const split = splitOf(e.split, total)
    const people = split ? split.parts.length : Math.round(num(e.people, 1, 20, 1))
    return {
      id, countyId: idOf(e.countyId) || 'removed', amount: shareFor(total, people, split), total, accountId: acc.id, currency: oneOf(e.currency, CODES, acc.currency),
      methodType: oneOf(e.methodType, TYPES, 'cash'), methodName: str(e.methodName, 22), people,
      note: str(e.note, 80), ts, fixedId: fixedIds.has(e.fixedId) ? e.fixedId : null,
      ...(split ? { split } : {}),
    }
  }).filter(Boolean)

  return {
    v: 1, entered: raw.entered === true, setupDone: raw.setupDone === true, stateName: str(raw.stateName, 28),
    season: 'summer', appearance: oneOf(raw.appearance, ['system', 'light', 'dark'], 'system'), minimal: raw.minimal === true,
    map: typeof raw.map === 'string' && /^[a-z]{2,12}$/.test(raw.map) ? raw.map : 'city',
    currency: oneOf(raw.currency, CODES, accounts[0].currency), counties, methods, accounts, expenses, fixed,
  }
}

function load() {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY))) } catch { return initial() }
}

let state = load()
const migratedAtLoad = migrated
const listeners = new Set()
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const emit = () => listeners.forEach((l) => l())
// in the phone app everything is also saved to native storage, iOS can wipe web storage
const NATIVE = Capacitor.isNativePlatform()

// the phone's database (see further down). declared early because saving a change needs to know about it.
let db = null // set once the database is open and in step with `state`
let saved = state // the state the database holds right now, to work out what changed
let touched = false // did something change before the database was ready?
let writes = Promise.resolve() // changes are written one after the other, in order
const BROKEN = KEY + ':db-broken'

// the old kind of saved copy: one piece of text, written on every change
const mirror = () => {
  const json = JSON.stringify(state)
  try { localStorage.setItem(KEY, json) } catch { /* private mode */ }
  if (NATIVE) Preferences.set({ key: KEY, value: json }).catch(() => {})
}
const persist = () => {
  mirror()
  if (db) { writeToDb(saved, state); saved = state }
}

if (migratedAtLoad && state.entered) persist() // write the converted expenses straight back

// web storage cleared? take the native copy
const restored = !NATIVE ? Promise.resolve() : Preferences.get({ key: KEY }).then(({ value }) => {
  if (!value) { if (state.entered) persist(); return }
  const copy = sanitize(JSON.parse(value))
  if (copy.entered && (!state.entered || copy.expenses.length > state.expenses.length)) { state = copy; persist(); emit() }
}).catch(() => {})

// ---------- the phone's database ----------
// the database is the main copy of the data. the old saved copy above is still written on every change (a mirror),
// so going back to an older version of the app never loses anything.

function writeToDb(before, next) {
  writes = writes.then(() => saveDiff(db, before, next)).catch((err) => {
    // never lose data over this: the mirror above has everything, and next start rebuilds the database from it
    console.error('database write failed, it will be rebuilt from the saved copy on the next start', err)
    try { localStorage.setItem(BROKEN, '1') } catch { /* ignore */ }
    db = null
  })
}

export async function startDatabase(open) {
  if (db) return
  try {
    const d = await open()
    if (!d) return // not a phone: no database, the app works as before
    await ensureSchema(d)
    let broken = false
    try { broken = !!localStorage.getItem(BROKEN) } catch { /* ignore */ }

    if (!(await getMeta(d, 'legacy_imported')) || broken || (await isEmpty(d))) {
      // first start with a database (or a rebuild): move the saved data in, then check nothing went missing
      const mine = state
      await d.tx(async (c) => {
        for (const t of ['counties', 'accounts', 'fixed_expenses', 'expenses', 'settings']) await c.run(`delete from ${t}`)
      })
      await importState(d, mine)
      const n = await counts(d)
      if (n.expenses !== mine.expenses.length || n.counties !== mine.counties.length || n.accounts !== mine.accounts.length || n.fixed !== mine.fixed.length) {
        throw new Error('the copy in the database does not match the saved data')
      }
      await setMeta(d, 'legacy_imported', new Date().toISOString())
      try { localStorage.removeItem(BROKEN) } catch { /* ignore */ }
      saved = mine
    } else {
      const fromDb = await loadState(d, initial())
      if (touched) { await saveDiff(d, fromDb, state); saved = state } // the user changed something while it was starting
      else { state = fromDb; saved = fromDb; emit() }
    }
    db = d
    if (state !== saved) { writeToDb(saved, state); saved = state } // anything changed while we were busy
  } catch (err) {
    console.error('could not start the database, the app keeps using its saved copy', err)
  }
}

// resolves when the database is open (or we know there is none). things that write, like the monthly subscriptions, wait for it.
export const ready = restored.then(() => startDatabase(openNativeDb))
export const getDb = () => db
export const flushDatabase = () => writes // resolves when every change so far is in the database

// ---------- what sync does to the state ----------

// something besides the screens changed the state (sync): tell the screens, and the sync, if it wants to know
const watchers = new Set()
export const onStateChange = (fn) => { watchers.add(fn); return () => watchers.delete(fn) }

// put changes received from the cloud into the state on screen. the database already has them. a record the person
// edited while the sync was running is left alone (the database keeps their newer edit).
export function applySynced(accepted, base, ordered = {}) {
  let next = state
  if (accepted.some((r) => r.kind === 'settings') && JSON.stringify(settingsOf(base)) === JSON.stringify(settingsOf(state))) {
    const remote = accepted.filter((r) => r.kind === 'settings').at(-1)
    next = { ...next, ...pick(remote.data || {}, SYNCED_SETTINGS) }
  }
  for (const [kind, spec] of Object.entries(DB_KINDS)) {
    const mine = accepted.filter((r) => r.kind === kind)
    if (!mine.length) continue
    if (spec.ordered) {
      if (ordered[spec.list] && base[spec.list] === state[spec.list]) next = { ...next, [spec.list]: ordered[spec.list] }
      continue
    }
    const wasBase = new Map(base[spec.list].map((o) => [o.id, o]))
    const nowList = next[spec.list]
    const nowById = new Map(nowList.map((o) => [o.id, o]))
    const drop = new Set()
    const put = new Map()
    for (const r of mine) {
      if (nowById.get(r.id) !== wasBase.get(r.id)) continue // changed on this phone meanwhile
      if (r.deleted) { drop.add(r.id); continue }
      const obj = { id: r.id }
      for (const [key] of spec.fields) if (r.data[key] !== undefined && r.data[key] !== null) obj[key] = r.data[key]
      put.set(r.id, obj)
    }
    if (!drop.size && !put.size) continue
    const list = nowList.filter((o) => !drop.has(o.id)).map((o) => put.get(o.id) || o)
    for (const [id, obj] of put) if (!nowById.has(id)) list.push(obj)
    next = { ...next, [spec.list]: list }
  }
  if (next === state) return
  state = next
  saved = next // the database already has this
  mirror()
  emit()
  watchers.forEach((fn) => fn('sync'))
}

// "use the cloud data instead": forget what this phone has, ready to be filled from the cloud
export async function clearForCloud() {
  await writes
  if (!db) return
  await db.tx(async (c) => {
    for (const t of ['counties', 'accounts', 'fixed_expenses', 'expenses', 'settings']) await c.run(`delete from ${t}`)
    await c.run("insert into meta (key, value) values ('cursor', '0') on conflict (key) do update set value = '0'")
  })
  state = { ...initial(), counties: [], accounts: [], fixed: [], expenses: [] }
  saved = state
  mirror()
  emit()
}

export const getState = () => state
export function setState(fn) {
  touched = true
  state = typeof fn === 'function' ? fn(state) : { ...state, ...fn }
  persist()
  emit()
  watchers.forEach((w) => w('local'))
}
export const useStore = () => useSyncExternalStore(subscribe, getState)

// import replaces everything, the old data is kept once for undo
export function replaceState(next) {
  touched = true
  try { localStorage.setItem(KEY + ':before-import', JSON.stringify(state)) } catch { /* ignore */ }
  state = sanitize(next)
  persist()
  emit()
}
export function undoImport() {
  try {
    const prev = JSON.parse(localStorage.getItem(KEY + ':before-import'))
    if (!prev) return false
    touched = true
    state = sanitize(prev)
    persist()
    emit()
    return true
  } catch { return false }
}
export const hasUndo = () => { try { return !!localStorage.getItem(KEY + ':before-import') } catch { return false } }

export const resetAll = () => setState(initial())

const clean = ({ countyId, amount, accountId, methodType, methodName, people, split: rawSplit, note, ts }) => {
  const acc = state.accounts.find((a) => a.id === accountId) || state.accounts[0]
  const total = money(amount)
  if (total === null || !state.counties.some((c) => c.id === countyId)) return null
  const split = rawSplit ? splitOf(rawSplit, total) : null
  if (rawSplit && !split) return null // a split that does not add up is never saved
  const n = split ? split.parts.length : Math.round(num(people, 1, 20, 1))
  return {
    countyId, amount: shareFor(total, n, split), total, accountId: acc.id, currency: acc.currency,
    methodType: oneOf(methodType, ['bank', 'debit', 'credit', 'cash'], 'cash'), methodName: str(methodName, 22),
    people: n, note: str(note, 80), ts: num(ts, 946684800000, Date.now() + 366 * 864e5, Date.now()),
    ...(split ? { split } : {}),
  }
}

// amount is the whole bill, what gets saved as the expense is my share
export function addExpense(input) {
  const c = clean(input)
  if (!c) return null
  const e = { id: uid(), ...c, fixedId: input.fixedId || null }
  setState((s) => ({ ...s, expenses: [...s.expenses, e] }))
  return e
}

export function updateExpense(id, input) {
  const old = state.expenses.find((x) => x.id === id)
  const c = old && clean(input)
  if (!c) return null
  const e = { ...old, ...c }
  if (!c.split) delete e.split // edited back to an equal split
  setState((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === id ? e : x)) }))
  return e
}
export const deleteExpense = (id) => setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }))

export function runFixed() {
  const now = new Date()
  const ym = ymOf(now.getTime())
  const due = []
  for (const f of state.fixed) {
    if (f.lastPosted === ym) continue
    const day = Math.min(f.day, daysIn(ym))
    if (now.getDate() >= day) due.push({ f, day })
  }
  if (!due.length) return
  setState((s) => {
    const exps = [...s.expenses]
    const fixed = s.fixed.map((f) => {
      const d = due.find((x) => x.f.id === f.id)
      if (!d) return f
      const acc = s.accounts.find((a) => a.id === f.accountId) || s.accounts[0]
      exps.push({
        id: 'fx-' + f.id + '-' + ym, // the same on every phone, so two phones posting the same month do not make two expenses
        countyId: f.countyId, amount: f.amount, total: f.amount, accountId: acc.id, currency: acc.currency,
        methodType: f.methodType || 'bank', methodName: f.methodName || '', people: 1,
        note: f.name, ts: new Date(now.getFullYear(), now.getMonth(), d.day, 9).getTime(), fixedId: f.id,
      })
      return { ...f, lastPosted: ym }
    })
    return { ...s, expenses: exps, fixed }
  })
}

export const prevYm = (ym) => shiftYm(ym, -1)
