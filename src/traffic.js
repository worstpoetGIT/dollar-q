// who drives and walks where. cars and people follow the same few rules, so this file only works
// with plain objects (no three.js) and can be tested on its own.
//  - everything moves along a straight road with two lanes: t is how far along, lat is how far across
//  - you slow down for whatever is in front of you, so nothing ever runs into anything
//  - a slower one in front can be overtaken, but only when the other lane is empty for the whole pass
//  - a traffic signal in the middle of the crossroad decides who goes: when a road has green, its cars drive
//    and the people walking along it cross the other road. everybody else waits, people at the kerb.

const brake = (gap, a) => Math.sqrt(2 * a * Math.max(0, gap))
const other = (axis) => (axis === 'x' ? 'z' : 'x')
const pos = (m) => m.t * m.dir // 0 is the middle of the crossroad, it grows the way you are heading

export const STOP = 3.4 // cars wait this far from the middle of the crossroad
const BOX = 1.5 // half the width of a road

const CAR = { brake: 3.5, accel: 2.6, hard: 6.5, gap: 0.6, side: 0.15, shift: 1.6, look: 3, dv: 0.45, clear: 0.8, boost: 1.3, far: 13.6, edge: 15.2 }
const WALK = { brake: 2.2, accel: 1.4, hard: 4, gap: 0.3, side: 0, squeeze: 0.52, shift: 0.9, look: 0.9, dv: 0.15, clear: 0.35, boost: 1.5, far: 11.5, edge: 13.2, zone: 3.9 }

// the footpath along a road runs from the road edge to the coloured line round the lots beside it. the lines are
// 2.45 from the middle of the road (the lot is 4.9 across and its middle is 4.9 out) when a lot is fully grown, and
// further out while it is small, so a small lot leaves more room. people keep to two lanes and never stand on a line.
export const LOT_HALF = 2.45
export const LOT_SMALL = 0.85 // a lot size to assume when there is no lot to look at (1 is fully grown)

// how big a lot is for a county of this level. an empty lot is small, it grows quickly with the first expenses and then
// slower, and gets close to 1 only for a county with a lot of spending. so the more spent, the thinner the footpath beside it.
export const lotSize = (level) => Math.min(1, 0.55 + 0.45 * (1 - Math.exp(-Math.max(0, level) / 10)))
const LOT_MIDDLE = 4.9
const INNER = 1.68 // the lane next to the road
const SPACING = [0.528, 1.1] // how far the second lane is from the first: least (a big lot squeezes the footpath) and most (an empty or tiny lot leaves lots of room)
export const LANES = [INNER, INNER + SPACING[0]]

export const newCar = (hl, hw) => ({
  active: false, axis: 'x', road: 'x', lane: 0, alt: 0, lat: 0, goal: 0, dir: 1, t: 0, speed: 0, base: 2.6, hl, hw, passing: null, still: 0, crash: null,
  turn: 'straight', arc: null, // at the crossroad a car goes straight on, or turns left or right (arc: the curve it is on while it turns)
})

const LANE = 0.75 // how far a lane is from the middle of the road
const TURN_SPEED = { right: 1.5, left: 1.9 } // how fast a car takes its curve

// where a car is on the ground and which way it points (a heading vector), also while it is turning
export function carPose(c) {
  if (c.arc) return { x: c.arc.x, z: c.arc.z, hx: c.arc.hx, hz: c.arc.hz }
  return c.axis === 'x' ? { x: c.t, z: c.lat, hx: c.dir, hz: 0 } : { x: c.lat, z: c.t, hx: 0, hz: c.dir }
}

// ---------- a staged accident ----------
// the car behind drives up to the one in front until the bumpers touch (never through it), and both stay put until the crash is cleared.
// everybody else drives around them, or waits, like behind any slow car.
export function startCrash(front, rear) {
  front.crash = { role: 'front', other: rear, hit: false }
  rear.crash = { role: 'rear', other: front, hit: false }
  front.passing = rear.passing = null
}

export function endCrash(a, b) {
  for (const c of [a, b]) { c.crash = null; c.still = 0 }
}

// the space between the rear car's nose and the front car's tail (0 means touching)
export const crashGap = (rear, front) => (front.t - rear.t) * rear.dir - rear.hl - front.hl

const TOUCH = 0.03 // the little space left between two cars that have bumped

function stepCrash(c, dt) {
  const k = c.crash
  if (k.role === 'front') {
    c.speed = Math.max(0, c.speed - 14 * dt) // brakes hard
  } else if (!k.hit) {
    const gap = crashGap(c, k.other)
    if (gap <= TOUCH + 0.01) {
      c.speed = 0
      c.t = k.other.t - c.dir * (c.hl + k.other.hl + TOUCH)
      k.hit = k.other.crash.hit = true
      k.other.speed = 0
    } else {
      const target = Math.min(2.4, Math.max(0.45, gap * 2)) // slows down as it gets close
      c.speed += (target - c.speed) * Math.min(1, 6 * dt)
    }
  } else {
    c.speed = 0
  }
  c.t += c.dir * c.speed * dt
  c.still = 0 // a wreck is not an idle car: it is not cleared away
}

// how much longer the roads are than in the 12 county city (the city grows a second ring when there are more counties)
let reach = 0

const GREEN = 5 // seconds a road keeps its green before it has to give way (if somebody is waiting)
const YELLOW = 2.2 // every green ends with a yellow, cars that can still stop do, the others carry on through
const PLAZA = 3.5 // people cross the whole crossroad area, corners included, in one go

// the light: which road has it, and whether it is green, yellow or red for everybody (the short all-red in between)
export function makeTraffic(extra = 0) {
  reach = extra
  return { sig: { phase: 'x', axis: 'x', left: 0, mode: 'green', age: 0, hold: null }, busy: { x: 0, z: 0 }, want: { x: false, z: false }, lots: [] }
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
  if (end > cfg.far + reach) return null

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

// move sideways towards the lane i want. cars wait if somebody is right there. people back off to the lane they
// came from instead, so they never end up pressed up against somebody (two people turning round at the same time).
function slide(m, movers, cfg, dt) {
  const step = cfg.shift * dt
  const want = m.goal - m.lat
  const next = Math.abs(want) < 1e-4 ? m.lat : m.lat + Math.max(-step, Math.min(step, want))
  const near = (o) => o !== m && o.active && o.road === m.road && Math.abs(o.t - m.t) < m.hl + o.hl + (cfg.squeeze ? 0.5 : 0.1) // somebody beside me, or about to be
  if (cfg.squeeze) {
    // people: back away from whoever is too close sideways, and never move closer to anybody who already is (two on either side must not both push me)
    const beside = movers.filter((o) => near(o) && Math.abs(m.lat - o.lat) >= 0.15) // the same lane one behind the other is followLimit's job
    let to = next
    for (const o of beside) {
      if (Math.abs(to - o.lat) >= cfg.squeeze) continue
      const lo = Math.min(m.lane, m.alt, m.lat), hi = Math.max(m.lane, m.alt, m.lat) // never snap towards somebody (the lane may have just moved in)
      to = Math.max(lo, Math.min(hi, m.lat + Math.sign(m.lat - o.lat) * step))
      break
    }
    for (const o of beside) if (Math.abs(to - o.lat) < cfg.squeeze && Math.abs(to - o.lat) < Math.abs(m.lat - o.lat)) { to = m.lat; break }
    m.lat = to
    return
  }
  for (const o of movers) if (near(o) && Math.abs(o.lat - next) < m.hw + o.hw + cfg.side) return
  m.lat = next
}

const approach = (m, lim, cfg, dt) => (m.speed < lim ? Math.min(lim, m.speed + cfg.accel * dt) : Math.max(lim, m.speed - cfg.hard * dt))

// ---------- cars ----------

const toLine = (c) => -STOP - (pos(c) + c.hl) // how far the nose is from the stop line (negative once it is over)
const inCrossroad = (c) => toLine(c) < 0 && pos(c) - c.hl < BOX + 0.15
const committed = (c) => toLine(c) >= 0 && toLine(c) < (c.speed * c.speed) / (2 * CAR.hard) + 0.1 // too close to stop even with the brakes on full

// the signal has phases. a road's "through" phase lets straight cars, right turns and walking people go. a left turn gets an arrow of its own,
// one direction at a time, so a car turning left never crosses anybody coming the other way. the phases come round in this order, and ones
// nobody is waiting for are skipped. it only changes once the crossroad is empty (nobody is in it, nobody is too close to stop).
const PHASES = [
  { id: 'x', axis: 'x', left: 0 }, { id: 'xl+', axis: 'x', left: 1 }, { id: 'xl-', axis: 'x', left: -1 },
  { id: 'z', axis: 'z', left: 0 }, { id: 'zl+', axis: 'z', left: 1 }, { id: 'zl-', axis: 'z', left: -1 },
]
const LEFT_GREEN = 2.4 // seconds a left arrow stays on if somebody else is waiting
const LEFT_YELLOW = 1.3
const leftKey = (axis, dir) => axis + (dir > 0 ? '+' : '-')

function updateSignal(cars, walkers, tr, dt) {
  const busy = { x: 0, z: 0 }, want = { x: false, z: false }, wantLeft = { 'x+': false, 'x-': false, 'z+': false, 'z-': false }
  for (const c of cars) {
    if (!c.active || c.crash) continue // a wreck does not count as somebody waiting or crossing
    if (inCrossroad(c) || committed(c)) busy[c.axis]++
    else if (toLine(c) >= 0 && toLine(c) < 12) {
      if (c.turn === 'left') {
        // only the one at the head of its lane can use the arrow (the cars in front of it would be stuck at the red anyway)
        const head = !cars.some((o) => o !== c && o.active && !o.crash && o.axis === c.axis && o.dir === c.dir && Math.abs(o.lat - c.lat) < 0.4 && toLine(o) >= 0 && toLine(o) < toLine(c))
        if (head) wantLeft[leftKey(c.axis, c.dir)] = true
        else want[c.axis] = true // it waits for the through green like everybody else, and the straight cars ahead of it need that too
      } else want[c.axis] = true
    }
  }
  for (const w of walkers) {
    if (w.inPlaza) busy[w.axis]++
    else if (w.waiting) want[w.axis] = true
  }
  const sig = tr.sig
  const demand = (p) => (p.left ? wantLeft[leftKey(p.axis, p.left)] : want[p.axis])
  const here = PHASES.findIndex((p) => p.id === sig.phase)
  const elsewhere = PHASES.some((p, i) => i !== here && demand(p))
  sig.age += dt
  if (sig.hold && (!sig.hold.active || !sig.hold.passing)) sig.hold = null
  if (sig.hold) sig.mode = 'green' // somebody is overtaking through the crossroad, nobody else goes now
  else if (sig.mode === 'green') {
    const limit = PHASES[here].left ? LEFT_GREEN : GREEN
    if (elsewhere && !demand(PHASES[here]) && !busy[sig.axis] && sig.age >= 1) { sig.mode = 'yellow'; sig.age = 0 } // nobody here, hand over soon
    else if (elsewhere && sig.age >= limit) { sig.mode = 'yellow'; sig.age = 0 }
  } else if (sig.mode === 'yellow') {
    if (sig.age >= (sig.left ? LEFT_YELLOW : YELLOW) && !busy[sig.axis]) { sig.mode = 'red'; sig.age = 0 }
  } else if (sig.age >= 0.6) {
    let next = (here + 1) % PHASES.length
    for (let k = 1; k <= PHASES.length; k++) {
      const i = (here + k) % PHASES.length
      if (demand(PHASES[i])) { next = i; break }
    }
    const p = PHASES[next]
    sig.phase = p.id
    sig.axis = p.axis
    sig.left = p.left
    sig.mode = 'green'
    sig.age = 0
  }
  tr.busy = busy
  tr.want = want
}

// may this car go now? a left turn needs the arrow for its direction, everybody else needs the road's through phase
const allows = (sig, c) => sig.mode === 'green' && sig.phase === (c.turn === 'left' ? c.axis + 'l' + (c.dir > 0 ? '+' : '-') : c.axis)
const walkersGo = (sig, axis) => sig.mode === 'green' && sig.phase === axis // people only cross in a through phase

// ---------- turning ----------

// the curve through the crossroad: from where the car's middle is at the edge of the crossroad, to where it leaves on the other road.
// right is a small curve, left a wide one (it has to cross). a0 and a1 are the two directions from the centre of the curve, so the
// car is at centre + a0 cos(t) + a1 sin(t) for t from 0 to a quarter turn.
function turnArc(c) {
  const h = c.axis === 'x' ? [c.dir, 0] : [0, c.dir]
  const start = c.axis === 'x' ? [-c.dir * BOX, c.lat] : [c.lat, -c.dir * BOX]
  const side = c.turn === 'right' ? [-h[1], h[0]] : [h[1], -h[0]] // the way the car turns
  const R = c.turn === 'right' ? BOX - LANE : BOX + LANE
  const centre = [start[0] + side[0] * R, start[1] + side[1] * R]
  const newAxis = c.axis === 'x' ? 'z' : 'x'
  const dir2 = newAxis === 'z' ? side[1] : side[0]
  return {
    kind: c.turn, centre, R, a0: [start[0] - centre[0], start[1] - centre[1]], a1: [h[0] * R, h[1] * R], len: (R * Math.PI) / 2, s: 0,
    newAxis, dir2, lat2: newAxis === 'x' ? dir2 * LANE : -dir2 * LANE, x: start[0], z: start[1], hx: h[0], hz: h[1],
  }
}

// where on the curve a car is after driving s along it
function arcPoint(a, s) {
  const f = Math.min(s / a.R, Math.PI / 2)
  const cs = Math.cos(f), sn = Math.sin(f)
  const hx = -a.a0[0] * sn + a.a1[0] * cs, hz = -a.a0[1] * sn + a.a1[1] * cs
  const n = Math.hypot(hx, hz) || 1
  return { x: a.centre[0] + a.a0[0] * cs + a.a1[0] * sn, z: a.centre[1] + a.a0[1] * cs + a.a1[1] * sn, hx: hx / n, hz: hz / n }
}

function placeOnArc(c) {
  const a = c.arc
  Object.assign(a, arcPoint(a, a.s))
  c.t = c.axis === 'x' ? a.x : a.z // the others see the turning car at this spot of the road it came from, in its lane
}

// the real shape of a car on the ground: a rectangle that points where it faces (grown forward by 'more', and sideways by 'wide')
function rectOf(c, more = 0, wide = 0) {
  const p = carPose(c), h = more / 2
  return { x: p.x + p.hx * h, z: p.z + p.hz * h, hx: p.hx, hz: p.hz, hl: c.hl + h, hw: c.hw + wide }
}
export function rectsTouch(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z
  for (const [ux, uz] of [[a.hx, a.hz], [-a.hz, a.hx], [b.hx, b.hz], [-b.hz, b.hx]]) {
    const r = (m) => m.hl * Math.abs(m.hx * ux + m.hz * uz) + m.hw * Math.abs(-m.hz * ux + m.hx * uz)
    if (Math.abs(dx * ux + dz * uz) >= r(a) + r(b)) return false // there is a line between them
  }
  return true
}

// the box a person takes up on the ground, grown forward the way they are walking
function walkerRect(w, more = 0, wide = 0) {
  const h = (more / 2) * w.dir
  return w.axis === 'x'
    ? { x: w.t + h, z: w.lat, hx: 1, hz: 0, hl: w.hl + more / 2, hw: w.hw + wide }
    : { x: w.lat, z: w.t + h, hx: 0, hz: 1, hl: w.hl + more / 2, hw: w.hw + wide }
}

// a long car swings its tail out when it turns, so before it starts the curve the whole swept area must be free,
// also for the next two seconds of whoever is still coming (at the speed they have now)
function sweepClear(c, cars, walkers, sig) {
  const a = turnArc(c)
  const speed = TURN_SPEED[a.kind]
  for (let i = 0; i <= 18; i++) {
    const s = (a.len * i) / 18
    const mine = { ...arcPoint(a, s), hl: c.hl, hw: c.hw + 0.1 }
    const by = s / speed + 0.5 // by the time i am at this spot, anybody coming has covered up to this much road
    for (const o of cars) {
      if (o === c || !o.active) continue
      if (o.road === c.road && o.dir === c.dir && Math.abs(o.lat - c.lat) < 0.4 && o.t * c.dir < c.t * c.dir) continue // in my lane behind me: the curve never reaches it
      let reach = 0.3
      if (!o.arc && !o.crash && !(toLine(o) >= 0 && !allows(sig, o))) reach += Math.min(o.base * by, o.speed * by + 0.5 * CAR.accel * by * by) // it may speed up (unless a red holds it)
      if (rectsTouch(mine, rectOf(o, reach, 0.08))) return false
    }
    for (const w of walkers) {
      const holdsStill = w.waiting && !walkersGo(sig, w.axis) // somebody waiting at their red light is not going anywhere
      if (rectsTouch(mine, walkerRect(w, holdsStill ? 0 : Math.max(w.speed, w.base) * by + 0.3, 0.1))) return false
    }
  }
  return true
}

// may this car start its curve? room to swing, room on the road it turns into, and nobody walking across that road
function turnOK(c, cars, walkers, sig) {
  if (!sweepClear(c, cars, walkers, sig) || !exitFree(c, cars)) return false
  const side = Math.sign(turnArc(c).dir2) // people crossing the road on the side i leave by (people who already started go first)
  return !walkers.some((w) => w.axis === c.axis && Math.sign(w.lat) === side && w.inPlaza)
}

// is the road it turns into free just beyond the crossroad? (nobody in that lane close to the exit, and nobody else about to turn into it)
function exitFree(c, cars) {
  const a = c.arc || turnArc(c)
  for (const o of cars) {
    if (o === c || !o.active) continue
    if (o.arc) { if (o.arc.newAxis === a.newAxis && o.arc.lat2 === a.lat2) return false; continue }
    if (o.road !== a.newAxis || Math.abs(o.lat - a.lat2) > 0.5) continue
    const d = (o.t - a.dir2 * BOX) * a.dir2 // how far past the exit its middle is
    if (d > -o.hl && d < c.hl + o.hl + 2.2) return false
  }
  return true
}

function finishTurn(c) {
  const a = c.arc
  const over = Math.max(0, a.s - a.len)
  Object.assign(c, { axis: a.newAxis, road: a.newAxis, dir: a.dir2, lane: a.lat2, alt: -a.lat2, lat: a.lat2, goal: a.lat2, t: a.dir2 * (BOX + over), turn: 'straight', arc: null, passing: null, still: 0 })
}

function stepTurn(c, cars, dt) {
  const a = c.arc
  let lim = Math.min(c.base, TURN_SPEED[a.kind], followLimit(c, cars, CAR))
  if (a.s > a.len * 0.4 && !exitFree(c, cars)) lim = 0 // stop inside rather than drive into somebody
  c.speed = approach(c, lim, CAR, dt)
  a.s += c.speed * dt
  if (a.s >= a.len) { finishTurn(c); return }
  placeOnArc(c)
  c.still = 0
}

function stepCar(c, cars, walkers, tr, dt) {
  if (c.crash) { stepCrash(c, dt); return }
  if (c.arc) { stepTurn(c, cars, dt); return }
  const sig = tr.sig
  updatePass(c, cars, CAR, (plan) => {
    if (c.turn !== 'straight') return false // a car that is about to turn does not overtake
    const onCrossroad = plan.end > -STOP - 0.3 && plan.start < BOX + 0.3
    if (!onCrossroad) return true
    const o = other(c.axis)
    if (sig.hold || !allows(sig, c) || tr.busy[o]) return false
    sig.hold = c // the light stays green until i am back in my lane
    return true
  })

  let lim = c.passing ? c.base * CAR.boost : c.base
  lim = Math.min(lim, followLimit(c, cars, CAR))

  const go = inCrossroad(c) || committed(c) || toLine(c) < 0 || allows(sig, c)
  const turnAt = -BOX - pos(c) // how far the middle of a turning car is from the start of its curve
  const mayTurn = c.turn === 'straight' || turnAt > 4 || turnOK(c, cars, walkers, sig)
  if (!mayTurn) lim = Math.min(lim, brake(Math.max(0, turnAt - 0.05), CAR.brake)) // wait for the room before the curve
  for (const o of cars) { // somebody on the other road, or in a curve, is right in front of me (a car that stopped half over the crossroad): i wait
    if (o === c || !o.active || (!o.arc && o.road === c.road)) continue
    if (rectsTouch(rectOf(c, (c.speed * c.speed) / (2 * CAR.brake) + 0.6, 0.05), rectOf(o, 0, 0.05))) lim = 0
  }
  if (!go) lim = Math.min(lim, brake(toLine(c) - 0.2, CAR.brake))

  for (const w of walkers) { // backup: if somebody is crossing my road anyway, stop for them
    if (!w.crossing || w.axis === c.axis) continue
    const at = c.dir * w.lat
    if (pos(c) - c.hl > at + 0.4 || pos(c) + c.hl > at - 0.4) continue // already past them, or already over their crossing: keep going and clear it
    lim = Math.min(lim, brake(at - 0.4 - (pos(c) + c.hl) - 0.5, CAR.brake))
  }

  c.speed = approach(c, lim, CAR, dt)
  slide(c, cars, CAR, dt)
  c.t += c.dir * c.speed * dt
  c.still = c.speed < 0.03 ? c.still + dt : 0
  if (c.turn !== 'straight' && pos(c) >= -BOX) { // its middle is at the edge of the crossroad: into the curve
    if (mayTurn) { c.arc = turnArc(c); placeOnArc(c) } else { c.t = -c.dir * BOX - c.dir * 0.01; c.speed = 0 }
  }
  if (pos(c) - c.hl > CAR.edge + reach || c.still > 25) { c.active = false; c.passing = null }
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
  let p = -(CAR.edge + reach + c.hl)
  let passed = false // already through the crossroad: it can only go straight on
  if (anywhere) {
    const before = [-(CAR.far + reach - 1), -(STOP + 0.4 + c.hl)] // between the end of the road and the stop line
    const after = [BOX + 0.4 + c.hl, CAR.far + reach - 1 - c.hl]
    passed = rng() > 0.5
    const [a, b] = passed ? after : before
    if (b <= a) return null
    p = a + rng() * (b - a)
  }
  const r = rng()
  const turn = passed || c.hl >= 1.8 || r < 0.7 ? 'straight' : r < 0.88 ? 'right' : 'left' // most go straight on, a few turn right, fewer turn left (a long train does not fit round the corner)
  Object.assign(c, { active: true, axis, road: axis, lane, alt: -lane, lat: lane, goal: lane, dir, t: dir * p, base: 2 + rng() * 1.6, passing: null, still: 0, turn, arc: null, crash: null })
  c.speed = c.base
  if (!roomFor(c, cars)) { c.active = false; return null }
  return c
}

// ---------- people ----------

// where the lot lines are beside this footpath, around position t (distance from the middle of the road)
function lineAt(w, lots, t) {
  let edge = LOT_MIDDLE - LOT_HALF * (lots.length ? LOT_SMALL : 1) // no lot right here: as much room as a small lot gives
  for (const l of lots) {
    const across = w.axis === 'x' ? l.z : l.x
    const along = w.axis === 'x' ? l.x : l.z
    if (Math.sign(across) !== w.side || Math.abs(Math.abs(across) - LOT_MIDDLE) > 0.5) continue // not a lot on my side of this road
    if (Math.abs(t - along) < LOT_HALF * l.size + 0.2) edge = Math.min(edge, LOT_MIDDLE - LOT_HALF * l.size)
  }
  return edge
}

// the two lanes right here: the first next to the road, the second as far out as there is room for (looking a bit
// ahead, so people move in before a bigger lot starts), and opposite ways use different lanes
function setLane(w, lots) {
  const ahead = w.t + w.dir * (w.hl + 0.9)
  const edge = Math.min(lineAt(w, lots, w.t), lineAt(w, lots, ahead), lineAt(w, lots, w.t - w.dir * (w.hl + 0.3)))
  const gap = Math.max(SPACING[0], Math.min(SPACING[1], edge - w.hw - 0.01 - INNER))
  const near = w.side * INNER, far = w.side * (INNER + gap)
  w.lane = w.dir > 0 ? near : far
  w.alt = w.dir > 0 ? far : near
  w.goal = w.passing ? w.alt : w.lane
}

// n people spread over the four footpaths along the roads
export function placeWalkers(n, rng) {
  const out = []
  for (let i = 0; i < n; i++) {
    const axis = i % 2 ? 'x' : 'z'
    const side = i % 4 < 2 ? 1 : -1
    const dir = rng() > 0.5 ? 1 : -1
    const w = { id: i, active: true, axis, side, road: axis + side, dir, t: 0, speed: 0, base: 0.55 + rng() * 0.5, hl: 0.3, hw: 0.24, lat: 0, passing: null, crossing: false, inPlaza: false, waiting: false, still: 0 }
    setLane(w, [])
    w.lat = w.lane
    for (let tries = 0; tries < 30; tries++) {
      w.t = (rng() > 0.5 ? 1 : -1) * (4.5 + rng() * (8 + reach))
      if (!out.some((o) => o.road === w.road && Math.abs(o.t - w.t) < 1.6)) break
    }
    w.speed = w.base
    out.push(w)
  }
  return out
}

// people may step into the crossroad area only on green. before that they wait at the kerb, never on the road.
// is a car in the way of this person's crossing? one that is turning into the road they cross, or one that is sitting where they would walk
function carInTheWay(w, cars) {
  const lane = { x: w.axis === 'x' ? 0 : w.lat, z: w.axis === 'x' ? w.lat : 0 }
  const band = w.axis === 'x' ? { x: 0, z: lane.z, hx: 1, hz: 0, hl: BOX + 0.3, hw: 0.8 } : { x: lane.x, z: 0, hx: 0, hz: 1, hl: BOX + 0.3, hw: 0.8 }
  for (const c of cars) {
    if (!c.active) continue
    if (c.arc && c.axis === w.axis) return true // it is turning into the road i want to cross
    if (rectsTouch(rectOf(c, 0, 0.1), band)) return true
  }
  return false
}

function plazaLimit(w, sig, cars) {
  const lo = w.t - w.hl, hi = w.t + w.hl
  w.inPlaza = hi > -PLAZA && lo < PLAZA
  w.crossing = w.inPlaza
  w.waiting = false
  if (w.inPlaza) return w.base * WALK.boost // already on the way over, hurry a little
  const toEdge = w.dir > 0 ? -PLAZA - hi : lo - PLAZA
  if (toEdge < 0 || toEdge > 1.5 || (walkersGo(sig, w.axis) && !carInTheWay(w, cars))) return Infinity
  w.waiting = true
  return brake(toEdge - 0.15, WALK.brake)
}

function turnAround(w, lots) {
  w.dir = -w.dir
  w.waiting = false
  w.t = Math.max(-(WALK.edge + reach), Math.min(WALK.edge + reach, w.t))
  w.passing = null
  w.still = 0
  setLane(w, lots)
}

function stepWalker(w, walkers, cars, tr, dt) {
  setLane(w, tr.lots)
  updatePass(w, walkers, WALK, (plan) => plan.end < WALK.far + reach && (plan.start > WALK.zone || plan.end < -WALK.zone))
  let lim = w.passing ? w.base * WALK.boost : w.base
  lim = Math.min(lim, followLimit(w, walkers, WALK), plazaLimit(w, tr.sig, cars))
  for (const c of cars) { // a car on my crossing (or sweeping round a curve): i hold still if it is about to reach me
    if (!c.active) continue
    const room = c.arc ? 0.1 : 0 // a curve sweeps wide so it gets a margin, a car just standing there does not (people walk right past it on the pavement)
    if (rectsTouch(walkerRect(w, 1.2 + (w.speed * w.speed) / (2 * WALK.hard), room), rectOf(c, c.arc ? 0.3 : 0, room))) lim = 0
  }
  w.speed = approach(w, lim, WALK, dt)
  slide(w, walkers, WALK, dt)
  w.t += w.dir * w.speed * dt
  w.still = w.speed < 0.03 && !w.waiting ? w.still + dt : 0
  if (Math.abs(w.t) > WALK.edge + reach || w.still > 20) turnAround(w, tr.lots)
}

// ---------- one step for everybody ----------

export function stepTraffic(cars, walkers, tr, dt) {
  for (const w of walkers) stepWalker(w, walkers, cars, tr, dt)
  updateSignal(cars, walkers, tr, dt)
  for (const c of cars) if (c.active) stepCar(c, cars, walkers, tr, dt)
}
