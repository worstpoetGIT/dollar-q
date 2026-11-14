import { useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { countyIcon } from './Editors.jsx'
import { setState } from '../store.js'
import { fmt, fmtNum, symbolOf, ymOf, shiftYm, monthLabel, daysIn } from '../util.js'
import { useLenis } from '../hooks.js'

export function CurrencyChips({ s, cur }) {
  const cs = [...new Set(s.accounts.map((a) => a.currency))]
  if (cs.length < 2) return null
  return (
    <div className="row" style={{ gap: 8, margin: '4px 0 10px' }}>
      {cs.map((c) => <button key={c} className={'pill' + (c === cur ? ' on' : '')} onClick={() => setState((st) => ({ ...st, currency: c }))}>{symbolOf(c)} {c}</button>)}
    </div>
  )
}

export default function Analytics({ s }) {
  const ref = useRef(null)
  useLenis(ref)
  const nowYm = ymOf(Date.now())
  const [ym, setYm] = useState(nowYm)
  const cs = [...new Set(s.accounts.map((a) => a.currency))]
  const cur = cs.includes(s.currency) ? s.currency : cs[0]

  const d = useMemo(() => {
    const inCur = s.expenses.filter((e) => e.currency === cur)
    const sumYm = (k) => inCur.filter((e) => ymOf(e.ts) === k).reduce((a, e) => a + e.amount, 0)
    const month = inCur.filter((e) => ymOf(e.ts) === ym)
    const n = daysIn(ym)
    const days = Array(n).fill(0)
    month.forEach((e) => { days[new Date(e.ts).getDate() - 1] += e.amount })
    const total = month.reduce((a, e) => a + e.amount, 0)
    const h1 = days.slice(0, 15).reduce((a, b) => a + b, 0)
    const trend = Array.from({ length: 6 }, (_, i) => { const k = shiftYm(ym, i - 5); return { k, v: sumYm(k) } })
    const per = {}
    month.forEach((e) => { per[e.countyId] = (per[e.countyId] || 0) + e.amount })
    const top = s.counties.map((c) => ({ c, v: per[c.id] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
    const hasEarlier = inCur.some((e) => ymOf(e.ts) < ym)
    return { n, days, total, h1, h2: total - h1, last: sumYm(shiftYm(ym, -1)), trend, top, hasEarlier }
  }, [s.expenses, s.counties, cur, ym])

  const diff = d.total - d.last
  const hasLast = d.last > 0
  const W = 340, H = 130, gap = 10, slot = (W - 8 - gap) / d.n
  const maxDay = Math.max(1, ...d.days)
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.v))
  const today = new Date()
  const futureFrom = ym === nowYm ? today.getDate() : ym > nowYm ? 0 : d.n

  return (
    <div className="page" ref={ref}>
      <div>
        <h1 className="title">Analytics</h1>
        <div className="row" style={{ marginBottom: 6 }}>
          <button className="icon-btn" onClick={() => setYm(shiftYm(ym, -1))} aria-label="Previous month"><Icon name="left" size={18} /></button>
          <b className="sp" style={{ textAlign: 'center', fontSize: 22.8 }}>{monthLabel(ym)}</b>
          <button className="icon-btn" style={{ opacity: ym >= nowYm ? 0.35 : 1 }} disabled={ym >= nowYm} onClick={() => setYm(shiftYm(ym, 1))} aria-label="Next month"><Icon name="right" size={18} /></button>
        </div>
        <CurrencyChips s={s} cur={cur} />

        <div className="stat-row" style={{ marginTop: 16 }}>
          <div><div className="k">Expenses</div><div className="v">{fmt(d.total, cur)}</div></div>
          <div><div className="k">Last month</div><div className="v">{hasLast ? fmt(d.last, cur) : '—'}</div></div>
          <div>
            <div className="k">Difference</div>
            <div className="v" style={{ color: !hasLast ? 'inherit' : diff > 0 ? 'var(--red)' : 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {hasLast ? <><Icon name={diff > 0 ? 'up' : 'down'} size={16} sw={3} />{fmt(Math.abs(diff), cur)}</> : '—'}
            </div>
            {hasLast && <div className="muted" style={{ fontSize: 14.4, marginTop: 2 }}>{diff === 0 ? 'Same as last month' : `${Math.abs(Math.round((diff / d.last) * 100))}% ${diff > 0 ? 'more' : 'less'}`}</div>}
          </div>
        </div>
        {!d.hasEarlier && <div className="pill fade-up" style={{ background: 'color-mix(in srgb, var(--indigo) 14%, var(--surface))', color: 'var(--indigo)', marginTop: 14 }}>First month tracking in $?</div>}

        <div className="card fade-up" style={{ marginTop: 18 }}>
          <b style={{ fontSize: 19.2 }}>Day by day</b>
          <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', marginTop: 10, display: 'block' }}>
            {d.days.map((v, i) => {
              const x = 4 + i * slot + (i >= 15 ? gap : 0)
              const h = v > 0 ? Math.max(4, (v / maxDay) * H) : 3
              return <rect key={i} x={x} y={H - h} width={Math.max(2, slot - 2.2)} height={h} rx={2}
                fill={v > 0 ? (i < 15 ? 'var(--green)' : 'color-mix(in srgb, var(--green) 62%, var(--indigo))') : 'var(--surface-2)'} opacity={i >= futureFrom ? 0.45 : 1} />
            })}
            {[[0, '1'], [14, '15'], [15, '16'], [d.n - 1, String(d.n)]].map(([i, t]) => (
              <text key={t} x={4 + i * slot + (i >= 15 ? gap : 0) + slot / 2} y={H + 16} textAnchor="middle" fontSize="12" fill="var(--ink-2)" fontWeight="600">{t}</text>
            ))}
          </svg>
          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            <div className="sp" style={{ background: 'var(--surface-2)', borderRadius: 16, padding: '10px 12px' }}>
              <div className="muted" style={{ fontSize: 14.4, fontWeight: 600 }}>1 – 15</div>
              <b style={{ fontSize: 21.6 }}>{fmt(d.h1, cur)}</b>
            </div>
            <div className="sp" style={{ background: 'var(--surface-2)', borderRadius: 16, padding: '10px 12px' }}>
              <div className="muted" style={{ fontSize: 14.4, fontWeight: 600 }}>16 – {d.n}</div>
              <b style={{ fontSize: 21.6 }}>{fmt(d.h2, cur)}</b>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <b style={{ fontSize: 19.2 }}>Last 6 months</b>
          <div className="row" style={{ alignItems: 'flex-end', gap: 10, height: 120, marginTop: 12 }}>
            {d.trend.map((t, i) => (
              <div key={t.k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ width: '100%', maxWidth: 34, height: t.v ? Math.max(6, (t.v / maxTrend) * 86) : 6, borderRadius: 10, background: t.v ? (i === 5 ? 'var(--green)' : 'color-mix(in srgb, var(--green) 45%, var(--surface-2))') : 'var(--surface-2)', transition: 'height .7s cubic-bezier(.2,.8,.2,1)' }} />
                <span style={{ fontSize: 13.2, fontWeight: i === 5 ? 800 : 600, color: i === 5 ? 'var(--ink)' : 'var(--ink-2)' }}>{new Date(t.k + '-01T00:00').toLocaleString('en', { month: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="label" style={{ marginTop: 22 }}>Top counties</div>
        {d.top.length === 0 ? (
          <div className="empty" style={{ paddingTop: 20 }}>
            <div className="blob"><Icon name="pie" size={46} color="var(--indigo)" /></div>
            <h3>Your spending brings the state to life</h3>
            <div className="muted">Counties show up here once expenses are recorded this month.</div>
          </div>
        ) : (
          <div className="card list" style={{ padding: '4px 16px' }}>
            {d.top.map(({ c, v }) => (
              <div key={c.id} style={{ padding: '12px 0' }}>
                <div className="row">
                  <span className="ico-circle" style={{ width: 34, height: 34, background: c.color + '26', color: c.color }}><Icon name={countyIcon(c)} size={18} /></span>
                  <b className="sp">{c.name}</b>
                  <b>{fmt(v, cur)}</b>
                  <span className="muted" style={{ width: 38, textAlign: 'right', fontSize: 15 }}>{Math.round((v / d.total) * 100)}%</span>
                </div>
                <div className="bar-bg" style={{ marginTop: 8 }}><div className="bar-fg" style={{ width: (v / d.top[0].v) * 100 + '%', background: c.color }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
