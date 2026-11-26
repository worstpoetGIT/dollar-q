import { describe, it, expect } from 'vitest'
import { startSound, CUT_AT, soundStatus } from '../src/splashSound.js'
import { SPLASHES, SPLASH_IDS, SPLASH_MS, splashFor } from '../src/splashes.jsx'
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

  it('an unknown or missing map falls back to the classic splash', () => {
    expect(splashFor('nope')).toBe(SPLASHES.city)
    expect(splashFor(undefined)).toBe(SPLASHES.city)
  })

  it('the one scissor cut lands near the start of the splash and well before it ends', () => {
    expect(CUT_AT).toBeGreaterThanOrEqual(0)
    expect(CUT_AT).toBeLessThan(SPLASH_MS / 1000 / 2)
  })

  it('without audio support the sound does nothing and does not throw', () => {
    const stop = startSound()
    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
    expect(soundStatus().audio).toBe(false)
  })
})
