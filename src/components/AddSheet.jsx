import { useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { addExpense } from '../store.js'
import { symbolOf, fmtNum } from '../util.js'
import { countyIcon } from './Editors.jsx'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '<']

export default function AddSheet({ s, countyId, onClose, onSaved }) {
  const [cid, setCid] = useState(countyId || s.counties[0]?.id)
  const [accId, setAccId] = useState(() => (s.accounts.find((a) => a.currency === s.currency) || s.accounts[0]).id)
  const methods = useMemo(() => {
    const out = []
    s.methods.bank.forEach((n) => out.push({ k: 'bank:' + n, type: 'bank', name: n, label: 'Bank Transfer · ' + n }))
    s.methods.debit.forEach((n) => out.push({ k: 'debit:' + n, type: 'debit', name: n, label: 'Debit · ' + n }))
    s.methods.credit.forEach((n) => out.push({ k: 'credit:' + n, type: 'credit', name: n, label: 'Credit · ' + n }))
    if (s.methods.cash) out.push({ k: 'cash:', type: 'cash', name: '', label: 'Cash' })
    return out
  }, [s.methods])
  const [mk, setMk] = useState(methods[0]?.k || '')
  const [raw, setRaw] = useState('')
  const [people, setPeople] = useState(1)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const acc = s.accounts.find((a) => a.id === accId) || s.accounts[0]
  const press = (k) => {
    if (k === '<') return setRaw((r) => r.slice(0, -1))
    if (k === '.') return setRaw((r) => (r.includes('.') ? r : (r || '0') + '.'))
    setRaw((r) => {
      const n = r === '0' ? k : r + k
      if (n.includes('.') && n.split('.')[1].length > 2) return r
      if (n.replace('.', '').length > 9) return r
      return n
    })
  }
  const amount = Number(raw) || 0
  const [whole, dec] = raw.split('.')
  const shown = raw === '' ? '0' : fmtNum(Number(whole || 0), acc.currency) + (raw.includes('.') ? '.' + (dec ?? '') : '')
  const county = s.counties.find((c) => c.id === cid)

  const save = () => {
    const m = methods.find((x) => x.k === mk)
    const d = new Date(date + 'T12:00:00')
    const now = new Date()
    d.setHours(now.getHours(), now.getMinutes(), 0, 0)
    const e = addExpense({ countyId: cid, amount, accountId: acc.id, methodType: m?.type || 'cash', methodName: m?.name || '', people, note: note.trim(), ts: d.getTime() })
    onSaved(e)
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet">
        <div className="grab" />
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="ico-circle" style={{ width: 40, height: 40, background: (county?.color || '#888') + '26', color: county?.color }}>
            <Icon name={county ? countyIcon(county) : 'tag'} size={20} />
          </div>
          <div className="sp"><b style={{ fontSize: 20.4 }}>New expense</b><div className="muted" style={{ fontSize: 15 }}>{county?.name}</div></div>
          <button className="x-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div className="chips">
          {s.counties.map((c) => (
            <button key={c.id} ref={(el) => { if (el && c.id === cid) el.scrollIntoView({ inline: 'center', block: 'nearest' }) }} className={'pill' + (c.id === cid ? ' on' : '')} onClick={() => setCid(c.id)}>{c.name}</button>
          ))}
        </div>

        <div className="amount"><small>{symbolOf(acc.currency)}</small>{shown}</div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {s.accounts.length > 1 && (
            <select className="field" style={{ width: 'auto', padding: '8px 14px', borderRadius: 999 }} value={accId} onChange={(e) => setAccId(e.target.value)}>
              {s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
            </select>
          )}
          <select className="field" style={{ width: 'auto', padding: '8px 14px', borderRadius: 999 }} value={mk} onChange={(e) => setMk(e.target.value)}>
            {methods.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
          </select>
        </div>

        <div className="row" style={{ justifyContent: 'center', marginTop: 10, gap: 14 }}>
          <div className="stepper">
            <button onClick={() => setPeople((p) => Math.max(1, p - 1))}>−</button>
            <span style={{ fontWeight: 700, minWidth: 74, textAlign: 'center', fontSize: 16.8 }}>{people} {people === 1 ? 'person' : 'people'}</span>
            <button onClick={() => setPeople((p) => Math.min(20, p + 1))}>+</button>
          </div>
          <input type="date" className="field" style={{ width: 'auto', padding: '8px 12px', borderRadius: 999, fontSize: 16.8 }} value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        </div>
        {people > 1 && amount > 0 && <div className="muted" style={{ textAlign: 'center', fontSize: 15.6, marginTop: 8 }}>{symbolOf(acc.currency)}{fmtNum(amount / people, acc.currency)} each</div>}

        <input className="field" style={{ marginTop: 10 }} placeholder="Note (optional)" maxLength={80} value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} />

        <div className="keys">
          {KEYS.map((k) => <button key={k} className="key" onClick={() => press(k)}>{k === '<' ? <Icon name="left" size={22} /> : k}</button>)}
        </div>
        <button className="btn green" disabled={amount <= 0 || !cid} onClick={save}>Save Expense</button>
      </div>
    </>
  )
}
