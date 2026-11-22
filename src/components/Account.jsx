import { useState } from 'react'
import { useSyncStatus, sync } from '../sync/service.js'
import { rememberedEmail, rememberEmail } from '../sync/remember.js'

const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return Math.round(s / 60) + ' min ago'
  if (s < 86400) return Math.round(s / 3600) + ' h ago'
  return new Date(ms).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
}

const btn = { height: 46, fontSize: 18 }
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export default function Account() {
  const s = useSyncStatus()
  const [email, setEmail] = useState(rememberedEmail)
  const [remember, setRemember] = useState(true)
  const [code, setCode] = useState('')
  const [askReplace, setAskReplace] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [typed, setTyped] = useState('')

  if (s.phase === 'unavailable' || s.phase === 'starting') return null // no database here (not a phone), so nothing to sync

  const error = s.error ? <div style={{ fontSize: 15, color: 'var(--red)' }}>{s.error}</div> : null

  if (s.phase === 'signedOut') {
    return (
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Keep your data on more than one phone</div>
        <div className="muted" style={{ fontSize: 15 }}>Sign in with your email to sync your expenses and get them back if you lose this phone. It is optional: $? works the same without it.</div>
        <input className="field" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" style={{ userSelect: 'text', WebkitUserSelect: 'text' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 22, height: 22, accentColor: 'var(--ink)' }} />
          Remember my email on this phone
        </label>
        {error}
        <button className="btn" style={btn} disabled={s.working || !emailOk(email)} onClick={() => { rememberEmail(email, remember); sync().sendCode(email) }}>{s.working ? 'Sending…' : 'Send me a code'}</button>
      </div>
    )
  }

  if (s.phase === 'codeSent') {
    return (
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Check your email</div>
        <div className="muted" style={{ fontSize: 15 }}>We sent a 6 digit code to {s.email}. It works for 10 minutes.</div>
        <input className="field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6 digit code" style={{ userSelect: 'text', WebkitUserSelect: 'text', letterSpacing: 4 }} />
        {error}
        <button className="btn" style={btn} disabled={s.working || code.length !== 6} onClick={() => sync().verifyCode(code)}>{s.working ? 'Checking…' : 'Sign in'}</button>
        <div className="row">
          <button className="btn ghost" style={btn} onClick={() => { setCode(''); sync().backToEmail() }}>Other email</button>
          <button className="btn ghost" style={btn} disabled={s.working} onClick={() => sync().sendCode(s.email)}>Send again</button>
        </div>
      </div>
    )
  }

  if (s.phase === 'choosing') {
    return (
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>This account already has data</div>
        <div className="muted" style={{ fontSize: 15 }}>
          {s.pending && s.pending.other
            ? `This phone was signed in to ${s.pending.previous} before. Merging would add that data to ${s.email}.`
            : `${s.email} already has expenses in the cloud, and this phone has its own.`}
        </div>
        {error}
        {askReplace ? (
          <>
            <div style={{ fontSize: 15, color: 'var(--red)' }}>This removes the expenses on this phone and takes the ones from the cloud. Export a backup first if you are not sure.</div>
            <div className="row">
              <button className="btn ghost" style={btn} onClick={() => setAskReplace(false)}>Cancel</button>
              <button className="btn" style={{ ...btn, background: 'var(--red)', color: '#fff' }} onClick={() => { setAskReplace(false); sync().chooseReplace() }}>Replace</button>
            </div>
          </>
        ) : (
          <>
            <button className="btn" style={btn} onClick={() => sync().chooseMerge()}>Merge them (recommended)</button>
            <button className="btn ghost" style={btn} onClick={() => setAskReplace(true)}>Use the cloud data instead</button>
          </>
        )}
      </div>
    )
  }

  // signed in
  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Signed in</div>
        <div className="muted" style={{ fontSize: 15, marginTop: 2, overflowWrap: 'anywhere' }}>{s.email}</div>
      </div>
      <div className="muted" style={{ fontSize: 15 }}>{s.working ? 'Syncing…' : s.lastSyncAt ? 'Last synced ' + ago(s.lastSyncAt) : 'Not synced yet'}</div>
      {error}
      <div className="row">
        <button className="btn ghost" style={btn} disabled={s.working} onClick={() => sync().syncNow()}>Sync now</button>
        <button className="btn ghost" style={btn} onClick={() => sync().signOut()}>Sign out</button>
      </div>
      {askDelete ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 15, color: 'var(--red)' }}>This deletes your account and the copy in the cloud, for good. The data on this phone stays. Type your email to confirm.</div>
          <input className="field" placeholder={s.email} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoCorrect="off" aria-label="Type your email to confirm" style={{ userSelect: 'text', WebkitUserSelect: 'text' }} />
          <div className="row">
            <button className="btn ghost" style={btn} onClick={() => { setAskDelete(false); setTyped('') }}>Cancel</button>
            <button className="btn" style={{ ...btn, background: 'var(--red)', color: '#fff' }} disabled={typed.trim().toLowerCase() !== s.email} onClick={() => { sync().deleteAccount(); setAskDelete(false); setTyped('') }}>Delete account</button>
          </div>
        </div>
      ) : (
        <button className="btn ghost" style={{ ...btn, color: 'var(--red)' }} onClick={() => setAskDelete(true)}>Delete account</button>
      )}
    </div>
  )
}
