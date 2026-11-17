// backup: export and import everything as one json file
// imports get checked before anything is used
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getState, sanitize, replaceState } from './store.js'

const APP = 'dollar-q'
const MAX_BYTES = 12 * 1024 * 1024
const LAST = 'dollar-q:lastBackup'

export const lastBackup = () => { try { return Number(localStorage.getItem(LAST)) || 0 } catch { return 0 } }
const markBackup = () => { try { localStorage.setItem(LAST, String(Date.now())) } catch { /* private mode */ } }

export function backupText() {
  return JSON.stringify({ app: APP, format: 1, exportedAt: new Date().toISOString(), data: getState() }, null, 1)
}

export async function exportBackup() {
  const text = backupText()
  const name = `dollarq-backup-${new Date().toISOString().slice(0, 10)}.json`
  if (Capacitor.isNativePlatform()) {
    const f = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: 'Backup', url: f.uri, dialogTitle: 'Save your $? backup' })
  } else {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  markBackup()
}

// reads the file, changes nothing yet
export async function readBackup(file) {
  if (!file) throw new Error('No file chosen.')
  if (file.size > MAX_BYTES) throw new Error('That file is too large to be a $? backup.')
  let doc
  try { doc = JSON.parse(await file.text()) } catch { throw new Error('That file is not a $? backup.') }
  if (!doc || doc.app !== APP || doc.format !== 1 || !doc.data || typeof doc.data !== 'object') throw new Error('That file is not a $? backup.')
  const data = sanitize(doc.data)
  if (!data.entered) throw new Error('That backup is empty.')
  return { data, expenses: data.expenses.length, counties: data.counties.length, name: data.stateName, exportedAt: doc.exportedAt }
}

export function applyBackup(info) {
  replaceState(info.data)
}
