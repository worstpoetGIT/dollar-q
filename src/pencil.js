// the sound under every opening splash: a pencil writing and drawing on paper (ASMR). nothing is recorded or downloaded: it is made on the spot
// from filtered noise. every stroke is a short scratch that swells and fades, with a soft tap where the pencil lands and a pause between strokes.
let ctx = null

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

// start the sound. returns a function that fades it out and stops it. quietly does nothing where audio is not allowed.
export function startPencil(seconds, { volume = 0.5 } = {}) {
  try {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!AC) return () => {}
    if (!ctx) ctx = new AC()
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
