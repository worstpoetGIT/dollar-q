// signing in and keeping the phone and the cloud in step. the screens talk to this, it talks to the server and the database.
import { useSyncExternalStore } from 'react'
import { createApi, ApiError } from './api.js'
import { createSession, nativeStore } from './session.js'
import { syncOnce, cloudHasData, markAllDirty } from './engine.js'
import { getMeta, setMeta } from '../db/repo.js'
import { API_URL } from './config.js'

const deviceName = () => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return /Android/i.test(ua) ? 'Android phone' : /iPhone|iPad/i.test(ua) ? 'iPhone' : 'Phone'
}

// everything it needs from outside is passed in, so it can be tested without a phone or a server
export function createService(deps) {
  const { getDb, api, session, flush, getState, applySynced, clearForCloud } = deps
  let status = { phase: 'starting', email: '', lastSyncAt: 0, error: '', pending: null, working: false }
  const listeners = new Set()
  const set = (patch) => { status = { ...status, ...patch }; listeners.forEach((l) => l()); if (deps.notify) deps.notify() }
  let running = null

  const message = (err) => {
    if (err instanceof ApiError) {
      if (err.status === 0) return 'No connection. Your changes are saved and will be sent later.'
      if (err.status === 503) return 'The server could not send the email right now. Try again in a little while.'
      if (err.status === 401) return err.message
      if (err.status === 429) return 'Too many tries. Wait a little and try again.'
      return err.message
    }
    return 'Something went wrong. Your data on this phone is safe.'
  }

  async function start() {
    const db = getDb()
    if (!db) return set({ phase: 'unavailable' })
    const token = await session.get()
    if (!token) return set({ phase: 'signedOut', email: '' })
    const known = await getMeta(db, 'account_email')
    if (known) return set({ phase: 'idle', email: known, lastSyncAt: Number(await getMeta(db, 'last_sync_at')) || 0 })

    // a login, but this database has never met the account: the app was deleted and installed again (the Keychain keeps the login
    // through that). so this is a new phone. find out who the login belongs to, then do what a first sign in does:
    // take the cloud data, and never send this phone's default state up over the real data.
    try {
      const who = await api.me()
      set({ phase: 'idle', email: String(who.email || '').toLowerCase(), working: true })
      await firstSync()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await session.clear() // the login is gone on the server
      set({ phase: 'signedOut', email: '', working: false })
    }
  }

  // ----- signing in -----
  async function sendCode(email) {
    set({ error: '', working: true })
    try {
      await api.requestCode(email.trim())
      set({ phase: 'codeSent', email: email.trim().toLowerCase(), working: false })
    } catch (err) {
      set({ error: message(err), working: false })
    }
  }

  async function verifyCode(code) {
    set({ error: '', working: true })
    try {
      const res = await api.verify(status.email, code.trim(), deviceName())
      await session.set(res.token)
      await firstSync()
    } catch (err) {
      set({ error: message(err), working: false })
    }
  }

  // the first time this phone meets this account: what should happen to the data on both sides?
  async function firstSync() {
    const db = getDb()
    const email = status.email
    const before = await getMeta(db, 'account_email')
    if (before === email) { // the same account as before: nothing to decide
      set({ phase: 'idle', working: false })
      return syncNow()
    }
    const cloudHas = await cloudHasData(api)
    if (!cloudHas) { // a new account: send everything this phone has
      await setMeta(db, 'account_email', email)
      await markAllDirty(db)
      set({ phase: 'idle', working: false })
      return syncNow()
    }
    if (!getState().entered && !before) return chooseReplace() // a new phone: just take the cloud data
    set({ phase: 'choosing', working: false, pending: { other: !!before && before !== email, previous: before || '' } })
  }

  async function chooseMerge() {
    const db = getDb()
    set({ phase: 'idle', pending: null, working: true })
    await setMeta(db, 'account_email', status.email)
    await markAllDirty(db) // everything here is sent, everything there is fetched, the newest edit of each record wins
    return syncNow()
  }

  async function chooseReplace() {
    const db = getDb()
    set({ phase: 'idle', pending: null, working: true, error: '' })
    try {
      await flush()
      await clearForCloud()
      await setMeta(db, 'account_email', status.email)
      await runSync()
    } catch (err) {
      set({ error: message(err), working: false })
    }
  }

  // ----- keeping in step -----
  async function runSync() {
    const db = getDb()
    const out = await syncOnce({ db, api, flush, getState, patch: applySynced })
    set({ lastSyncAt: Number(await getMeta(db, 'last_sync_at')) || Date.now(), error: '', working: false })
    return out
  }

  function syncNow() {
    if (running) return running
    if (status.phase !== 'idle' && status.phase !== 'error') return Promise.resolve(null)
    set({ working: true })
    running = (async () => {
      try {
        return await runSync()
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) { // the login ran out or was ended elsewhere
          await session.clear()
          set({ phase: 'signedOut', error: 'You were signed out. Sign in again to keep syncing.', working: false })
        } else {
          set({ phase: 'idle', error: message(err), working: false })
        }
        return null
      } finally {
        running = null
      }
    })()
    return running
  }

  // ----- leaving -----
  async function signOut() {
    try { await api.logout() } catch { /* the server may be out of reach, we forget the login here anyway */ }
    await session.clear()
    set({ phase: 'signedOut', error: '', pending: null, working: false })
  }

  async function deleteAccount() {
    set({ error: '', working: true })
    try {
      await api.deleteAccount(status.email)
      await session.clear()
      const db = getDb()
      await setMeta(db, 'account_email', '')
      await setMeta(db, 'cursor', 0)
      set({ phase: 'signedOut', email: '', working: false })
    } catch (err) {
      set({ error: message(err), working: false })
    }
  }

  const backToEmail = () => set({ phase: 'signedOut', error: '', email: '' })

  return {
    start, sendCode, verifyCode, chooseMerge, chooseReplace, syncNow, signOut, deleteAccount, backToEmail,
    getStatus: () => status,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
  }
}

// ---------- the real one, used by the app ----------
let real = null
const watchers = new Set() // the screens that show the sync state, whether or not it has started yet
const notify = () => watchers.forEach((fn) => fn())
export function sync() {
  if (!real) throw new Error('sync is not started yet')
  return real
}

export async function startSync(store) {
  if (real) return real
  const sessionStore = createSession(await nativeStore())
  real = createService({
    getDb: store.getDb,
    api: createApi({ baseUrl: API_URL, getToken: sessionStore.get }),
    session: sessionStore,
    flush: store.flushDatabase,
    getState: store.getState,
    applySynced: store.applySynced,
    clearForCloud: store.clearForCloud,
    notify,
  })
  await real.start()
  notify()

  // sync when the app opens, comes back to the front, regains the network, and a few seconds after the person changes something
  let timer = null
  const soon = (ms) => { clearTimeout(timer); timer = setTimeout(() => real.syncNow(), ms) }
  store.onStateChange((source) => { if (source === 'local') soon(5000) })
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && real.syncNow())
  if (typeof window !== 'undefined') window.addEventListener('online', () => soon(1000))
  setInterval(() => document.visibilityState === 'visible' && real.syncNow(), 5 * 60 * 1000)
  return real
}

// the screens use this to show the state
// only while developing: lets me look at every state of the Account screen in a browser. not in the real app.
let demo = null
if (import.meta.env.DEV && typeof window !== 'undefined') window.__syncDemo = (s) => { demo = s ? { ...NONE, ...s } : null; notify() }

export function useSyncStatus() {
  return useSyncExternalStore(
    (fn) => { watchers.add(fn); return () => watchers.delete(fn) },
    () => demo || (real ? real.getStatus() : NONE),
  )
}
const NONE = { phase: 'unavailable', email: '', lastSyncAt: 0, error: '', pending: null, working: false }
