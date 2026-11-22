import { describe, it, expect } from 'vitest'
import { rememberedEmail, rememberEmail } from '../src/sync/remember.js'

const fakeStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) } }

describe('remember my email', () => {
  it('gives back what was saved, without stray spaces', () => {
    const s = fakeStore()
    rememberEmail('  me@example.com ', true, s)
    expect(rememberedEmail(s)).toBe('me@example.com')
  })

  it('forgets it when the box is off', () => {
    const s = fakeStore()
    rememberEmail('me@example.com', true, s)
    rememberEmail('me@example.com', false, s)
    expect(rememberedEmail(s)).toBe('')
  })

  it('works (and remembers nothing) when storage is missing or blocked', () => {
    expect(rememberedEmail(null)).toBe('')
    expect(() => rememberEmail('me@example.com', true, null)).not.toThrow()
    const blocked = { getItem() { throw new Error('no') }, setItem() { throw new Error('no') }, removeItem() { throw new Error('no') } }
    expect(rememberedEmail(blocked)).toBe('')
    expect(() => rememberEmail('me@example.com', true, blocked)).not.toThrow()
  })
})
