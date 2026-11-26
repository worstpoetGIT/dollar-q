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
export const LOT_FULL = 0.96 // the biggest a lot gets: the footpath beside it keeps a clear strip between the people and the house

// how big a lot is for a county of this level. an empty lot is small, it grows quickly with the first expenses and then
// slower, and gets close to 1 only for a county with a lot of spending. so the more spent, the thinner the footpath beside it.
export const lotSize = (level) => Math.min(LOT_FULL, 0.55 + 0.45 * (1 - Math.exp(-Math.max(0, level) / 10)))
const LOT_MIDDLE = 4.9
const INNER = 1.67 // the lane next to the road
const LINE_GAP = 0.1 // people keep this far from the line round a lot (never on the edge of the house)
const SPACING = [0.528, 0.528] // how far the second lane is from the first: always the same, the pavement is a fixed strip next to the road (however small the lot beside it is, nobody wanders in to it)
export const LANES = [INNER, INNER + SPACING[0]]

export const newCar = (hl, hw) => ({
  active: false, axis: 'x', road: 'x', lane: 0, alt: 0, lat: 0, goal: 0, dir: 1, t: 0, speed: 0, base: 2.6, hl, hw, passing: null, still: 0, crash: null,
  yaw: 0, stuck: 0, // yaw: how far off the road it points (only a car that lost control); stuck: seconds it has waited behind a wreck
  special: null, park: null, // special: an ambulance or a police car (never part of the ordinary traffic); park: { t } a spot on the road to stop at, until it is released
  turn: 'straight', arc: null, // at the crossroad a car goes straight on, or turns left or right (arc: the curve it is on while it turns)
})

const LANE = 0.75 // how far a lane is from the middle of the road
const TURN_SPEED = { right: 1.5, left: 1.9, u: 1.6 } // how fast a car takes its curve

// where a car is on the ground and which way it points (a heading vector), also while it is turning
export function carPose(c) {
  if (c.arc) return { x: c.arc.x, z: c.arc.z, hx: c.arc.hx, hz: c.arc.hz }
  const p = c.axis === 'x' ? { x: c.t, z: c.lat, hx: c.dir, hz: 0 } : { x: c.lat, z: c.t, hx: 0, hz: c.dir }
  if (c.yaw) { // a car that has lost control points a little away from the road
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw)
    return { x: p.x, z: p.z, hx: p.hx * cs + p.hz * sn, hz: -p.hx * sn + p.hz * cs }
  }
  return p
}

// how far a car reaches sideways (across the road), also when it points a bit off the road
const sideReach = (c) => (c.yaw ? c.hw * Math.abs(Math.cos(c.yaw)) + c.hl * Math.abs(Math.sin(c.yaw)) : c.hw)

// ---------- an accident that builds up ----------
// two real cars on the street. the driver of 'a' loses control: the car wobbles, then swerves (a rear-end bump into the car in front, or a swerve
// across the middle into the car coming the other way) and runs into 'b'. nothing jumps: the car steers there, and they touch when their real shapes
// touch. then both stay put, a bit crooked, until the crash is cleared. everybody else drives around them, or waits, or turns back.
export function startCrash(a, b, kind = 'rear') {
  a.crash = { role: 'loser', kind, other: b, hit: false, t: 0, toward: 0 }
  b.crash = { role: 'victim', kind, other: a, hit: false, t: 0, toward: 0 }
  for (const c of [a, b]) { c.passing = null; c.turn = 'straight'; c.yaw = 0 }
  // which way is the other lane? (the way a swerve goes)
  const side = -Math.sign(a.lat || a.lane)
  a.crash.toward = side
  b.crash.toward = -side
}

// the driver loses control on the narrowed road: the car steers off the road, up on to the pavement, at somebody walking there, and hits them
export function startHit(car, walker, toward) {
  car.crash = { role: 'driver', kind: 'hit', other: walker, hit: false, stopped: false, run: 0, t: 0, toward }
  car.passing = null; car.turn = 'straight'; car.yaw = 0
  walker.hitBy = car
}

function stepHit(c, k, dt) {
  const w = k.other
  k.t += dt
  c.still = 0
  c.goal = c.lat // (it is where it is on the footpath: for the traffic behind it, it is not in the lane any more)
  const lat = c.axis === 'x' ? -c.dir : c.dir
  if (k.hit) { // after the hit the car rolls on, further up on to the footpath, and the person is knocked on ahead of it; then it stops
    if (k.stopped) { c.speed = 0; return }
    k.run += dt
    const rest = 2.05 - Math.abs(c.lat) // how far it still has to go to be properly up on the footpath (whichever lane the person was in)
    c.yaw = yawFor(c, k.toward) * 0.45 * Math.max(0, Math.min(1, rest / 0.45))
    c.speed = Math.max(0, c.speed - 2.2 * dt)
    c.t += c.dir * Math.cos(c.yaw) * c.speed * dt
    c.lat += lat * Math.sin(c.yaw) * c.speed * dt
    c.hwe = sideReach(c)
    if (c.speed < 0.06 || k.run > 1.6) { c.speed = 0; c.yaw *= 0.5; c.hwe = sideReach(c); k.stopped = true } // (it comes to rest a little less crooked)
    w.t = c.t + c.dir * (c.hl + w.hl + 0.05)
    for (let i = 0; i < 120 && rectsTouch(rectOf(c), walkerRect(w, 0, 0.02)); i++) w.t += c.dir * 0.02 // (knocked on ahead of the nose, never inside the car however it is turned)
    return
  }
  const grow = Math.min(1, k.t / 0.6)
  const left = Math.min(1, Math.abs(w.lat - c.lat) / 0.45) // (how much of the way to the person's path is left)
  c.yaw = yawFor(c, k.toward) * 0.45 * grow * left
  c.speed += (Math.max(c.base, 2.4) - c.speed) * Math.min(1, 2 * dt)
  c.t += c.dir * Math.cos(c.yaw) * c.speed * dt
  c.lat += lat * Math.sin(c.yaw) * c.speed * dt
  c.hwe = sideReach(c)
  if (rectsTouch(rectOf(c), walkerRect(w, 0, 0))) { // it reaches them: the person goes down
    k.hit = true
    k.run = 0
    w.down = true
    w.speed = 0
    for (let i = 0; i < 120 && rectsTouch(rectOf(c), walkerRect(w, 0, 0.02)); i++) w.t += c.dir * 0.02 // (knocked a little ahead at once)
  }
}

export function endCrash(a, b) {
  for (const c of [a, b]) {
    if (!c) continue
    c.crash = null; c.still = 0; c.stuck = 0; c.hwe = 0; c.goal = c.lane; c.freeSlide = 2.2 // (nose to nose after a head-on: for a moment each may slide back to its lane, whoever is beside)
  }
}

// which way a car must turn (the sign of its yaw) to move towards 'toward' (-1 or +1, along the lateral axis of its road)
const yawFor = (c, toward) => (c.axis === 'x' ? toward * c.dir * -1 : toward * c.dir)

function stepCrash(c, cars, dt) {
  const k = c.crash
  if (k.kind === 'hit') { stepHit(c, k, dt); return }
  k.t += dt
  if (k.hit) { // a wreck: stopped, resting a bit crooked
    c.speed = 0
    c.still = 0
    return
  }
  const other = k.other
  if (k.role === 'loser') {
    const grow = Math.min(1, k.t / 1.1)
    if (k.kind === 'rear') { // it does not brake and wobbles: the wobble grows, it speeds up at the car in front
      c.yaw = Math.sin(k.t * 5.5) * 0.3 * grow
      const target = Math.min(6, Math.max(c.base, other.speed) + 2.4)
      c.speed += (target - c.speed) * Math.min(1, 2.5 * dt)
    } else { // it steers across the middle until it is in the other car's lane, then it is pointing straight at it
      const left = Math.min(1, Math.abs(other.lat - c.lat) / 0.45) // (how much of the way across is left)
      c.yaw = yawFor(c, k.toward) * 0.42 * grow * left
      c.speed += (Math.max(c.base, 2.6) - c.speed) * Math.min(1, 2 * dt)
    }
  } else if (k.kind === 'head') { // the other driver sees it too late: brakes, swerves a little away
    const late = Math.max(0, k.t - 0.55)
    c.yaw = yawFor(c, k.toward) * 0.14 * Math.min(1, late / 0.4)
    c.speed = Math.max(0, c.speed - 4.5 * late * dt) // brakes, but it is far too late
  } else { // the car in front does not see it coming
    c.yaw = Math.sin(k.t * 3) * 0.04
  }
  const v = c.speed
  const lat = c.axis === 'x' ? -c.dir : c.dir // which way along the lateral axis a positive yaw takes it
  c.t += c.dir * Math.cos(c.yaw) * v * dt
  c.lat += lat * Math.sin(c.yaw) * v * dt
  c.hwe = sideReach(c)
  c.still = 0 // a wreck is not an idle car: it is not cleared away
  if (k.role === 'loser' && rectsTouch(rectOf(c), rectOf(other))) { // they touch: both stop where they are, a little crooked
    for (let i = 0; i < 40 && rectsTouch(rectOf(c), rectOf(other)); i++) { // (the last step went a little into the other car: back out along the way it came)
      c.t -= c.dir * Math.cos(c.yaw) * 0.02
      c.lat -= lat * Math.sin(c.yaw) * 0.02
    }
    c.speed = other.speed = 0
    c.yaw *= 0.7
    if (k.kind === 'rear') other.yaw = (other.yaw || 0.05) + 0.1 * (c.yaw >= 0 ? 1 : -1) // the car in front is knocked a little sideways
    c.hwe = sideReach(c)
    other.hwe = sideReach(other)
    k.hit = other.crash.hit = true
  }
}

// how much longer the roads are than in the 12 county city (the city grows a second ring when there are more counties)
let reach = 0
let fixed = [] // things that stand still beside the road: [{ x, z, r }] (lamp posts)
export const setObstacles = (list) => { fixed = list }

const GREEN = 5 // seconds a road keeps its green before it has to give way (if somebody is waiting)
const YELLOW = 2.2 // every green ends with a yellow, cars that can still stop do, the others carry on through
const PLAZA = 3.5 // people cross the whole crossroad area, corners included, in one go

// the light: which road has it, and whether it is green, yellow or red for everybody (the short all-red in between)
export function makeTraffic(extra = 0) {
  reach = extra
  return { sig: { phase: 'x', axis: 'x', left: 0, mode: 'green', age: 0, hold: null }, busy: { x: 0, z: 0 }, want: { x: false, z: false }, lots: [], blockers: [] }
}

// ---------- shared by cars and people ----------

// how fast i may go so that i can still stop behind whatever is ahead of me
function followLimit(m, movers, cfg) {
  let lim = Infinity
  for (const o of movers) {
    if (o === m || !o.active || o.road !== m.road) continue
    let ot = o.t, olat = o.lat
    if (o.arc && o.arc.kind === 'u') { const p = carPose(o); ot = m.axis === 'x' ? p.x : p.z; olat = m.axis === 'x' ? p.z : p.x } // (a car swinging round across the road is where its body is, not where its lane is)
    const ahead = (ot - m.t) * m.dir
    if (ahead <= 0) continue
    if (Math.min(Math.abs(olat - m.lat), o.arc ? Infinity : Math.abs(o.goal - m.lat)) >= (m.hwe || m.hw) + (o.hwe || o.hw) + cfg.side) continue
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
    if (Math.abs(o.lat - m.lane) >= m.hw + (o.hwe || o.hw) + cfg.side) continue
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
    const inAlt = Math.min(Math.abs(o.lat - m.alt), Math.abs(o.goal - m.alt)) < near + (o.hwe || o.hw)
    if (o.dir !== m.dir) {
      if (!inAlt || p(o) - o.hl < start) continue // not in my way, or already behind me
      if (p(o) - o.hl - o.base * time < end + 1) return null // it would reach me before i am done
    } else {
      if (inAlt && p(o) + o.hl > start - 1 && p(o) - o.hl < end + 1) return null
      const inHome = Math.abs(o.lat - m.lane) < near + (o.hwe || o.hw)
      if (m.special !== 'ambulance') { // (an ambulance goes past the whole queue, one after the other)
        if (inHome && p(o) > p(lead) && (o.crash || o.speed < 0.5) && p(o) - o.hl < p(m) + 22) return null // a queue or a wreck stands in my lane up ahead: passing would only leave me stuck out in the other lane
        if (inHome && p(o) > p(lead) && p(o) - o.hl - (p(lead) + lead.hl) < 2 * m.hl + 2 * cfg.clear) return null // no room to pull back in
      }
    }
  }
  return { lead, start, end }
}

// how much room there is ahead of me in my own lane (from my nose to the next car in it)
function homeGap(m, movers) {
  let best = Infinity
  for (const o of movers) {
    if (o === m || !o.active || o.road !== m.road || o.arc) continue
    if (Math.abs(o.lat - m.lane) >= m.hw + (o.hwe || o.hw) + 0.1) continue
    const ahead = (o.t - m.t) * m.dir
    if (ahead > 0) best = Math.min(best, ahead - m.hl - o.hl)
  }
  return best
}
const roomToMerge = (m, movers, cfg) => homeGap(m, movers) >= 1.2 + (m.speed * m.speed) / (2 * cfg.brake)

// start a pass when one is possible, finish it (go back to my own lane) once i am clear of the one i passed, and only when there is room to pull in
function updatePass(m, movers, cfg, canStart) {
  const p = (o) => o.t * m.dir
  if (m.waitMerge && !m.passing) { // done passing, but somebody is stopped right ahead in my lane: stay out (and slow down) until there is room
    if (roomToMerge(m, movers, cfg)) { m.waitMerge = false; m.goal = m.lane }
    return
  }
  if (m.passing) {
    const lead = m.passing
    const ahead = p(m) - m.hl - (p(lead) + lead.hl) > cfg.clear
    const behind = p(lead) - lead.hl - (p(m) + m.hl) > cfg.clear
    if (!lead.active || ahead || behind) {
      m.passing = null
      const next = m.special === 'ambulance' ? passPlan(m, movers, cfg) : null // the next one in the queue: an ambulance stays out and goes on past it
      if (next) { m.passing = next.lead; return }
      if (roomToMerge(m, movers, cfg)) m.goal = m.lane
      else m.waitMerge = true
    }
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
  if (!m.freeSlide) for (const o of movers) if (near(o) && Math.abs(o.lat - next) < m.hw + o.hw + cfg.side) return
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
  let siren = null // an ambulance on its way to the crossroad: the lights change for it
  for (const c of cars) {
    if (!c.active || c.crash) continue // a wreck does not count as somebody waiting or crossing
    if (c.special === 'ambulance' && toLine(c) >= -1.5 && toLine(c) < 14) siren = c
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
  sig.siren = !!siren
  if (siren) { // the cars in front of the ambulance in its lane, that wanted to turn, go straight on: nobody holds it up waiting for an arrow or for people on a crossing
    for (const o of cars) if (o !== siren && o.active && !o.crash && !o.arc && o.turn !== 'straight' && o.road === siren.road && o.dir === siren.dir && Math.abs(o.lat - siren.lat) < 0.6 && toLine(o) < toLine(siren) && toLine(o) > -2.5) o.turn = 'straight'
  }
  const mine = siren && PHASES[here].axis === siren.axis && !PHASES[here].left // the siren is on the road that has the green
  if (sig.hold) sig.mode = 'green' // somebody is overtaking through the crossroad, nobody else goes now
  else if (siren && sig.mode === 'green') {
    if (!mine && sig.age >= 1) { sig.mode = 'yellow'; sig.age = 0 } // everybody else gets their yellow and then a red
  } else if (sig.mode === 'green') {
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
    if (siren) next = PHASES.findIndex((p) => p.axis === siren.axis && !p.left) // the green goes to the ambulance's road
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
const walkersGo = (sig, axis) => sig.mode === 'green' && sig.phase === axis && !sig.siren // people only cross in a through phase (and not while an ambulance is coming: those on the way over finish, nobody new steps out)

// ---------- turning ----------

// the curve through the crossroad is a table of points (position and heading) along it. a right turn is a small circle. a left turn has
// to cross, and the signal pole stands in the middle, so it is a curve that bulges out round the pole as far as this vehicle needs.
const POLE = 0.3 // how far the body of a vehicle should stay from the middle of the crossroad (the pole is about 0.2 wide at most)

function curveTable(start, h, side, kind, k) {
  if (kind === 'u') { // half a circle, from my lane over to the other lane (side points at it), then I head back the way I came
    const pts = []
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI, sn = Math.sin(a), cs = Math.cos(a)
      pts.push({ x: start[0] + side[0] * LANE * (1 - cs) + h[0] * LANE * sn, z: start[1] + side[1] * LANE * (1 - cs) + h[1] * LANE * sn, hx: side[0] * sn + h[0] * cs, hz: side[1] * sn + h[1] * cs, s: 0 })
    }
    for (let i = 1; i < pts.length; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    return { pts, len: pts[pts.length - 1].s }
  }
  const R = kind === 'right' ? BOX - LANE : BOX + LANE
  const end = [start[0] + (side[0] + h[0]) * R, start[1] + (side[1] + h[1]) * R]
  const pts = []
  const N = 48
  for (let i = 0; i <= N; i++) {
    const f = i / N
    if (kind === 'right') {
      const a = (f * Math.PI) / 2, cs = Math.cos(a), sn = Math.sin(a)
      const centre = [start[0] + side[0] * R, start[1] + side[1] * R]
      pts.push({ x: centre[0] - side[0] * R * cs + h[0] * R * sn, z: centre[1] - side[1] * R * cs + h[1] * R * sn, hx: side[0] * sn + h[0] * cs, hz: side[1] * sn + h[1] * cs, s: 0 })
    } else { // cubic curve that leaves along my heading and arrives along the new road
      const p1 = [start[0] + h[0] * k, start[1] + h[1] * k], p2 = [end[0] - side[0] * k, end[1] - side[1] * k]
      const u = 1 - f
      const d = [3 * u * u * (p1[0] - start[0]) + 6 * u * f * (p2[0] - p1[0]) + 3 * f * f * (end[0] - p2[0]), 3 * u * u * (p1[1] - start[1]) + 6 * u * f * (p2[1] - p1[1]) + 3 * f * f * (end[1] - p2[1])]
      const n = Math.hypot(d[0], d[1]) || 1
      pts.push({ x: u * u * u * start[0] + 3 * u * u * f * p1[0] + 3 * u * f * f * p2[0] + f * f * f * end[0], z: u * u * u * start[1] + 3 * u * u * f * p1[1] + 3 * u * f * f * p2[1] + f * f * f * end[1], hx: d[0] / n, hz: d[1] / n, s: 0 })
    }
  }
  for (let i = 1; i < pts.length; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
  return { pts, len: pts[pts.length - 1].s }
}

// how close the body of a vehicle comes to the middle of the crossroad along a curve
function poleGap(pts, hl, hw) {
  let least = Infinity
  for (const p of pts) {
    const a = -p.x * p.hx - p.z * p.hz, b = p.x * p.hz - p.z * p.hx // the pole as seen from the vehicle: along it, and across it
    least = Math.min(least, Math.hypot(Math.max(Math.abs(a) - hl, 0), Math.max(Math.abs(b) - hw, 0)))
  }
  return least
}

// does a vehicle of this size get round the corner without touching the pole (at least as well as it passes it driving straight)? and with which bulge?
// every approach looks the same turned round, so one is enough to work it out.
const fits = new Map()
export function turnFits(hl, hw, kind) {
  const key = kind + hl + 'x' + hw
  if (fits.has(key)) return fits.get(key)
  const want = Math.min(POLE, LANE - hw) - 0.005
  const start = [-BOX, LANE], h = [1, 0], side = kind === 'right' ? [0, 1] : [0, -1]
  let out = { ok: false, k: 0 }
  if (kind === 'right') out = { ok: poleGap(curveTable(start, h, side, kind, 0).pts, hl, hw) >= want, k: 0 }
  else for (let k = 1.2; k <= 4.2; k += 0.1) if (poleGap(curveTable(start, h, side, kind, k).pts, hl, hw) >= want) { out = { ok: true, k }; break }
  fits.set(key, out)
  return out
}

function turnArc(c) {
  const h = c.axis === 'x' ? [c.dir, 0] : [0, c.dir]
  const start = c.axis === 'x' ? [-c.dir * BOX, c.lat] : [c.lat, -c.dir * BOX]
  const side = c.turn === 'right' ? [-h[1], h[0]] : [h[1], -h[0]] // the way the car turns
  const { pts, len } = curveTable(start, h, side, c.turn, turnFits(c.hl, c.hw, c.turn).k)
  const newAxis = c.axis === 'x' ? 'z' : 'x'
  const dir2 = newAxis === 'z' ? side[1] : side[0]
  return { kind: c.turn, pts, len, s: 0, newAxis, dir2, lat2: newAxis === 'x' ? dir2 * LANE : -dir2 * LANE, x: start[0], z: start[1], hx: h[0], hz: h[1] }
}

// the half circle of a U-turn from where the car stands
export function uArc(c) {
  const h = c.axis === 'x' ? [c.dir, 0] : [0, c.dir]
  const start = c.axis === 'x' ? [c.t, c.lat] : [c.lat, c.t]
  const toward = -Math.sign(c.lane)
  const side = c.axis === 'x' ? [0, toward] : [toward, 0]
  const { pts, len } = curveTable(start, h, side, 'u', 0)
  return { kind: 'u', pts, len, s: 0, newAxis: c.axis, dir2: -c.dir, lat2: -c.lane, tEnd: c.t, x: start[0], z: start[1], hx: h[0], hz: h[1] }
}

// where on the curve a car is after driving s along it
function arcPoint(a, s) {
  const pts = a.pts
  const d = Math.max(0, Math.min(a.len, s))
  let i = 1
  while (i < pts.length - 1 && pts[i].s < d) i++
  const p = pts[i - 1], q = pts[i]
  const f = q.s > p.s ? (d - p.s) / (q.s - p.s) : 0
  const hx = p.hx + (q.hx - p.hx) * f, hz = p.hz + (q.hz - p.hz) * f
  const n = Math.hypot(hx, hz) || 1
  return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f, hx: hx / n, hz: hz / n }
}

function placeOnArc(c) {
  const a = c.arc
  Object.assign(a, arcPoint(a, a.s))
  c.t = c.axis === 'x' ? a.x : a.z // the others see the turning car at this spot of the road it came from, in its lane
  if (a.kind === 'u') c.lat = c.axis === 'x' ? a.z : a.x // (a U-turn stays on its own road, so everybody sees where it really is)
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
export function sweepClear(c, cars, walkers, sig, arc = null, why = null) { // (why: a list to say what is in the way, for finding out)
  const no = (reason) => { if (why) why.push(reason); return false }
  const a = arc || turnArc(c)
  const speed = TURN_SPEED[a.kind]
  for (let i = 0; i <= 18; i++) {
    const s = (a.len * i) / 18
    const mine = { ...arcPoint(a, s), hl: c.hl + 0.12, hw: c.hw + 0.1 } // (room to spare all round, also in front and behind)
    for (const f of fixed) { // a lamp post: the body of the car must stay clear of it
      const px = f.x - mine.x, pz = f.z - mine.z
      const along = px * mine.hx + pz * mine.hz, across = -px * mine.hz + pz * mine.hx
      if (Math.hypot(Math.max(Math.abs(along) - mine.hl, 0), Math.max(Math.abs(across) - mine.hw, 0)) < f.r + 0.08) return no('lamp post')
    }
    const by = a.kind === 'u' ? s / (speed * 0.55) + 0.9 : s / speed + 0.5 // by the time i am at this spot, anybody coming has covered up to this much road (a car that starts a U-turn from standing is slow at first)
    for (const o of cars) {
      if (o === c || !o.active) continue
      if (o.road === c.road && o.dir === c.dir && Math.abs(o.lat - c.lat) < 0.4 && o.t * c.dir < c.t * c.dir) continue // in my lane behind me: the curve never reaches it
      let reach = 0.3
      if (!o.arc && !o.crash && !(toLine(o) >= 0 && !allows(sig, o))) reach += Math.min(o.base * by, o.speed * by + 0.5 * CAR.accel * by * by) // it may speed up (unless a red holds it)
      if (rectsTouch(mine, rectOf(o, reach, 0.08))) return no(`car t=${o.t.toFixed(1)} lat=${o.lat.toFixed(2)} ${o.crash ? 'wreck' : o.arc ? 'turning' : 'driving'} s=${s.toFixed(1)}`)
    }
    for (const w of walkers) {
      const holdsStill = w.waiting && !walkersGo(sig, w.axis) // somebody waiting at their red light is not going anywhere
      if (rectsTouch(mine, walkerRect(w, holdsStill ? 0 : Math.max(w.speed, w.base) * by + 0.3, 0.1))) return no('person')
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
  if (a.kind === 'u') { // facing the other way in the other lane, on the same road, at the same place: off it goes (it turns at the next crossroad if it likes)
    const pick = [null, 'right', 'left'][Math.floor(c.base * 100) % 3]
    Object.assign(c, { dir: a.dir2, lane: a.lat2, alt: -a.lat2, lat: a.lat2, goal: a.lat2, t: a.tEnd, turn: pick && turnFits(c.hl, c.hw, pick).ok ? pick : 'straight', arc: null, passing: null, still: 0, stuck: 0, backed: 0, rerouted: false })
    return
  }
  Object.assign(c, { axis: a.newAxis, road: a.newAxis, dir: a.dir2, lane: a.lat2, alt: -a.lat2, lat: a.lat2, goal: a.lat2, t: a.dir2 * (BOX + over), turn: 'straight', arc: null, passing: null, still: 0, rerouted: false })
}

function stepTurn(c, cars, dt) {
  const a = c.arc
  let lim = Math.min(c.base, TURN_SPEED[a.kind])
  if (a.kind !== 'u') lim = Math.min(lim, followLimit(c, cars, CAR)) // (a U-turn was checked all the way round before it started, and what is ahead in the lane it is leaving does not matter)
  if (a.kind !== 'u' && a.s > a.len * 0.4 && !exitFree(c, cars)) lim = 0 // stop inside rather than drive into somebody
  c.speed = approach(c, lim, CAR, dt)
  a.s += c.speed * dt
  if (a.s >= a.len) { finishTurn(c); return }
  placeOnArc(c)
  c.still = 0
}

// is there a wreck on this arm of the crossroad (the road 'axis', on the side 'sign' of the middle)?
const armBlocked = (cars, axis, sign) => cars.some((o) => o.active && o.crash && o.road === axis && Math.sign(o.t) === sign)

// the direction a car will be heading after it turns right or left
const exitDir = (c, kind) => (c.axis === 'x' ? (kind === 'right' ? c.dir : -c.dir) : (kind === 'right' ? -c.dir : c.dir))

let roadSense = true
export const setRoadSense = (on) => { roadSense = on } // (the tests turn it off to get a queue of cars behind a wreck)

// road sense: a car that is about to go into a road with a wreck on it takes another road instead, and one that was about to turn into it goes straight on
function reroute(c, cars) {
  if (!roadSense || c.special || c.rerouted || c.arc || c.crash || toLine(c) < 0 || toLine(c) > 16) return
  if (c.turn === 'straight') {
    if (!armBlocked(cars, c.road, c.dir)) return
    c.rerouted = true
    const options = ['right', 'left'].filter((k) => turnFits(c.hl, c.hw, k).ok && !armBlocked(cars, other(c.axis), exitDir(c, k)))
    if (options.length) c.turn = options[Math.floor(c.base * 100) % options.length]
  } else if (armBlocked(cars, other(c.axis), exitDir(c, c.turn))) {
    c.rerouted = true
    if (!armBlocked(cars, c.road, c.dir)) c.turn = 'straight'
  }
}

// stuck behind a wreck: is there one ahead on my road (close enough that it is what the queue is waiting for), and am i held up by it?
function stuckBehindWreck(c, cars) {
  if (c.special || c.speed > 0.05 || Math.abs(c.t) < 5 || c.passing || c.turn !== 'straight') return false
  let wreck = false
  for (const o of cars) if (o !== c && o.active && o.crash && o.road === c.road && (o.t - c.t) * c.dir > 0 && (o.t - c.t) * c.dir < 16 && (o.crash.kind !== 'hit' || Math.abs(o.lat - c.lat) < c.hw + (o.hwe || o.hw) + 0.3)) wreck = true // (a car that is up on the footpath, after it hit somebody, does not block my lane)
  return wreck && followLimit(c, cars, CAR) < 0.4
}

// nobody right behind me in my lane (so i can back up a little)
const roomBehind = (c, cars) => !cars.some((o) => o !== c && o.active && o.road === c.road && Math.abs(o.lat - c.lat) < c.hw + (o.hwe || o.hw) + 0.2 && (c.t - o.t) * c.dir > 0 && (c.t - o.t) * c.dir < c.hl + o.hl + 0.8)

// turn back: half a circle into the other lane when it is free (cars coming the other way are waited for), after backing up if there is not room to swing round
function tryUTurn(c, cars, walkers, sig, dt) {
  if (c.hl > 1.6 || Math.abs(c.lat - c.lane) > 0.05) return false // (a really long vehicle, a train or a long sled, cannot swing round and waits)
  const a = uArc(c)
  if (sweepClear(c, cars, walkers, sig, a)) { c.arc = a; c.backed = 0; placeOnArc(c); return true }
  // (it never backs into the crossroad)
  if ((c.backed || 0) < 2.6 && Math.abs(c.t - c.dir * 0.8 * dt) > 5 && roomBehind(c, cars)) { c.t -= c.dir * 0.8 * dt; c.backed = (c.backed || 0) + 0.8 * dt; c.still = 0; return true }
  return false
}

function stepCar(c, cars, walkers, tr, dt) {
  if (c.crash) { stepCrash(c, cars, dt); return }
  if (c.freeSlide > 0) c.freeSlide -= dt
  if (c.yaw) { c.yaw = Math.abs(c.yaw) < 0.01 ? 0 : c.yaw * (1 - Math.min(1, 3 * dt)); c.hwe = c.yaw ? sideReach(c) : 0 } // a car that has been in a crash straightens up again once it drives off
  if (c.arc) { stepTurn(c, cars, dt); return }
  reroute(c, cars)
  c.stuck = stuckBehindWreck(c, cars) ? c.stuck + dt : 0
  if (c.stuck > 1.5 && tryUTurn(c, cars, walkers, tr.sig, dt)) return
  const sig = tr.sig
  updatePass(c, cars, CAR, (plan) => {
    if (c.turn !== 'straight' || (c.park && c.special !== 'ambulance')) return false // a car that is about to turn, or is on its way to park, does not overtake (an ambulance on its way to an accident does)
    const onCrossroad = plan.end > -STOP - 0.3 && plan.start < BOX + 0.3
    if (!onCrossroad) return true
    const o = other(c.axis)
    if (c.special === 'ambulance') return !tr.busy[o] // over the crossroad in the other lane, on a red too, as long as nobody is on it crossing
    return false // nobody but an ambulance overtakes across a crossroad: a car that waits at the line for its light or its arrow is waited for, not gone round (that ended nose to nose with the queue of the other lane, the light held, and the cars stuck until they were taken away)
  })

  let lim = c.passing ? c.base * CAR.boost : c.base
  lim = Math.min(lim, followLimit(c, cars, CAR))
  if (c.park) { // stop at the place it was sent to, and stay until it is released
    const d = (c.park.t - c.t) * c.dir - c.hl
    lim = Math.min(lim, brake(Math.max(0, d), CAR.brake))
    if (d < 0.3 && c.speed < 0.08) c.park.at = true
    if (c.park.at) c.still = 0
  }
  if (c.waitMerge) lim = Math.min(lim, brake(Math.max(0, homeGap(c, cars) - 0.8), CAR.brake)) // (out in the other lane, slowing down for whatever is stopped in mine)

  // (and a car that goes straight on does not start across the crossroad if a car is standing in its lane right beyond it: that would block the crossroad)
  const beyond = c.turn !== 'straight' || toLine(c) < 0 || !walkers.some((w) => w.crossing && w.axis !== c.axis && c.dir * w.lat > 0) && !cars.some((o) => o !== c && o.active && !o.arc && o.road === c.road && o.dir === c.dir && Math.abs(o.lat - c.lat) < c.hw + (o.hwe || o.hw) && pos(o) - o.hl > BOX && pos(o) - o.hl < BOX + 2 * c.hl + 1.2 && (o.crash || o.speed < 0.4))
  const go = inCrossroad(c) || committed(c) || toLine(c) < 0 || ((allows(sig, c) || c.special === 'ambulance') && beyond) // (an ambulance does not wait for the green: whoever is in its way on the crossroad, it waits for)
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
  const atRed = toLine(c) >= -0.2 && !allows(sig, c) // (waiting for its light: that is not being stuck, however long the other roads keep their green)
  c.idleGo = c.speed < 0.03 && !atRed ? (c.idleGo || 0) + dt : 0 // how long it has stood still without a red to blame
  if (pos(c) - c.hl > CAR.edge + reach || (c.idleGo > 25 && !c.special)) { c.active = false; c.passing = null } // (an emergency vehicle waits for as long as it is needed)
}

// room for a car at its spot: nobody close in the same lane, nobody overtaking into it
function roomFor(c, cars) {
  for (const o of cars) {
    if (o === c || !o.active || o.road !== c.road) continue
    if (o.passing && Math.abs(o.goal - c.lane) < 0.1) return false
    const sameLane = Math.min(Math.abs(o.lat - c.lane), Math.abs(o.goal - c.lane)) < c.hw + (o.hwe || o.hw) + CAR.side
    if (sameLane && Math.abs(o.t - c.t) < c.hl + o.hl + 3) return false
  }
  return true
}

// put one car from the pool on the road: at the far end, or (for the first few) somewhere in the middle
export function spawnCar(cars, rng, anywhere = false, prefer = null) { // prefer: { axis } brings the cars onto that road (the street where something is about to happen)
  const free = cars.filter((c) => !c.active && !c.special)
  if (!free.length) return null
  const c = free[Math.floor(rng() * free.length)]
  const axis = prefer && prefer.axis ? prefer.axis : rng() > 0.5 ? 'x' : 'z'
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
  let turn = passed || r < 0.7 ? 'straight' : r < 0.88 ? 'right' : 'left' // most go straight on, a few turn right, fewer turn left
  if (turn !== 'straight' && (c.hl >= 1.8 || !turnFits(c.hl, c.hw, turn).ok)) turn = 'straight' // a vehicle that would brush the pole or does not fit round the corner goes straight on
  Object.assign(c, { active: true, axis, road: axis, lane, alt: -lane, lat: lane, goal: lane, dir, t: dir * p, base: 2 + rng() * 1.6, passing: null, still: 0, turn, arc: null, crash: null, waitMerge: false, yaw: 0, stuck: 0, backed: 0, hwe: 0, rerouted: false, park: null })
  c.speed = c.base
  if (!roomFor(c, cars)) { c.active = false; return null }
  return c
}

// ---------- people ----------

// the very end of the footpath: people walk to here and are gone, and come in from here (the scene fades them out and in over the last stretch)
export const walkTip = () => WALK.edge + reach + 1.9 // (the edge of the board: the end of the road)
export const TIP_FADE = 0.7

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
// the lamp posts on this footpath, as { t: along the road, lat: across it, r } (they stand beside the road, on the pavement, so people must go round them)
function postsOf(w) {
  const out = []
  for (const f of fixed) {
    const lat = w.axis === 'x' ? f.z : f.x, t = w.axis === 'x' ? f.x : f.z
    if (Math.sign(lat) === w.side) out.push({ t, lat, r: f.r })
  }
  return out
}

function setLane(w, lots, others = null) {
  const ahead = w.t + w.dir * (w.hl + 0.9)
  const edge = Math.min(lineAt(w, lots, w.t), lineAt(w, lots, ahead), lineAt(w, lots, w.t - w.dir * (w.hl + 0.3)))
  const gap = Math.max(SPACING[0], Math.min(SPACING[1], edge - w.hw - LINE_GAP - INNER))
  const near = w.side * INNER, far = w.side * (INNER + gap)
  w.lane = w.dir > 0 ? near : far
  w.alt = w.dir > 0 ? far : near
  // a lamp post is about to be in the way in my lane: i use the other lane while i go by it
  const inTheWay = (lane) => postsOf(w).some((f) => (f.t - w.t) * w.dir > -(w.hl + f.r - 0.02) && (f.t - w.t) * w.dir < 1.4 && Math.abs(Math.abs(f.lat) - Math.abs(lane)) < w.hw + f.r + 0.04)
  // (and only when nobody is coming the other way in that lane: i wait in front of the post until they have gone by, so we never meet head on in the lane i stepped into)
  const altFree = !others || !others.some((o) => o !== w && o.active && o.road === w.road && o.dir !== w.dir && Math.abs(o.lat - w.alt) < 0.6 && (o.t - w.t) * w.dir > -0.8 && (o.t - w.t) * w.dir < 5.2)
  const inOther = Math.abs(w.lat - w.alt) < 0.3 // (already stepped over: once beside the post i go on past it, whoever comes)
  // somebody coming the other way who had to step into my lane to get round a post: i move over to my other lane for a moment so we can go by each other
  const makeWay = !!others && others.some((o) => o !== w && o.active && o.road === w.road && o.dir !== w.dir && Math.abs(o.lat - o.lane) > 0.3 && Math.abs(o.lat - w.lane) < 0.45 && (o.t - w.t) * w.dir > -0.5 && (o.t - w.t) * w.dir < 2.4)
  w.goal = w.passing || makeWay && !inTheWay(w.alt) || (inTheWay(w.lane) && !inTheWay(w.alt) && (altFree || inOther)) ? w.alt : w.lane
}

// n people spread over the four footpaths along the roads
export function placeWalkers(n, rng, extra = 0) { // extra: how much longer the roads are (a hidden setting used to be read here, so a test that ran before could change this one)
  const out = []
  for (let i = 0; i < n; i++) {
    const axis = i % 2 ? 'x' : 'z'
    const side = i % 4 < 2 ? 1 : -1
    const dir = rng() > 0.5 ? 1 : -1
    // everybody walks at a decent pace (one or two used to crawl at half the speed of the others)
    const w = { id: i, active: true, axis, side, road: axis + side, dir, t: 0, speed: 0, base: 0.85 + rng() * 0.35, hl: 0.3, hw: 0.24, lat: 0, passing: null, crossing: false, inPlaza: false, waiting: false, still: 0 }
    setLane(w, [])
    w.lat = w.lane
    for (let tries = 0; tries < 30; tries++) {
      w.t = (rng() > 0.5 ? 1 : -1) * (4.5 + rng() * (8 + extra))
      if (!out.some((o) => o.road === w.road && Math.abs(o.t - w.t) < 1.6) && !postsOf(w).some((f) => Math.abs(f.t - w.t) < 0.8)) break // (not on top of anybody, or of a lamp post)
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
    if (c.arc && c.arc.kind !== 'u' && c.axis === w.axis) return true // it is turning into the road i want to cross
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
  w.t = Math.max(-walkTip(), Math.min(walkTip(), w.t))
  w.passing = null
  w.still = 0
  setLane(w, lots)
}

function stepWalker(w, walkers, cars, tr, dt) {
  if (!w.active) { // somebody who is not on the street: an onlooker who has not come yet, or has left, or somebody who walked off the end and comes back in a while
    if (w.away > 0) {
      w.away -= dt
      if (w.away <= 0) { w.t = -(Math.sign(w.t) || 1); if (!sendWatcher(w, walkers, w.axis, w.side, null)) w.away = 0.5 } // (in at the other end, when there is room there)
    }
    return
  }
  if (w.down) { w.speed = 0; w.still = 0; w.waiting = false; w.crossing = false; return } // (somebody who was hit lies where they are)
  setLane(w, tr.lots, walkers)
  updatePass(w, walkers, WALK, (plan) => plan.end < WALK.far + reach && (plan.start > WALK.zone || plan.end < -WALK.zone))
  let lim = w.passing ? w.base * WALK.boost : w.base
  lim = Math.min(lim, followLimit(w, walkers, WALK), plazaLimit(w, tr.sig, cars))
  // somebody standing in my way (the drivers of a bump fighting on the footpath): i stop in front of them, and after a moment i turn round and go the other way
  const stop = tr.blockers.length ? followLimit(w, tr.blockers, WALK) : Infinity
  lim = Math.min(lim, stop)
  for (const f of postsOf(w)) { // never walk into a lamp post: wait for the side step to clear it
    const ahead = (f.t - w.t) * w.dir
    if (ahead > 0 && Math.abs(f.lat - w.lat) < w.hw + f.r + 0.03) lim = Math.min(lim, brake(Math.max(0, ahead - w.hl - f.r - 0.12), WALK.brake))
  }
  if (w.watch) { // an onlooker walks to the spot where they will stand and watch, and stays there
    const d = (w.watch.t - w.t) * w.dir
    lim = Math.min(lim, d < 0 ? 0 : brake(d, WALK.brake))
    if (d < 0.08 && w.speed < 0.08) w.watch.at = true
    if (w.watch.at) { w.still = 0; w.blocked = 0 }
  }
  w.blocked = stop < 0.05 ? (w.blocked || 0) + dt : 0
  if (w.blocked > 1.5 && !w.watch) { w.blocked = 0; turnAround(w, tr.lots); return }
  for (const c of cars) { // a car on my crossing (or sweeping round a curve): i hold still if it is about to reach me
    if (!c.active) continue
    const room = c.arc ? 0.1 : 0 // a curve sweeps wide so it gets a margin, a car just standing there does not (people walk right past it on the pavement)
    if (rectsTouch(walkerRect(w, 1.2 + (w.speed * w.speed) / (2 * WALK.hard), room), rectOf(c, c.arc ? 0.3 : 0, room))) lim = 0
  }
  w.speed = approach(w, lim, WALK, dt)
  slide(w, walkers, WALK, dt)
  w.t += w.dir * w.speed * dt
  w.still = w.speed < 0.03 && !w.waiting ? w.still + dt : 0
  if (w.leaving && Math.abs(w.t) > walkTip()) { w.active = false; w.leaving = false; return } // (an onlooker who walks off the end of the footpath is gone)
  if (Math.abs(w.t) > walkTip() && w.dir === Math.sign(w.t)) { w.active = false; w.away = 3 + (w.id % 4); return } // (they walk to the tip of the footpath and are gone, they do not turn round)
  if (w.still > 20 && !w.watch) turnAround(w, tr.lots)
}

// the traffic lets an emergency vehicle in from the end of the road: same lane and way as the car that crashed, it parks at 'spot' (its nose there)
export function dispatchCar(c, cars, axis, lane, spot, special) {
  const dir = axis === 'x' ? (lane > 0 ? 1 : -1) : (lane > 0 ? -1 : 1)
  Object.assign(c, { active: true, special, axis, road: axis, lane, alt: -lane, lat: lane, goal: lane, dir, t: -dir * (CAR.edge + reach + c.hl), base: 3.4, passing: null, still: 0, turn: 'straight', arc: null, crash: null, waitMerge: false, yaw: 0, stuck: 0, backed: 0, hwe: 0, rerouted: false, park: { t: spot } })
  c.speed = c.base
  if (!roomFor(c, cars)) { c.active = false; return false }
  return true
}

// an onlooker comes in from the end of the footpath on 'side' of the road 'axis' and walks to 'spot', and watches from there
export function sendWatcher(w, walkers, axis, side, spot) {
  const way = spot === null ? Math.sign(w.t) || 1 : Math.sign(spot) // (no spot: somebody walks back on to the street from the end of the footpath they were taken from)
  const end = way * (walkTip() - 0.05)
  if (walkers.some((o) => o !== w && o.active && o.axis === axis && o.side === side && Math.abs(o.t - end) < 1.8)) return false // somebody is at the end of the footpath: not yet
  Object.assign(w, { axis, side, road: axis + side, dir: -way, t: end, speed: w.base, passing: null, crossing: false, inPlaza: false, waiting: false, still: 0, blocked: 0, watch: spot === null ? null : { t: spot, at: false }, leaving: false, down: false, hitBy: null })
  setLane(w, [])
  w.lat = w.lane
  w.active = true
  return true
}

// the onlooker is done watching: walks off the way they came
export function releaseWatcher(w, lots) {
  w.watch = null
  w.leaving = true
  if (w.dir !== Math.sign(w.t)) turnAround(w, lots)
}

// ---------- one step for everybody ----------

export function stepTraffic(cars, walkers, tr, dt) {
  for (const w of walkers) stepWalker(w, walkers, cars, tr, dt)
  updateSignal(cars, walkers, tr, dt)
  for (const c of cars) if (c.active) stepCar(c, cars, walkers, tr, dt)
}
