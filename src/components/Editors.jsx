import { useState } from 'react'
import Icon from './Icon.jsx'
import { setState, GROUPS, STYLES, PALETTE, MAX_COUNTIES, MAX_ACCOUNTS, MAX_SUB, runFixed } from '../store.js'
import { CURRENCIES, uid, fmt, symbolOf } from '../util.js'
import { prevYm } from '../store.js'
import { ymOf } from '../util.js'

export const STYLE_LABEL = { house: 'House', tower: 'Tower', shop: 'Shop', dome: 'Bank', market: 'Market', cafe: 'Cafe', cinema: 'Cinema', tech: 'Tech', depot: 'Depot', hospital: 'Hospital' }
export const STYLE_ICON = { house: 'home', tower: 'bolt', shop: 'tag', dome: 'bank', market: 'cart', cafe: 'coffee', cinema: 'film', tech: 'chip', depot: 'bus', hospital: 'cross' }
export const countyIcon = (c) => c.icon || STYLE_ICON[c.style] || 'tag'

export function CountiesEditor({ s }) {
  const upd = (id, patch) => setState((st) => ({ ...st, counties: st.counties.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  const used = (id) => s.expenses.filter((e) => e.countyId === id).length
  const add = () => setState((st) => {
    const i = st.counties.length
    return { ...st, counties: [...st.counties, { id: 'c' + uid(), name: 'New county', group: 'Other', style: 'shop', icon: 'tag', color: PALETTE[i % PALETTE.length] }] }
  })
  const del = (id) => setState((st) => ({ ...st, counties: st.counties.filter((c) => c.id !== id), fixed: st.fixed.filter((f) => f.countyId !== id) }))
  return (
    <div>
      <div className="list">
        {s.counties.map((c) => (
          <div key={c.id} className="item" style={{ flexWrap: 'wrap' }}>
            <div className="ico-circle" style={{ width: 38, height: 38, background: c.color + '26', color: c.color }}>
              <Icon name={countyIcon(c)} size={20} />
            </div>
            <input className="field" style={{ flex: 1, minWidth: 0 }} value={c.name} maxLength={22} onChange={(e) => upd(c.id, { name: e.target.value })} />
            <button className="x-btn" disabled={used(c.id) > 0} style={{ opacity: used(c.id) ? 0.3 : 1 }} onClick={() => del(c.id)} aria-label="Delete county"><Icon name="x" size={16} /></button>
            <div className="row" style={{ width: '100%', paddingLeft: 48, gap: 8 }}>
              <select className="field" value={c.group} onChange={(e) => upd(c.id, { group: e.target.value })}>
                {GROUPS.map((g) => <option key={g}>{g}</option>)}
              </select>
              <select className="field" value={c.style} onChange={(e) => upd(c.id, { style: e.target.value, icon: STYLE_ICON[e.target.value] })}>
                {STYLES.map((x) => <option key={x} value={x}>{STYLE_LABEL[x]}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      <button className="btn ghost" style={{ height: 48, marginTop: 10 }} disabled={s.counties.length >= MAX_COUNTIES} onClick={add}>
        {s.counties.length >= MAX_COUNTIES ? `Map is full (${MAX_COUNTIES} counties)` : `+ Add county (${s.counties.length}/${MAX_COUNTIES})`}
      </button>
      <p className="muted" style={{ fontSize: 15, margin: '10px 4px 0' }}>Counties with expenses can't be deleted. Group decides which filter circle shows it; building style is how it looks on the map.</p>
    </div>
  )
}

const METHOD_TYPES = [['bank', 'Bank Transfer', 'Bank'], ['debit', 'Debit Card', 'Card'], ['credit', 'Credit Card', 'Card']]

export function MethodsEditor({ s }) {
  const set = (k, arr) => setState((st) => ({ ...st, methods: { ...st.methods, [k]: arr } }))
  return (
    <div>
      {METHOD_TYPES.map(([k, label, noun]) => (
        <div key={k} style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginTop: 6 }}>{label} · {s.methods[k].length}/{MAX_SUB}</div>
          <div className="list">
            {s.methods[k].map((n, i) => (
              <div key={i} className="item">
                <Icon name={k === 'bank' ? 'bank' : 'card'} size={20} />
                <input className="field" value={n} maxLength={22} onChange={(e) => set(k, s.methods[k].map((x, j) => (j === i ? e.target.value : x)))} />
                <button className="x-btn" onClick={() => set(k, s.methods[k].filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
              </div>
            ))}
          </div>
          <button className="btn ghost" style={{ height: 42, fontSize: 16.8, marginTop: 6 }} disabled={s.methods[k].length >= MAX_SUB}
            onClick={() => set(k, [...s.methods[k], `${noun} ${s.methods[k].length + 1}`])}>
            + Add {label.toLowerCase()}
          </button>
        </div>
      ))}
      <div className="row" style={{ padding: '6px 4px' }}>
        <Icon name="wallet" size={20} />
        <b>Cash</b>
        <div className="sp" />
        <button className={'pill' + (s.methods.cash ? ' on' : '')} onClick={() => setState((st) => ({ ...st, methods: { ...st.methods, cash: !st.methods.cash } }))}>
          {s.methods.cash ? 'Enabled' : 'Disabled'}
        </button>
      </div>
    </div>
  )
}

export function AccountsEditor({ s }) {
  const upd = (id, patch) => setState((st) => ({ ...st, accounts: st.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  const used = (id) => s.expenses.some((e) => e.accountId === id)
  const add = () => setState((st) => ({ ...st, accounts: [...st.accounts, { id: 'a' + uid(), name: `Account ${st.accounts.length + 1}`, currency: 'EUR' }] }))
  const del = (id) => setState((st) => ({ ...st, accounts: st.accounts.filter((a) => a.id !== id), fixed: st.fixed.filter((f) => f.accountId !== id) }))
  return (
    <div>
      <div className="list">
        {s.accounts.map((a) => (
          <div key={a.id} className="item">
            <input className="field" style={{ flex: 1, minWidth: 0 }} value={a.name} maxLength={20} onChange={(e) => upd(a.id, { name: e.target.value })} />
            <select className="field" style={{ width: 118, flex: 'none' }} value={a.currency} disabled={used(a.id)} onChange={(e) => upd(a.id, { currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{symbolOf(c.code)} {c.code}</option>)}
            </select>
            <button className="x-btn" disabled={s.accounts.length <= 1 || used(a.id)} style={{ opacity: s.accounts.length <= 1 || used(a.id) ? 0.3 : 1 }} onClick={() => del(a.id)}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>
      <button className="btn ghost" style={{ height: 48, marginTop: 10 }} disabled={s.accounts.length >= MAX_ACCOUNTS} onClick={add}>
        {s.accounts.length >= MAX_ACCOUNTS ? 'Maximum 5 accounts' : `+ Add account (${s.accounts.length}/${MAX_ACCOUNTS})`}
      </button>
      <p className="muted" style={{ fontSize: 15, margin: '10px 4px 0' }}>Each account has one currency. A currency can't be changed once the account has expenses.</p>
    </div>
  )
}

export function FixedEditor({ s }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', amount: '', accountId: s.accounts[0]?.id, countyId: s.counties.find((c) => c.name === 'Subscriptions')?.id || s.counties[0]?.id, day: 1 })
  const ok = f.name.trim() && Number(f.amount) > 0
  const save = () => {
    const m = s.methods
    const methodType = m.bank.length ? 'bank' : m.debit.length ? 'debit' : m.credit.length ? 'credit' : 'cash'
    const item = { id: 'f' + uid(), name: f.name.trim(), amount: Number(f.amount), accountId: f.accountId, countyId: f.countyId, day: Number(f.day), methodType, methodName: m[methodType]?.[0] || '', lastPosted: prevYm(ymOf(Date.now())) }
    setState((st) => ({ ...st, fixed: [...st.fixed, item] }))
    setF({ ...f, name: '', amount: '' })
    setOpen(false)
    runFixed()
  }
  const cur = (id) => s.accounts.find((a) => a.id === id)?.currency || 'INR'
  return (
    <div>
      {s.fixed.length === 0 && !open && <p className="muted" style={{ margin: '4px 4px 12px' }}>Nothing here yet. Add things like Claude, ChatGPT, rent or a gym membership once and they're logged for you every month.</p>}
      <div className="list">
        {s.fixed.map((x) => (
          <div key={x.id} className="item">
            <div className="ico-circle" style={{ width: 38, height: 38, background: 'var(--surface-2)' }}><Icon name="repeat" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{x.name}</b>
              <div className="muted" style={{ fontSize: 15 }}>{fmt(x.amount, cur(x.accountId))} · day {x.day} · {s.counties.find((c) => c.id === x.countyId)?.name || '—'}</div>
            </div>
            <button className="x-btn" onClick={() => setState((st) => ({ ...st, fixed: st.fixed.filter((y) => y.id !== x.id) }))}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>
      {open ? (
        <div className="card" style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <input className="field" placeholder="Name (e.g. Claude Pro)" maxLength={40} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="row">
            <input className="field" inputMode="decimal" placeholder="Amount" maxLength={12} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, '') })} />
            <select className="field" style={{ width: 96, flex: 'none' }} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>Day {i + 1}</option>)}
            </select>
          </div>
          <div className="row">
            <select className="field" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              {s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
            <select className="field" value={f.countyId} onChange={(e) => setF({ ...f, countyId: e.target.value })}>
              {s.counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="row">
            <button className="btn ghost" style={{ height: 46 }} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn green" style={{ height: 46 }} disabled={!ok} onClick={save}>Save</button>
          </div>
        </div>
      ) : (
        <button className="btn ghost" style={{ height: 48, marginTop: 10 }} onClick={() => setOpen(true)}>+ Add fixed expense</button>
      )}
    </div>
  )
}
