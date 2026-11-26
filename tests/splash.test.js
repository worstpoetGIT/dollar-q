import { describe, it, expect } from 'vitest'
import { startSound, cutStart, soundStatus, SOUND_VOLUME } from '../src/splashSound.js'
import { SPLASHES, SPLASH_IDS, SPLASH_MS, SPLASH_HOLD, splashFor } from '../src/splashes.jsx'
import { MAP_LIST } from '../src/maps.js'

describe('opening splashes', () => {
  it('every map has its own splash scene and background', () => {
    for (const m of MAP_LIST) {
      expect(SPLASHES[m.id], m.id).toBeTruthy()
      expect(typeof SPLASHES[m.id].Scene).toBe('function')
    }
    expect(SPLASH_IDS).toEqual(MAP_LIST.map((m) => m.id))
    expect(new Set(Object.values(SPLASHES).map((s) => s.Scene)).size).toBe(MAP_LIST.length) // (no two maps share a scene)
  })

  it('every scene has its own speed, so that it finishes together with the splash and the cut', () => {
    for (const id of SPLASH_IDS) { expect(SPLASHES[id].k, id).toBeGreaterThan(0.7); expect(SPLASHES[id].k, id).toBeLessThan(1.3) }
  })

  it('an unknown or missing map falls back to the classic splash', () => {
    expect(splashFor('nope')).toBe(SPLASHES.city)
    expect(splashFor(undefined)).toBe(SPLASHES.city)
  })

  it('the scissor cut is timed to end exactly when the splash ends', () => {
    const end = SPLASH_MS / 1000
    expect(cutStart(end, 1.0)).toBeCloseTo(end - 1.0, 6)
    expect(cutStart(end, 1.0, 0.3) + 0.3 + 1.0).toBeCloseTo(end, 6) // (the recording took 0.3 s to load: it starts that much sooner)
    expect(cutStart(end, 5)).toBe(0) // (a recording longer than the splash starts at once)
    expect(cutStart(0, 1)).toBe(0)
  })

  it('the finished $? waits a moment on screen before the splash fades', () => {
    expect(SPLASH_HOLD).toBeGreaterThanOrEqual(200)
    expect(SPLASH_HOLD).toBeLessThan(600)
  })

  it('the splash sound plays at 70 % of the volume of the recording', () => {
    expect(SOUND_VOLUME).toBe(0.7)
  })

  it('without audio support the sound does nothing and does not throw', () => {
    const stop = startSound()
    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
    expect(soundStatus().audio).toBe(false)
  })
})
