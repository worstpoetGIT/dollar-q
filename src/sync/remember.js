// remembers the email on this phone so it is already typed in next time. only the email, nothing secret.
const KEY = 'dollar-q:remembered-email'

const here = () => { try { return globalThis.localStorage || null } catch { return null } }

export function rememberedEmail(store = here()) {
  try { return (store && store.getItem(KEY)) || '' } catch { return '' }
}

// on = true saves it, on = false forgets it
export function rememberEmail(email, on, store = here()) {
  try {
    if (!store) return
    if (on && email) store.setItem(KEY, email.trim())
    else store.removeItem(KEY)
  } catch { /* storage can be blocked, then it is just not remembered */ }
}
