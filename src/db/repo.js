// turns the app's state into rows and back. the app keeps one state object in memory (that is what the screens read);
// this file keeps the database in step with it, and can rebuild the state from the database.

// the kinds of record and how each lines up with a table. [field in the app, column in the table]
export const KINDS = {
  county: {
    table: 'counties', list: 'counties', ordered: true,
    fields: [['name', 'name'], ['group', 'grp'], ['style', 'style'], ['icon', 'icon'], ['color', 'color']],
  },
  account: {
    table: 'accounts', list: 'accounts', ordered: true,
    fields: [['name', 'name'], ['currency', 'currency']],
  },
  fixed: {
    table: 'fixed_expenses', list: 'fixed', ordered: false,
    fields: [['name', 'name'], ['amount', 'amount'], ['countyId', 'county_id'], ['accountId', 'account_id'], ['day', 'day'],
      ['methodType', 'method_type'], ['methodName', 'method_name'], ['lastPosted', 'last_posted']],
  },
  expense: {
    table: 'expenses', list: 'expenses', ordered: false,
    fields: [['countyId', 'county_id'], ['accountId', 'account_id'], ['amount', 'amount'], ['total', 'total'], ['people', 'people'],
      ['currency', 'currency'], ['methodType', 'method_type'], ['methodName', 'method_name'], ['note', 'note'], ['ts', 'ts'], ['fixedId', 'fixed_id']],
  },
}

// everything in the state that is not a list of records
export const SETTING_KEYS = ['entered', 'setupDone', 'stateName', 'season', 'appearance', 'minimal', 'map', 'currency', 'methods']

const settingsOf = (state) => Object.fromEntries(SETTING_KEYS.filter((k) => state[k] !== undefined).map((k) => [k, state[k]]))
const sameSettings = (a, b) => JSON.stringify(settingsOf(a)) === JSON.stringify(settingsOf(b))

// the SQL to write one record (insert, or update when it is already there)
function upsertSql(spec) {
  const cols = [...(spec.ordered ? ['pos'] : []), ...spec.fields.map((f) => f[1])]
  const all = ['id', ...cols, 'updated_at', 'deleted', 'dirty']
  const sets = [...cols, 'updated_at', 'deleted', 'dirty'].map((c) => `${c} = excluded.${c}`).join(', ')
  return `insert into ${spec.table} (${all.join(', ')}) values (${all.map(() => '?').join(', ')}) on conflict (id) do update set ${sets}`
}

const values = (spec, obj, pos, now) => [
  obj.id,
  ...(spec.ordered ? [pos] : []),
  ...spec.fields.map(([key]) => (obj[key] === undefined ? null : obj[key])),
  now, 0, 1,
]

const fromRow = (spec, row) => {
  const obj = { id: row.id }
  for (const [key, col] of spec.fields) if (row[col] !== null) obj[key] = row[col]
  return obj
}

// a database with nothing in it yet
export async function isEmpty(db) {
  for (const spec of Object.values(KINDS)) {
    if ((await db.all(`select 1 from ${spec.table} limit 1`)).length) return false
  }
  return (await db.all('select 1 from settings limit 1')).length === 0
}

// rebuild the state from the database. `base` supplies the defaults for anything not stored.
export async function loadState(db, base) {
  const state = { ...base }
  for (const spec of Object.values(KINDS)) {
    const order = spec.ordered ? 'pos, id' : spec.table === 'expenses' ? 'ts, id' : 'id'
    const rows = await db.all(`select * from ${spec.table} where deleted = 0 order by ${order}`)
    state[spec.list] = rows.map((r) => fromRow(spec, r))
  }
  const row = (await db.all("select data from settings where id = 'settings' and deleted = 0"))[0]
  if (row) Object.assign(state, JSON.parse(row.data))
  return state
}

// write what changed between two states. records are compared by identity: the app replaces a record
// when it changes it and reuses the same object when it does not.
export async function saveDiff(db, prev, next, now = Date.now()) {
  const statements = []
  for (const spec of Object.values(KINDS)) {
    const before = new Map(prev[spec.list].map((o, i) => [o.id, [o, i]]))
    const seen = new Set()
    const sql = upsertSql(spec)
    next[spec.list].forEach((obj, i) => {
      seen.add(obj.id)
      const was = before.get(obj.id)
      if (!was || was[0] !== obj || (spec.ordered && was[1] !== i)) statements.push([sql, values(spec, obj, i, now)])
    })
    for (const id of before.keys()) {
      if (!seen.has(id)) statements.push([`update ${spec.table} set deleted = 1, updated_at = ?, dirty = 1 where id = ? and deleted = 0`, [now, id]])
    }
  }
  if (!sameSettings(prev, next)) {
    statements.push([
      "insert into settings (id, data, updated_at, deleted, dirty) values ('settings', ?, ?, 0, 1) on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = 0, dirty = 1",
      [JSON.stringify(settingsOf(next)), now],
    ])
  }
  if (!statements.length) return 0
  await db.tx(async (c) => {
    for (const [sql, params] of statements) await c.run(sql, params)
  })
  return statements.length
}

// put a whole state into an empty database (used when the old saved data is moved over)
export async function importState(db, state, now = Date.now()) {
  await db.tx(async (c) => {
    for (const spec of Object.values(KINDS)) {
      const sql = upsertSql(spec)
      let i = 0
      for (const obj of state[spec.list]) await c.run(sql, values(spec, obj, i++, now))
    }
    await c.run(
      "insert into settings (id, data, updated_at, deleted, dirty) values ('settings', ?, ?, 0, 1) on conflict (id) do update set data = excluded.data",
      [JSON.stringify(settingsOf(state)), now],
    )
  })
}

export const counts = async (db) => {
  const out = {}
  for (const spec of Object.values(KINDS)) out[spec.list] = (await db.all(`select count(*) as n from ${spec.table} where deleted = 0`))[0].n
  return out
}

export async function getMeta(db, key) {
  const row = (await db.all('select value from meta where key = ?', [key]))[0]
  return row ? row.value : null
}

export const setMeta = (db, key, value) =>
  db.run('insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value', [key, String(value)])
