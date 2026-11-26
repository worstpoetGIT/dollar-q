// the sound of the opening splash: one cut of a pair of scissors through paper (the owner's recording, see assets/scissors-cut.NOTE.txt).
// it plays once and nothing else in the app makes a sound. it is timed so that the cut ENDS exactly when the splash ends (the splash tells how long it lasts).
import cutUrl from './assets/scissors-cut.wav?url'

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

// when the cut has to start so that it is over exactly at "endsAt" (seconds from now), given how long the recording is. pure, so it can be tested.
export const cutStart = (endsAt, length, elapsed = 0) => Math.max(0, endsAt - length - elapsed)

// play the cut once, so that it ends "endsAt" seconds from now (the end of the splash; 0 or less: right away). returns a function that stops it. quietly does nothing where audio is not allowed.
export function startSound({ volume = 1, endsAt = 0 } = {}) {
  try {
    const c = audioContext()
    if (!c) return () => {}
    if (c.state === 'suspended') c.resume().catch(() => {})
    let src = null, cancelled = false
    const play = (elapsed) => {
      if (cancelled || !recording) return
      const delay = cutStart(endsAt, recording.duration, elapsed)
      const master = c.createGain(); master.gain.value = volume
      src = c.createBufferSource(); src.buffer = recording
      src.connect(master); master.connect(c.destination)
      src.start(c.currentTime + Math.max(0, delay))
    }
    if (recording) play(0)
    else if (recording === null) { const t0 = Date.now(); const p = preloadSound(); if (p) p.then(() => play((Date.now() - t0) / 1000)) }
    return () => { cancelled = true; try { if (src) src.stop(c.currentTime + 0.05) } catch { /* already done */ } }
  } catch {
    return () => {}
  }
}
