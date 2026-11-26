import { useEffect, useRef, useState } from 'react'
import { splashFor, SPLASH_MS, SPLASH_SLOW } from '../splashes.jsx'
import { startSound, preloadSound } from '../splashSound.js'

preloadSound() // (the recording is fetched as soon as the app loads)

// the opening splash of the map in use: the $ and ? drawn in that map's way, with the sound of one cut of scissors through paper
export default function Splash({ map = 'city', onDone, sound = true }) {
  const [go, setGo] = useState(false)
  const [out, setOut] = useState(false)
  const { Scene, style, k } = splashFor(map)
  const doneRef = useRef(onDone) // (the parent hands over a new onDone on every render: the splash must not start over, nor play its sound again, when that happens)
  doneRef.current = onDone
  useEffect(() => {
    const t0 = setTimeout(() => setGo(true), 150)
    const stop = sound ? startSound({ endsAt: SPLASH_MS / 1000 }) : () => {} // (the cut ends exactly when the splash does)
    const t1 = setTimeout(() => { setOut(true); stop() }, SPLASH_MS)
    const t2 = setTimeout(() => doneRef.current && doneRef.current(), SPLASH_MS + 550)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); stop() }
  }, [sound])
  return (
    <div className={'splash full' + (go ? ' go' : '') + (out ? ' out' : '')} style={{ ...style, '--k': k || SPLASH_SLOW }}>
      <Scene go={go} />
    </div>
  )
}
