import { useEffect, useState } from 'react'

export default function Splash({ onDone }) {
  const [go, setGo] = useState(false)
  const [out, setOut] = useState(false)
  const [dot, setDot] = useState(false)
  useEffect(() => {
    const t0 = setTimeout(() => setGo(true), 150)
    const td = setTimeout(() => setDot(true), 2150)
    const t1 = setTimeout(() => setOut(true), 3300)
    const t2 = setTimeout(onDone, 3850)
    return () => { clearTimeout(t0); clearTimeout(td); clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])
  const cls = 'draw' + (go ? ' go' : '')
  return (
    <div className={'splash' + (out ? ' out' : '')}>
      <svg viewBox="0 0 240 240" aria-label="$?">
        <path className={cls} pathLength="1" style={{ '--dur': '1.15s', '--delay': '0s' }}
          d="M120 14c58 -1 106 46 106 106s-47 107 -107 106S13 178 14 119 60 15 120 14c20 0 38 5 52 13"
          fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path className={cls} pathLength="1" style={{ '--dur': '.85s', '--delay': '1.2s' }}
          d="M140 94c2-20 36-26 44-8 8 18-18 24-24 38" fill="none" stroke="#e5383b" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        {dot && <circle cx="158" cy="152" r="8" fill="#e5383b" />}
        <path className={cls} pathLength="1" style={{ '--dur': '1.1s', '--delay': '2.05s' }}
          d="M108 64c-18-8-38 2-38 18 0 20 40 22 40 44 0 16-22 24-42 14" fill="none" stroke="#1faa59" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" transform="translate(-4 4)" />
        <path className={cls} pathLength="1" style={{ '--dur': '.5s', '--delay': '2.55s' }}
          d="M88 50 82 180" fill="none" stroke="#1faa59" strokeWidth="13" strokeLinecap="round" />
      </svg>
    </div>
  )
}
