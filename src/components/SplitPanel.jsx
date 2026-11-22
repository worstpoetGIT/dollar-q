import { useState } from 'react'
import Icon from './Icon.jsx'
import { symbolOf, fmtNum, splitShares } from '../util.js'

// keep what the person types a plain number with at most two decimals
const typed = (v) => {
  let t = v.replace(/[^0-9.]/g, '')
  const dot = t.indexOf('.')
  if (dot >= 0) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '')
  if (dot >= 0 && t.length - dot - 1 > 2) t = t.slice(0, dot + 3)
  return t.slice(0, 12)
}
const numOf = (v) => (v === '' || v === '.' ? 0 : Number(v))

// equal parts that add up exactly: the last person gets what is left over
function equalParts(mode, total, n) {
  const whole = mode === 'percent' ? 10000 : Math.round(total * 100)
  const each = Math.floor(whole / n)
  return Array.from({ length: n }, (_, i) => String((i === n - 1 ? whole - each * (n - 1) : each) / 100))
}

const modeBtn = (on) => ({
  flex: 1, height: 44, borderRadius: 999, fontSize: 16, fontWeight: 700, border: '1px solid var(--line)',
  background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--bg)' : 'var(--ink)',
})

// the screen for an uneven split. a is percentages, b is exact amounts, both typed in boxes.
// the split can only be used when it settles the whole bill.
export default function SplitPanel({ total, currency, people, initial, onUse, onEqual, onBack }) {
  const [mode, setMode] = useState(initial ? initial.mode : 'percent')
  const [vals, setVals] = useState(() => (initial && initial.parts.length === people ? initial.parts.map(String) : equalParts('percent', total, people)))
  const sym = symbolOf(currency)
  const money = (n) => sym + fmtNum(n, currency)

  const parts = vals.map(numOf)
  const shares = splitShares(total, { mode, parts })
  const target = mode === 'percent' ? 10000 : Math.round(total * 100)
  const left = (target - parts.reduce((a, p) => a + Math.round(p * 100), 0)) / 100
  const settled = !!shares

  const pick = (m) => {
    if (m === mode) return
    setMode(m)
    setVals(equalParts(m, total, people))
  }
  const setAt = (i, v) => setVals((a) => a.map((x, j) => (j === i ? typed(v) : x)))
  const fillLast = () => {
    const others = parts.slice(0, -1).reduce((a, p) => a + Math.round(p * 100), 0)
    const rest = target - others
    if (rest > 0) setVals((a) => a.map((x, j) => (j === a.length - 1 ? String(rest / 100) : x)))
  }

  // what each person ends up with, shown next to their box
  const side = (i) => {
    if (shares) return mode === 'percent' ? money(shares[i]) : (Math.round((shares[i] / total) * 10000) / 100) + '%'
    return mode === 'percent' ? money(Math.round(total * parts[i]) / 100) : (total ? Math.round((parts[i] / total) * 10000) / 100 : 0) + '%'
  }

  return (
    <>
      <div className="scrim" onClick={onBack} />
      <div className="sheet" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="grab" />
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="sp"><b style={{ fontSize: 20.4 }}>Split the bill</b><div className="muted" style={{ fontSize: 15 }}>{money(total)} between {people} people</div></div>
          <button className="x-btn" onClick={onBack} aria-label="Back"><Icon name="x" size={16} /></button>
        </div>

        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button style={modeBtn(mode === 'percent')} onClick={() => pick('percent')}>A · Percentage</button>
          <button style={modeBtn(mode === 'amount')} onClick={() => pick('amount')}>B · Exact amounts</button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {vals.map((v, i) => (
            <div className="row" key={i} style={{ gap: 10 }}>
              <div className="sp" style={{ fontWeight: i === 0 ? 700 : 500 }}>{i === 0 ? 'You (person 1)' : 'Person ' + (i + 1)}</div>
              <span className="muted" style={{ fontSize: 15, minWidth: 64, textAlign: 'right' }}>{side(i)}</span>
              <input className="field" inputMode="decimal" style={{ width: 104, textAlign: 'right', userSelect: 'text', WebkitUserSelect: 'text' }}
                value={v} placeholder="0" onChange={(e) => setAt(i, e.target.value)} aria-label={(i === 0 ? 'You' : 'Person ' + (i + 1)) + (mode === 'percent' ? ' percent' : ' amount')} />
              <span className="muted" style={{ width: 14 }}>{mode === 'percent' ? '%' : sym}</span>
            </div>
          ))}
        </div>

        <div style={{ margin: '12px 0 4px', fontSize: 16.8, fontWeight: 700, color: settled ? 'var(--green-ink)' : 'var(--red)' }}>
          {settled
            ? 'All settled. Your share is ' + money(shares[0])
            : (left > 0 ? 'Still to split: ' : 'Over by: ') + (mode === 'percent' ? Math.abs(left) + '%' : money(Math.abs(left)))}
        </div>
        {!settled && left > 0 && <button className="btn ghost" style={{ height: 40, fontSize: 16, marginBottom: 6 }} onClick={fillLast}>Put the rest on person {people}</button>}
        {!settled && parts.some((p) => p <= 0) && <div className="muted" style={{ fontSize: 14.4 }}>Everyone needs a share above zero.</div>}

        <button className="btn green" style={{ marginTop: 8 }} disabled={!settled} onClick={() => onUse({ mode, parts })}>Use this split</button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={onEqual}>Split equally instead</button>
      </div>
    </>
  )
}
