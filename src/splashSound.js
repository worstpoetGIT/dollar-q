// the sound of the opening splash: one cut of a pair of scissors through paper (the owner's recording, see assets/scissors-cut.NOTE.txt).
// it plays once, right at the start, and nothing else in the app makes a sound.
import cutUrl from './assets/scissors-cut.wav?url'

export const CUT_AT = 0.2 // seconds after the splash starts

let ctx = null
let recording = null // the decoded recording once it has loaded (false when it could not be)
let loading = null

const audioContext = () => {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

// phones only let a page make sound after the person has touched it, and the sound has to be switched on right in the touch. so on every touch or key press
// the audio is woken up (and a silent blip is played), and on an iPhone the page asks for the "playback" kind of sound, which the silent switch does not mute.
export function unlockAudio() {
  try {
    if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback'
    const c = audioContext()
    if (!c) return
    if (c.state !== 'running') c.resume().catch(() => {})
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0)
  } catch { /* no audio here */ }
}
if (typeof window !== 'undefined') for (const ev of ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown']) window.addEventListener(ev, unlockAudio, { passive: true, capture: true })

// what the sound is up to, to show on the splash tester
export const soundStatus = () => ({ audio: !!audioContext(), state: ctx ? ctx.state : 'none', recording: recording === null ? 'loading' : recording ? 'loaded' : 'failed' })

// load the recording ahead of time, so it is ready when the splash starts
export function preloadSound() {
  if (loading || recording !== null) return loading
  try {
    const c = audioContext()
    if (!c || typeof fetch === 'undefined') { recording = false; return null }
    loading = fetch(cutUrl).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, no) => c.decodeAudioData(ab, ok, no))).then((b) => { recording = b }).catch(() => { recording = false })
  } catch { recording = false }
  return loading
}

// play the cut once. returns a function that stops it. quietly does nothing where audio is not allowed.
export function startSound({ volume = 1, at = CUT_AT } = {}) {
  try {
    const c = audioContext()
    if (!c) return () => {}
    if (c.state === 'suspended') c.resume().catch(() => {})
    let src = null, cancelled = false
    const play = (delay) => {
      if (cancelled || !recording) return
      const master = c.createGain(); master.gain.value = volume
      src = c.createBufferSource(); src.buffer = recording
      src.connect(master); master.connect(c.destination)
      src.start(c.currentTime + Math.max(0, delay))
    }
    if (recording) play(at)
    else if (recording === null) { const t0 = Date.now(); const p = preloadSound(); if (p) p.then(() => play(at - (Date.now() - t0) / 1000)) }
    return () => { cancelled = true; try { if (src) src.stop(c.currentTime + 0.05) } catch { /* already done */ } }
  } catch {
    return () => {}
  }
}
