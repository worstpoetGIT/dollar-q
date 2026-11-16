import { describe, it, expect } from 'vitest'
import { readBackup, backupText } from '../src/backup.js'
import { sanitize, setState } from '../src/store.js'

const file = (text, name = 'b.json') => new File([text], name, { type: 'application/json' })
const good = (data) => JSON.stringify({ app: 'dollar-q', format: 1, exportedAt: '2026-11-14T00:00:00Z', data })
const state = { v: 1, entered: true, setupDone: true, stateName: 'Atlas', expenses: [] }

describe('reading a backup file', () => {
  it('accepts a real backup and reports what is in it', async () => {
    const info = await readBackup(file(good({ ...state, expenses: [{ id: 'e1', countyId: 'c1', amount: 30, people: 3, ts: Date.now() }] })))
    expect(info.name).toBe('Atlas')
    expect(info.expenses).toBe(1)
    expect(info.data.expenses[0].amount).toBe(10)
    expect(info.data.expenses[0].total).toBe(30)
  })

  it('turns an old backup into shares the moment it is read', async () => {
    const info = await readBackup(file(good({ ...state, expenses: [{ id: 'e1', countyId: 'c1', amount: 90, people: 3, ts: Date.now() }] })))
    expect(info.data.expenses[0].amount).toBe(30)
  })

  it('refuses things that are not a backup', async () => {
    await expect(readBackup(file('{nope'))).rejects.toThrow()
    await expect(readBackup(file(JSON.stringify({ app: 'other', format: 1, data: state })))).rejects.toThrow()
    await expect(readBackup(file(JSON.stringify({ app: 'dollar-q', format: 2, data: state })))).rejects.toThrow()
    await expect(readBackup(file(JSON.stringify({ app: 'dollar-q', format: 1 })))).rejects.toThrow()
    await expect(readBackup(null)).rejects.toThrow()
  })

  it('refuses an empty backup and an oversized file', async () => {
    await expect(readBackup(file(good({ v: 1, entered: false })))).rejects.toThrow()
    await expect(readBackup(file('x'.repeat(13 * 1024 * 1024)))).rejects.toThrow()
  })

  it('cleans a hostile backup instead of trusting it', async () => {
    const hostile = good({ ...state, stateName: '<img src=x onerror=alert(1)>', counties: [{ id: 'c1', name: 'A', icon: '__proto__', color: 'red;x:y' }] })
    const info = await readBackup(file(hostile))
    expect(info.data.counties[0].icon).toBe('tag')
    expect(info.data.counties[0].color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('round trips: export, then read it back, gives the same data', async () => {
    setState((st) => ({ ...st, entered: true, stateName: 'Round' }))
    const text = backupText()
    const info = await readBackup(file(text))
    expect(info.data.stateName).toBe('Round')
    expect(sanitize(JSON.parse(text).data)).toEqual(info.data)
  })
})
