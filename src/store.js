import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { uid, ymOf, shiftYm, daysIn, CURRENCIES } from './util.js'

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
  map: 'city',
  currency: 'INR',
  counties: DEFAULT_COUNTIES.map((c) => ({ ...c })),
  methods: { bank: ['Bank 1'], debit: ['Debit Card 1'], credit: [], cash: true },
  accounts: [{ id: 'a1', name: 'Main', currency: 'INR' }],
  expenses: [],
  fixed: [],
})

/* ---------- never trust what comes back from storage ---------- */
// Saved data can be damaged or tampered with (a backup editor, a bad restore, a bug). Every field is
// checked against what the app can actually produce; anything else is dropped or reset to a safe value.
const MAX_AMOUNT = 999999999.99
const MAX_EXPENSES = 50000
const MAX_FIXED = 50
const ICONS = new Set(['home', 'bolt', 'repeat', 'bank', 'cart', 'fork', 'coffee', 'bus', 'dots', 'film', 'chip', 'shirt', 'tag', 'city'])
const str = (v, max, fallback = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback)
const idOf = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : null)
const num = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback)
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback)
const arr = (v) => (Array.isArray(v) ? v : [])
const CODES = CURRENCIES.map((c) => c.code)

export function sanitize(raw) {
  const base = initial()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return base
  const seen = new Set()
  const fresh = (id) => { if (!id || seen.has(id)) return null; seen.add(id); return id }

  // a missing or damaged list falls back to the defaults; a valid list is kept as the user left it
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
    const amount = id ? num(f.amount, 0.01, MAX_AMOUNT, null) : null
    if (!id || amount === null || !countyIds.has(f.countyId)) return null
    return {
      id, name: str(f.name, 40, 'Fixed expense') || 'Fixed expense', amount, countyId: f.countyId,
      accountId: accById.has(f.accountId) ? f.accountId : accounts[0].id, day: Math.round(num(f.day, 1, 31, 1)),
      methodType: oneOf(f.methodType, TYPES, 'bank'), methodName: str(f.methodName, 22),
      lastPosted: typeof f.lastPosted === 'string' && /^\d{4}-\d{2}$/.test(f.lastPosted) ? f.lastPosted : null,
    }
  }).filter(Boolean)
  const fixedIds = new Set(fixed.map((f) => f.id))

  const expenses = arr(raw.expenses).slice(-MAX_EXPENSES).map((e) => {
    const id = e && typeof e === 'object' ? fresh(idOf(e.id)) : null
    const amount = id ? num(e.amount, 0.01, MAX_AMOUNT, null) : null
    const ts = id ? num(e.ts, 946684800000, now + 366 * 864e5, null) : null // 2000-01-01 .. a year ahead
    if (!id || amount === null || ts === null || typeof e.countyId !== 'string') return null
    const acc = accById.get(e.accountId) || accounts[0]
    return {
      id, countyId: idOf(e.countyId) || 'removed', amount, accountId: acc.id, currency: oneOf(e.currency, CODES, acc.currency),
      methodType: oneOf(e.methodType, TYPES, 'cash'), methodName: str(e.methodName, 22), people: Math.round(num(e.people, 1, 20, 1)),
      note: str(e.note, 80), ts, fixedId: fixedIds.has(e.fixedId) ? e.fixedId : null,
    }
  }).filter(Boolean)

  return {
    v: 1, entered: raw.entered === true, setupDone: raw.setupDone === true, stateName: str(raw.stateName, 28),
    season: 'summer', appearance: oneOf(raw.appearance, ['system', 'light', 'dark'], 'system'),
    map: typeof raw.map === 'string' && /^[a-z]{2,12}$/.test(raw.map) ? raw.map : 'city',
    currency: oneOf(raw.currency, CODES, accounts[0].currency), counties, methods, accounts, expenses, fixed,
  }
}

function load() {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY))) } catch { return initial() }
}

let state = load()
const listeners = new Set()
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const emit = () => listeners.forEach((l) => l())
// In the installed iPhone app the data is also written to the app's own native storage, which iOS does not
// clear the way it can clear web storage. Web storage stays as the fast working copy.
const NATIVE = Capacitor.isNativePlatform()
const persist = () => {
  const json = JSON.stringify(state)
  try { localStorage.setItem(KEY, json) } catch { /* private mode */ }
  if (NATIVE) Preferences.set({ key: KEY, value: json }).catch(() => {})
}

if (NATIVE) {
  // if web storage was cleared (or is older), restore from native storage
  Preferences.get({ key: KEY }).then(({ value }) => {
    if (!value) { if (state.entered) persist(); return }
    const saved = sanitize(JSON.parse(value))
    if (saved.entered && (!state.entered || saved.expenses.length > state.expenses.length)) { state = saved; try { localStorage.setItem(KEY, value) } catch { /* ignore */ } emit() }
  }).catch(() => {})
}

export const getState = () => state
export function setState(fn) {
  state = typeof fn === 'function' ? fn(state) : { ...state, ...fn }
  persist()
  emit()
}
export const useStore = () => useSyncExternalStore(subscribe, getState)

// Replaces everything (used by Import). The previous data is kept once as an undo copy.
export function replaceState(next) {
  try { localStorage.setItem(KEY + ':before-import', JSON.stringify(state)) } catch { /* ignore */ }
  state = sanitize(next)
  persist()
  emit()
}
export function undoImport() {
  try {
    const prev = JSON.parse(localStorage.getItem(KEY + ':before-import'))
    if (!prev) return false
    state = sanitize(prev)
    persist()
    emit()
    return true
  } catch { return false }
}
export const hasUndo = () => { try { return !!localStorage.getItem(KEY + ':before-import') } catch { return false } }

export const resetAll = () => setState(initial())

export function addExpense({ countyId, amount, accountId, methodType, methodName, people, note, ts, fixedId }) {
  const acc = state.accounts.find((a) => a.id === accountId) || state.accounts[0]
  const amt = num(amount, 0.01, MAX_AMOUNT, null)
  if (amt === null || !state.counties.some((c) => c.id === countyId)) return null
  const e = {
    id: uid(), countyId, amount: amt, accountId: acc.id, currency: acc.currency,
    methodType: oneOf(methodType, ['bank', 'debit', 'credit', 'cash'], 'cash'), methodName: str(methodName, 22),
    people: Math.round(num(people, 1, 20, 1)), note: str(note, 80), ts: num(ts, 946684800000, Date.now() + 366 * 864e5, Date.now()), fixedId: fixedId || null,
  }
  setState((s) => ({ ...s, expenses: [...s.expenses, e] }))
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
        id: uid(), countyId: f.countyId, amount: f.amount, accountId: acc.id, currency: acc.currency,
        methodType: f.methodType || 'bank', methodName: f.methodName || '', people: 1,
        note: f.name, ts: new Date(now.getFullYear(), now.getMonth(), d.day, 9).getTime(), fixedId: f.id,
      })
      return { ...f, lastPosted: ym }
    })
    return { ...s, expenses: exps, fixed }
  })
}

export const prevYm = (ym) => shiftYm(ym, -1)
