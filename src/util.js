export const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'SAR', name: 'Saudi Riyal' },
]

const symCache = {}
export function symbolOf(code) {
  if (symCache[code]) return symCache[code]
  let s = code
  try {
    s = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency').value
  } catch { /* keep code */ }
  symCache[code] = s
  return s
}

export function fmtNum(n, code = 'INR') {
  const loc = code === 'INR' ? 'en-IN' : 'en-US'
  const whole = Math.abs(n - Math.round(n)) < 0.005
  return new Intl.NumberFormat(loc, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n)
}
export const fmt = (n, code) => symbolOf(code) + fmtNum(n, code)

export const uid = () => Math.random().toString(36).slice(2, 9)

export const ymOf = (ts) => {
  const d = new Date(ts)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}
export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}
export const shiftYm = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}
export const daysIn = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
export const dayLabel = (ts) => {
  const d = new Date(ts)
  const today = new Date()
  const y = new Date(); y.setDate(today.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleString('en', { weekday: 'short', day: 'numeric', month: 'short' })
}
export const sumBy = (list, code) =>
  list.reduce((a, e) => a + (e.currency === code ? e.amount : 0), 0)

// about 20 EUR in each currency = 1 unit
const UNIT = { EUR: 20, USD: 22, GBP: 17, INR: 1900, AED: 80, JPY: 3300, CAD: 30, AUD: 33, SGD: 30, CHF: 19, CNY: 160, SAR: 82 }
// how built up a county is. no cap, it just grows slower once it gets big
export function levelFor(amount, code) {
  if (!(amount > 0)) return 0
  const u = amount / (UNIT[code] || 20)
  const n = u <= 6 ? u * 2.5 : 15 + 5.5 * Math.log(u - 5)
  return Math.max(1, Math.round(n))
}

// Gulliver: the big rare things (rent, investments, gifts). a Gulliver county is on the map like any other, but what is spent in it
// is not part of "this month", of Analytics' top spender, or of the accident odds. it has its own total.
export const GULLIVER = 'Gulliver'
export const isGulliver = (county) => !!county && county.group === GULLIVER

// what was spent in one month and one currency: per county, the total of everything except Gulliver, and the Gulliver total
export function monthSpending(expenses, counties, currency, ym) {
  const group = new Map(counties.map((c) => [c.id, c.group]))
  const per = {}
  let total = 0
  let gulliver = 0
  for (const e of expenses) {
    if (e.currency !== currency || ymOf(e.ts) !== ym) continue
    const p = (per[e.countyId] ||= { spent: 0, count: 0 })
    p.spent += e.amount
    p.count += 1
    if (group.get(e.countyId) === GULLIVER) gulliver += e.amount
    else total += e.amount
  }
  return { per, total, gulliver }
}

// my share of a bill split between n people
export const shareOf = (total, people) => Math.max(0.01, Math.round((total / Math.max(1, Math.round(people) || 1)) * 100) / 100)

// an uneven split of one bill between friends. split = { mode, parts }, parts[0] is me.
// mode 'percent': the parts are percentages and must add up to 100.  mode 'amount': the parts are money and must add up to the total.
// gives back everyone's share in order (the shares always add up to the total to the cent), or null when the split does not work.
export function splitShares(total, split) {
  if (!split || (split.mode !== 'percent' && split.mode !== 'amount') || !Array.isArray(split.parts)) return null
  const parts = split.parts
  if (parts.length < 2 || parts.length > 20) return null
  const whole = Math.round(total * 100)
  const c = parts.map((p) => (typeof p === 'number' && Number.isFinite(p) ? Math.round(p * 100) : 0))
  if (!(whole >= 1) || c.some((x) => x < 1)) return null
  const sum = c.reduce((a, b) => a + b, 0)
  if (split.mode === 'amount') return sum === whole ? c.map((x) => x / 100) : null
  if (sum !== 10000) return null
  // percentages: cut the bill in cents, then hand the leftover cents to the biggest remainders (earlier person first on a tie)
  const top = c.map((p) => whole * p)
  const cents = top.map((t) => Math.floor(t / 10000))
  const order = top.map((t, i) => [t % 10000, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  let left = whole - cents.reduce((a, b) => a + b, 0)
  for (let k = 0; left > 0; k++, left--) cents[order[k][1]]++
  return cents.some((x) => x < 1) ? null : cents.map((x) => x / 100)
}

// my share of a bill: from the uneven split when there is one, otherwise an equal share
export const shareFor = (total, people, split) => {
  const s = splitShares(total, split)
  return s ? s[0] : shareOf(total, people)
}

// history shows one account at a time so currencies never mix
export const byAccount = (expenses, accountId) => expenses.filter((e) => e.accountId === accountId)
