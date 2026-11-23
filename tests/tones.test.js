import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// the colours of each onboarding page, and that the words on it can be read
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const css = read('src/styles.css')

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) }
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

const tone = (name) => {
  const block = new RegExp('\\.lime\\.' + name + '\\s*\\{([^}]*)\\}').exec(css)
  expect(block, name + ' is missing in styles.css').not.toBeNull()
  const get = (v) => new RegExp('--' + v + ':\\s*(#[0-9a-fA-F]{6})').exec(block[1])?.[1].toLowerCase()
  return { bg: get('bg'), ink: get('ink'), ink2: get('ink-2'), red: get('red'), btn: get('btn'), label: get('btn-ink') }
}

// from the palettes: the page background, the button colour and the colour of the words on the buttons
const PALETTES = {
  email:    { bg: '#f4721e', btn: '#4d6080', label: '#e9d9ca' }, // orange, blue, cream
  state:    { bg: '#0f3d3a', btn: '#f5dabf', label: '#6c151e' }, // green, cream, bordo
  counties: { bg: '#58b561', btn: '#ffe991', label: '#854606' },
  accounts: { bg: '#313070', btn: '#ffa3db', label: '#313070' }, // (the palette's purple text is too faint on the pink button, the navy reads)
  fixed:    { bg: '#ea9ab2', btn: '#ffffff', label: '#337357' },
}

describe('the colours of each onboarding page', () => {
  for (const [name, want] of Object.entries(PALETTES)) {
    it(`${name}: the chosen background, button and button label, and everything can be read`, () => {
      const t = tone(name)
      expect(t.bg).toBe(want.bg)
      expect(t.btn).toBe(want.btn)
      expect(t.label).toBe(want.label)
      expect(contrast(t.bg, t.ink)).toBeGreaterThanOrEqual(4.5)   // page text
      expect(contrast(t.bg, t.ink2)).toBeGreaterThanOrEqual(4.5)  // muted text
      expect(contrast(t.bg, t.red)).toBeGreaterThanOrEqual(4.5)   // errors
      expect(contrast(t.btn, t.label)).toBeGreaterThanOrEqual(4.5) // the words on the buttons
      expect(contrast(t.bg, t.btn)).toBeGreaterThanOrEqual(2)     // a button stands out from the page
    })
  }

  const onboarding = read('src/components/Onboarding.jsx')
  const signIn = read('src/components/SignIn.jsx')

  it('sign in is the email page', () => {
    expect(signIn).toMatch(/className="lime email"/)
  })

  it('enter the state has its own colours', () => {
    expect(/export function NameStep[\s\S]*?className="lime state"/.test(onboarding)).toBe(true)
  })

  it('counties, accounts and fixed expenses have their own colours, and payment methods keeps the normal theme', () => {
    const tones = Object.fromEntries([...onboarding.matchAll(/h: '([^']+)'[^\n]*?C: (\w+)[^\n]*?next: '[^']+'(?:, tone: '(\w+)')?/g)].map((m) => [m[2], m[3] || null]))
    expect(tones).toEqual({ CountiesEditor: 'counties', MethodsEditor: null, AccountsEditor: 'accounts', FixedEditor: 'fixed' })
  })
})
