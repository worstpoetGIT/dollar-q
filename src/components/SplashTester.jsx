import { useState } from 'react'
import Splash from './Splash.jsx'
import { MAP_LIST } from '../maps.js'

// a page to look at every opening splash (open the app with ?splashes): tap a map to play its splash again, with its sound
export default function SplashTester() {
  const [play, setPlay] = useState(null) // { id, n }
  return (
    <div style={{ padding: '28px 20px', minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <h2 style={{ margin: '0 0 6px' }}>Opening splashes</h2>
      <p style={{ margin: '0 0 18px', opacity: 0.6, fontSize: 14 }}>Tap a map to play its splash (turn the sound on).</p>
      <div style={{ display: 'grid', gap: 12 }}>
        {MAP_LIST.map((m) => (
          <button key={m.id} className="btn" style={{ padding: '18px 16px', fontSize: 17, textAlign: 'left', background: 'var(--ink)', color: 'var(--bg)', border: 0, borderRadius: 16 }} onClick={() => setPlay({ id: m.id, n: Date.now() })}>
            ▶︎ {m.name}
          </button>
        ))}
      </div>
      {play && <Splash key={play.n} map={play.id} onDone={() => setPlay(null)} />}
    </div>
  )
}
