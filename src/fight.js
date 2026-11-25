// a wrestling match between two drivers, as plain numbers: where every part of each fighter is at every moment (the scene only draws it).
//
// the match is a string of moves: a lock-up, then a throw (slam, clothesline, suplex) or an elbow drop from the roof of a car, then a pin with a count,
// and the other one kicks out. whoever attacks changes from move to move. every move starts and ends with both of them standing, facing each
// other, so the moves can follow each other for as long as the fight lasts.
//
// positions are in the ring: x runs along the road, z across it (away from the cars), y is up. 'yaw' is where the fighter faces (0 = along +x,
// pi = along -x), 'pitch' leans the body (positive: forward, -pi/2: lying on the back, +pi/2: lying on the front). arms and legs are swing angles
// like the walking ones (0 hangs down, -1.5 is straight ahead, -pi is straight up).

const PI = Math.PI
export const STANCE = 0.32 // how far each fighter stands from the middle

const smooth = (f) => f * f * (3 - 2 * f)
const clamp01 = (f) => Math.max(0, Math.min(1, f))

// a value that follows keyframes [[time, value], ...] (smooth between them)
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]
      return v0 + (v1 - v0) * smooth(clamp01((t - t0) / (t1 - t0 || 1)))
    }
  }
  return keys[keys.length - 1][1]
}

const stand = (x, yaw) => ({ x, z: 0, y: 0, yaw, pitch: 0, roll: 0, arms: [0, 0], legs: [0, 0] })
const mirror = (p) => ({ ...p, x: -p.x, z: p.z, yaw: PI - p.yaw, roll: -p.roll })

// a fighter described by keyframes for every part. 'k' maps a part to its keys. parts that are not given stay at the standing value.
function body(k, t, from) {
  const g = (name, dflt) => (k[name] ? track(k[name], t) : dflt)
  return {
    x: g('x', from.x), z: g('z', 0), y: g('y', 0), yaw: g('yaw', from.yaw), pitch: g('pitch', 0), roll: g('roll', 0),
    arms: [g('al', 0), g('ar', 0)], legs: [g('ll', 0), g('lr', 0)],
  }
}

const A0 = stand(-STANCE, 0)
const B0 = stand(STANCE, PI)

// ---------------------------------------------------------------- the moves
// each move: { dur, at(t, ctx) } -> { a, b, count } where 'a' is the one who attacks (standing on the left at the start) and 'b' the one who is thrown.
// ctx has the car roof (for the elbow drop): ctx.roof = { x, z, y } or null.

const arms = (v) => ({ al: v, ar: v })

const MOVES = {
  // both lock up, push and pull, and let go
  grapple: {
    dur: 1.7,
    at() {
      const lock = [[0, 0], [0.35, -1.35], [1.3, -1.35], [1.7, 0]]
      const push = (t) => Math.sin(t * 5.5) * 0.06 * clamp01(Math.min(t - 0.3, 1.4 - t) * 4) // each pushes and gives way, together
      return {
        a: (t) => { const q = body({ x: [[0, -STANCE], [0.35, -0.27], [1.7, -STANCE]], pitch: [[0, 0], [0.4, 0.3], [1.3, 0.3], [1.7, 0]], al: lock, ar: lock, yaw: [[0, 0]] }, t, A0); q.x += push(t); return q },
        b: (t) => { const q = body({ x: [[0, STANCE], [0.35, 0.27], [1.7, STANCE]], pitch: [[0, 0], [0.4, 0.3], [1.3, 0.3], [1.7, 0]], al: lock, ar: lock, yaw: [[0, PI]] }, t, B0); q.x -= push(t); return q },
      }
    },
  },

  // lifts him across the chest, holds him up, drives him into the ground
  slam: {
    dur: 3.1,
    at() {
      const up = [[0, 0], [0.4, -1.4], [0.9, -2.9], [1.5, -2.9], [1.75, -0.5], [2.3, -2.6], [2.7, -0.2], [3.1, 0]]
      return {
        a: (t) => body({
          x: [[0, -STANCE], [0.5, -0.3], [1.0, -0.2], [1.6, -0.15], [1.8, -0.2], [2.3, -0.5], [2.8, -0.35], [3.1, -STANCE]],
          pitch: [[0, 0], [0.5, 0.5], [1.0, -0.05], [1.5, -0.2], [1.8, 0.5], [2.3, 0], [3.1, 0]], al: up, ar: up, yaw: [[0, 0]],
        }, t, A0),
        b: (t) => body({
          x: [[0, STANCE], [0.5, 0.3], [1.0, 0.16], [1.5, 0.16], [1.8, 0.14], [2.6, 0.14], [3.1, STANCE]],
          y: [[0, 0], [0.5, 0], [1.0, 1.0], [1.5, 1.0], [1.8, 0.12], [2.6, 0.12], [3.1, 0]],
          pitch: [[0, 0], [0.5, 0.2], [1.0, -PI / 2], [1.8, -PI / 2], [2.6, -PI / 2], [3.1, 0]],
          al: [[0, 0], [0.5, -1.2], [1.0, -1.0], [1.8, -2.2], [2.6, -0.4], [3.1, 0]], ar: [[0, 0], [0.5, -1.2], [1.0, 1.0], [1.8, 2.2], [2.6, 0.4], [3.1, 0]],
          ll: [[0, 0], [1.0, 0.3], [3.1, 0]], lr: [[0, 0], [1.0, -0.3], [3.1, 0]], yaw: [[0, PI]],
        }, t, B0),
        lieAt: [1.9, 2.6], // when he is on the floor (a pin or an elbow follows)
      }
    },
  },

  // runs at him with a stiff arm, he goes down on his back
  clothesline: {
    dur: 2.8,
    at() {
      return {
        a: (t) => body({
          x: [[0, -STANCE], [0.5, -0.9], [1.0, 0.0], [1.15, 0.12], [1.6, 0.0], [2.2, -0.2], [2.8, -STANCE]],
          pitch: [[0, 0], [0.5, 0.35], [1.0, 0.25], [1.5, 0.1], [2.8, 0]], al: [[0, 0], [0.5, -0.6], [1.0, -1.57], [1.4, -1.57], [2.0, -0.4], [2.8, 0]], ar: [[0, 0], [0.5, 0.6], [1.0, -0.2], [2.8, 0]],
          ll: [[0, 0], [0.5, 0.9], [1.0, -0.7], [1.4, 0.2], [2.8, 0]], lr: [[0, 0], [0.5, -0.9], [1.0, 0.7], [1.4, -0.2], [2.8, 0]], yaw: [[0, 0]],
        }, t, A0),
        b: (t) => body({
          x: [[0, STANCE], [1.0, 0.32], [1.4, 0.85], [1.9, 0.95], [2.2, 0.95], [2.8, STANCE]],
          y: [[0, 0], [1.0, 0], [1.2, 0.55], [1.5, 0.12], [2.3, 0.12], [2.8, 0]],
          pitch: [[0, 0], [1.0, 0], [1.4, -PI / 2], [2.2, -PI / 2], [2.8, 0]], al: [[0, 0], [1.0, 0], [1.4, -2.0], [2.2, -0.3], [2.8, 0]], ar: [[0, 0], [1.0, 0], [1.4, 2.0], [2.2, 0.3], [2.8, 0]], yaw: [[0, PI]],
        }, t, B0),
        lieAt: [1.5, 2.2],
      }
    },
  },

  // hooks him from behind and throws him over backwards
  suplex: {
    dur: 3.0,
    at() {
      return {
        a: (t) => body({
          x: [[0, -STANCE], [0.5, 0.12], [1.0, 0.12], [1.5, -0.1], [2.0, -0.35], [3.0, -STANCE]],
          pitch: [[0, 0], [0.5, 0.2], [1.0, -0.1], [1.4, -0.7], [1.8, 0.3], [2.4, 0], [3.0, 0]], al: [[0, 0], [0.5, -1.4], [1.0, -2.5], [1.5, -2.9], [2.0, -1.0], [3.0, 0]], ar: [[0, 0], [0.5, -1.4], [1.0, -2.5], [1.5, -2.9], [2.0, -1.0], [3.0, 0]], yaw: [[0, 0]],
        }, t, A0),
        b: (t) => body({
          x: [[0, STANCE], [0.5, 0.34], [1.0, 0.2], [1.4, -0.1], [1.8, 0.0], [2.6, 0.0], [3.0, STANCE]],
          y: [[0, 0], [0.5, 0], [1.0, 0.9], [1.4, 1.2], [1.8, 0.12], [2.6, 0.12], [3.0, 0]],
          pitch: [[0, 0], [0.5, 0], [1.0, 1.2], [1.4, PI], [1.8, PI * 1.5], [2.6, PI * 1.5], [3.0, PI * 2]], al: [[0, 0], [1.0, -1.8], [1.8, -2.4], [2.6, -0.3], [3.0, 0]], ar: [[0, 0], [1.0, 1.8], [1.8, 2.4], [2.6, 0.3], [3.0, 0]], yaw: [[0, PI]], // (over the top, forward, onto his back; and a full turn to stand up again)
        }, t, B0),
        lieAt: [1.8, 2.6],
      }
    },
  },

  // the attacker climbs on the roof of a car, shows off, and jumps with an elbow onto him (the victim is already on the floor)
  elbow: {
    dur: 5.0,
    needsRoof: true,
    at(ctx) {
      const r = ctx.roof
      return {
        a: (t) => body({
          x: [[0, -STANCE], [0.6, -0.5], [1.3, r.x], [1.3, r.x], [3.1, r.x], [3.7, 0.55], [4.3, 0.55], [5.0, -STANCE]],
          z: [[0, 0], [0.6, 0], [1.3, r.z], [3.1, r.z], [3.7, 0.05], [4.3, 0.05], [5.0, 0]],
          y: [[0, 0], [1.3, 0], [2.0, r.y], [3.1, r.y], [3.35, r.y + 0.45], [3.7, 0.34], [4.3, 0.34], [5.0, 0]],
          pitch: [[0, 0], [2.0, 0], [3.1, 0], [3.35, 0.3], [3.7, PI / 2], [4.3, PI / 2], [4.9, 0], [5.0, 0]],
          al: [[0, 0], [1.3, -0.6], [2.0, -2.8], [3.0, -3.0], [3.3, -2.2], [3.7, -0.8], [4.3, -0.8], [4.9, 0]], ar: [[0, 0], [1.3, -0.6], [2.0, -2.8], [3.0, -3.0], [3.3, -2.2], [3.7, 0.5], [4.3, 0.5], [4.9, 0]],
          ll: [[0, 0], [0.6, 0.8], [1.3, -0.5], [2.0, 0.4], [3.1, 0], [4.9, 0]], lr: [[0, 0], [0.6, -0.8], [1.3, 0.5], [2.0, -0.4], [3.1, 0], [4.9, 0]], yaw: [[0, 0], [3.1, 0], [3.5, 0]],
        }, t, A0),
        b: (t) => body({
          x: [[0, STANCE], [0.8, 0.32], [1.2, 0.85], [1.7, 0.95], [3.9, 0.95], [4.6, 0.62], [5.0, STANCE]],
          y: [[0, 0], [0.8, 0], [1.0, 0.55], [1.3, 0.12], [3.9, 0.12], [4.5, 0], [5.0, 0]],
          pitch: [[0, 0], [0.8, 0], [1.2, -PI / 2], [3.9, -PI / 2], [4.5, 0], [5.0, 0]], al: [[0, 0], [1.2, -2.0], [3.9, -0.3], [4.5, 0]], ar: [[0, 0], [1.2, 2.0], [3.9, 0.3], [4.5, 0]], yaw: [[0, PI]],
        }, t, B0),
        lieAt: [1.3, 3.9],
        pinAt: [3.75, 4.35],
      }
    },
  },
}

// the pin: the attacker drops across him, the referee's count goes up (1, 2, 3), he kicks out at two (sometimes at three) and throws him off
export const PIN_TIME = 3.4
const throwEnd = (move) => MOVES[move].at({ roof: null }).lieAt[0] + 0.5 // a pin starts when he is lying and the attacker has stepped up

// ---------------------------------------------------------------- the whole match
// the match is a list of segments, made as it goes: each is { move, swap, pin, dur, kick }. 'swap' means the fighter on the right attacks.
export function nextSegment(prev, rng, hasRoof) {
  const last = prev ? prev.move : null
  const swap = prev ? (rng() < 0.7 ? !prev.swap : prev.swap) : false
  let move
  if (last === 'grapple' || last === null) {
    const pool = ['slam', 'slam', 'clothesline', 'suplex', ...(hasRoof ? ['elbow', 'elbow'] : [])]
    move = pool[Math.floor(rng() * pool.length)]
  } else move = 'grapple'
  const pin = move !== 'grapple' && move !== 'elbow' && rng() < 0.6
  const dur = pin ? throwEnd(move) + PIN_TIME : MOVES[move].dur
  return { move, swap, pin, dur, kick: rng() < 0.75 ? 2 : 3 }
}

// where both fighters are at time t of a segment: f0 started on the left, f1 on the right. count is the referee's count (or null), lying is true
// while somebody is on the floor
export function poseAt(seg, t, ctx = {}) {
  const m = MOVES[seg.move]
  const roof = ctx.roof ? (seg.swap ? { ...ctx.roof, x: -ctx.roof.x } : ctx.roof) : null // (the roof stays where it is, whoever is the attacker)
  const d = m.at({ roof })
  const end = seg.pin ? throwEnd(seg.move) : m.dur
  const tm = Math.min(t, end)
  let att = d.a(tm), vic = d.b(tm)
  let count = null
  let lying = d.lieAt ? tm >= d.lieAt[0] && tm <= d.lieAt[1] : false

  if (seg.pin && t > end) {
    const p = t - end
    const kickAt = seg.kick === 3 ? 1.7 : 1.15
    const drop = smooth(clamp01(p / 0.35))
    const out = smooth(clamp01((p - kickAt) / 0.5)) // he throws him off
    const getUp = smooth(clamp01((p - kickAt - 0.5) / 1.0))
    const a0 = att, v0 = vic
    att = {
      x: (a0.x + (v0.x + 0.55 - a0.x) * drop) * (1 - getUp) + -STANCE * getUp,
      z: out * 0.5 * (1 - getUp), y: 0.34 * drop * (1 - out) + 0.12 * out * (1 - getUp), yaw: 0,
      pitch: (PI / 2) * drop * (1 - getUp), roll: out * 0.8 * (1 - getUp), arms: [-0.5 * drop * (1 - getUp), 0.5 * drop * (1 - getUp)], legs: [0, 0],
    }
    vic = { ...v0, x: v0.x + (STANCE - v0.x) * getUp, y: v0.y * (1 - getUp), pitch: v0.pitch * (1 - getUp), arms: [v0.arms[0] * (1 - getUp), v0.arms[1] * (1 - getUp)] }
    count = p > 0.5 && p < kickAt + 0.3 ? Math.min(3, 1 + Math.floor((p - 0.5) / 0.55)) : null
    lying = p < kickAt + 1.0
  }
  if (seg.move === 'elbow') { // the referee counts two while the attacker lies on him
    const p = t - d.pinAt[0]
    count = p > 0 && p < 0.9 ? Math.min(2, 1 + Math.floor(p / 0.45)) : null
  }
  return seg.swap ? { f0: mirror(vic), f1: mirror(att), count, lying } : { f0: att, f1: vic, count, lying }
}

// the stance both fighters start and end every move in
export const stances = () => ({ f0: { ...A0 }, f1: { ...B0 } })
