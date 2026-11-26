import { useEffect, useState } from 'react'
import { splashFor, SPLASH_MS, SPLASH_SLOW } from '../splashes.jsx'
import { startSound, preloadSound } from '../splashSound.js'

preloadSound() // (the recording is fetched as soon as the app loads)

// the opening splash of the map in use: the $ and ? drawn in that map's way, with the sound of one cut of scissors through paper
export default function Splash({ map = 'city', onDone, sound = true }) {
  const [go, setGo] = useState(false)
  const [out, setOut] = useState(false)
  const { Scene, style } = splashFor(map)
  useEffect(() => {
    const t0 = setTimeout(() => setGo(true), 150)
    const stop = sound ? startSound() : () => {}
    const t1 = setTimeout(() => { setOut(true); stop() }, SPLASH_MS)
    const t2 = setTimeout(() => onDone && onDone(), SPLASH_MS + 550)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); stop() }
  }, [onDone, sound])
  return (
    <div className={'splash full' + (go ? ' go' : '') + (out ? ' out' : '')} style={{ ...style, '--k': SPLASH_SLOW }}>
      <Scene go={go} />
    </div>
  )
}
