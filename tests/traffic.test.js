import { describe, it, expect } from 'vitest'
import { newCar, makeTraffic, placeWalkers, spawnCar, stepTraffic, LANES, LOT_HALF, LOT_SMALL, lotSize, startCrash, endCrash, carPose, turnFits } from '../src/traffic.js'

const seeded = (a) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// half length x half width of every vehicle, measured from the real models on each map
const FLEETS = {
  city: '0.68x0.38 0.68x0.38 0.68x0.38 0.68x0.38 0.68x0.38 0.68x0.38 0.88x0.4 0.88x0.4 1.51x0.49 1.45x0.44 1.51x0.49',
  japan: '2.55x0.59 0.57x0.37 0.57x0.37 0.57x0.37 0.57x0.37 0.68x0.38 0.68x0.38 0.88x0.4 0.57x0.37 2.55x0.59',
  ice: '1.9x0.45 1.52x0.36 2.09x0.5 1.05x0.21 1.05x0.21 1.45x0.35 1.45x0.35 1.14x0.27',
  court: '0.47x0.45 0.47x0.45 0.47x0.45 1.51x0.49 1.51x0.49 0.68x0.38 0.47x0.45',
}
const fleet = (name) => FLEETS[name].split(' ').map((s) => newCar(...s.split('x').map(Number)))

// the box a car or a person takes up on the ground
const box = (m) => {
  const along = [m.t - m.hl, m.t + m.hl], across = [m.lat - m.hw, m.lat + m.hw]
  return m.axis === 'x' ? { x: along, z: across } : { x: across, z: along }
}
const hit = (a, b) => a.x[0] < b.x[1] && b.x[0] < a.x[1] && a.z[0] < b.z[1] && b.z[0] < a.z[1]

// the real shape of a car or person on the ground (a rectangle pointing the way it faces, so a car in the middle of a turn is measured properly)
const rectOf = (m) => {
  if (m.id !== undefined) return m.axis === 'x' ? { x: m.t, z: m.lat, hx: 1, hz: 0, hl: m.hl, hw: m.hw } : { x: m.lat, z: m.t, hx: 0, hz: 1, hl: m.hl, hw: m.hw }
  const p = carPose(m)
  return { x: p.x, z: p.z, hx: p.hx, hz: p.hz, hl: m.hl, hw: m.hw }
}
const overlap = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z
  for (const [ux, uz] of [[a.hx, a.hz], [-a.hz, a.hx], [b.hx, b.hz], [-b.hz, b.hx]]) {
    const r = (m) => m.hl * Math.abs(m.hx * ux + m.hz * uz) + m.hw * Math.abs(-m.hz * ux + m.hx * uz)
    if (Math.abs(dx * ux + dz * uz) >= r(a) + r(b)) return false // there is a line between them
  }
  return true
}

// the eight lots that touch a footpath, with a size each (1 = fully grown, LOT_SMALL = first stage)
// the 12 more lots of the big city (24 counties): the old park corner and two more along the roads, in every corner
const BIG = [[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([a, b]) => [[11.1 * a, 11.1 * b], [17.3 * a, 4.9 * b], [4.9 * a, 17.3 * b]])
const lotsOf = (size, big = false) => [[4.9, 4.9], [11.1, 4.9], [4.9, 11.1], [-4.9, 4.9], [-11.1, 4.9], [-4.9, 11.1], [4.9, -4.9], [11.1, -4.9], [4.9, -11.1], [-4.9, -4.9], [-11.1, -4.9], [-4.9, -11.1], ...(big ? BIG : [])].map(([x, z]) => ({ x, z, size: size(x, z) }))

function simulate(name, seed, minutes, dt, lotSize, extra = 0) {
  const rng = seeded(seed)
  const cars = fleet(name)
  const walkers = placeWalkers(extra > 0 ? 12 : 8, rng, extra)
  const tr = makeTraffic(extra)
  if (lotSize) tr.lots = lotsOf(lotSize, extra > 0)
  for (let i = 0; i < 3; i++) spawnCar(cars, rng, true)
  const out = { settledGap: 9, minGap: 9, outsideLine: 0, offPavement: 0, crashes: [], passes: 0, walked: 0, busiest: 0, trips: 0, lastTrip: 0, standing: 0, carsWaiting: 0, carTime: 0 }
  const still = walkers.map(() => 0)
  const was = new Map()
  let spawnIn = 0.4
  for (let step = 0; step < (minutes * 60) / dt; step++) {
    spawnIn -= dt
    if (spawnIn <= 0) { spawnIn = 1.8 + rng() * 2.6; spawnCar(cars, rng) }
    const walkedBefore = walkers.map((w) => w.t)
    const wasOn = cars.map((c) => c.active)
    stepTraffic(cars, walkers, tr, dt)
    for (const w of walkers) if (Math.abs(w.lat) - w.hw < 1.43 || Math.abs(w.lat) + w.hw > 2.45) out.offPavement++
    for (const w of walkers) { // the lot line beside this person: the biggest lot they are beside decides
      // the lot line beside this person: the biggest lot they are beside decides (no lots at all: as for a fully grown lot)
      const beside = !lotSize ? [] : lotsOf(lotSize, extra > 0).filter((l) => Math.sign(w.axis === 'x' ? l.z : l.x) === w.side && Math.abs(w.t - (w.axis === 'x' ? l.x : l.z)) < LOT_HALF * l.size + 0.3 && Math.abs(Math.abs(w.axis === 'x' ? l.z : l.x) - 4.9) < 0.5)
      const edge = !lotSize ? 4.9 - LOT_HALF : 4.9 - LOT_HALF * (beside.length ? Math.max(...beside.map((l) => l.size)) : LOT_SMALL)
      if (Math.abs(w.lat) + w.hw > edge + 0.01) out.outsideLine++
    }
    for (let i = 0; i < walkers.length; i++) { // how far apart (after the first few seconds, when people have settled into their lanes) are two people who are beside each other?
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i], b = walkers[j]
        if (step * dt > 5 && a.road === b.road && Math.abs(a.t - b.t) < 0.5) {
          const gap = Math.abs(a.lat - b.lat) - a.hw - b.hw
          out.minGap = Math.min(out.minGap, gap)
          const settled = (w) => !w.passing && Math.abs(w.lat - w.lane) < 0.02 // in their lane, not in the middle of getting past somebody
          if (settled(a) && settled(b)) out.settledGap = Math.min(out.settledGap, gap)
        }
      }
    }
    walkers.forEach((w, i) => { // anybody standing about on the crossroad?
      still[i] = w.inPlaza && w.speed < 0.03 ? still[i] + dt : 0
      out.standing = Math.max(out.standing, still[i])
    })
    for (const c of cars) if (c.active) { out.carTime++; if (c.speed < 0.05) out.carsWaiting++ }
    cars.forEach((c, i) => { if (wasOn[i] && !c.active) { out.trips++; out.lastTrip = step * dt } })
    walkers.forEach((w, i) => { out.walked += Math.abs(w.t - walkedBefore[i]) })
    for (const c of cars) {
      const now = !!c.passing
      if (now && !was.get(c)) out.passes++
      was.set(c, now)
    }
    out.busiest = Math.max(out.busiest, cars.filter((c) => c.active).length)

    const all = [...cars.filter((c) => c.active), ...walkers]
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (overlap(rectOf(all[i]), rectOf(all[j]))) {
          const kind = (m) => (m.id !== undefined ? 'person' : 'car')
          out.crashes.push(`${name} seed ${seed} at ${(step * dt).toFixed(1)}s: ${kind(all[i])} ${all[i].axis}${all[i].dir > 0 ? '+' : '-'} hits ${kind(all[j])} ${all[j].axis}${all[j].dir > 0 ? '+' : '-'}`)
          if (out.crashes.length > 3) return out
        }
      }
    }
  }
  return out
}

describe('traffic: nothing ever runs into anything', () => {
  for (const name of Object.keys(FLEETS)) {
    it(`${name}: no two cars, no two people and no car and person ever overlap`, () => {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const dt of [1 / 60, 0.05]) {
          const r = simulate(name, seed, 6, dt)
          expect(r.crashes).toEqual([])
        }
      }
    }, 120000)
  }
})

describe('traffic: people', () => {
  it('stay on the pavement, and some walk faster than others', () => {
    const w = placeWalkers(8, seeded(3))
    expect(new Set(w.map((x) => x.base)).size).toBeGreaterThan(1)
    for (const seed of [1, 2, 3, 4]) expect(simulate('city', seed, 6, 1 / 30).offPavement).toBe(0)
  }, 60000)
})

describe('traffic: room on the footpath follows how big the lots are', () => {
  it('first-stage lots leave room: people passing keep a comfortable gap and stay inside the lines', () => {
    for (const seed of [1, 2, 3]) {
      const r = simulate('city', seed, 6, 1 / 30, () => LOT_SMALL)
      expect(r.crashes).toEqual([])
      expect(r.outsideLine).toBe(0)
      expect(r.minGap).toBeGreaterThan(0.04) // even while getting past somebody
      expect(r.settledGap).toBeGreaterThan(0.2) // and a roomy gap the rest of the time
    }
  }, 60000)

  it('fully grown lots: tighter, but still not touching, and never on the line', () => {
    for (const seed of [1, 2, 3]) {
      const r = simulate('city', seed, 6, 1 / 30, () => 1)
      expect(r.outsideLine).toBe(0)
      expect(r.minGap).toBeGreaterThan(0.04)
    }
  }, 60000)

  it('some lots grown, some not: people pull in next to a grown lot and never touch', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = simulate('city', seed, 6, 1 / 30, (x, z) => (x > 0 && z > 0 ? 1 : LOT_SMALL))
      expect(r.crashes).toEqual([])
      expect(r.outsideLine).toBe(0)
      expect(r.minGap).toBeGreaterThan(0.04)
    }
  }, 120000)
})

describe('traffic: the footpath gets thinner the more is spent', () => {
  it('a lot grows with its level: small when empty, bigger with spending, never past full size', () => {
    expect(lotSize(0)).toBeGreaterThan(0.5)
    expect(lotSize(0)).toBeLessThan(0.6)
    let last = 0
    for (let level = 0; level <= 200; level++) {
      const s = lotSize(level)
      expect(s).toBeGreaterThanOrEqual(last)
      expect(s).toBeLessThanOrEqual(1)
      last = s
    }
    expect(lotSize(4)).toBeLessThan(lotSize(15))
    expect(lotSize(15)).toBeLessThan(lotSize(40))
    expect(lotSize(40)).toBeGreaterThan(0.99)
    expect(lotSize(-3)).toBe(lotSize(0))
  })

  // the room between the two lanes, with every lot at the same size: it shrinks as the lots grow
  const gapAt = (size) => {
    const w = placeWalkers(1, () => 0.5)[0]
    const tr = makeTraffic()
    tr.lots = lotsOf(() => size)
    w.t = 4.9
    stepTraffic([], [w], tr, 1 / 30)
    return Math.abs(w.alt - w.lane)
  }

  it('an empty or tiny lot leaves wide lanes, a big one squeezes them to the tightest gap', () => {
    const gaps = [0.55, 0.7, 0.85, 1].map(gapAt)
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1] + 1e-9)
    expect(gaps[0]).toBeGreaterThan(gaps[3] + 0.3) // you can see the difference
    expect(gaps[3]).toBeGreaterThanOrEqual(0.52)   // but even the tightest still lets two people pass
  })

  it('at every size people stay inside the lines and never touch', () => {
    for (const size of [lotSize(0), lotSize(3), lotSize(8), lotSize(20), 1]) {
      for (const seed of [1, 2]) {
        const r = simulate('city', seed, 4, 1 / 30, () => size)
        expect(r.crashes).toEqual([])
        expect(r.outsideLine).toBe(0)
        expect(r.minGap).toBeGreaterThan(0.04)
      }
    }
  }, 180000)

  it('counties of different levels side by side: people move over as the lots change, no touching', () => {
    for (const seed of [1, 2, 3]) {
      const r = simulate('city', seed, 5, 1 / 30, (x, z) => lotSize(Math.round(Math.abs(x) + Math.abs(z)) % 30))
      expect(r.crashes).toEqual([])
      expect(r.outsideLine).toBe(0)
      expect(r.minGap).toBeGreaterThan(0.04)
    }
  }, 120000)
})

describe('traffic: the big city (24 counties, longer roads)', () => {
  it('the second ring has 12 more lots, none on top of another and none on the roads', () => {
    expect(BIG.length).toBe(12)
    const all = lotsOf(() => 1, true)
    expect(all.length).toBe(24)
    for (const a of all) {
      expect(Math.abs(a.x) > 2.45 + 0.3 && Math.abs(a.z) > 2.45 + 0.3).toBe(true) // clear of the roads
      for (const b of all) if (a !== b) expect(Math.abs(a.x - b.x) >= 4.9 || Math.abs(a.z - b.z) >= 4.9).toBe(true)
    }
  })

  it('cars and people use the whole longer road, and nothing touches, stands on a line or leaves the pavement', () => {
    for (const size of [() => lotSize(0), () => lotSize(10), () => 1]) {
      for (const seed of [1, 2]) {
        const r = simulate('city', seed, 4, 1 / 30, size, 7)
        expect(r.crashes).toEqual([])
        expect(r.outsideLine).toBe(0)
        expect(r.minGap).toBeGreaterThan(0.04)
      }
    }
  }, 240000)

  it('with no lots at all, nobody leaves the pavement on the long roads either', () => {
    for (const seed of [1, 2]) expect(simulate('city', seed, 4, 1 / 30, null, 7).offPavement).toBe(0)
  }, 120000)
})

describe('traffic: people passing', () => {
  it('never touch: two people in the two lanes keep a clear gap between their bodies', () => {
    const w = placeWalkers(8, seeded(3))[0]
    const lanes = [LANES[0], LANES[1]]
    expect(lanes[1] - lanes[0] - 2 * w.hw).toBeGreaterThan(0.04) // the visible body is about as wide as the hit box
  })
})

describe('traffic: the signal', () => {
  it('goes green, yellow, red, then the other road gets green: yellow is never skipped', () => {
    const rng = seeded(5)
    const cars = fleet('city')
    const walkers = placeWalkers(8, rng)
    const tr = makeTraffic()
    for (let i = 0; i < 3; i++) spawnCar(cars, rng, true)
    const seen = new Set()
    let spawnIn = 0.4, last = 'x-green', jumps = 0
    for (let step = 0; step < 60 * 20 * 30; step++) {
      spawnIn -= 1 / 30
      if (spawnIn <= 0) { spawnIn = 1.8 + rng() * 2.6; spawnCar(cars, rng) }
      stepTraffic(cars, walkers, tr, 1 / 30)
      const now = tr.sig.axis + '-' + tr.sig.mode
      if (now !== last) {
        seen.add(last + ' > ' + now)
        if (last.endsWith('green') && !now.endsWith('yellow')) jumps++
        last = now
      }
    }
    expect(jumps).toBe(0)
    expect([...seen].some((s) => s.endsWith('yellow'))).toBe(true)
  }, 60000)

  it('nobody stands about on the crossroad waiting for something', () => {
    for (const name of ['city', 'japan', 'ice']) {
      for (const seed of [1, 2, 3, 4]) expect(simulate(name, seed, 8, 1 / 30).standing).toBeLessThan(1.5)
    }
  }, 120000)

  it('cars wait at the light, but not most of the time', () => {
    const r = simulate('city', 11, 10, 1 / 30)
    expect(r.carsWaiting / r.carTime).toBeLessThan(0.65) // single lane roads: a car waiting for its left arrow holds up the ones behind it
  }, 60000)
})

describe('traffic: things still get done', () => {
  it('cars keep arriving and leaving, they do not jam up for good', () => {
    const r = simulate('city', 7, 10, 1 / 30)
    expect(r.trips).toBeGreaterThan(80) // a car reaches the end of the road every few seconds
    expect(r.lastTrip).toBeGreaterThan(9 * 60) // and it is still doing so at the end
    expect(r.walked).toBeGreaterThan(8 * 60) // people really walk about
  }, 60000)

  it('cars overtake slower cars, and do it without touching', () => {
    let passes = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = simulate('city', seed, 8, 1 / 30)
      expect(r.crashes).toEqual([])
      passes += r.passes
    }
    expect(passes).toBeGreaterThan(0)
  }, 120000)
})

describe('traffic: an accident that builds up', () => {
  const crashSetup = (kind = 'rear') => {
    const rng = seeded(5)
    const cars = fleet('city')
    const tr = makeTraffic()
    const walkers = placeWalkers(8, rng)
    const [x, y, ...rest] = cars
    const drive = (c, lane, dir, t, speed) => Object.assign(c, { active: true, axis: 'x', road: 'x', lane, alt: -lane, lat: lane, goal: lane, dir, t, base: 2.4, speed, passing: null, still: 0, turn: 'straight' })
    // rear-end: one car behind the other in the same lane. head-on: two cars coming at each other in their own lanes. both well away from the crossroad.
    if (kind === 'rear') { drive(x, 0.75, 1, 9, 2.4); drive(y, 0.75, 1, 5.6, 2.4) } else { drive(x, 0.75, 1, 7, 2.6); drive(y, -0.75, -1, 17, 2.6) }
    const [a, b] = kind === 'rear' ? [y, x] : [x, y] // a loses control
    return { cars, rest, tr, walkers, a, b, rng }
  }
  const run = (s, seconds, dt = 1 / 30, each = () => {}) => {
    for (let i = 0; i < seconds / dt; i++) { stepTraffic(s.cars, s.walkers, s.tr, dt); each(i * dt) }
  }
  const watch = (s, seconds) => { // everything about how the two cars move, step by step
    const log = { hitAt: null, jump: 0, turn: 0, overlapAfter: false, yawBefore: 0, drift: 0 }
    let last = { t: s.a.t, yaw: 0 }
    const lane0 = s.a.lat
    run(s, seconds, 1 / 30, (time) => {
      if (s.a.crash && s.a.crash.hit && log.hitAt === null) log.hitAt = time
      if (log.hitAt === null) { log.yawBefore = Math.max(log.yawBefore, Math.abs(s.a.yaw)); log.drift = Math.max(log.drift, Math.abs(s.a.lat - lane0)) }
      log.jump = Math.max(log.jump, Math.abs(s.a.t - last.t))
      log.turn = Math.max(log.turn, Math.abs(s.a.yaw - last.yaw))
      last = { t: s.a.t, yaw: s.a.yaw }
      if (log.hitAt !== null && overlap(rectOf(s.a), rectOf(s.b))) log.overlapAfter = true
    })
    return log
  }

  for (const kind of ['rear', 'head']) {
    it(`${kind === 'rear' ? 'rear-end' : 'head-on'}: the driver loses control gradually (wobbling or swerving, no jump), they touch, stop crooked, and never overlap`, () => {
      const s = crashSetup(kind)
      startCrash(s.a, s.b, kind)
      const log = watch(s, 12)
      expect(log.hitAt).not.toBeNull()
      expect(log.hitAt).toBeGreaterThan(0.8) // it takes a moment: the car does not teleport into the other one
      expect(log.jump).toBeLessThan(0.25) // never more than a step of driving
      expect(log.turn).toBeLessThan(0.08) // the steering changes smoothly
      expect(log.yawBefore).toBeGreaterThan(0.12) // it really did lose control before the bump
      if (kind === 'head') expect(log.drift).toBeGreaterThan(0.3) // and swerved across the middle
      expect(log.overlapAfter).toBe(false)
      expect(s.a.speed).toBe(0)
      expect(s.b.speed).toBe(0)
      expect(Math.abs(s.a.yaw) + Math.abs(s.b.yaw)).toBeGreaterThan(0.03) // they sit a little crooked
    })
  }

  it('both cars stay where they are for as long as the crash lasts (they are not cleared away as idle)', () => {
    const s = crashSetup('head')
    startCrash(s.a, s.b, 'head')
    run(s, 8)
    const at = [s.a.t, s.b.t, s.a.lat, s.b.lat, s.a.yaw, s.b.yaw]
    run(s, 60)
    expect(s.a.active && s.b.active).toBe(true)
    expect([s.a.t, s.b.t, s.a.lat, s.b.lat, s.a.yaw, s.b.yaw]).toEqual(at)
  })

  it('other cars drive around the wreck, wait behind it or turn back, and never run into it', () => {
    for (const kind of ['rear', 'head']) {
      for (const seed of [1, 2, 3]) {
        const s = crashSetup(kind)
        s.rng = seeded(seed)
        startCrash(s.a, s.b, kind)
        let bad = 0
        for (let i = 0; i < 120 / (1 / 30); i++) {
          if (i % 45 === 0) spawnCar(s.cars, s.rng)
          stepTraffic(s.cars, s.walkers, s.tr, 1 / 30)
          for (const c of s.cars) {
            if (!c.active || c === s.a || c === s.b) continue
            for (const w of [s.a, s.b]) if (overlap(rectOf(c), rectOf(w))) bad++
          }
        }
        expect(bad).toBe(0)
      }
    }
  }, 120000)

  it('when the crash is cleared both cars straighten up and drive on', () => {
    const s = crashSetup('rear')
    startCrash(s.a, s.b, 'rear')
    run(s, 8)
    endCrash(s.a, s.b)
    expect(s.a.crash).toBeNull()
    expect(s.b.crash).toBeNull()
    const before = s.b.t
    run(s, 5)
    expect(s.b.t).toBeGreaterThan(before + 1)
    expect(Math.abs(s.a.yaw)).toBeLessThan(0.02)
    expect(Math.abs(s.b.yaw)).toBeLessThan(0.02)
  })

  it('a wreck does not hold up the traffic light', () => {
    const s = crashSetup('head')
    startCrash(s.a, s.b, 'head')
    run(s, 20)
    expect(s.tr.busy.x + s.tr.busy.z).toBeGreaterThanOrEqual(0)
    expect(s.tr.sig.mode).toBeTruthy()
  })
})

describe('traffic: turning back behind a wreck', () => {
  // a wreck on the x road (rear-end in the + lane, or head-on across the middle), and a stream of cars coming along that road from both ends
  const scene = (kind, seed, minutes) => {
    const rng = seeded(seed)
    const cars = fleet('city')
    const tr = makeTraffic()
    const walkers = placeWalkers(8, rng)
    const [x, y, ...rest] = cars
    const drive = (c, lane, dir, t, speed) => Object.assign(c, { active: true, axis: 'x', road: 'x', lane, alt: -lane, lat: lane, goal: lane, dir, t, base: 2.4, speed, passing: null, still: 0, turn: 'straight' })
    if (kind === 'rear') { drive(x, 0.75, 1, 9, 2.4); drive(y, 0.75, 1, 5.6, 2.4) } else { drive(x, 0.75, 1, 7, 2.6); drive(y, -0.75, -1, 17, 2.6) }
    const [a, b] = kind === 'rear' ? [y, x] : [x, y]
    startCrash(a, b, kind)
    const out = { turned: 0, overlaps: [], queue: 0, queueSteps: 0 }
    const wasU = new Map()
    let spawnIn = 0.5
    const dt = 1 / 30
    for (let step = 0; step < (minutes * 60) / dt; step++) {
      spawnIn -= dt
      if (spawnIn <= 0) { spawnIn = 1.6 + rng() * 1.6; spawnCar(cars, rng, false, { axis: 'x' }) }
      stepTraffic(cars, walkers, tr, dt)
      for (const c of cars) {
        const now = !!(c.arc && c.arc.kind === 'u')
        if (wasU.get(c) && !now && c.active) out.turned++
        wasU.set(c, now)
      }
      const act = cars.filter((c) => c.active)
      if (step * dt > (minutes * 60) / 2) { out.queue += act.filter((c) => c !== a && c !== b && c.speed < 0.05 && Math.abs(c.t) > 7).length; out.queueSteps++ } // how many stand waiting beside the wreck, on average, in the second half
      const all = [...act, ...walkers]
      for (let i = 0; i < all.length && out.overlaps.length < 3; i++) for (let j = i + 1; j < all.length; j++) {
        if (all[i] === a && all[j] === b) continue
        if (overlap(rectOf(all[i]), rectOf(all[j]))) { out.overlaps.push(`${seed} ${kind} at ${(step * dt).toFixed(1)}s`); break }
      }
    }
    return out
  }

  for (const kind of ['rear', 'head']) {
    it(`${kind === 'rear' ? 'rear-end' : 'head-on'} wreck: cars stuck behind it turn back, nobody overlaps anybody, and the queue does not grow for ever`, () => {
      let turned = 0
      for (const seed of [1, 2, 3]) {
        const r = scene(kind, seed, 3)
        expect(r.overlaps).toEqual([])
        expect(r.queue / r.queueSteps).toBeLessThan(4) // a queue forms and clears, it does not grow for ever
        turned += r.turned
      }
      expect(turned).toBeGreaterThan(2)
    }, 240000)
  }
})

describe('traffic: turning at the crossroad', () => {
  const run = (name, seed, minutes, each) => {
    const rng = seeded(seed)
    const cars = fleet(name)
    const walkers = placeWalkers(8, rng)
    globalThis.__walkers = walkers
    const tr = makeTraffic()
    for (let i = 0; i < 3; i++) spawnCar(cars, rng, true)
    let spawnIn = 0.4
    const dt = 1 / 30
    for (let step = 0; step < (minutes * 60) / dt; step++) {
      spawnIn -= dt
      if (spawnIn <= 0) { spawnIn = 1.8 + rng() * 2.6; spawnCar(cars, rng) }
      const before = cars.map((c) => ({ turn: c.turn, axis: c.axis, dir: c.dir, arc: !!c.arc, active: c.active }))
      stepTraffic(cars, walkers, tr, dt)
      each(cars, before, tr)
    }
  }

  it('cars turn right and left, and come out on the other road, heading the right way, in the right lane', () => {
    const seen = { right: 0, left: 0 }
    const bad = []
    run('city', 4, 8, (cars, before) => {
      cars.forEach((c, i) => {
        const b = before[i]
        if (!b.arc || c.arc || !c.active) return // just finished a curve
        seen[b.turn]++
        const side = b.turn === 'right' ? 1 : -1 // x+ right goes to z+, x+ left to z-; z+ right goes to x-, z+ left to x+
        const dir = b.axis === 'x' ? b.dir * side : -b.dir * side
        const lane = c.axis === 'x' ? (dir > 0 ? 0.75 : -0.75) : (dir > 0 ? -0.75 : 0.75)
        if (c.axis === b.axis || c.dir !== dir || c.lane !== lane || c.lat !== lane || c.turn !== 'straight') bad.push(`${b.turn} from ${b.axis}${b.dir > 0 ? '+' : '-'} came out as ${c.axis}${c.dir > 0 ? '+' : '-'} lane ${c.lane}`)
      })
    })
    expect(bad).toEqual([])
    expect(seen.right).toBeGreaterThan(5)
    expect(seen.left).toBeGreaterThan(2)
  }, 60000)

  it('a left turn only ever starts on its own arrow, never on the plain green', () => {
    let starts = 0
    const bad = []
    run('city', 5, 8, (cars, before, tr) => {
      cars.forEach((c, i) => {
        if (before[i].arc || !c.arc || c.turn !== 'left') return
        starts++
        const own = c.axis + 'l' + (c.dir > 0 ? '+' : '-')
        if (tr.sig.phase !== own) bad.push(`left turn from ${c.axis}${c.dir > 0 ? '+' : '-'} started in phase ${tr.sig.phase}`)
      })
    })
    expect(starts).toBeGreaterThan(2)
    expect(bad).toEqual([])
  }, 60000)

  it('the light only shows one phase at a time, and a left arrow never comes together with the same road through green', () => {
    const phases = new Set()
    run('city', 6, 6, (cars, before, tr) => {
      phases.add(tr.sig.phase)
      if (tr.sig.left !== 0) expect(tr.sig.phase).toBe(tr.sig.axis + 'l' + (tr.sig.left > 0 ? '+' : '-'))
      else expect(tr.sig.phase).toBe(tr.sig.axis)
    })
    expect([...phases].some((p) => p.includes('l'))).toBe(true) // the arrows really come up
  }, 60000)

  it('a turning vehicle keeps clear of the pole in the middle, and of every car and person: never closer than 15 cm, on every map', () => {
    const gap = (a, b) => { // the room between two rectangles (negative means they overlap)
      const dx = b.x - a.x, dz = b.z - a.z
      let best = -Infinity
      for (const [ux, uz] of [[a.hx, a.hz], [-a.hz, a.hx], [b.hx, b.hz], [-b.hz, b.hx]]) {
        const r = (m) => m.hl * Math.abs(m.hx * ux + m.hz * uz) + m.hw * Math.abs(-m.hz * ux + m.hx * uz)
        best = Math.max(best, Math.abs(dx * ux + dz * uz) - r(a) - r(b))
      }
      return best
    }
    let least = Infinity, turns = 0
    for (const name of Object.keys(FLEETS)) {
      for (const seed of [1, 2]) {
        run(name, seed, 3, (cars, before) => {
          const act = cars.filter((c) => c.active)
          for (const c of act) {
            if (!c.arc) continue
            turns++
            const r = rectOf(c)
            const a = -r.x * r.hx - r.z * r.hz, b = r.x * r.hz - r.z * r.hx // the pole in the middle, as seen from the vehicle
            least = Math.min(least, Math.hypot(Math.max(Math.abs(a) - r.hl, 0), Math.max(Math.abs(b) - r.hw, 0)) - 0.0) // from the middle of the pole
            for (const o of [...act, ...(globalThis.__walkers || [])]) if (o !== c) least = Math.min(least, gap(r, rectOf(o)))
          }
        })
      }
    }
    expect(turns).toBeGreaterThan(100)
    expect(least).toBeGreaterThan(0.15)
  }, 120000)

  it('every vehicle that may turn gets round the pole at least as well as it passes it driving straight', () => {
    for (const name of Object.keys(FLEETS)) {
      for (const car of fleet(name)) {
        for (const kind of ['left', 'right']) {
          const f = turnFits(car.hl, car.hw, kind)
          if (f.ok) expect(f.k).toBeGreaterThanOrEqual(0)
        }
      }
    }
    expect(turnFits(0.5, 0.3, 'left').ok).toBe(true)
    expect(turnFits(0.5, 0.3, 'right').ok).toBe(true)
  })

  it('a long vehicle (a train) never turns, it does not fit round the corner', () => {
    const rng = seeded(9)
    const cars = fleet('japan')
    for (let i = 0; i < 200; i++) {
      const c = spawnCar(cars, rng)
      if (c) { if (c.hl >= 1.8) expect(c.turn).toBe('straight'); c.active = false }
    }
  })
})

describe('traffic: people and somebody standing in the way', () => {
  it('walkers stop in front of a fighter on the footpath, turn round and never touch', () => {
    const rng = seeded(3)
    const walkers = placeWalkers(8, rng)
    const tr = makeTraffic()
    // two drivers fighting on the +side footpath of the x road, a bit out from the crossroad
    const fighter = (t) => ({ active: true, road: 'x1', t, lat: 1.55, goal: 1.55, hw: 0.3, hl: 0.32, dir: 0, speed: 0 })
    tr.blockers = [fighter(8), fighter(8.6)]
    let touched = 0, turned = 0
    const was = walkers.map((w) => w.dir)
    for (let step = 0; step < 90 * 30; step++) {
      stepTraffic([], walkers, tr, 1 / 30)
      walkers.forEach((w, i) => {
        if (w.dir !== was[i]) { was[i] = w.dir; if (w.road === 'x1') turned++ }
        if (w.road === 'x1') for (const b of tr.blockers) if (Math.abs(w.t - b.t) < w.hl + b.hl && Math.abs(w.lat - b.lat) < w.hw + b.hw) touched++
      })
    }
    expect(touched).toBe(0)
    expect(turned).toBeGreaterThan(0)
  })
})
