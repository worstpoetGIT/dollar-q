// the phone's own SQLite (iOS and Android). on anything else there is no database and the app keeps using
// its old saved data, exactly as before.
import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

const NAME = 'dollarq'

export async function openNativeDb() {
  if (!Capacitor.isNativePlatform()) return null
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const consistent = (await sqlite.checkConnectionsConsistency()).result
  const known = (await sqlite.isConnection(NAME, false)).result
  const conn = consistent && known ? await sqlite.retrieveConnection(NAME, false) : await sqlite.createConnection(NAME, false, 'no-encryption', 1, false)
  await conn.open()

  const ddl = /^\s*(create|drop|alter|pragma)\b/i
  const run = async (sql, params = []) => {
    if (!params.length && ddl.test(sql)) await conn.execute(sql, false)
    else await conn.run(sql, params, false)
  }
  const all = async (sql, params = []) => (await conn.query(sql, params)).values || []

  // one writer at a time, and a failed batch changes nothing
  let queue = Promise.resolve()
  const tx = (fn) => {
    const job = queue.then(async () => {
      await conn.beginTransaction()
      try {
        const out = await fn({ run, all })
        await conn.commitTransaction()
        return out
      } catch (err) {
        await conn.rollbackTransaction().catch(() => {})
        throw err
      }
    })
    queue = job.catch(() => {})
    return job
  }
  return { run, all, tx }
}
