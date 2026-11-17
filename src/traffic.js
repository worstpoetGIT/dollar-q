// who drives and walks where. cars and people follow the same few rules, so this file only works
// with plain objects (no three.js) and can be tested on its own.
//  - everything moves along a straight road with two lanes: t is how far along, lat is how far across
//  - you slow down for whatever is in front of you, so nothing ever runs into anything
//  - a slower one in front can be overtaken, but only when the other lane is empty for the whole pass
//  - cars take turns at the crossroad, people wait for a gap before they cross a road

const brake = (gap, a) => Math.sqrt(2 * a * Math.max(0, gap))
const other = (axis) => (axis === 'x' ? 'z' : 'x')
const pos = (m) => m.t * m.dir // 0 is the middle of the crossroad, it grows the way you are heading

export const STOP = 3.4 // cars wait this far from the middle of the crossroad
const BOX = 1.5 // half the width of a road

const CAR = { brake: 3.5, accel: 2.6, hard: 6.5, gap: 0.6, side: 0.15, shift: 1.6, look: 3, dv: 0.45, clear: 0.8, boost: 1.3, far: 13.6, edge: 15.2 }
const WALK = { brake: 2.2, accel: 1.4, hard: 4, gap: 0.3, side: 0.08, shift: 0.9, look: 0.9, dv: 0.15, clear: 0.35, boost: 1.25, far: 11.5, edge: 13.2, zone: 3.9 }

export const LANES = [1.8, 2.5] // where people walk, on each side of the crossroad

export const newCar = (hl, hw) => ({
  active: false, axis: 'x', road: 'x', lane: 0, alt: 0, lat: 0, goal: 0, dir: 1, t: 0, speed: 0, base: 2.6, hl, hw, passing: null, still: 0,
})

const GREEN = 4 // seconds a road keeps the crossroad before it has to share it

export function makeTraffic() {
  return { tok: { axis: null, last: 'z', hold: null, age: 0 }, busy: { x: 0, z: 0 }, want: { x: false, z: false }, locks: new Map() }
}

// ---------- shared by cars and people ----------

// how fast i may go so that i can still stop behind whatever is ahead of me
function followLimit(m, movers, cfg) {
  let lim = Infinity
  for (const o of movers) {
    if (o === m || !o.active || o.road !== m.road) continue
    const ahead = (o.t - m.t) * m.dir
    if (ahead <= 0) continue
    if (Math.min(Math.abs(o.lat - m.lat), Math.abs(o.goal - m.lat)) >= m.hw + o.hw + cfg.side) continue
    const gap = ahead - m.hl - o.hl - cfg.gap
    if (o.dir === m.dir) lim = Math.min(lim, brake(gap, cfg.brake))
    else if (o.passing && !m.passing) lim = Math.min(lim, Math.sqrt(o.speed * o.speed + 2 * cfg.brake * Math.max(0, gap)) - o.speed) // somebody overtaking comes at me: i give way
    else lim = Math.min(lim, brake(gap / 2, cfg.brake))
  }
  return lim
}

// is there a slower one right in front, and is the other lane free for long enough to get past?
function passPlan(m, movers, cfg) {
  const p = (o) => o.t * m.dir
  let lead = null
  for (const o of movers) {
    if (o === m || !o.active || o.road !== m.road || o.dir !== m.dir || p(o) <= p(m)) continue
    if (Math.abs(o.lat - m.lane) >= m.hw + o.hw + cfg.side) continue
    if (!lead || p(o) < p(lead)) lead = o
  }
  if (!lead) return null
  const gap = p(lead) - lead.hl - (p(m) + m.hl)
  const fast = m.base * cfg.boost
  if (gap > cfg.look || m.base - lead.speed < cfg.dv) return null

  const start = p(m) - m.hl
  const cover = p(lead) + lead.hl + cfg.clear - start
  const time = cover / (fast - lead.speed) + Math.abs(m.lane - m.alt) / cfg.shift
  const end = p(m) + m.hl + fast * time
  if (end > cfg.far) return null

  const near = m.hw + cfg.side
  for (const o of movers) {
    if (o === m || o === lead || !o.active || o.road !== m.road) continue
    const inAlt = Math.min(Math.abs(o.lat - m.alt), Math.abs(o.goal - m.alt)) < near + o.hw
    if (o.dir !== m.dir) {
      if (!inAlt || p(o) - o.hl < start) continue // not in my way, or already behind me
      if (p(o) - o.hl - o.base * time < end + 1) return null // it would reach me before i am done
    } else {
      if (inAlt && p(o) + o.hl > start - 1 && p(o) - o.hl < end + 1) return null
      const inHome = Math.abs(o.lat - m.lane) < near + o.hw
      if (inHome && p(o) > p(lead) && p(o) - o.hl - (p(lead) + lead.hl) < 2 * m.hl + 2 * cfg.clear) return null // no room to pull back in
    }
  }
  return { lead, start, end }
}

// start a pass when one is possible, finish it (go back to my own lane) once i am clear of the one i passed
function updatePass(m, movers, cfg, canStart) {
  const p = (o) => o.t * m.dir
  if (m.passing) {
    const lead = m.passing
    const ahead = p(m) - m.hl - (p(lead) + lead.hl) > cfg.clear
    const behind = p(lead) - lead.hl - (p(m) + m.hl) > cfg.clear
    if (!lead.active || ahead || behind) { m.passing = null; m.goal = m.lane }
    return
  }
  if (m.goal !== m.lane || Math.abs(m.lat - m.lane) > 0.01) return
  const plan = passPlan(m, movers, cfg)
  if (plan && canStart(plan)) { m.passing = plan.lead; m.goal = m.alt }
}

// move sideways towards the lane i want, unless somebody is right there
function slide(m, movers, cfg, dt) {
  const want = m.goal - m.lat
  if (Math.abs(want) < 1e-4) return
  const next = m.lat + Math.max(-cfg.shift * dt, Math.min(cfg.shift * dt, want))
  for (const o of movers) {
    if (o === m || !o.active || o.road !== m.road) continue
    if (Math.abs(o.t - m.t) < m.hl + o.hl + 0.1 && Math.abs(o.lat - next) < m.hw + o.hw + cfg.side) return
  }
  m.lat = next
}

const approach = (m, lim, cfg, dt) => (m.speed < lim ? Math.min(lim, m.speed + cfg.accel * dt) : Math.max(lim, m.speed - cfg.hard * dt))

// ---------- cars ----------

const toLine = (c) => -STOP - (pos(c) + c.hl) // how far the nose is from the stop line (negative once it is over)
const inCrossroad = (c) => toLine(c) < 0 && pos(c) - c.hl < BOX + 0.15
const committed = (c) => toLine(c) >= 0 && toLine(c) < (c.speed * c.speed) / (2 * CAR.hard) + 0.1 // too close to stop even with the brakes on full

// the crossroad belongs to one road at a time. the other one waits at its line.
function updateToken(cars, tr, dt) {
  const busy = { x: 0, z: 0 }, want = { x: false, z: false }
  for (const c of cars) {
    if (!c.active) continue
    if (inCrossroad(c) || committed(c)) busy[c.axis]++
    else if (toLine(c) >= 0 && toLine(c) < 12) want[c.axis] = true
  }
  const tok = tr.tok
  if (tok.hold && (!tok.hold.active || !tok.hold.passing)) tok.hold = null
  if (tok.hold) tok.axis = tok.hold.axis
  else {
    tok.age += dt
    const done = tok.age >= GREEN || !want[tok.axis]
    if (tok.axis && busy[tok.axis] === 0 && want[other(tok.axis)] && done) tok.axis = null
    if (!tok.axis && (want.x || want.z)) {
      tok.axis = want.x && want.z ? other(tok.last) : want.x ? 'x' : 'z'
      tok.age = 0
    }
    if (tok.axis) tok.last = tok.axis
  }
  tr.busy = busy
  tr.want = want
}

function stepCar(c, cars, walkers, tr, dt) {
  const tok = tr.tok
  updatePass(c, cars, CAR, (plan) => {
    const onCrossroad = plan.end > -STOP - 0.3 && plan.start < BOX + 0.3
    if (!onCrossroad) return true
    const o = other(c.axis)
    if (tok.hold || tr.busy[o] || tr.want[o]) return false
    tok.hold = c // nobody crosses while i am getting past
    tok.axis = c.axis
    return true
  })

  let lim = c.passing ? c.base * CAR.boost : c.base
  lim = Math.min(lim, followLimit(c, cars, CAR))

  const go = (c.passing && tok.hold === c) || inCrossroad(c) || committed(c) || toLine(c) < 0 || (tok.axis === c.axis && (!tr.want[other(c.axis)] || tok.age < GREEN))
  if (!go) lim = Math.min(lim, brake(toLine(c) - 0.2, CAR.brake))

  for (const w of walkers) { // people on the road have the right of way
    if (!w.crossing || w.axis === c.axis) continue
    const at = c.dir * w.lat
    if (pos(c) - c.hl > at + 0.4) continue
    lim = Math.min(lim, brake(at - 0.4 - (pos(c) + c.hl) - 0.5, CAR.brake))
  }

  c.speed = approach(c, lim, CAR, dt)
  slide(c, cars, CAR, dt)
  c.t += c.dir * c.speed * dt
  c.still = c.speed < 0.03 ? c.still + dt : 0
  if (pos(c) - c.hl > CAR.edge || c.still > 25) { c.active = false; c.passing = null }
}

// room for a car at its spot: nobody close in the same lane, nobody overtaking into it
function roomFor(c, cars) {
  for (const o of cars) {
    if (o === c || !o.active || o.road !== c.road) continue
    if (o.passing && Math.abs(o.goal - c.lane) < 0.1) return false
    const sameLane = Math.min(Math.abs(o.lat - c.lane), Math.abs(o.goal - c.lane)) < c.hw + o.hw + CAR.side
    if (sameLane && Math.abs(o.t - c.t) < c.hl + o.hl + 3) return false
  }
  return true
}

// put one car from the pool on the road: at the far end, or (for the first few) somewhere in the middle
export function spawnCar(cars, rng, anywhere = false) {
  const free = cars.filter((c) => !c.active)
  if (!free.length) return null
  const c = free[Math.floor(rng() * free.length)]
  const axis = rng() > 0.5 ? 'x' : 'z'
  const lane = rng() > 0.5 ? 0.75 : -0.75
  const dir = axis === 'x' ? (lane > 0 ? 1 : -1) : (lane > 0 ? -1 : 1)
  let p = -(CAR.edge + c.hl)
  if (anywhere) {
    const before = [-(CAR.far - 1), -(STOP + 0.4 + c.hl)] // between the end of the road and the stop line
    const after = [BOX + 0.4 + c.hl, CAR.far - 1 - c.hl]
    const [a, b] = rng() > 0.5 ? before : after
    if (b <= a) return null
    p = a + rng() * (b - a)
  }
  Object.assign(c, { active: true, axis, road: axis, lane, alt: -lane, lat: lane, goal: lane, dir, t: dir * p, base: 2 + rng() * 1.6, passing: null, still: 0 })
  c.speed = c.base
  if (!roomFor(c, cars)) { c.active = false; return null }
  return c
}

// ---------- people ----------

const wLane = (side, dir) => side * (dir > 0 ? LANES[0] : LANES[1]) // opposite ways use different lanes
const wAlt = (side, dir) => side * (dir > 0 ? LANES[1] : LANES[0])

function setLane(w) {
  w.lane = wLane(w.side, w.dir)
  w.alt = wAlt(w.side, w.dir)
  w.goal = w.lane
}

// n people spread over the four footpaths along the roads
export function placeWalkers(n, rng) {
  const out = []
  for (let i = 0; i < n; i++) {
    const axis = i % 2 ? 'x' : 'z'
    const side = i % 4 < 2 ? 1 : -1
    const dir = rng() > 0.5 ? 1 : -1
    const w = { id: i, active: true, axis, side, road: axis + side, dir, t: 0, speed: 0, base: 0.55 + rng() * 0.5, hl: 0.3, hw: 0.28, lat: 0, passing: null, crossing: false, held: new Set(), still: 0 }
    setLane(w)
    w.lat = w.lane
    for (let tries = 0; tries < 30; tries++) {
      w.t = (rng() > 0.5 ? 1 : -1) * (4.5 + rng() * 8)
      if (!out.some((o) => o.road === w.road && Math.abs(o.t - w.t) < 1.6)) break
    }
    w.speed = w.base
    out.push(w)
  }
  return out
}

// each corner next to the crossroad is shared by one footpath of each road. only one road at a time.
const ZONES = [{ key: 'road', a: -1.8, b: 1.8 }, { s: -1, a: -3.4, b: -0.9 }, { s: 1, a: 0.9, b: 3.4 }]

function cornerKey(w, s) {
  return w.axis === 'x' ? s + ',' + w.side : w.side + ',' + s
}

// can i step onto the road here without a car getting to me?
function gapInTraffic(w, cars) {
  for (const c of cars) {
    if (!c.active || c.axis === w.axis) continue
    const at = c.dir * w.lat
    if (pos(c) - c.hl > at + 0.4) continue // already went past
    if (at - 0.4 - (pos(c) + c.hl) < (c.speed * c.speed) / (2 * CAR.brake) + 0.6) return false
  }
  return true
}

function takeCorner(w, key, tr, force) {
  const lock = tr.locks.get(key)
  if (!lock || lock.n === 0) { tr.locks.set(key, { axis: w.axis, n: 1 }); return true }
  if (lock.axis === w.axis || force) { lock.n++; return true }
  return false
}

// how fast i may go so that i stop at the edge of a corner or a road i am not allowed into yet
function zoneLimit(w, cars, tr) {
  let lim = Infinity
  const lo = w.t - w.hl, hi = w.t + w.hl
  for (const z of ZONES) {
    const inside = hi > z.a && lo < z.b
    const toEdge = w.dir > 0 ? z.a - hi : lo - z.b
    const key = z.key || cornerKey(w, z.s)
    const has = w.held.has(key)
    if (inside || (toEdge >= 0 && toEdge < 0.5)) {
      if (has) continue
      const ok = z.key ? gapInTraffic(w, cars) : takeCorner(w, key, tr, false)
      if (ok || inside) {
        if (!z.key && !ok) takeCorner(w, key, tr, true)
        w.held.add(key)
      } else lim = Math.min(lim, brake(toEdge - 0.15, WALK.brake)) // stop just short of it
    } else if (has) {
      if (!z.key) tr.locks.get(key).n--
      w.held.delete(key)
    }
  }
  w.crossing = w.held.has('road')
  return lim
}

function turnAround(w) {
  w.dir = -w.dir
  w.t = Math.max(-WALK.edge, Math.min(WALK.edge, w.t))
  w.passing = null
  w.still = 0
  setLane(w)
}

function stepWalker(w, walkers, cars, tr, dt) {
  updatePass(w, walkers, WALK, (plan) => plan.end < WALK.far && (plan.start > WALK.zone || plan.end < -WALK.zone))
  let lim = w.passing ? w.base * WALK.boost : w.base
  lim = Math.min(lim, followLimit(w, walkers, WALK), zoneLimit(w, cars, tr))
  w.speed = approach(w, lim, WALK, dt)
  slide(w, walkers, WALK, dt)
  w.t += w.dir * w.speed * dt
  w.still = w.speed < 0.03 ? w.still + dt : 0
  if (Math.abs(w.t) > WALK.edge || w.still > 20) turnAround(w)
}

// ---------- one step for everybody ----------

export function stepTraffic(cars, walkers, tr, dt) {
  for (const w of walkers) stepWalker(w, walkers, cars, tr, dt)
  updateToken(cars, tr, dt)
  for (const c of cars) if (c.active) stepCar(c, cars, walkers, tr, dt)
}
