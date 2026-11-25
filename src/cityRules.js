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
