// the tables on the phone. they line up with the ones on the server, plus a "dirty" flag
// (changed here, not sent yet). money is stored as numbers, times as milliseconds.

const STANDARD = 'updated_at integer not null, deleted integer not null default 0, dirty integer not null default 1'

// each entry is one version of the schema. new versions are added at the end, never edited.
export const MIGRATIONS = [
  [
    'create table meta (key text primary key, value text)',
    `create table counties (id text primary key, pos integer not null, name text not null, grp text not null, style text not null, icon text not null, color text not null, ${STANDARD})`,
    `create table accounts (id text primary key, pos integer not null, name text not null, currency text not null, ${STANDARD})`,
    `create table fixed_expenses (id text primary key, name text not null, amount real not null, county_id text not null, account_id text not null, day integer not null, method_type text not null, method_name text not null, last_posted text, ${STANDARD})`,
    `create table expenses (id text primary key, county_id text not null, account_id text not null, amount real not null, total real not null, people integer not null, currency text not null, method_type text not null, method_name text not null, note text not null, ts integer not null, fixed_id text, ${STANDARD})`,
    'create index expenses_ts_idx on expenses (ts) where deleted = 0',
    'create index expenses_dirty_idx on expenses (dirty) where dirty = 1',
    `create table settings (id text primary key, data text not null, ${STANDARD})`,
  ],
  [
    // version 2: an uneven split of an expense (who paid what share), stored as text
    'alter table expenses add column split text',
  ],
]

// bring a database up to the newest version, one step at a time, each in its own transaction
export async function ensureSchema(db) {
  const hasMeta = (await db.all("select name from sqlite_master where type = 'table' and name = 'meta'")).length > 0
  let have = 0
  if (hasMeta) {
    const row = (await db.all("select value from meta where key = 'schema_version'"))[0]
    have = row ? Number(row.value) : 0
  }
  for (let v = have; v < MIGRATIONS.length; v++) {
    await db.tx(async (c) => {
      for (const sql of MIGRATIONS[v]) await c.run(sql)
      await c.run("insert into meta (key, value) values ('schema_version', ?) on conflict (key) do update set value = excluded.value", [String(v + 1)])
    })
  }
}
