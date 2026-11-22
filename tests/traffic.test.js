import { describe, it, expect } from 'vitest'
import { newCar, makeTraffic, placeWalkers, spawnCar, stepTraffic, LANES, LOT_HALF, LOT_SMALL, lotSize } from '../src/traffic.js'

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
  war: '0.7x0.46 0.7x0.46 0.88x0.38 0.88x0.38 1.15x0.53 0.55x0.15 0.55x0.15 1.45x0.44 0.88x0.38',
  ocean: '1.09x0.53 1.09x0.53 1.05x0.22 0.84x0.18 0.73x0.15 0.95x0.2 1.58x0.33 0.84x0.18',
  court: '0.47x0.45 0.47x0.45 0.47x0.45 1.51x0.49 1.51x0.49 0.68x0.38 0.47x0.45',
}
const fleet = (name) => FLEETS[name].split(' ').map((s) => newCar(...s.split('x').map(Number)))

// the box a car or a person takes up on the ground
const box = (m) => {
  const along = [m.t - m.hl, m.t + m.hl], across = [m.lat - m.hw, m.lat + m.hw]
  return m.axis === 'x' ? { x: along, z: across } : { x: across, z: along }
}
const hit = (a, b) => a.x[0] < b.x[1] && b.x[0] < a.x[1] && a.z[0] < b.z[1] && b.z[0] < a.z[1]

// the eight lots that touch a footpath, with a size each (1 = fully grown, LOT_SMALL = first stage)
const lotsOf = (size) => [[4.9, 4.9], [11.1, 4.9], [4.9, 11.1], [-4.9, 4.9], [-11.1, 4.9], [-4.9, 11.1], [4.9, -4.9], [11.1, -4.9], [4.9, -11.1], [-4.9, -4.9], [-11.1, -4.9], [-4.9, -11.1]].map(([x, z]) => ({ x, z, size: size(x, z) }))

function simulate(name, seed, minutes, dt, lotSize) {
  const rng = seeded(seed)
  const cars = fleet(name)
  const walkers = placeWalkers(8, rng)
  const tr = makeTraffic()
  if (lotSize) tr.lots = lotsOf(lotSize)
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
      const beside = !lotSize ? [] : lotsOf(lotSize).filter((l) => Math.sign(w.axis === 'x' ? l.z : l.x) === w.side && Math.abs(w.t - (w.axis === 'x' ? l.x : l.z)) < LOT_HALF * l.size + 0.3 && Math.abs(Math.abs(w.axis === 'x' ? l.z : l.x) - 4.9) < 0.5)
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
        if (hit(box(all[i]), box(all[j]))) {
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
    expect(r.carsWaiting / r.carTime).toBeLessThan(0.5)
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
