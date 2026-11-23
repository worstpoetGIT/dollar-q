import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// the colour of each onboarding page, and that the text on it can be read
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const css = read('src/styles.css')

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) }
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

const tone = (name) => {
  const block = new RegExp('\\.lime\\.' + name + '\\s*\\{([^}]*)\\}').exec(css)
  expect(block, name + ' is missing in styles.css').not.toBeNull()
  const get = (v) => new RegExp('--' + v + ':\\s*(#[0-9a-fA-F]{6})').exec(block[1])?.[1].toLowerCase()
  return { bg: get('bg'), ink: get('ink'), ink2: get('ink-2'), red: get('red') }
}

// the colours chosen for each page
const WANTED = { sand: '#f5deb3', ocean: '#003366', cherry: '#9a0002', vanilla: '#efe6de', avocado: '#568203' }

describe('the colour of each onboarding page', () => {
  for (const [name, bg] of Object.entries(WANTED)) {
    it(`${name} is ${bg}, and its text, muted text and errors can be read`, () => {
      const t = tone(name)
      expect(t.bg).toBe(bg)
      expect(contrast(t.bg, t.ink)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.bg, t.ink2)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.bg, t.red)).toBeGreaterThanOrEqual(4.5)
    })
  }

  const onboarding = read('src/components/Onboarding.jsx')
  const signIn = read('src/components/SignIn.jsx')

  it('sign in is sand', () => {
    expect(signIn).toMatch(/className="lime sand"/)
  })

  it('enter the state is ocean deep', () => {
    expect(/export function NameStep[\s\S]*?className="lime ocean"/.test(onboarding)).toBe(true)
  })

  it('counties, accounts and fixed expenses have their own colour, and payment methods keeps the normal theme', () => {
    const tones = Object.fromEntries([...onboarding.matchAll(/h: '([^']+)'[^\n]*?C: (\w+)[^\n]*?next: '[^']+'(?:, tone: '(\w+)')?/g)].map((m) => [m[2], m[3] || null]))
    expect(tones).toEqual({ CountiesEditor: 'cherry', MethodsEditor: null, AccountsEditor: 'vanilla', FixedEditor: 'avocado' })
  })
})
