import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'

export function useLenis(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || !el.firstElementChild) return
    const lenis = new Lenis({ wrapper: el, content: el.firstElementChild, duration: 1.05, smoothWheel: true })
    let raf
    const loop = (t) => { lenis.raf(t); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); lenis.destroy() }
  }, [ref])
}

export function useCountUp(value, ms = 900) {
  const [v, setV] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const a = from.current, b = value
    if (a === b) return
    const t0 = performance.now()
    let raf
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - k, 4)
      setV(a + (b - a) * e)
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = b
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = value }
  }, [value, ms])
  return v
}

export function useDark() {
  const get = () => {
    const t = document.documentElement.dataset.theme
    if (t) return t === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  const [d, setD] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => setD(get())
    mq.addEventListener('change', h)
    const mo = new MutationObserver(h)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    h()
    return () => { mq.removeEventListener('change', h); mo.disconnect() }
  }, [])
  return d
}
