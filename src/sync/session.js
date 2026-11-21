// the login token. on a phone it goes in the secure storage (iPhone Keychain, Android Keystore), not in ordinary app storage.
import { Capacitor } from '@capacitor/core'

const KEY = 'dollarq-session'

// a place to keep one secret string. `store` is swapped for a plain one in tests.
export function createSession(store) {
  return {
    get: async () => { try { return (await store.get(KEY)) || null } catch { return null } },
    set: (token) => store.set(KEY, token),
    clear: async () => { try { await store.remove(KEY) } catch { /* nothing there */ } },
  }
}

// the real thing, loaded only on a phone so the plugin is not needed anywhere else
export async function nativeStore() {
  if (!Capacitor.isNativePlatform()) {
    return { get: async (k) => localStorage.getItem(k), set: async (k, v) => localStorage.setItem(k, v), remove: async (k) => localStorage.removeItem(k) }
  }
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  return {
    get: async (k) => (await SecureStorage.get(k)) || null,
    set: (k, v) => SecureStorage.set(k, v),
    remove: (k) => SecureStorage.remove(k),
  }
}
