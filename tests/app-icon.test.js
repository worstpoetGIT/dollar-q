import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { APP_ICONS, iconNameFor } from '../src/appIcon.js'
import { MAP_LIST } from '../src/maps.js'

const cat = 'ios/App/App/Assets.xcassets/'
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')
const plugin = readFileSync('android/app/src/main/java/win/fridayai/dollarq/AppIconPlugin.java', 'utf8')

describe('the home screen icon follows the map', () => {
  it('every map has an icon on both phones, all different', () => {
    for (const m of MAP_LIST) expect(APP_ICONS[m.id], m.id).toBeTruthy()
    const ios = MAP_LIST.map((m) => APP_ICONS[m.id].ios), and = MAP_LIST.map((m) => APP_ICONS[m.id].android)
    expect(new Set(ios).size).toBe(MAP_LIST.length)
    expect(new Set(and).size).toBe(MAP_LIST.length)
  })

  it('the name for a map on a platform, and the main icon for an unknown map', () => {
    expect(iconNameFor('lego', 'ios')).toBe('AppIcon-Lego')
    expect(iconNameFor('lego', 'android')).toBe('IconLego')
    expect(iconNameFor('city', 'ios')).toBe('') // (the main icon)
    expect(iconNameFor('nope', 'android')).toBe('IconCity')
    expect(iconNameFor(undefined, 'ios')).toBe('')
  })

  it('on iPhone every alternate icon exists as a 1024 picture and is listed in the project', () => {
    const alts = Object.values(APP_ICONS).map((i) => i.ios).filter(Boolean)
    expect(alts.length).toBe(MAP_LIST.length - 1)
    for (const a of alts) {
      const dir = `${cat}${a}.appiconset/`
      expect(existsSync(dir + 'Contents.json'), a).toBe(true)
      const c = JSON.parse(readFileSync(dir + 'Contents.json', 'utf8'))
      expect(existsSync(dir + c.images[0].filename), a).toBe(true)
      expect(c.images[0].size).toBe('1024x1024')
      expect(pbx).toContain(a)
    }
    expect(pbx).toContain('ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES')
    expect(existsSync(cat + 'AppIcon.appiconset/AppIcon-512@2x.png')).toBe(true) // (the main icon)
  })

  it('on Android every icon is a launcher entry with pictures in every density, and the plugin knows them all', () => {
    for (const i of Object.values(APP_ICONS)) {
      expect(manifest).toContain(`android:name=".${i.android}"`)
      expect(plugin).toContain(`"${i.android}"`)
    }
    for (const res of ['city', 'lego', 'japan', 'santy', 'wire', 'court'])
      for (const dpi of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) expect(existsSync(`android/app/src/main/res/mipmap-${dpi}/ic_launcher_${res}.png`), res + dpi).toBe(true)
    // only the main entry starts switched on, and only entries that start the app
    expect((manifest.match(/android:enabled="true"/g) || []).length).toBe(1)
    expect((manifest.match(/<activity-alias/g) || []).length).toBe(MAP_LIST.length)
  })

  it('on iPhone the first screen is the one that carries the icon plugin (the scene delegate must not make the plain Capacitor one)', () => {
    const scene = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8')
    expect(scene).toContain('MainViewController()')
    expect(scene).not.toContain('= CAPBridgeViewController()')
    expect(readFileSync('ios/App/App/AppDelegate.swift', 'utf8')).toContain('registerPluginInstance(AppIconPlugin())')
    expect(readFileSync('ios/App/App/AppDelegate.swift', 'utf8')).toContain('call.getBool("force")') // (a change of map always asks the phone, so going back to the main icon works)
  })

  it('without a phone around, switching the icon does nothing and does not throw', async () => {
    const { setAppIcon } = await import('../src/appIcon.js')
    await expect(setAppIcon('lego')).resolves.toBe(false)
  })
})
