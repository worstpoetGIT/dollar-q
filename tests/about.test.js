import { describe, it, expect } from 'vitest'
import { LINKEDIN_URL, SHOUT_TEXT } from '../src/about.js'

describe('the thanks in the footer of the Profile page', () => {
  it('links to a LinkedIn profile over https, with the words "shout at him"', () => {
    const u = new URL(LINKEDIN_URL)
    expect(u.protocol).toBe('https:')
    expect(['linkedin.com', 'www.linkedin.com']).toContain(u.hostname) // (the exact host, not just a name that ends with it)
    expect(u.pathname.startsWith('/in/')).toBe(true)
    expect(SHOUT_TEXT).toBe('shout at him')
  })
})
