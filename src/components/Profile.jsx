import { useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { CountiesEditor, MethodsEditor, AccountsEditor, FixedEditor } from './Editors.jsx'
import { setState, resetAll, undoImport, hasUndo } from '../store.js'
import { exportBackup, readBackup, applyBackup, lastBackup } from '../backup.js'
import { useLenis } from '../hooks.js'

function Sub({ title, onBack, children }) {
  const ref = useRef(null)
  useLenis(ref)
  return (
    <div className="page sub" ref={ref}>
      <div>
        <button className="back" onClick={onBack}><Icon name="left" size={20} /> Profile</button>
        <h1 className="title">{title}</h1>
        <div className="card">{children}</div>
      </div>
    </div>
  )
}

export default function Profile({ s, sub, setSub }) {
  const ref = useRef(null)
  useLenis(ref)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState(null)
  const [pending, setPending] = useState(null)
  const [undo, setUndo] = useState(hasUndo())
  const [last, setLast] = useState(lastBackup())
  const pick = useRef(null)
  const doExport = async () => {
    try { await exportBackup(); setLast(lastBackup()); setMsg({ ok: true, text: 'Backup file created.' }) }
    catch (e) { if (!/cancel/i.test(String(e && e.message))) setMsg({ ok: false, text: 'Could not create the backup.' }) }
  }
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    try { setPending(await readBackup(f)); setMsg(null) } catch (err) { setPending(null); setMsg({ ok: false, text: err.message }) }
  }
  const initial = (s.stateName || '$').trim()[0]?.toUpperCase()
  if (sub === 'accounts') return <Sub title="Accounts" onBack={() => setSub(null)}><AccountsEditor s={s} /></Sub>
  if (sub === 'fixed') return <Sub title="Fixed Expenses & Subscriptions" onBack={() => setSub(null)}><FixedEditor s={s} /></Sub>
  if (sub === 'manage') return (
    <Sub title="Counties & Payments" onBack={() => setSub(null)}>
      <div className="label" style={{ marginTop: 0 }}>Counties (categories)</div>
      <CountiesEditor s={s} />
      <div className="label" style={{ marginTop: 26 }}>Payment methods (cultures)</div>
      <MethodsEditor s={s} />
    </Sub>
  )
  const rows = [
    ['accounts', 'wallet', 'Accounts', `${s.accounts.length} of 5 · ${[...new Set(s.accounts.map((a) => a.currency))].join(', ')}`, 'rgba(43,196,109,.16)', 'var(--green-ink)'],
    ['fixed', 'repeat', 'Fixed Expenses & Subscriptions', s.fixed.length ? `${s.fixed.length} set up, logged automatically` : 'Claude, ChatGPT, rent… log them once', 'rgba(217,115,26,.18)', '#d9731a'],
    ['manage', 'city', 'Manage Counties & Payment Methods', `${s.counties.length} counties · ${s.methods.bank.length + s.methods.debit.length + s.methods.credit.length + (s.methods.cash ? 1 : 0)} payment methods`, 'rgba(123,117,255,.18)', 'var(--indigo)'],
  ]
  return (
    <div className="page" ref={ref}>
      <div>
        <h1 className="title">Profile</h1>
        <div className="card row fade-up" style={{ padding: 18, marginBottom: 16 }}>
          <div className="display" style={{ width: 64, height: 64, borderRadius: 22, background: 'var(--lime)', color: '#111', display: 'grid', placeItems: 'center', fontSize: 36, flex: 'none' }}>{initial}</div>
          <div className="sp">
            <input className="display" value={s.stateName} onChange={(e) => setState((st) => ({ ...st, stateName: e.target.value }))}
              style={{ background: 'none', border: 0, outline: 0, fontSize: 25.2, width: '100%', padding: 0, userSelect: 'text', WebkitUserSelect: 'text' }} maxLength={28} aria-label="State name" />
            <div className="muted" style={{ fontSize: 15.6, marginTop: 4 }}>{s.expenses.length} expense{s.expenses.length === 1 ? '' : 's'} recorded</div>
          </div>
        </div>
        {rows.map(([k, ic, t, sub2, bg, fg], i) => (
          <button key={k} className="prow card fade-up" style={{ animationDelay: i * 60 + 'ms' }} onClick={() => setSub(k)}>
            <span className="ico-circle" style={{ background: bg, color: fg, width: 52, height: 52, borderRadius: 18 }}><Icon name={ic} size={26} /></span>
            <span className="sp"><div className="t">{t}</div><div className="s">{sub2}</div></span>
            <Icon name="right" size={18} />
          </button>
        ))}

        <div className="label" style={{ marginTop: 26 }}>Display</div>
        <div className="card">
          <button className="row" style={{ width: '100%', textAlign: 'left' }} role="switch" aria-checked={!!s.minimal} onClick={() => setState((st) => ({ ...st, minimal: !st.minimal }))}>
            <span className="sp">
              <div style={{ fontWeight: 700 }}>Minimalist mode</div>
              <div className="muted" style={{ fontSize: 15, marginTop: 2 }}>Hides the status bar (clock, signal, battery) while you are in the app.</div>
            </span>
            <span className={'switch' + (s.minimal ? ' on' : '')}><i /></span>
          </button>
        </div>

        <div className="label" style={{ marginTop: 26 }}>Data</div>
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <div className="muted" style={{ fontSize: 15 }}>Everything is stored on this iPhone only. Save a backup file so a deleted or expired app can't take your expenses with it.</div>
          <div className="muted" style={{ fontSize: 15 }}>{last ? 'Last backup: ' + new Date(last).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : s.expenses.length ? 'You have not made a backup yet.' : 'No backup yet.'}</div>
          <div className="row">
            <button className="btn ghost" style={{ height: 46, fontSize: 18 }} onClick={doExport}>Export backup</button>
            <button className="btn ghost" style={{ height: 46, fontSize: 18 }} onClick={() => pick.current && pick.current.click()}>Import backup</button>
          </div>
          <input ref={pick} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFile} data-nohaptic />
          {msg && <div style={{ fontSize: 15, color: msg.ok ? 'var(--green-ink)' : 'var(--red)' }}>{msg.text}</div>}
          {pending && (
            <div className="card" style={{ display: 'grid', gap: 8, padding: 14, boxShadow: 'none' }}>
              <div style={{ fontWeight: 700 }}>Replace everything on this iPhone?</div>
              <div className="muted" style={{ fontSize: 15 }}>{pending.name || 'This backup'}: {pending.expenses} expense{pending.expenses === 1 ? '' : 's'}, {pending.counties} counties{pending.exportedAt ? ', saved ' + new Date(pending.exportedAt).toLocaleDateString('en', { dateStyle: 'medium' }) : ''}. Your current data will be replaced.</div>
              <div className="row">
                <button className="btn ghost" style={{ height: 46, fontSize: 18 }} onClick={() => setPending(null)}>Cancel</button>
                <button className="btn" style={{ height: 46, fontSize: 18 }} onClick={() => { applyBackup(pending); setPending(null); setUndo(true); setMsg({ ok: true, text: 'Backup restored.' }) }}>Replace</button>
              </div>
            </div>
          )}
          {undo && !pending && <button className="btn ghost" style={{ height: 46, fontSize: 18 }} onClick={() => { if (undoImport()) setMsg({ ok: true, text: 'Your previous data is back.' }); setUndo(false) }}>Undo last import</button>}
          {confirm ? (
            <div className="row">
              <button className="btn ghost" style={{ height: 46, fontSize: 18 }} onClick={() => setConfirm(false)}>Keep my data</button>
              <button className="btn" style={{ height: 46, fontSize: 18, background: 'var(--red)', color: '#fff' }} onClick={() => { resetAll(); setConfirm(false) }}>Erase everything</button>
            </div>
          ) : (
            <button className="btn ghost" style={{ height: 46, fontSize: 18, color: 'var(--red)' }} onClick={() => setConfirm(true)}>Reset app (start over)</button>
          )}
        </div>
      </div>
    </div>
  )
}
