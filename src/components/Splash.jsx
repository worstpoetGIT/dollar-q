import { useEffect, useState } from 'react'
import { splashFor, SPLASH_MS } from '../splashes.jsx'
import { startPencil } from '../pencil.js'

// the opening splash of the map in use: the $ and ? drawn in that map's way, with the sound of a pencil on paper until it is done
export default function Splash({ map = 'city', onDone, sound = true }) {
  const [go, setGo] = useState(false)
  const [out, setOut] = useState(false)
  const { Scene, style } = splashFor(map)
  useEffect(() => {
    const t0 = setTimeout(() => setGo(true), 150)
    const stop = sound ? startPencil((SPLASH_MS - 150) / 1000) : () => {}
    const t1 = setTimeout(() => { setOut(true); stop() }, SPLASH_MS)
    const t2 = setTimeout(() => onDone && onDone(), SPLASH_MS + 550)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); stop() }
  }, [onDone, sound])
  return (
    <div className={'splash full' + (go ? ' go' : '') + (out ? ' out' : '')} style={style}>
      <Scene go={go} />
    </div>
  )
}
