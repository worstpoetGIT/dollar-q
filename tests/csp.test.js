import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { API_URL } from '../src/sync/config.js'

// the page has a rule about which addresses it may talk to. if the server address is not in it,
// the phone blocks every request before it leaves and the app says "no connection".
describe('the page security rule', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const connect = /connect-src ([^;"]*)/.exec(html)?.[1].split(' ') || []

  it('lets the app reach the server address', () => {
    expect(connect).toContain(new URL(API_URL).origin)
  })

  it('does not open the door wider than that', () => {
    expect(connect).not.toContain('*')
    expect(connect).not.toContain('https:')
    expect(connect.filter((c) => c !== "'self'")).toEqual([new URL(API_URL).origin])
  })
})
