// a small stand-in for the server, with the same rules: the newest edit of a record wins, an older one is ignored,
// every accepted write gets the next number, and a phone asks for "everything after number n".
export function fakeCloud({ reject = () => false } = {}) {
  const rows = new Map() // "kind:id" -> { seq, kind, id, updatedAt, deleted, data }
  let seq = 0
  const calls = { push: 0, pull: 0 }
  const down = { value: false }

  const api = {
    async push(changes) {
      calls.push++
      if (down.value) throw Object.assign(new Error('no connection'), { status: 0 })
      let applied = 0
      const rejected = []
      changes.forEach((ch, index) => {
        if (reject(ch)) { rejected.push({ index, kind: ch.kind, id: ch.id, reason: 'unusable data' }); return }
        const key = ch.kind + ':' + ch.id
        const have = rows.get(key)
        if (have && have.updatedAt >= ch.updatedAt) return
        rows.set(key, { seq: ++seq, kind: ch.kind, id: ch.id, updatedAt: ch.updatedAt, deleted: !!ch.deleted, data: ch.data || {} })
        applied++
      })
      return { applied, ignored: changes.length - applied - rejected.length, rejected }
    },
    async pull(since, limit) {
      calls.pull++
      if (down.value) throw Object.assign(new Error('no connection'), { status: 0 })
      const all = [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq)
      const page = all.slice(0, limit)
      return { changes: page.map((r) => ({ ...r })), cursor: page.length ? page.at(-1).seq : since, more: all.length > limit }
    },
  }
  return { api, rows, calls, down, size: () => [...rows.values()].filter((r) => !r.deleted).length }
}
