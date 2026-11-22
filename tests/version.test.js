import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// the version is written in three places. a release with a mismatch would install fine on one phone and be refused on the other,
// so the tests refuse it first.
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const gradle = read('android/app/build.gradle')
const xcode = read('ios/App/App.xcodeproj/project.pbxproj')

const all = (text, re) => [...text.matchAll(re)].map((m) => m[1])

describe('the version is the same everywhere', () => {
  it('has a plain version number', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('Android shows the same version as package.json', () => {
    expect(all(gradle, /versionName "([^"]+)"/g)).toEqual([pkg.version])
  })

  it('iPhone shows the same version as package.json, in every build setting', () => {
    const found = all(xcode, /MARKETING_VERSION = ([^;]+);/g)
    expect(found.length).toBeGreaterThan(0)
    for (const v of found) expect(v).toBe(pkg.version)
  })

  it('the hidden build counter is the same on both phones, and a whole number above zero', () => {
    const android = all(gradle, /versionCode (\d+)/g)
    const ios = all(xcode, /CURRENT_PROJECT_VERSION = (\d+);/g)
    expect(android.length).toBe(1)
    expect(ios.length).toBeGreaterThan(0)
    expect(Number(android[0])).toBeGreaterThan(0)
    for (const n of ios) expect(n).toBe(android[0])
  })
})
