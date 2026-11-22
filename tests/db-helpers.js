// SQLite for the tests: the same SQL the phone runs, on node's built in engine
import { DatabaseSync } from 'node:sqlite'

export function nodeDb() {
  const raw = new DatabaseSync(':memory:')
  const clean = (p) => p.map((v) => (v === undefined ? null : v))
  const conn = {
    async run(sql, params = []) { raw.prepare(sql).run(...clean(params)) },
    async all(sql, params = []) { return raw.prepare(sql).all(...clean(params)).map((r) => ({ ...r })) },
  }
  let queue = Promise.resolve()
  return {
    ...conn,
    raw,
    tx(fn) {
      const job = queue.then(async () => {
        raw.exec('BEGIN')
        try {
          const out = await fn(conn)
          raw.exec('COMMIT')
          return out
        } catch (err) {
          raw.exec('ROLLBACK')
          throw err
        }
      })
      queue = job.catch(() => {})
      return job
    },
  }
}
