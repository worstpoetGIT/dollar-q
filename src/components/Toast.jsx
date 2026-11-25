import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

const SHOW = 3000 // how long it stays if nobody touches it
const FAR = 36 // dragged up this far (px) and let go: it goes away

// the bar at the top after an expense. it leaves by itself, or you swipe it up like a notification
export default function Toast({ toast, onGone }) {
  const [dy, setDy] = useState(0)
  const [state, setState] = useState('in') // in, drag, back, out
  const t = useRef({ y0: 0, last: 0, lastT: 0, v: 0, timer: 0 })

  const leave = () => { clearTimeout(t.current.timer); setDy(-160); setState('out'); setTimeout(onGone, 260) }
  const arm = () => { clearTimeout(t.current.timer); t.current.timer = setTimeout(leave, SHOW) }

  useEffect(() => { setDy(0); setState('in'); arm(); return () => clearTimeout(t.current.timer) }, [toast.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e) => {
    clearTimeout(t.current.timer) // somebody is holding it, it stays
    e.currentTarget.setPointerCapture?.(e.pointerId)
    Object.assign(t.current, { y0: e.clientY, last: e.clientY, lastT: performance.now(), v: 0 })
    setState('drag')
  }
  const move = (e) => {
    if (state !== 'drag') return
    const now = performance.now()
    t.current.v = (e.clientY - t.current.last) / Math.max(1, now - t.current.lastT) // px per ms, negative is up
    t.current.last = e.clientY
    t.current.lastT = now
    const d = e.clientY - t.current.y0
    setDy(d < 0 ? d : d * 0.15) // a pull down only gives a little (rubber band)
  }
  const up = () => {
    if (state !== 'drag') return
    if (dy < -FAR || t.current.v < -0.5) { leave() } // far enough, or a quick flick up
    else { setState('back'); setDy(0); arm() }
  }

  const style = state === 'in' ? undefined : { transform: `translateY(${dy}px)`, opacity: state === 'out' ? 0 : 1, transition: state === 'drag' ? 'none' : 'transform .26s ease, opacity .26s ease', animation: 'none' }
  return (
    <div className="toast" style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--green)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" size={16} color="#fff" sw={3} /></span>
      <div><div style={{ fontSize: 14.4, opacity: 0.7 }}>{toast.sub}</div><b>{toast.text}</b></div>
    </div>
  )
}
