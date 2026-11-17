import { useCallback, useEffect, useState } from 'react'
import 'lenis/dist/lenis.css'
import Splash from './components/Splash.jsx'
import Icon from './components/Icon.jsx'
import Home from './components/Home.jsx'
import Analytics from './components/Analytics.jsx'
import History from './components/History.jsx'
import Profile from './components/Profile.jsx'
import AddSheet from './components/AddSheet.jsx'
import { NameStep, Wizard } from './components/Onboarding.jsx'
import { useStore, setState, runFixed } from './store.js'
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
    runFixed()
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
    setTimeout(() => setToast(null), 3100)
  }, [s.counties])

  const go = (t) => { setSub(null); setTab(t) }

  return (
    <div className="app">
      {!s.entered && !splash && <NameStep onDone={() => setTab('home')} />}
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
          {!s.setupDone && !splash && <Wizard s={s} onDone={() => setState((st) => ({ ...st, setupDone: true }))} />}
        </>
      )}
      {toast && (
        <div className="toast" key={toast.n}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--green)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" size={16} color="#fff" sw={3} /></span>
          <div><div style={{ fontSize: 14.4, opacity: 0.7 }}>{toast.sub}</div><b>{toast.text}</b></div>
        </div>
      )}
      {splash && <Splash onDone={() => setSplash(false)} />}
    </div>
  )
}
