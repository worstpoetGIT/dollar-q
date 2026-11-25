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
  const holes = openingsOf(wall)
  const inHole = (side, c0, len, y, hgt) => holes.some((o) => o.side === side && Math.min(c0 + len / 2, o.a1) - Math.max(c0 - len / 2, o.a0) > len * 0.4 && Math.min(y + hgt / 2, o.y1) - Math.max(y - hgt / 2, o.y0) > hgt * 0.4)
  const n = Math.max(1, Math.round((wall.to - wall.from) / kit.ch))
  const ch = (wall.to - wall.from) / n
  const out = []
  const inset = kit.bt / 2 + 0.02 // the outer face stays just inside the finished wall, so the finished wall covers it
  for (let k = 0; k < n; k++) {
    const y = wall.from + (k + 0.5) * ch
    const odd = k % 2 === 1
    if (d.kind === 'box') {
      for (const { c, len } of row(d.w, kit.bl, odd)) { // (a gap is left wherever a window goes)
        if (!inHole(0, d.cx + c, len, y, ch)) out.push({ x: d.cx + c, y, z: d.cz + d.d / 2 - inset, ry: 0, sx: len, sy: ch * 0.94, sz: kit.bt, side: 0, course: k, along: c })
        if (!inHole(2, d.cx + c, len, y, ch)) out.push({ x: d.cx + c, y, z: d.cz - d.d / 2 + inset, ry: 0, sx: len, sy: ch * 0.94, sz: kit.bt, side: 2, course: k, along: c })
      }
      for (const { c, len } of row(d.d - 2 * kit.bt, kit.bl, odd)) {
        if (!inHole(1, d.cz + c, len, y, ch)) out.push({ x: d.cx + d.w / 2 - inset, y, z: d.cz + c, ry: Math.PI / 2, sx: len, sy: ch * 0.94, sz: kit.bt, side: 1, course: k, along: c })
        if (!inHole(3, d.cz + c, len, y, ch)) out.push({ x: d.cx - d.w / 2 + inset, y, z: d.cz + c, ry: Math.PI / 2, sx: len, sy: ch * 0.94, sz: kit.bt, side: 3, course: k, along: c })
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

// ---------- windows ----------
// a wall with windows (the classic buildings) is built with gaps where the windows go, and the windows are fitted afterwards.
// where they go is the same grid the finished wall's texture has: 'floors' rows and 'cols' columns, a window in the middle of each cell.
export function openingsOf(wall) {
  const d = wall.d
  const w = d.win
  if (!w || d.kind !== 'box') return []
  const H = d.top - d.bottom
  const rows = w.floors, cols = w.cols
  const px = Math.max(10, Math.min(56, Math.floor(2000 / rows))) // (the texture's cell height in pixels, as windowTex works it out)
  const out = []
  for (let r = 0; r < rows; r++) {
    const y1 = d.top - ((r * px + 12) / (rows * px)) * H
    const y0 = d.top - ((r * px + px - 12) / (rows * px)) * H
    if (y0 < wall.from - 1e-6 || y1 > wall.to + 1e-6) continue // the part that already stands keeps its windows
    for (let k = 0; k < cols; k++) {
      const u0 = (k * 64 + 14) / (cols * 64), u1 = (k * 64 + 50) / (cols * 64)
      for (let side = 0; side < 4; side++) {
        const x = side % 2 === 0
        const c = x ? d.cx : d.cz, len = x ? d.w : d.d
        out.push({ side, a0: c + (u0 - 0.5) * len, a1: c + (u1 - 0.5) * len, y0, y1 })
      }
    }
  }
  return out
}

// the window panes to fit (one for every opening), lowest first
export function windowPanes(walls) {
  const out = []
  for (const wall of walls) {
    const d = wall.d
    for (const o of openingsOf(wall)) {
      const mid = (o.a0 + o.a1) / 2, width = o.a1 - o.a0
      const sx = o.side % 2 === 0 ? width : 0.025, sz = o.side % 2 === 0 ? 0.025 : width
      const x = o.side === 1 ? d.cx + d.w / 2 + 0.006 : o.side === 3 ? d.cx - d.w / 2 - 0.006 : mid
      const z = o.side === 0 ? d.cz + d.d / 2 + 0.006 : o.side === 2 ? d.cz - d.d / 2 - 0.006 : mid
      out.push({ x, y: (o.y0 + o.y1) / 2, z, sx, sy: o.y1 - o.y0, sz, top: o.y1, glass: d.win.glass })
    }
  }
  return out.sort((a, b) => a.y - b.y)
}

// ---------- the frame ----------
export const FLOOR_H = 1.3

// columns, beams and a floor deck for every floor of a wall (only the part that is being built)
export function frameOf(wall) {
  const d = wall.d
  const H = wall.to - wall.from
  const n = Math.max(1, Math.round(H / FLOOR_H))
  const lh = H / n
  const box = d.kind === 'box'
  const hw = box ? d.w / 2 : Math.max(d.rt, d.rb), hd = box ? d.d / 2 : hw
  const inset = 0.16
  const cols = box
    ? [[-1, -1], [1, -1], [-1, 1], [1, 1], ...(hw > 1.25 ? [[0, -1], [0, 1]] : [])].map(([a, b]) => [d.cx + a * (hw - inset), d.cz + b * (hd - inset)])
    : [0, 1, 2, 3, 4, 5].map((k) => [d.cx + Math.cos((k * Math.PI) / 3) * (hw - inset), d.cz + Math.sin((k * Math.PI) / 3) * (hw - inset)])
  const parts = []
  for (let i = 1; i <= n; i++) {
    const y0 = wall.from + (i - 1) * lh, y1 = wall.from + i * lh
    for (const [x, z] of cols) parts.push({ type: 'col', level: i, x, y: (y0 + y1) / 2, z, w: 0.1, h: lh, d: 0.1, color: 0x8a8f99 })
    if (box) {
      for (const s of [-1, 1]) {
        parts.push({ type: 'beam', level: i, x: d.cx, y: y1 - 0.04, z: d.cz + s * (hd - inset), w: 2 * (hw - inset), h: 0.07, d: 0.07, color: 0x6b7280 })
        parts.push({ type: 'beam', level: i, x: d.cx + s * (hw - inset), y: y1 - 0.04, z: d.cz, w: 0.07, h: 0.07, d: 2 * (hd - inset), color: 0x6b7280 })
      }
    }
    parts.push({ type: 'deck', level: i, x: d.cx, y: y1 - 0.035, z: d.cz, w: 2 * (hw - inset - 0.05), h: 0.07, d: 2 * (hd - inset - 0.05), color: 0xb8b2a6 })
  }
  return { levels: n, lh, from: wall.from, parts }
}

// ---------- the site ----------
// a building that starts on the ground gets a fence, a pit that is dug and a footing that is poured. (a floor on top of one that stands does not)
export function siteOf(walls) {
  const ground = walls.filter((w) => !w.grown && w.from < 0.3)
  if (!ground.length) return null
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const w of ground) {
    const d = w.d
    const rx = d.kind === 'box' ? d.w / 2 : Math.max(d.rt, d.rb), rz = d.kind === 'box' ? d.d / 2 : Math.max(d.rt, d.rb)
    x0 = Math.min(x0, d.cx - rx); x1 = Math.max(x1, d.cx + rx); z0 = Math.min(z0, d.cz - rz); z1 = Math.max(z1, d.cz + rz)
  }
  const fence = []
  const o = 0.95
  const run = (a0, a1, fix, alongX) => {
    const n = Math.max(2, Math.round((a1 - a0) / 0.8))
    for (let i = 0; i < n; i++) {
      const c = a0 + ((i + 0.5) * (a1 - a0)) / n, w = ((a1 - a0) / n) * 0.92
      fence.push({ type: 'fence', x: alongX ? c : fix, y: 0.25, z: alongX ? fix : c, w: alongX ? w : 0.04, h: 0.5, d: alongX ? 0.04 : w, color: 0xff8c1a })
    }
  }
  run(x0 - o, x1 + o, z1 + o, true); run(x0 - o, x1 + o, z0 - o, true); run(z0 - o, z1 + o, x0 - o, false); run(z0 - o, z1 + o, x1 + o, false)
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  return {
    fence,
    pit: { type: 'pit', x: cx, y: 0.03, z: cz, w: x1 - x0 + 0.7, h: 0.06, d: z1 - z0 + 0.7, color: 0x4a3a2a },
    footing: { type: 'footing', x: cx, y: 0.1, z: cz, w: x1 - x0 + 0.4, h: 0.1, d: z1 - z0 + 0.4, color: 0xbdbdbd },
  }
}

export const CRANE_TIME = 2.3 // fetch, hoist, swing across, lower
export const HAND_TIME = 0.45
export const POUR_TIME = 1.3
export const LIFT_OFF = 1.1 // the old roof goes up and away

// when everything happens. times are seconds from the start; 'speed' > 1 when more levels are waiting behind this one.
// order: old roof off, fence + pit + footing, frame floor by floor (the crane lays the decks), walls (bricks), windows, roof (crane), paint from the top down, scaffold off
export function timeline(plan, kit, speed = 1) {
  const sp = Math.max(1, speed)
  const { bricks, kit: used } = allBricks(plan.walls, kit)

  const removes = plan.removed.map((o) => ({ d: o, start: 0.5 / sp, dur: LIFT_OFF / sp }))
  const offDone = removes.length ? (0.5 + LIFT_OFF) / sp : 0

  // the site
  const site = siteOf(plan.walls)
  let siteEnd = offDone
  if (site) {
    const s0 = offDone + 0.2 / sp
    site.fence.forEach((f, i) => { f.mode = 'hand'; f.start = s0 + (i * 0.04) / sp; f.dur = 0.3 / sp })
    const fenced = Math.max(...site.fence.map((f) => f.start + f.dur)) // the fence is up, then the digging starts
    Object.assign(site.pit, { mode: 'pour', start: fenced + 0.1 / sp, dur: 0.9 / sp })
    Object.assign(site.footing, { mode: 'pour', start: site.pit.start + site.pit.dur, dur: 1.0 / sp })
    siteEnd = site.footing.start + site.footing.dur
  }

  // the frame, one floor after the other: columns rise, beams go in, the crane lays the deck
  let craneFree = offDone
  const levels = []
  plan.walls.forEach((w, wi) => {
    const f = frameOf(w)
    for (let i = 1; i <= f.levels; i++) levels.push({ wi, top: f.from + i * f.lh, parts: f.parts.filter((p) => p.level === i) })
  })
  levels.sort((a, b) => a.top - b.top || a.wi - b.wi)
  const frame = []
  const levelDone = [] // [height of the top of the floor, time its frame is done]
  let frameT = siteEnd
  for (const L of levels) {
    const t0 = frameT
    let done = t0
    let b = 0
    for (const p of L.parts) {
      if (p.type === 'col') Object.assign(p, { mode: 'pour', start: t0, dur: 0.5 / sp })
      else if (p.type === 'beam') Object.assign(p, { mode: 'hand', start: t0 + (0.3 + b++ * 0.06) / sp, dur: 0.35 / sp })
      else { Object.assign(p, { mode: 'crane', start: Math.max(t0 + 0.55 / sp, craneFree), dur: 1.3 / sp }); craneFree = p.start + p.dur }
      done = Math.max(done, p.start + p.dur)
      frame.push(p)
    }
    levelDone.push([L.top, done])
    frameT = t0 + 0.9 / sp
  }
  const frameDoneAt = (y) => {
    for (const [top, at] of levelDone) if (top >= y - 0.05) return at
    return levelDone.length ? levelDone[levelDone.length - 1][1] : siteEnd
  }
  const brickStart = (levelDone.length ? levelDone[0][1] : siteEnd) + 0.2 / sp // the scaffold goes up as the first floor is framed

  // bricks, course by course (a course is finished by everybody before the next one starts), each bricklayer on his own side;
  // a course waits until the frame of its floor is up
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
    for (let k = i; k < j; k++) top = Math.max(top, order[k].y + (order[k].sy / 0.94) / 2)
    t = Math.max(t, frameDoneAt(top))
    for (let k = i; k < j; k++) {
      const b = order[k]
      b.start = t + count[b.side]++ * dt
      b.land = b.start + flight
    }
    t += Math.max(...count) * dt + 0.03 / sp
    courseEnd.push([top, t + flight]) // finished once the last brick of it has landed
    i = j
  }
  order.sort((a, b) => a.land - b.land)
  const lastBrick = order.length ? order[order.length - 1].land : brickStart
  const readyAt = (bottom) => {
    for (const [top, at] of courseEnd) if (top >= bottom - 0.05) return at
    return courseEnd.length ? courseEnd[courseEnd.length - 1][1] : brickStart
  }

  // the windows go into their gaps, from the bottom up, once the wall above them is laid
  const panes = windowPanes(plan.walls)
  const winGap = Math.max(0.02, Math.min(0.25, 7 / Math.max(1, panes.length))) / sp
  let winT = 0
  for (const p of panes) {
    p.start = Math.max(readyAt(p.top), winT)
    p.dur = 0.2 / sp
    winT = p.start + winGap
  }
  const windowsEnd = panes.length ? panes[panes.length - 1].start + panes[panes.length - 1].dur : 0

  // pieces that are not walls (roof, dome, slabs, doors): they wait for the walls under them
  const wallBottom = plan.walls.length ? Math.min(...plan.walls.map((w) => w.from)) : 0
  const pieces = [...plan.pieces].sort((a, b) => a.bottom - b.bottom).map((p) => ({ d: p, mode: pieceMode(p) }))
  let handFree = [offDone, offDone]
  for (const p of pieces) {
    const ready = p.mode === 'pour' ? offDone : readyAt(p.d.bottom) // a slab is poured at once, the rest waits until the walls beneath it stand
    if (p.mode === 'crane') { p.start = Math.max(ready, craneFree); p.dur = CRANE_TIME / sp; craneFree = p.start + p.dur }
    else if (p.mode === 'hand') { const w = handFree[0] <= handFree[1] ? 0 : 1; p.start = Math.max(ready, handFree[w]); p.dur = HAND_TIME / sp; handFree[w] = p.start + p.dur; p.by = w }
    else { p.start = ready; p.dur = POUR_TIME / sp }
  }
  const piecesEnd = pieces.reduce((m, p) => Math.max(m, p.start + p.dur), 0)

  // painting starts at the top once everything else is in, and works its way down
  const topAll = plan.walls.length ? Math.max(...plan.walls.map((w) => w.to)) : 0
  const paintStart = Math.max(lastBrick, windowsEnd, piecesEnd)
  const paintTime = Math.max(0.8, (topAll - wallBottom) * 0.15) / sp
  const paintEnd = paintStart + (plan.walls.length ? paintTime : 0)
  const end = Math.max(paintEnd, piecesEnd) + 0.9 / sp // the scaffold comes down

  return { bricks: order, kit: used, removes, site, frame, panes, pieces, courseEnd, brickStart, lastBrick, windowsEnd, wallBottom, topAll, paintStart, paintTime, paintEnd, end, dt, flight, perSide, speed: sp, scaffoldAt: siteEnd }
}

// the lower edge of the finished (painted) wall at time t: it starts above the top, and the painters bring it down to the bottom
export function paintEdge(tl, t) {
  if (t < tl.paintStart) return tl.topAll + 0.6
  const f = Math.min(1, (t - tl.paintStart) / tl.paintTime)
  return tl.topAll - (tl.topAll - tl.wallBottom) * f
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
