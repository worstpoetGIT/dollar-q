import { useState } from 'react'
import Icon from './Icon.jsx'
import { CountiesEditor, MethodsEditor, AccountsEditor, FixedEditor } from './Editors.jsx'
import { setState } from '../store.js'

function Steps({ at }) {
  return <div className="steps">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i <= at ? 'on' : ''} />)}</div>
}

function Billboard({ name }) {
  const n = name
  const fs = n.length > 22 ? 17 : n.length > 16 ? 21 : 26
  return (
    <svg viewBox="0 0 340 250" style={{ width: '100%', maxWidth: 340, display: 'block', margin: '4px auto 10px' }}>
      <g stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M268 40 280 34M270 56l22 0" fill="none" strokeWidth="3" />
        <rect x="52" y="14" width="214" height="76" rx="8" fill="#444" transform="translate(5 5)" />
        <rect x="52" y="14" width="214" height="76" rx="8" fill="#fff" />
        <path d="M84 90v26M236 90v26" fill="none" strokeWidth="5" />
        <path d="M82 118h162l8-10H92z" fill="#fff" />
        <rect x="86" y="118" width="158" height="104" fill="#fff4e6" />
        <path d="M244 118l12-10v104l-12 10z" fill="#555" />
        <path d="M30 222h262" fill="none" />
        <ellipse cx="62" cy="186" rx="19" ry="26" fill="#2fa56a" />
        <path d="M62 176v46M62 192l-9-9" fill="none" />
      </g>
      <circle cx="62" cy="20" r="4" fill="#ff5a3c" stroke="currentColor" strokeWidth="2" />
      <circle cx="258" cy="82" r="4" fill="#ff5a3c" stroke="currentColor" strokeWidth="2" />
      {[0, 1, 2].map((c) => [0, 1].map((r) => (
        <g key={c + '-' + r}><rect x={98 + c * 44} y={132 + r * 31} width="28" height="24" rx="3" fill="#111" /><rect x={103 + c * 44} y={137 + r * 31} width="3" height="10" fill="#fff" /></g>
      )))}
      <rect x="150" y="190" width="36" height="32" fill="#5b54e8" stroke="currentColor" strokeWidth="3.5" />
      {n && (
        <>
          <text x="159" y="38" textAnchor="middle" fontSize="10.8" fontWeight="600" fill="#222" fontFamily="Inter,sans-serif" letterSpacing=".6">
            <tspan x="159">WELCOME TO THE STATE OF</tspan>
          </text>
          <text x="159" y="68" textAnchor="middle" fontSize={fs} fill="#111" fontFamily="Archivo Black,sans-serif" letterSpacing="-.5">{n}</text>
        </>
      )}
    </svg>
  )
}

export function NameStep({ initial = '', onBack, onDone }) {
  const [name, setName] = useState(initial)
  return (
    <div className="lime state">
      <div className="body">
        <div className="row" style={{ marginBottom: 6 }}>
          {onBack && <button className="x-btn" onClick={onBack} aria-label="Back"><Icon name="left" size={18} /></button>}
          <div style={{ flex: 1 }}><Steps at={0} /></div>
        </div>
        <h1 className="fade-up">A state<br />with your name.</h1>
        <Billboard name={name.trim()} />
        <p className="muted" style={{ margin: '4px 0 18px', fontSize: 19.2 }}>Just a name so the state knows who it belongs to.</p>
        <div className="muted" style={{ fontSize: 16.8, marginBottom: 12 }}>Your state's name</div>
        <input className="name-input" value={name} placeholder="" maxLength={28} onChange={(e) => setName(e.target.value)} autoFocus={false} />
      </div>
      <div className="foot">
        <button className="btn" disabled={!name.trim()} onClick={() => { setState((s) => ({ ...s, stateName: name.trim(), entered: true })); onDone() }}>
          Enter without Roaming charges
        </button>
      </div>
    </div>
  )
}

const STEPS = [
  { h: 'Name your counties.', p: "Counties are your spending categories. Each one becomes a building on the map. Rename them, regroup them, or add up to 12.", C: CountiesEditor, next: 'Continue', tone: 'counties' },
  { h: 'Pick your payment cultures.', p: 'How do you pay? Add up to 5 of each kind. They show up when you log an expense.', C: MethodsEditor, next: 'Continue', tone: 'payments' },
  { h: 'Accounts and currencies.', p: 'Up to 5 accounts, each with one currency. Spend in EUR and INR? Make two.', C: AccountsEditor, next: 'Continue', tone: 'accounts' },
  { h: 'Fixed expenses.', p: "Subscriptions and rent that debit on a fixed day. Add them once and they're logged automatically. You can skip this.", C: FixedEditor, next: 'Enter my state', tone: 'fixed' },
]

export function Wizard({ s, onBack, onDone }) {
  const [i, setI] = useState(0)
  const st = STEPS[i]
  const C = st.C
  const last = i === STEPS.length - 1
  return (
    <div className={'lime' + (st.tone ? ' ' + st.tone : '')}>
      <div className="body" key={i}>
        <div className="row" style={{ marginBottom: 6 }}>
          {(i > 0 || onBack) && <button className="x-btn" onClick={() => (i > 0 ? setI(i - 1) : onBack())} aria-label="Back"><Icon name="left" size={18} /></button>}
          <div style={{ flex: 1 }}><Steps at={i + 1} /></div>
        </div>
        <h1 className="fade-up" style={{ fontSize: 43.2 }}>{st.h}</h1>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 18 }}>{st.p}</p>
        <div className="card fade-up" style={{ background: 'var(--bg)', boxShadow: 'none', padding: '14px 0' }}>
          <C s={s} />
        </div>
      </div>
      <div className="foot">
        <button className="btn" onClick={() => (last ? onDone() : setI(i + 1))}>{st.next}</button>
      </div>
    </div>
  )
}
