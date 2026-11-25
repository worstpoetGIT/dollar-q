// how a building really goes up, as plain numbers (the scene draws it, this only decides what happens and when)
//
// a model is a pile of pieces. when a county levels up, the new model is compared with what stands:
//   - pieces that are the same are already there and stay
//   - a wall that has the same footprint but is taller grows: only the new part is built
//   - a wall that is new is built from the ground
//   - the old roof and other things that are not in the new model are lifted off first
//   - everything that is not a wall (roof, dome, slab, door, antenna) is fitted once the walls beneath it stand
// walls are laid brick by brick, one course at a time, by bricklayers (one for each side of the building).

const TAU = Math.PI * 2
const near = (a, b, e = 0.03) => Math.abs(a - b) <= e

export const MAX_BRICKS = 2400 // more than this and the bricks get bigger (a phone has to draw them all)
export const BRICK_PHASE = 16 // about how long the walls of a floor take, in seconds
export const LIFT = 0.64 // the scaffold platforms are this far apart

// a wall is a big box or a big round drum. everything else is a piece that gets fitted
export function isWall(d) {
  if (d.kind === 'box') return d.h >= 0.4 && Math.min(d.w, d.d) >= 1.2 && d.upright // (a small box on a roof is a module the crane lifts on)
  if (d.kind === 'cyl') return d.h >= 0.4 && Math.max(d.rt, d.rb) >= 0.7 && d.seg >= 8 && d.upright
  return false
}

const key = (d) => [d.kind, d.w?.toFixed(2), d.d?.toFixed(2), d.rt?.toFixed(2), d.rb?.toFixed(2), d.h.toFixed(2), d.cx.toFixed(2), d.cy.toFixed(2), d.cz.toFixed(2), d.color].join('|')
const sameFoot = (a, b) => a.kind === b.kind && near(a.cx, b.cx) && near(a.cz, b.cz) && near(a.bottom, b.bottom) &&
  (a.kind === 'box' ? near(a.w, b.w) && near(a.d, b.d) : near(a.rt, b.rt, 0.06) && near(a.rb, b.rb, 0.06))

// what the new model needs compared with what stands. both are lists of piece descriptions (see the scene: describe())
export function compare(oldList, newList) {
  const have = new Map()
  for (const o of oldList) {
    const k = key(o)
    ;(have.get(k) || have.set(k, []).get(k)).push(o)
  }
  const fresh = []
  const kept = []
  for (const n of newList) {
    const slot = have.get(key(n))
    if (slot && slot.length) { slot.pop(); kept.push(n) } else fresh.push(n)
  }
  const gone = [...have.values()].flat() // left over: not in the new model any more
  const walls = []
  const pieces = []
  for (const n of fresh) {
    if (!isWall(n)) { pieces.push(n); continue }
    // the same wall, taller than before: only the new part is built
    const i = gone.findIndex((o) => isWall(o) && sameFoot(o, n) && n.top > o.top + 0.05)
    if (i >= 0) {
      const [o] = gone.splice(i, 1)
      walls.push({ d: n, from: o.top, to: n.top, grown: o })
    } else walls.push({ d: n, from: n.bottom, to: n.top, grown: null })
  }
  return { kept, walls, pieces, removed: gone }
}

// bricks along one run of wall: a row of 'len' split into whole bricks, every other row shifted by half a brick (that is what makes a wall a wall)
function row(len, bl, odd) {
  const n = Math.max(2, Math.round(len / bl))
  const w = len / n
  const out = []
  if (!odd) for (let i = 0; i < n; i++) out.push({ c: -len / 2 + (i + 0.5) * w, len: w })
  else {
    out.push({ c: -len / 2 + w / 4, len: w / 2 })
    for (let i = 0; i < n - 1; i++) out.push({ c: -len / 2 + (i + 1) * w, len: w })
    out.push({ c: len / 2 - w / 4, len: w / 2 })
  }
  return out
}

// the bricks of a wall between two heights. side 0..3 says which bricklayer does it (+z, +x, -z, -x)
export function wallBricks(wall, kit) {
  const d = wall.d
  const n = Math.max(1, Math.round((wall.to - wall.from) / kit.ch))
  const ch = (wall.to - wall.from) / n
  const out = []
  const inset = kit.bt / 2 + 0.02 // the outer face stays just inside the finished wall, so the finished wall covers it
  for (let k = 0; k < n; k++) {
    const y = wall.from + (k + 0.5) * ch
    const odd = k % 2 === 1
    if (d.kind === 'box') {
      for (const { c, len } of row(d.w, kit.bl, odd)) {
        out.push({ x: d.cx + c, y, z: d.cz + d.d / 2 - inset, ry: 0, sx: len, sy: ch * 0.94, sz: kit.bt, side: 0, course: k, along: c })
        out.push({ x: d.cx + c, y, z: d.cz - d.d / 2 + inset, ry: 0, sx: len, sy: ch * 0.94, sz: kit.bt, side: 2, course: k, along: c })
      }
      for (const { c, len } of row(d.d - 2 * kit.bt, kit.bl, odd)) {
        out.push({ x: d.cx + d.w / 2 - inset, y, z: d.cz + c, ry: Math.PI / 2, sx: len, sy: ch * 0.94, sz: kit.bt, side: 1, course: k, along: c })
        out.push({ x: d.cx - d.w / 2 + inset, y, z: d.cz + c, ry: Math.PI / 2, sx: len, sy: ch * 0.94, sz: kit.bt, side: 3, course: k, along: c })
      }
    } else {
      const f = (y - d.bottom) / d.h
      const r = d.rb + (d.rt - d.rb) * f - inset
      const m = Math.max(8, Math.round((TAU * r) / kit.bl))
      for (let i = 0; i < m; i++) {
        const a = (i + (odd ? 0.5 : 0)) * (TAU / m)
        out.push({ x: d.cx + r * Math.cos(a), y, z: d.cz + r * Math.sin(a), ry: -(a + Math.PI / 2), sx: ((TAU * r) / m) * 1.05, sy: ch * 0.94, sz: kit.bt, side: Math.floor((((a + Math.PI / 4) % TAU) + TAU) % TAU / (Math.PI / 2)) % 4, course: k, along: a })
      }
    }
  }
  return out
}

// all the bricks of all walls, with a kit made bigger if there would be too many
export function allBricks(walls, kit) {
  let k = kit
  for (let tries = 0; tries < 6; tries++) {
    const list = walls.flatMap((w, wi) => wallBricks(w, k).map((b) => ({ ...b, wall: wi })))
    if (list.length <= MAX_BRICKS) return { bricks: list, kit: k }
    const s = Math.sqrt(list.length / MAX_BRICKS) * 1.04
    k = { ...k, bl: k.bl * s, ch: k.ch * s }
  }
  return { bricks: walls.flatMap((w, wi) => wallBricks(w, k).map((b) => ({ ...b, wall: wi }))), kit: k }
}

// a piece that is not a wall: how it gets in place
export function pieceMode(p) {
  const big = Math.max(p.w || 0, p.d || 0, p.rt || 0, p.rb || 0, p.h)
  if (p.kind === 'box' && p.h < 0.3 && Math.min(p.w, p.d) >= 1.2 && p.bottom < 0.4) return 'pour' // a foundation slab: poured on the ground
  return big >= 0.45 || p.kind === 'other' && big >= 0.4 ? 'crane' : 'hand'
}

export const CRANE_TIME = 2.3 // fetch, hoist, swing across, lower
export const HAND_TIME = 0.45
export const POUR_TIME = 1.3
export const LIFT_OFF = 1.1 // the old roof goes up and away

// when everything happens. times are seconds from the start; 'speed' > 1 when more levels are waiting behind this one.
export function timeline(plan, kit, speed = 1) {
  const sp = Math.max(1, speed)
  const { bricks, kit: used } = allBricks(plan.walls, kit)

  // lift the old roof off first
  const removes = plan.removed.map((o) => ({ d: o, start: 0.5 / sp, dur: LIFT_OFF / sp }))
  const offDone = removes.length ? (0.5 + LIFT_OFF) / sp : 0
  const brickStart = offDone + 0.7 / sp // then the scaffold goes up

  // bricks, course by course (a course is finished by everybody before the next one starts), each bricklayer on his own side
  const perSide = [0, 0, 0, 0]
  for (const b of bricks) perSide[b.side]++
  const dt = Math.max(0.012, Math.min(0.11, BRICK_PHASE / Math.max(1, ...perSide))) / sp
  const flight = Math.min(0.16, dt * 2.2 + 0.05)
  const level = (b) => Math.round(b.y / used.ch)
  const order = [...bricks].sort((a, b) => level(a) - level(b) || a.side - b.side || a.along - b.along)
  const courseEnd = [] // [height of the top of the course, time it is finished]
  let t = brickStart
  for (let i = 0; i < order.length;) {
    const lv = level(order[i])
    let j = i
    while (j < order.length && level(order[j]) === lv) j++
    const count = [0, 0, 0, 0]
    let top = 0
    for (let k = i; k < j; k++) {
      const b = order[k]
      b.start = t + count[b.side]++ * dt
      b.land = b.start + flight
      top = Math.max(top, b.y + (b.sy / 0.94) / 2)
    }
    t += Math.max(...count) * dt + 0.03 / sp
    courseEnd.push([top, t + flight]) // finished once the last brick of it has landed
    i = j
  }
  order.sort((a, b) => a.land - b.land)
  const lastBrick = order.length ? order[order.length - 1].land : brickStart

  // pieces that are not walls: they wait for the walls under them
  const readyAt = (p) => {
    for (const [top, at] of courseEnd) if (top >= p.bottom - 0.05) return at
    return courseEnd.length ? courseEnd[courseEnd.length - 1][1] : brickStart
  }
  const wallBottom = plan.walls.length ? Math.min(...plan.walls.map((w) => w.from)) : 0
  const pieces = [...plan.pieces].sort((a, b) => a.bottom - b.bottom).map((p) => ({ d: p, mode: pieceMode(p) }))
  let craneFree = offDone
  let handFree = [offDone, offDone]
  for (const p of pieces) {
    const ready = p.mode === 'pour' ? offDone : readyAt(p.d) // a slab is poured at once, the rest waits until the walls beneath it stand
    if (p.mode === 'crane') { p.start = Math.max(ready, craneFree); p.dur = CRANE_TIME / sp; craneFree = p.start + p.dur }
    else if (p.mode === 'hand') { const w = handFree[0] <= handFree[1] ? 0 : 1; p.start = Math.max(ready, handFree[w]); p.dur = HAND_TIME / sp; handFree[w] = p.start + p.dur; p.by = w }
    else { p.start = ready; p.dur = POUR_TIME / sp }
  }
  const piecesEnd = pieces.reduce((m, p) => Math.max(m, p.start + p.dur), 0)

  // the painters follow the bricklayers up, one floor behind, then finish the top
  const topAll = plan.walls.length ? Math.max(...plan.walls.map((w) => w.to)) : 0
  const sweepFrom = lastBrick
  const sweepTime = Math.max(0.6, (topAll - wallBottom) * 0.12) / sp
  const claddingEnd = sweepFrom + sweepTime
  const end = Math.max(piecesEnd, claddingEnd) + 0.9 / sp // the scaffold comes down

  return { bricks: order, kit: used, removes, pieces, courseEnd, brickStart, lastBrick, wallBottom, topAll, sweepFrom, sweepTime, claddingEnd, end, dt, flight, perSide, speed: sp }
}

// how high the finished wall shows at time t: it follows the bricklayers by 'lag', then finishes the top
export function claddingHeight(tl, t, lag = 0.9) {
  if (t < tl.brickStart) return tl.wallBottom
  let top = tl.wallBottom
  for (const [h, at] of tl.courseEnd) { if (at <= t) top = h; else break }
  if (t >= tl.lastBrick) {
    const f = Math.min(1, Math.max(0, (t - tl.sweepFrom) / tl.sweepTime))
    return Math.max(top - lag, tl.wallBottom) + (tl.topAll - Math.max(top - lag, tl.wallBottom)) * f
  }
  return Math.max(tl.wallBottom, top - lag)
}

// the bricklayers' kits, per map (sizes are in the units of the building model)
export const KITS = {
  city: { bl: 0.3, ch: 0.14, bt: 0.16, shape: 'brick' },
  lego: { bl: 0.34, ch: 0.17, bt: 0.2, shape: 'lego' },
  japan: { bl: 0.5, ch: 0.1, bt: 0.14, shape: 'plank' },
  ice: { bl: 0.3, ch: 0.22, bt: 0.2, shape: 'cube' },
  wire: { bl: 0.3, ch: 0.2, bt: 0.2, shape: 'cube' },
  court: { bl: 0.24, ch: 0.24, bt: 0.24, shape: 'ball' },
}
