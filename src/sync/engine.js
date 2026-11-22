// the sync itself: send what changed on this phone, fetch what changed elsewhere.
// the rule is simple. for every record the newest edit wins, and nothing is ever overwritten by something older.
import { KINDS, upsertSql, values, loadList, getMeta, setMeta } from '../db/repo.js'

// what belongs to the person (and goes to the cloud) and what belongs to this phone (theme, map, status bar)
export const SYNCED_SETTINGS = ['stateName', 'methods', 'currency', 'entered', 'setupDone']
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]))

const BATCH = 500

// ---------- sending ----------

function toChange(kind, row) {
  if (kind === 'settings') {
    return { kind, id: 'settings', updatedAt: row.updated_at, deleted: !!row.deleted, data: pick(JSON.parse(row.data), SYNCED_SETTINGS) }
  }
  const spec = KINDS[kind]
  const data = {}
  for (const [key, col, json] of spec.fields) if (row[col] !== null) data[key] = json ? JSON.parse(row[col]) : row[col]
  if (spec.ordered) data.pos = row.pos
  return { kind, id: row.id, updatedAt: row.updated_at, deleted: !!row.deleted, data }
}

// records changed here and not sent yet. `stamp` is the time of the edit we read, so we only mark it sent if it is still that edit.
export async function dirtyChanges(db, limit = BATCH) {
  const out = []
  for (const [kind, spec] of Object.entries(KINDS)) {
    if (out.length >= limit) break
    const rows = await db.all(`select * from ${spec.table} where dirty = 1 order by updated_at limit ?`, [limit - out.length])
    for (const r of rows) out.push({ table: spec.table, id: r.id, stamp: r.updated_at, change: toChange(kind, r) })
  }
  if (out.length < limit) {
    for (const r of await db.all('select * from settings where dirty = 1')) {
      out.push({ table: 'settings', id: r.id, stamp: r.updated_at, change: toChange('settings', r) })
    }
  }
  return out
}

export async function markSent(db, batch) {
  await db.tx(async (c) => {
    for (const b of batch) await c.run(`update ${b.table} set dirty = 0 where id = ? and updated_at = ?`, [b.id, b.stamp])
  })
}

// keep sending until nothing is waiting. a record edited again while we were sending stays waiting.
export async function pushAll(db, api) {
  let sent = 0
  for (let round = 0; round < 60; round++) {
    const batch = await dirtyChanges(db)
    if (!batch.length) break
    const res = await api.push(batch.map((b) => b.change))
    // the server said no to some (it never will say yes): count them and move on, so one bad record cannot block everything
    if (res.rejected && res.rejected.length) await setMeta(db, 'rejected_total', (Number(await getMeta(db, 'rejected_total')) || 0) + res.rejected.length)
    await markSent(db, batch)
    sent += batch.length
  }
  return sent
}

// ---------- receiving ----------

const wireToObj = (spec, id, data) => {
  const obj = { id }
  for (const [key] of spec.fields) if (data[key] !== undefined && data[key] !== null) obj[key] = data[key]
  return obj
}

// put what the server sent into the database. returns the changes that were actually used (the others were older than what we have).
export async function applyRemote(db, changes, cursor) {
  const accepted = []
  await db.tx(async (c) => {
    for (const r of changes) {
      if (r.kind === 'settings') {
        const local = (await c.all("select data, updated_at from settings where id = 'settings'"))[0]
        if (local && local.updated_at >= r.updatedAt) continue
        const merged = { ...(local ? JSON.parse(local.data) : {}), ...pick(r.data || {}, SYNCED_SETTINGS) } // this phone's own settings stay
        await c.run(
          "insert into settings (id, data, updated_at, deleted, dirty) values ('settings', ?, ?, 0, 0) on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = 0, dirty = 0",
          [JSON.stringify(merged), r.updatedAt],
        )
        accepted.push(r)
        continue
      }
      const spec = KINDS[r.kind]
      if (!spec) continue // a kind of record a newer version knows about
      const local = (await c.all(`select updated_at from ${spec.table} where id = ?`, [r.id]))[0]
      if (local && local.updated_at >= r.updatedAt) continue // we already have this edit, or a newer one
      if (!local && r.deleted) continue // deleted before we ever saw it
      if (r.deleted) {
        await c.run(`update ${spec.table} set deleted = 1, updated_at = ?, dirty = 0 where id = ?`, [r.updatedAt, r.id])
      } else {
        await c.run(upsertSql(spec), values(spec, wireToObj(spec, r.id, r.data || {}), (r.data && r.data.pos) || 0, r.updatedAt, 0))
      }
      accepted.push(r)
    }
    await c.run("insert into meta (key, value) values ('cursor', ?) on conflict (key) do update set value = excluded.value", [String(cursor)])
  })
  return accepted
}

// the counties and accounts are ordered, so when one of them changed the whole list is read again
export async function orderedLists(db, accepted) {
  const out = {}
  for (const [kind, spec] of Object.entries(KINDS)) {
    if (spec.ordered && accepted.some((r) => r.kind === kind)) out[spec.list] = await loadList(db, spec)
  }
  return out
}

// one round: send, then fetch. `patch` puts what was fetched into the app's state on screen.
export async function syncOnce({ db, api, flush, getState, patch }) {
  await flush() // changes made a moment ago must be in the database before we look for them
  const pushed = await pushAll(db, api)
  let pulled = 0
  for (let page = 0; page < 400; page++) {
    const since = Number(await getMeta(db, 'cursor')) || 0
    const base = getState() // what the screen shows now. anything the person changes during this round is left alone.
    const res = await api.pull(since, BATCH)
    const accepted = await applyRemote(db, res.changes, res.cursor)
    if (accepted.length) patch(accepted, base, await orderedLists(db, accepted))
    pulled += res.changes.length
    if (!res.more || res.cursor <= since) break
  }
  await setMeta(db, 'last_sync_at', Date.now())
  return { pushed, pulled }
}

// ---------- the first time ----------

// before signing in: what would happen? the cloud may already have data (from another phone).
export async function cloudHasData(api) {
  const res = await api.pull(0, 1)
  return res.changes.length > 0
}

// start again from the cloud: forget everything stored on this phone and the place we got to
export async function wipeLocal(db) {
  await db.tx(async (c) => {
    for (const spec of Object.values(KINDS)) await c.run(`delete from ${spec.table}`)
    await c.run('delete from settings')
    await c.run("insert into meta (key, value) values ('cursor', '0') on conflict (key) do update set value = '0'")
  })
}

// send everything again (used when an account is joined for the first time with data already on the phone)
export async function markAllDirty(db) {
  await db.tx(async (c) => {
    for (const spec of Object.values(KINDS)) await c.run(`update ${spec.table} set dirty = 1`)
    await c.run('update settings set dirty = 1')
    await c.run("insert into meta (key, value) values ('cursor', '0') on conflict (key) do update set value = '0'")
  })
}
