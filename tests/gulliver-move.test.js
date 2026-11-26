import { describe, it, expect, beforeEach } from 'vitest'
import { withGulliver, moveToGulliver, getState, setState, resetAll } from '../src/store.js'

const c = (id, name, group) => ({ id, name, group, style: 'shop', icon: 'tag', color: '#e5383b' })

describe('counties saved before Gulliver existed move into it', () => {
  it('rent, banking, investments and gifts move into Gulliver when nobody has a Gulliver county', () => {
    const old = [c('c1', 'Home & Rent', 'Home'), c('c2', 'Groceries', 'Food'), c('c3', 'Banking', 'Other'), c('c4', 'Investments', 'Other'), c('c5', 'Gifts', 'Shopping'), c('c6', 'House rent', 'Home')]
    const next = withGulliver(old)
    expect(next.map((x) => x.group)).toEqual(['Gulliver', 'Food', 'Gulliver', 'Gulliver', 'Gulliver', 'Gulliver'])
    expect(old[0].group).toBe('Home') // (the old list is left as it was)
  })

  it('other counties stay where they are, even with a word inside their name', () => {
    const old = [c('c1', 'Entertainment', 'Media'), c('c2', 'Current account', 'Other'), c('c3', 'Parents', 'Other'), c('c4', 'Groceries', 'Food')]
    expect(withGulliver(old)).toBe(old) // (nothing to move: the very same list)
  })

  it('nothing happens when there already is a Gulliver county', () => {
    const old = [c('c1', 'Home & Rent', 'Home'), c('c2', 'Gifts', 'Gulliver')]
    expect(withGulliver(old)).toBe(old)
  })

  describe('in the app, once', () => {
    beforeEach(() => { localStorage.clear(); resetAll() })

    it('moves them on the first start of an app that is set up, then leaves the groups alone', () => {
      setState((s) => ({ ...s, entered: true, counties: [c('c1', 'Home & Rent', 'Home'), c('c2', 'Banking', 'Other'), c('c3', 'Groceries', 'Food')] }))
      expect(moveToGulliver()).toBe(true)
      expect(getState().counties.map((x) => x.group)).toEqual(['Gulliver', 'Gulliver', 'Food'])
      // the person moves them out again: it must not happen a second time
      setState((s) => ({ ...s, counties: s.counties.map((x) => ({ ...x, group: 'Other' })) }))
      expect(moveToGulliver()).toBe(false)
      expect(getState().counties.every((x) => x.group === 'Other')).toBe(true)
    })

    it('does nothing for an app that is not set up yet, and does not use up the one chance', () => {
      setState((s) => ({ ...s, entered: false, counties: [c('c1', 'Home & Rent', 'Home')] }))
      expect(moveToGulliver()).toBe(false)
      expect(getState().counties[0].group).toBe('Home')
      setState((s) => ({ ...s, entered: true }))
      expect(moveToGulliver()).toBe(true)
    })
  })
})
