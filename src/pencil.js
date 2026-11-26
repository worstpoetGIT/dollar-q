// the sound under every opening splash: a real recording of a pencil writing on paper (CC0, see assets/pencil-write.LICENSE.txt), laid down three
// times in a row at slightly different speeds so it lasts as long as the animation, and faded out at the end. if the recording cannot be played,
// a pencil made from filtered noise takes its place (the older sound below).
import pencilUrl from './assets/pencil-write.mp3?url'

let ctx = null
let recording = null // the decoded recording, once it has loaded (or false when it could not be)
let loading = null

const audioContext = () => {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

// load the recording ahead of time, so it is ready when the splash starts
export function preloadPencil() {
  if (loading || recording !== null) return loading
  try {
    const c = audioContext()
    if (!c || typeof fetch === 'undefined') { recording = false; return null }
    loading = fetch(pencilUrl).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, no) => c.decodeAudioData(ab, ok, no))).then((b) => { recording = b }).catch(() => { recording = false })
  } catch { recording = false }
  return loading
}

// where each pass of the recording starts, how fast it plays and how loud: pure, so it can be tested. the recording is about 1.2 s of writing.
export function passesFor(seconds) {
  const out = []
  const plan = [[0, 1.0, 1], [1.0, 0.92, 0.95], [2.05, 1.08, 1], [3.05, 0.96, 0.95]]
  for (const [at, rate, level] of plan) if (at < seconds - 0.4) out.push({ at, rate, level })
  return out
}

// the plan of the strokes for a given length: [{ at, dur, level, tone }] in seconds. pure, so it can be tested.
export function pencilPlan(seconds, rnd = Math.random) {
  const out = []
  let t = 0.05
  while (t < seconds - 0.2) {
    const dur = Math.min(0.2 + rnd() * 0.4, seconds - t)
    out.push({ at: t, dur, level: 0.5 + rnd() * 0.5, tone: 2600 + rnd() * 1800 })
    t += dur + 0.03 + rnd() * 0.14
  }
  return out
}

// the noise pencil: returns a function that fades it out and stops it
function startSynth(seconds, { volume = 0.5 } = {}) {
  try {
    if (!audioContext()) return () => {}
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime
    const sr = ctx.sampleRate
    const buf = ctx.createBuffer(1, sr * 2, sr)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = (w * 0.7 + last * 6) * 0.5 } // white noise with a little grit
    const src = ctx.createBufferSource()
    src.buffer = buf; src.loop = true
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 3200; band.Q.value = 0.9
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 1100
    const gain = ctx.createGain(); gain.gain.value = 0
    const master = ctx.createGain(); master.gain.value = volume
    src.connect(band); band.connect(high); high.connect(gain); gain.connect(master); master.connect(ctx.destination)
    // the taps: a short low burst where the pencil touches down
    const tapBuf = ctx.createBuffer(1, Math.floor(sr * 0.04), sr)
    const td = tapBuf.getChannelData(0)
    for (let i = 0; i < td.length; i++) td[i] = (Math.random() * 2 - 1) * (1 - i / td.length) ** 2
    for (const s of pencilPlan(seconds)) {
      const a = now + s.at
      gain.gain.setValueAtTime(0.0001, a)
      gain.gain.linearRampToValueAtTime(0.5 * s.level, a + Math.min(0.06, s.dur * 0.3))
      for (let k = 1; k <= 4; k++) gain.gain.linearRampToValueAtTime((0.25 + Math.random() * 0.3) * s.level, a + (s.dur * k) / 5) // the little unevenness of a hand
      gain.gain.linearRampToValueAtTime(0.0001, a + s.dur)
      band.frequency.setValueAtTime(s.tone, a)
      band.frequency.linearRampToValueAtTime(s.tone * (0.8 + Math.random() * 0.4), a + s.dur)
      const tap = ctx.createBufferSource(); tap.buffer = tapBuf
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
      const tg = ctx.createGain(); tg.gain.value = 0.35 * s.level
      tap.connect(lp); lp.connect(tg); tg.connect(master)
      tap.start(a)
    }
    src.start(now)
    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.25); src.stop(ctx.currentTime + 0.3) } catch { /* already stopped */ }
    }
  } catch {
    return () => {}
  }
}

// the recording, played for the length of the splash
function startRecording(seconds, volume) {
  const c = ctx
  const master = c.createGain(); master.gain.value = volume
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4
  master.connect(comp); comp.connect(c.destination)
  const now = c.currentTime
  const srcs = []
  for (const p of passesFor(seconds)) {
    const src = c.createBufferSource(); src.buffer = recording; src.playbackRate.value = p.rate
    const g = c.createGain()
    const a = now + p.at, len = Math.min(recording.duration / p.rate, seconds - p.at)
    g.gain.setValueAtTime(0.0001, a)
    g.gain.linearRampToValueAtTime(3.4 * p.level, a + 0.06) // (the recording is quiet: bring it up)
    g.gain.setValueAtTime(3.4 * p.level, a + Math.max(0.07, len - 0.25))
    g.gain.linearRampToValueAtTime(0.0001, a + len)
    src.connect(g); g.connect(master)
    src.start(a)
    srcs.push(src)
  }
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    try { master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(master.gain.value, c.currentTime); master.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.2); srcs.forEach((x) => { try { x.stop(c.currentTime + 0.25) } catch { /* already done */ } }) } catch { /* ignore */ }
  }
}

// start the sound. returns a function that fades it out and stops it. quietly does nothing where audio is not allowed.
export function startPencil(seconds, { volume = 0.9 } = {}) {
  try {
    if (!audioContext()) return () => {}
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    if (recording) return startRecording(seconds, volume)
    if (recording === false) return startSynth(seconds)
    // not loaded yet: start the noise pencil now, or the recording the moment it is ready (whichever fits better)
    let stop = () => {}, cancelled = false
    const p = preloadPencil()
    const t0 = Date.now()
    if (p) p.then(() => { if (cancelled) return; const left = seconds - (Date.now() - t0) / 1000; if (recording && left > 0.8) stop = startRecording(left, volume); else if (!recording) stop = startSynth(left) })
    return () => { cancelled = true; stop() }
  } catch {
    return () => {}
  }
}
