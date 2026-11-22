import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { countyIcon } from './Editors.jsx'
import { deleteExpense } from '../store.js'
import { fmt, ymOf, shiftYm, monthLabel, dayLabel, byAccount, splitShares } from '../util.js'
import { setState } from '../store.js'
import { useLenis } from '../hooks.js'
import { haptic } from '../haptics.js'

const REVEAL = 176

// swipe left on a row to show edit and delete
function SwipeRow({ open, onOpen, onClose, onDelete, onEdit, onTap, children }) {
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const [gone, setGone] = useState(false)
  const st = useRef(null)
  const x = drag ? dx : open ? -REVEAL : 0

  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    st.current = { x: e.clientX, y: e.clientY, base: open ? -REVEAL : 0, lock: null, crossed: open }
  }
  const move = (e) => {
    const s0 = st.current
    if (!s0) return
    const ddx = e.clientX - s0.x, ddy = e.clientY - s0.y
    if (!s0.lock) {
      if (Math.abs(ddx) < 7 && Math.abs(ddy) < 7) return
      s0.lock = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y'
      if (s0.lock === 'x') { try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ } setDrag(true) }
    }
    if (s0.lock !== 'x') return
    let v = s0.base + ddx
    if (v > 0) v = v * 0.2
    if (v < -REVEAL) v = -REVEAL + (v + REVEAL) * 0.25
    setDx(v)
    const past = v < -REVEAL * 0.5
    if (past !== s0.crossed) { s0.crossed = past; haptic('light') }
  }
  const up = () => {
    const s0 = st.current
    st.current = null
    if (!s0 || s0.lock !== 'x') return
    setDrag(false)
    if (dx < -REVEAL * 0.5) onOpen(); else onClose()
    s0.moved = true
    setTimeout(() => { s0.moved = false }, 0)
    lastDrag.current = performance.now()
  }
  const lastDrag = useRef(0)
  const click = () => {
    if (performance.now() - lastDrag.current < 250) return
    if (open) onClose(); else onTap()
  }
  const del = () => { setGone(true); setTimeout(onDelete, 240) }

  return (
    <div className={'swipe' + (gone ? ' gone' : '') + (open || drag ? ' active' : '')}>
      <div className="swipe-actions">
        <button className="swipe-edit" onClick={() => { onClose(); onEdit() }} tabIndex={open ? 0 : -1} aria-label="Edit transaction"><Icon name="edit2" size={20} /><span>Edit</span></button>
        <button className="swipe-del" onClick={del} tabIndex={open ? 0 : -1} aria-label="Delete transaction"><Icon name="trash" size={20} /><span>Delete</span></button>
      </div>
      <div className="swipe-fg" style={{ transform: `translateX(${x}px)`, transition: drag ? 'none' : 'transform .28s cubic-bezier(.2,.9,.3,1)' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}>
        {children}
      </div>
    </div>
  )
}

const METHOD = { bank: 'Bank transfer', debit: 'Debit', credit: 'Credit', cash: 'Cash' }

// the whole math of an uneven split, one line: "You 16 · Person 2 12 · Person 3 22  (32% / 24% / 44%)"
const splitLine = (e) => {
  const shares = splitShares(e.total ?? e.amount, e.split)
  if (!shares) return ''
  const who = shares.map((v, i) => (i === 0 ? 'You ' : 'Person ' + (i + 1) + ' ') + fmt(v, e.currency)).join(' · ')
  return who + (e.split.mode === 'percent' ? '  (' + e.split.parts.map((p) => p + '%').join(' / ') + ')' : '')
}

export default function History({ s, initCounty, onEdit }) {
  const ref = useRef(null)
  useLenis(ref)
  const nowYm = ymOf(Date.now())
  const [ym, setYm] = useState(nowYm)
  const [cid, setCid] = useState(initCounty || null)
  const [accId, setAccId] = useState(() => (s.accounts.find((a) => a.currency === s.currency) || s.accounts[0]).id)
  const acc = s.accounts.find((a) => a.id === accId) || s.accounts[0]
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [detailId, setDetailId] = useState(null)
  useEffect(() => { if (initCounty) setCid(initCounty) }, [initCounty])

  const countyOf = (id) => s.counties.find((c) => c.id === id)
  const query = q.trim().toLowerCase()

  const rows = useMemo(() => {
    let r = byAccount(s.expenses, acc.id)
    if (cid) r = r.filter((e) => e.countyId === cid)
    if (query) {
      r = r.filter((e) => {
        const c = countyOf(e.countyId)
        const hay = [c?.name, c?.group, e.note, e.methodName, METHOD[e.methodType], String(e.amount), e.currency].join(' ').toLowerCase()
        return query.split(/\s+/).every((w) => hay.includes(w))
      })
    } else r = r.filter((e) => ymOf(e.ts) === ym)
    return [...r].sort((a, b) => b.ts - a.ts)
  }, [s.expenses, s.counties, cid, ym, query, acc.id])

  const days = useMemo(() => {
    const m = new Map()
    for (const e of rows) {
      const k = new Date(e.ts).toDateString()
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(e)
    }
    return [...m.values()]
  }, [rows])

  const dayTotal = (list) => {
    const t = {}
    list.forEach((e) => { t[e.currency] = (t[e.currency] || 0) + e.amount })
    return Object.entries(t).map(([c, v]) => fmt(v, c)).join(' · ')
  }

  return (
    <div className="page" ref={ref}>
      <div>
        <div className="row" style={{ marginBottom: 12 }}>
          <h1 className="title sp" style={{ margin: 0 }}>History</h1>
          <button className="icon-btn" onClick={() => { setSearching((v) => !v); setQ('') }} aria-label="Search"><Icon name={searching ? 'x' : 'search'} size={20} color="var(--indigo)" /></button>
        </div>
        {s.accounts.length > 1 && (
          <div className="chips" style={{ marginBottom: 12 }}>
            {s.accounts.map((a) => (
              <button key={a.id} className={'pill' + (a.id === acc.id ? ' on' : '')} onClick={() => { setAccId(a.id); setOpenId(null); setDetailId(null); setState((st) => ({ ...st, currency: a.currency })) }}>{a.name} · {a.currency}</button>
            ))}
          </div>
        )}
        {searching ? (
          <input className="field fade-up" autoFocus placeholder="Search every month — county, note, amount, card…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        ) : (
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="icon-btn" onClick={() => setYm(shiftYm(ym, -1))}><Icon name="left" size={18} /></button>
            <b className="sp" style={{ textAlign: 'center', fontSize: 21.6 }}>{monthLabel(ym)}</b>
            <button className="icon-btn" style={{ opacity: ym >= nowYm ? 0.35 : 1 }} disabled={ym >= nowYm} onClick={() => setYm(shiftYm(ym, 1))}><Icon name="right" size={18} /></button>
          </div>
        )}
        <div className="chips">
          <button className={'pill' + (!cid ? ' on' : '')} onClick={() => setCid(null)}>All</button>
          {s.counties.map((c) => <button key={c.id} className={'pill' + (cid === c.id ? ' on' : '')} onClick={() => setCid(c.id)}>{c.name}</button>)}
        </div>

        {rows.length === 0 ? (
          <div className="empty" style={{ paddingTop: 70 }}>
            <div className="blob"><Icon name="receipt" size={46} /></div>
            <h3>{query ? 'No matches' : 'Your spending story starts here'}</h3>
            <div className="muted">{query ? 'Nothing matches that search in any month.' : 'No transactions in this view. Add an expense with + to see it here, organized by day.'}</div>
          </div>
        ) : days.map((list) => (
          <div key={list[0].id}>
            <div className="hist-day"><span>{dayLabel(list[0].ts)}{query ? ' · ' + new Date(list[0].ts).toLocaleString('en', { month: 'short', year: 'numeric' }) : ''}</span><span>{dayTotal(list)}</span></div>
            <div className="card list" style={{ padding: 0, overflow: 'hidden' }}>
              {list.map((e) => {
                const c = countyOf(e.countyId)
                return (
                  <SwipeRow key={e.id} open={openId === e.id} onOpen={() => setOpenId(e.id)} onClose={() => setOpenId(null)}
                    onDelete={() => { deleteExpense(e.id); setOpenId(null) }} onEdit={() => onEdit && onEdit(e)} onTap={() => { setOpenId(null); setDetailId(detailId === e.id ? null : e.id) }}>
                    <div className="hist-item">
                      <span className="ico-circle" style={{ width: 42, height: 42, background: (c?.color || '#888') + '26', color: c?.color || '#888' }}><Icon name={c ? countyIcon(c) : 'tag'} size={20} /></span>
                      <div className="sp" style={{ minWidth: 0 }}>
                        <div className="t">{c?.name || 'Removed county'}{e.fixedId ? ' · auto' : ''}</div>
                        <div className="s">{[e.note, METHOD[e.methodType] + (e.methodName ? ' · ' + e.methodName : ''), e.people > 1 ? 'Total ' + fmt(e.total ?? e.amount, e.currency) + ' · ' + e.people + ' people' + (e.split ? ' · custom split' : '') : ''].filter(Boolean).join(' · ')}</div>
                        {detailId === e.id && <div className="s" style={{ marginTop: 6 }}>{new Date(e.ts).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}{e.people > 1 ? ` · your share ${fmt(e.amount, e.currency)} of ${fmt(e.total ?? e.amount, e.currency)}` : ''}</div>}
                        {detailId === e.id && e.split && <div className="s" style={{ marginTop: 4 }}>{splitLine(e)}</div>}
                      </div>
                      <b>{fmt(e.amount, e.currency)}</b>
                    </div>
                  </SwipeRow>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
