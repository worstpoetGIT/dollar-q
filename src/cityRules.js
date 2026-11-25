// the rules of the city that do not need three.js, so they can be tested on their own.
// (how people and cars move is in traffic.js; this is about what spending does to the land around a county)

// ---------- trees ----------

export const TREES_PER_LOT = 8

// each floor that goes up costs a tree, and every fifth floor (a new building) costs one more: one to two trees per floor,
// so a county with a few floors has no trees left. an empty county keeps all of them.
const felled = (level) => {
  const l = Math.max(0, Math.floor(Number.isFinite(level) ? level : 0))
  return l + Math.floor(l / 5)
}
export const treesLeft = (level) => Math.max(0, TREES_PER_LOT - felled(level))

// ---------- roads ----------

// how much of the 3 wide road a county takes on its own side. the more floors, the narrower the road in front of it.
export const ROAD_TAKEN_MAX = 0.45
export const roadTaken = (level) => ROAD_TAKEN_MAX * (1 - Math.exp(-Math.max(0, Number.isFinite(level) ? level : 0) / 12))

// ---------- accidents ----------

export const MAX_ACCIDENTS = 2 // at most this many crashes (with a fight each) at a time, so the phone and the traffic stay calm

// how likely each lot is to have the next accident. `counties` has one entry (or null) for every lot, in lot order, with how much
// was spent this month, its group and its level; `frontage[i]` says whether lot i has a road in front of it.
// the weight is the county's share of everything spent outside Gulliver (what Analytics shows as the top spenders) times how
// narrow its road has become. Gulliver (rent, investments, gifts) never has accidents, and neither does a lot without a road.
export function accidentWeights(counties, frontage) {
  const spent = counties.map((c) => (c && c.group !== 'Gulliver' && c.spent > 0 ? c.spent : 0))
  const all = spent.reduce((a, b) => a + b, 0)
  if (all <= 0) return counties.map(() => 0)
  return counties.map((c, i) => (frontage[i] && spent[i] > 0 ? (spent[i] / all) * (roadTaken(c.level) / ROAD_TAKEN_MAX) : 0))
}

// choose a lot by weight; r is a random number from 0 up to (not including) 1. -1 when nothing can happen.
export function pickLot(weights, r) {
  const total = weights.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return -1
  let x = Math.min(Math.max(r, 0), 0.999999) * total
  let last = -1
  for (let i = 0; i < weights.length; i++) {
    if (!(weights[i] > 0)) continue
    last = i
    x -= weights[i]
    if (x < 0) return i
  }
  return last
}

// the chance that an accident starts within `seconds`, from the total of the weights (0 to 1). at full danger about one every 15 seconds.
export const accidentChance = (danger, seconds) => 1 - Math.exp(-(Math.max(0, danger) * seconds) / 15)

// a fight goes on for as long as there is any spending in the county, and stops when its expenses come down to zero
export const fightGoesOn = (spent) => spent > 0
