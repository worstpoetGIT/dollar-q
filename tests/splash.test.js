import { describe, it, expect } from 'vitest'
import { pencilPlan, startPencil } from '../src/pencil.js'
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

  it('the pencil strokes fill the splash from start to finish, one after another, never overlapping', () => {
    const secs = (SPLASH_MS - 150) / 1000
    for (let seed = 1; seed <= 20; seed++) {
      let a = seed * 7919
      const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647 }
      const plan = pencilPlan(secs, rnd)
      expect(plan.length).toBeGreaterThan(4)
      expect(plan[0].at).toBeLessThan(0.2)
      let end = 0
      for (const s of plan) {
        expect(s.at).toBeGreaterThanOrEqual(end)
        expect(s.dur).toBeGreaterThan(0)
        expect(s.at + s.dur).toBeLessThanOrEqual(secs + 1e-9)
        end = s.at + s.dur
      }
      expect(end).toBeGreaterThan(secs - 0.8) // (it is still scratching near the end)
    }
  })

  it('without audio support the sound does nothing and does not throw', () => {
    const stop = startPencil(3)
    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
  })
})
