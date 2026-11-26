// the icon of the app on the home screen follows the map in use (the maps are skins, and so is the icon).
// the icons are bundled in the app: on iPhone as alternate icon sets (Assets.xcassets/AppIcon-<Name>.appiconset), on Android as launcher entries (activity-alias in the manifest).
// the native part is the "AppIcon" plugin (ios/App/App/AppDelegate.swift and android/.../AppIconPlugin.java). on the web nothing happens.
import { Capacitor, registerPlugin } from '@capacitor/core'

// per map id: the name of the iPhone icon set ('' = the main icon) and the Android launcher entry
export const APP_ICONS = {
  city: { ios: '', android: 'IconCity' },
  lego: { ios: 'AppIcon-Lego', android: 'IconLego' },
  japan: { ios: 'AppIcon-Japan', android: 'IconJapan' },
  ice: { ios: 'AppIcon-Santy', android: 'IconSanty' }, // (the Santy map)
  wire: { ios: 'AppIcon-Wire', android: 'IconWire' },
  court: { ios: 'AppIcon-Court', android: 'IconCourt' },
}

// the name to hand to the native plugin for a map on a platform ('ios' or 'android'); an unknown map gets the main icon
export const iconNameFor = (mapId, platform) => ((APP_ICONS[mapId] || APP_ICONS.city)[platform === 'android' ? 'android' : 'ios'])

const AppIcon = registerPlugin('AppIcon')

// what the last try did, shown in Profile on a phone so that a failure can be read: { map, name, ok, message }
let last = null
export const lastIconResult = () => last

// switch the home screen icon to the one of the map. never throws: a phone that cannot do it just keeps its icon (and lastIconResult says why).
export async function setAppIcon(mapId) {
  let name = ''
  try {
    if (!Capacitor.isNativePlatform()) return false
    const platform = Capacitor.getPlatform()
    if (platform !== 'ios' && platform !== 'android') return false
    name = iconNameFor(mapId, platform)
    const r = await AppIcon.setIcon({ name })
    last = { map: mapId, name, ok: true, message: r && r.changed === false ? 'already this icon' : 'changed' }
    return true
  } catch (e) {
    last = { map: mapId, name, ok: false, message: String((e && (e.message || e.errorMessage)) || e).slice(0, 140) }
    return false
  }
}
