import { describe, it, expect } from 'vitest'
import { firstRunScreen, hasEmailPage } from '../src/firstRun.js'

const fresh = { splash: false, phase: 'signedOut', working: false, entered: false, setupDone: false, skippedNow: false, skippedBefore: false, editName: false }
const screen = (over) => firstRunScreen({ ...fresh, ...over })

describe('which screen comes first', () => {
  it('the opening animation comes before everything', () => {
    expect(screen({ splash: true })).toBe('splash')
  })

  it('a new phone that is not signed in starts with the email page', () => {
    expect(screen({})).toBe('email')
    expect(screen({ phase: 'codeSent' })).toBe('email')
    expect(screen({ phase: 'choosing' })).toBe('email')
  })

  it('even if Not now was tapped on an earlier start, a fresh start asks again (the name page is not first)', () => {
    expect(screen({ skippedBefore: true })).toBe('email')
  })

  it('Not now in this run moves on to the name page, then the setup pages, then the app', () => {
    expect(screen({ skippedNow: true })).toBe('name')
    expect(screen({ skippedNow: true, entered: true })).toBe('wizard')
    expect(screen({ skippedNow: true, entered: true, setupDone: true })).toBe('app')
  })

  it('an app that is already set up is not asked again once Not now was tapped', () => {
    expect(screen({ entered: true, setupDone: true, skippedBefore: true })).toBe('app')
    expect(screen({ entered: true, setupDone: true })).toBe('email') // never tapped Not now: asked once
  })

  it('signed in: straight to the name page, setup pages, app (there is no email page to show)', () => {
    expect(screen({ phase: 'idle' })).toBe('name')
    expect(screen({ phase: 'idle', entered: true })).toBe('wizard')
    expect(screen({ phase: 'idle', entered: true, setupDone: true })).toBe('app')
  })

  it('waits, showing nothing, while it finds out who is signed in or pulls the account onto a new phone', () => {
    expect(screen({ phase: 'starting' })).toBe('wait')
    expect(screen({ phase: 'idle', working: true })).toBe('wait')
    // an app that already has data does not blank out for an ordinary sync
    expect(screen({ phase: 'idle', working: true, entered: true, setupDone: true })).toBe('app')
  })

  it('a phone with no database (a browser) goes straight to the name page', () => {
    expect(screen({ phase: 'unavailable' })).toBe('name')
  })

  it('going back from the setup pages to the name page works without touching the saved state', () => {
    expect(screen({ phase: 'idle', entered: true, editName: true })).toBe('name')
  })

  it('only a phone that is not signed in has an email page to go back to', () => {
    expect(hasEmailPage('signedOut')).toBe(true)
    expect(hasEmailPage('codeSent')).toBe(true)
    expect(hasEmailPage('idle')).toBe(false)
    expect(hasEmailPage('unavailable')).toBe(false)
  })
})
