import { describe, it, expect } from 'vitest'
import { DEFAULT_COUNTIES, sanitize } from '../src/store.js'

describe('the Dr. county', () => {
  it('a new app has a Dr. county for medicine, in place of Cafes, and there are still 12 counties', () => {
    expect(DEFAULT_COUNTIES).toHaveLength(12)
    const dr = DEFAULT_COUNTIES.find((c) => c.name === 'Dr.')
    expect(dr).toBeTruthy()
    expect(dr.icon).toBe('cross')
    expect(dr.style).toBe('hospital')
    expect(DEFAULT_COUNTIES.some((c) => c.name === 'Cafes')).toBe(false)
  })

  it('the cross icon survives saving and loading', () => {
    const s = sanitize({ v: 1, entered: true, setupDone: true, counties: DEFAULT_COUNTIES, accounts: [], expenses: [], fixed: [] })
    expect(s.counties.find((c) => c.name === 'Dr.').icon).toBe('cross')
  })
})
