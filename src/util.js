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

// roughly what 20 EUR is worth in each currency: one "unit" of spending
const UNIT = { EUR: 20, USD: 22, GBP: 17, INR: 1900, AED: 80, JPY: 3300, CAD: 30, AUD: 33, SGD: 30, CHF: 19, CNY: 160, SAR: 82 }
// County level follows the real amount, with no ceiling. Each level is one construction step
// (foundation, hut, details, an extra building, another floor...). ~2.5 steps per unit, easing off gently.
export function levelFor(amount, code) {
  if (!(amount > 0)) return 0
  const u = amount / (UNIT[code] || 20)
  const n = u <= 6 ? u * 2.5 : 15 + 5.5 * Math.log(u - 5)
  return Math.max(1, Math.round(n))
}

// Splitwise-style split: with N people, my own expense is my equal share of the whole bill, rounded to cents.
export const shareOf = (total, people) => Math.max(0.01, Math.round((total / Math.max(1, Math.round(people) || 1)) * 100) / 100)
