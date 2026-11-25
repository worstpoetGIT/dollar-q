import { useEffect, useMemo, useRef, useState } from 'react'
import { CityScene } from '../CityScene.js'
import Icon from './Icon.jsx'
import { countyIcon } from './Editors.jsx'
import { setState } from '../store.js'
import { fmt, fmtNum, symbolOf, ymOf, levelFor, monthSpending } from '../util.js'
import { useCountUp, useDark } from '../hooks.js'
import { haptic } from '../haptics.js'
import { MAP_LIST } from '../maps.js'

const FILTERS = [
  { id: null, label: 'All State', icon: 'city', color: '#5b54e8' },
  { id: 'Food', label: 'Food', icon: 'fork', color: '#e5383b' },
  { id: 'Home', label: 'Home', icon: 'home', color: '#e76f51' },
  { id: 'Media', label: 'Media', icon: 'film', color: '#8338ec' },
  { id: 'Shopping', label: 'Shopping', icon: 'cart', color: '#2a9d8f' },
  { id: 'Other', label: 'Other', icon: 'dots', color: '#6c757d' },
  { id: 'Gulliver', label: 'Gulliver', icon: 'bank', color: '#c9a227' },
]

const MODES = ['system', 'light', 'dark']
const MODE_ICON = { system: 'auto', light: 'sun', dark: 'moon' }
const MODE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' }

export default function Home({ s, active, saved, onAdd, onHistory }) {
  const box = useRef(null)
  const scene = useRef(null)
  const dark = useDark()
  const [sel, setSel] = useState(null)
  const [filter, setFilter] = useState(null)
  const [moved, setMoved] = useState(false)
  const [open, setOpen] = useState(false)
  const [bubbles, setBubbles] = useState([])
  const [mapOpen, setMapOpen] = useState(false)
  const mapMeta = MAP_LIST.find((m) => m.id === s.map) || MAP_LIST[0]

  const currencies = useMemo(() => [...new Set(s.accounts.map((a) => a.currency))], [s.accounts])
  const cur = currencies.includes(s.currency) ? s.currency : currencies[0]
  const ym = ymOf(Date.now())

  // "this month" leaves out Gulliver (rent, investments, gifts), which has its own total
  const { list, total, gulliver } = useMemo(() => {
    const { per, total: t, gulliver: g } = monthSpending(s.expenses, s.counties, cur, ym)
    return { list: s.counties.map((c) => ({ ...c, spent: per[c.id]?.spent || 0, count: per[c.id]?.count || 0, level: levelFor(per[c.id]?.spent || 0, cur) })), total: t, gulliver: g }
  }, [s.expenses, s.counties, cur, ym])

  const animTotal = useCountUp(total)

  useEffect(() => {
    const sc = new CityScene(box.current, {
      onSelect: (id) => { if (id) haptic('light'); setSel(id) },
      onViewChanged: (m) => setMoved(m),
    })
    scene.current = sc
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__scene = sc // lets a preview start a crash by hand
    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_HOOK) window.__scene = sc // test hook, never in release builds
    return () => { sc.dispose(); scene.current = null }
  }, [])

  useEffect(() => { scene.current?.setCounties(list) }, [list])
  useEffect(() => { scene.current?.setMap(s.map) }, [s.map])
  useEffect(() => { scene.current?.setDark(dark) }, [dark])
  useEffect(() => { scene.current?.select(sel) }, [sel])
  useEffect(() => { scene.current?.setFilter(filter) }, [filter])
  useEffect(() => { if (active) scene.current?.start(); else scene.current?.stop() }, [active])

  useEffect(() => {
    if (!saved || !scene.current) return
    scene.current.pulse(saved.countyId)
    const p = scene.current.project(saved.countyId)
    if (p) {
      const id = saved.n
      setBubbles((b) => [...b, { id, x: p.x, y: p.y, text: '+' + symbolOf(saved.currency) + fmtNum(saved.amount, saved.currency) }])
      setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== id)), 1600)
    }
  }, [saved])

  const groupsPresent = new Set(s.counties.map((c) => c.group))
  const filters = FILTERS.filter((f) => f.id === null || groupsPresent.has(f.id))
  const selC = list.find((c) => c.id === sel)
  const sorted = [...list].filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent)

  const cycleCur = () => {
    if (currencies.length < 2) return
    setState((st) => ({ ...st, currency: currencies[(currencies.indexOf(cur) + 1) % currencies.length] }))
  }

  return (
    <div className={'home' + (mapMeta.hud === 'light' && !dark ? ' hud-light' : '')} style={{ display: active ? 'block' : 'none' }}>
      <div className="scene" ref={box} />
      {bubbles.map((b) => <div key={b.id} className="bubble" style={{ left: b.x, top: b.y }}>{b.text}</div>)}

      <div className="home-top">
        <div className="spent-label">$? <span className="muted" style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 14.4 }}>this month</span></div>
        <div className="spent-amt" onClick={cycleCur}>
          {symbolOf(cur)}{fmtNum(Math.round(animTotal * 100) / 100, cur)}
          {currencies.length > 1 && <span className="cur-chip">{cur} ⇄</span>}
        </div>
        {gulliver > 0 && filter !== 'Gulliver' && <div className="muted" style={{ fontSize: 14.4, fontWeight: 600, marginTop: 2 }}>+ Gulliver {fmt(gulliver, cur)}</div>}
        <div className={'filters' + (filters.length > 6 ? ' many' : '')}>
          {filters.map((f) => (
            <button key={f.label} className={'filt' + (filter === f.id ? ' on' : '')} onClick={() => { setSel(null); setFilter(f.id) }}>
              <span className="ring"><Icon name={f.icon} size={22} color={f.color} /></span>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <button className="map-btn" onClick={() => setMapOpen(true)} aria-label="Change map"><Icon name="map" size={22} /></button>
      <button className="map-btn mode-btn" onClick={() => setState((st) => ({ ...st, appearance: MODES[(MODES.indexOf(st.appearance) + 1) % 3] }))} aria-label={'Appearance: ' + MODE_LABEL[s.appearance || 'system']}>
        <Icon name={MODE_ICON[s.appearance || 'system']} size={22} />
      </button>
      {mapOpen && (
        <>
          <div className="map-scrim" onClick={() => setMapOpen(false)} />
          <div className="map-sheet fade-up">
            <div className="row" style={{ marginBottom: 10 }}>
              <b className="sp display" style={{ fontSize: 24 }}>Maps</b>
              <button className="x-btn" onClick={() => setMapOpen(false)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div className="map-row">
              {MAP_LIST.map((m) => (
                <button key={m.id} className={'map-card' + (m.id === mapMeta.id ? ' on' : '')} onClick={() => { setSel(null); setState((st) => ({ ...st, map: m.id })); setMapOpen(false) }}>
                  <span className="map-thumb" style={{ background: `linear-gradient(180deg, ${m.sky[0]}, ${m.sky[1]})` }}>
                    <i className="g" style={{ background: m.ground }} />
                    <i className="r" style={{ background: m.road }} />
                    {m.accent.map((c, k) => <i key={k} className={'b b' + k} style={{ background: c }} />)}
                  </span>
                  <span className="map-name">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="dock">
        {moved && <button className="recenter" style={{ bottom: 'calc(100% + 10px)' }} onClick={() => { scene.current?.recenter(); }}>
          <Icon name="up" size={14} /> Recenter
        </button>}
        {selC ? (
          <div className="card fade-up">
            <div className="row">
              <div className="ico-circle" style={{ background: selC.color + '26', color: selC.color }}><Icon name={countyIcon(selC)} size={24} /></div>
              <div className="sp">
                <b style={{ fontSize: 20.4 }}>{selC.name}</b>
                <div className="muted" style={{ fontSize: 15.6, marginTop: 2 }}>
                  {selC.count ? `${fmt(selC.spent, cur)} this month · ${selC.count} transaction${selC.count > 1 ? 's' : ''}` : `No expenses this month · ${symbolOf(cur)}0`}
                </div>
              </div>
              <button className="x-btn" onClick={() => setSel(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="muted" style={{ fontSize: 15, flex: 1 }}>{selC.count ? `${selC.count} visit${selC.count > 1 ? 's' : ''} this month` : 'No visits yet'}</span>
              <button className="mini" style={{ background: 'var(--green)' }} onClick={() => onAdd(selC.id)}>+ Add</button>
              <button className="mini" style={{ background: 'var(--indigo)' }} onClick={() => onHistory(selC.id)}>History</button>
            </div>
          </div>
        ) : (
          <div className="card" onClick={() => setOpen((v) => !v)}>
            <div className="row">
              <div className="ico-circle" style={{ background: 'var(--surface-2)' }}><Icon name="city" size={24} /></div>
              <div className="sp">
                <b style={{ fontSize: 20.4 }}>{filter || 'All'} State</b>
                <div className="muted" style={{ fontSize: 15.6, marginTop: 2 }}>Spending breakdown by county</div>
              </div>
              <b style={{ fontSize: 19.2, whiteSpace: 'nowrap' }}>{fmt(filter ? list.filter((c) => c.group === filter).reduce((a, c) => a + c.spent, 0) : total, cur)}</b>
              <Icon name={open ? 'down' : 'right'} size={16} />
            </div>
            {open && (
              <div style={{ marginTop: 8, maxHeight: '30vh', overflowY: 'auto' }}>
                {sorted.length === 0 && <div className="muted" style={{ padding: '8px 0', fontSize: 16.8 }}>Nothing spent yet this month. Tap + to add your first expense.</div>}
                {sorted.filter((c) => !filter || c.group === filter).map((c) => (
                  <div key={c.id} className="bd-row" onClick={(e) => { e.stopPropagation(); setSel(c.id) }}>
                    <span className="ico-circle" style={{ width: 32, height: 32, background: c.color + '26', color: c.color }}><Icon name={countyIcon(c)} size={17} /></span>
                    <span className="sp">{c.name}</span>
                    <span>{fmt(c.spent, cur)}</span>
                    <span className="pc">{(c.group === 'Gulliver' ? gulliver : total) ? Math.round((c.spent / (c.group === 'Gulliver' ? gulliver : total)) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
