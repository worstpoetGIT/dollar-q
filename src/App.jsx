import { useCallback, useEffect, useState } from 'react'
import 'lenis/dist/lenis.css'
import Splash from './components/Splash.jsx'
import Icon from './components/Icon.jsx'
import Toast from './components/Toast.jsx'
import Home from './components/Home.jsx'
import Analytics from './components/Analytics.jsx'
import History from './components/History.jsx'
import Profile from './components/Profile.jsx'
import AddSheet from './components/AddSheet.jsx'
import { NameStep, Wizard } from './components/Onboarding.jsx'
import SignIn from './components/SignIn.jsx'
import { firstRunScreen, hasEmailPage } from './firstRun.js'
import * as store from './store.js'
import { useStore, setState, runFixed, ready } from './store.js'
import { startSync, useSyncStatus } from './sync/service.js'
import { fmt } from './util.js'
import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'

const TABS = [['home', 'city', 'State'], ['analytics', 'chart', 'Analytics'], null, ['history', 'receipt', 'History'], ['profile', 'user', 'Profile']]

export default function App() {
  const s = useStore()
  const [splash, setSplash] = useState(!new URLSearchParams(location.search).has('nosplash'))
  const [tab, setTab] = useState('home')
  const [sub, setSub] = useState(null)
  const [adding, setAdding] = useState(null)
  const [saved, setSaved] = useState(null)
  const [toast, setToast] = useState(null)
  const [histCounty, setHistCounty] = useState(null)
  // which of the first pages to show (see firstRun.js). "Not now" is remembered, but only keeps the email page away for an app that is already set up.
  const syncState = useSyncStatus()
  const [skippedBefore] = useState(() => { try { return localStorage.getItem('dollar-q:signin-skipped') === '1' } catch { return false } })
  const [skippedNow, setSkippedNow] = useState(false)
  const [editName, setEditName] = useState(false) // came back to the name page from the first setup page
  const skipSignIn = () => { try { localStorage.setItem('dollar-q:signin-skipped', '1') } catch { /* ignore */ } setSkippedNow(true) }
  const screen = firstRunScreen({ splash, phase: syncState.phase, working: syncState.working, entered: s.entered, setupDone: s.setupDone, skippedNow, skippedBefore, editName })

  useEffect(() => {
    const el = document.documentElement
    if (s.appearance === 'light' || s.appearance === 'dark') el.dataset.theme = s.appearance
    else delete el.dataset.theme
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const paint = () => {
      const dark = s.appearance === 'dark' || (s.appearance !== 'light' && mq.matches)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#ffffff')
    }
    paint()
    mq.addEventListener('change', paint)
    return () => mq.removeEventListener('change', paint)
  }, [s.appearance])

  useEffect(() => {
    // minimalist mode hides the status bar
    document.documentElement.dataset.minimal = s.minimal ? '1' : ''
    if (Capacitor.isNativePlatform()) (s.minimal ? StatusBar.hide() : StatusBar.show()).catch(() => {})
  }, [s.minimal])

  useEffect(() => {
    // open the database, then sync (but never wait long for the network), and only then add this month's subscriptions,
    // so a subscription another phone already added is not added again
    ready
      .then(() => startSync(store))
      .then((svc) => svc.getStatus().phase === 'idle' ? Promise.race([svc.syncNow(), new Promise((r) => setTimeout(r, 8000))]) : null)
      .catch(() => {})
      .then(runFixed)
    const h = () => document.visibilityState === 'visible' && runFixed()
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  const onSaved = useCallback((e, edited) => {
    setAdding(null)
    const c = s.counties.find((x) => x.id === e.countyId)
    setToast({ n: Date.now(), text: fmt(e.amount, e.currency) + ' · ' + (c?.name || ''), sub: edited ? 'Transaction updated' : 'Transaction recorded' })
    if (!edited) {
      setSaved({ n: Date.now(), countyId: e.countyId, amount: e.amount, currency: e.currency })
      setTab('home')
    }
  }, [s.counties])

  const go = (t) => { setSub(null); setTab(t) }

  return (
    <div className="app">
      {screen === 'name' && <NameStep initial={s.stateName} onBack={hasEmailPage(syncState.phase) ? () => setSkippedNow(false) : undefined} onDone={() => { setEditName(false); setTab('home') }} />}
      {s.entered && (
        <>
          <Home s={s} active={tab === 'home'} saved={saved}
            onAdd={(id) => setAdding({ countyId: id })}
            onHistory={(id) => { setHistCounty(id); go('history') }} />
          {tab === 'analytics' && <Analytics s={s} />}
          {tab === 'history' && <History s={s} initCounty={histCounty} onEdit={(e) => setAdding({ edit: e })} />}
          {tab === 'profile' && <Profile s={s} sub={sub} setSub={setSub} />}

          {tab !== 'home' && !s.minimal && <div className="status-cover" aria-hidden="true" />}
          <nav className="tabbar">
            {TABS.map((t, i) => t ? (
              <button key={t[0]} className={'tab' + (tab === t[0] ? ' on' : '')} onClick={() => { if (t[0] !== 'history') setHistCounty(null); go(t[0]) }}>
                <Icon name={t[1]} size={24} />{t[2]}
              </button>
            ) : (
              <button key="add" className="fab" aria-label="Add expense" onClick={() => setAdding({ countyId: null })}><Icon name="plus" size={30} sw={3.2} /></button>
            ))}
          </nav>

          {adding && <AddSheet key={adding.edit ? adding.edit.id : 'new'} s={s} countyId={adding.countyId} edit={adding.edit} onClose={() => setAdding(null)} onSaved={onSaved} />}
          {screen === 'wizard' && <Wizard s={s} onBack={() => setEditName(true)} onDone={() => setState((st) => ({ ...st, setupDone: true }))} />}
        </>
      )}
      {toast && <Toast key={toast.n} toast={toast} onGone={() => setToast((x) => (x && x.n === toast.n ? null : x))} />}
      {screen === 'email' && <SignIn onSkip={skipSignIn} />}
      {splash && <Splash onDone={() => setSplash(false)} />}
    </div>
  )
}
