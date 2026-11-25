import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'
import { makeMaps, MAP_LIST } from './maps.js'
import { treesLeft, TREES_PER_LOT, roadTaken, accidentWeights, pickLot, accidentChance, fightGoesOn, MAX_ACCIDENTS } from './cityRules.js'
import { newCar, makeTraffic, placeWalkers, spawnCar, stepTraffic, LOT_SMALL, lotSize, startCrash, endCrash } from './traffic.js'

// helpers
const shade = (c, a) => new THREE.Color(c).offsetHSL(0, 0, a).getHex()
// toon look for the japan map
let TOON = false
let WIRE = false
const toonRamp = (() => {
  let t
  return () => {
    if (t) return t
    t = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat)
    t.minFilter = t.magFilter = THREE.NearestFilter
    t.needsUpdate = true
    return t
  }
})()
const L = (c, map) => {
  if (WIRE) return new THREE.MeshBasicMaterial({ color: c, wireframe: true })
  const o = map ? { map } : { color: c }
  return TOON ? new THREE.MeshToonMaterial({ ...o, gradientMap: toonRamp() }) : new THREE.MeshLambertMaterial(o)
}

function mk(parent, geo, color, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? L(color) : color)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = true
  parent.add(m)
  return m
}
const bx = (p, w, h, d, c, x = 0, y = 0, z = 0) => mk(p, new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z)
const cyl = (p, r, h, c, x = 0, y = 0, z = 0, seg = 12) => mk(p, new THREE.CylinderGeometry(r, r, h, seg), c, x, y + h / 2, z)

const texCache = new Map()
function windowTex(wall, floors, cols, glass = 0x2b3a55) {
  const key = [wall, floors, cols, glass].join('|')
  if (texCache.has(key)) return texCache.get(key)
  const cw = 64
  const ch = Math.max(10, Math.min(56, Math.floor(2000 / floors)))
  const c = document.createElement('canvas')
  c.width = cw * cols
  c.height = ch * floors
  const g = c.getContext('2d')
  g.fillStyle = '#' + new THREE.Color(wall).getHexString()
  g.fillRect(0, 0, c.width, c.height)
  for (let r = 0; r < floors; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * cw + 14, y = r * ch + 12
      g.fillStyle = '#' + new THREE.Color(glass).getHexString()
      g.fillRect(x, y, cw - 28, ch - 24)
      g.fillStyle = 'rgba(255,255,255,.32)'
      g.fillRect(x + 3, y + 3, 6, ch - 30)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  texCache.set(key, t)
  return t
}
function wall(p, w, h, d, color, floors, cols, x = 0, y = 0, z = 0, glass) {
  const side = WIRE ? L(color) : L(0, windowTex(color, floors, cols, glass))
  const top = L(shade(color, -0.12))
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, side, side])
  m.position.set(x, y + h / 2, z)
  m.castShadow = true
  m.receiveShadow = true
  p.add(m)
  return m
}
function textPlane(p, text, w, h, bg, fg, x, y, z, ry = 0) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = Math.round(256 * (h / w))
  const g = c.getContext('2d')
  g.fillStyle = bg
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = fg
  g.font = `900 ${Math.round(c.height * 0.62)}px Arial Black, Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, c.width / 2, c.height / 2 + 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }))
  m.position.set(x, y, z)
  m.rotation.y = ry
  p.add(m)
  return m
}

// buildings, about 3.6 x 3.6
const STYLE_FN = {
  house(g, f, col) {
    const h = 0.8 + 0.75 * f
    wall(g, 3.0, h, 2.6, shade(col, 0.28), f, 2)
    const roof = mk(g, new THREE.ConeGeometry(2.35, 1.25, 4), shade(col, -0.05), 0, h + 0.62, 0)
    roof.rotation.y = Math.PI / 4
    bx(g, 0.55, 0.85, 0.12, 0x7a4b2a, 0, 0, 1.32)
    bx(g, 0.32, 0.9, 0.32, 0x8a5a44, 0.8, h + 0.35, 0)
  },
  tower(g, f, col) {
    const h = 1.6 + 1.35 * f
    wall(g, 2.6, h, 2.6, shade(col, 0.12), f * 2, 3, 0, 0, 0, 0x203a5a)
    bx(g, 2.8, 0.22, 2.8, 0x3a4250, 0, h, 0)
    cyl(g, 0.06, 1.0, 0x8a919c, 0.6, h + 0.2, 0.6, 6)
    bx(g, 0.9, 0.5, 0.9, 0x59616e, -0.6, h + 0.2, -0.5)
  },
  shop(g, f, col) {
    const h = 1.1 + 0.8 * f
    wall(g, 3.4, h, 2.6, shade(col, 0.3), f, 3)
    const aw = bx(g, 3.4, 0.14, 1.05, col, 0, 1.15, 1.55)
    aw.rotation.x = 0.32
    bx(g, 2.2, 0.42, 0.14, 0x1f2937, 0, 1.62, 1.33)
    bx(g, 0.8, 1.0, 0.1, 0x2b3a55, -0.9, 0, 1.31)
    bx(g, 1.2, 0.7, 0.08, 0xcfe8f5, 0.9, 0.3, 1.31)
  },
  dome(g, f, col) {
    const h = 1.0 + 0.55 * f
    wall(g, 3.4, h, 2.8, 0xefe4cc, f, 4, 0, 0, 0, 0x6b5b45)
    for (let i = 0; i < 4; i++) cyl(g, 0.14, h, 0xfaf5e8, -1.35 + i * 0.9, 0, 1.55, 10)
    bx(g, 3.7, 0.28, 3.1, 0xd8c9a8, 0, h, 0.05)
    const dome = mk(g, new THREE.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), col, 0, h + 0.28, 0)
    dome.scale.y = 0.85
    cyl(g, 0.05, 0.6, 0xd4af37, 0, h + 1.2, 0, 6)
  },
  market(g, f, col) {
    const n = Math.min(1 + f, 6)
    for (let i = 0; i < n; i++) {
      const x = ((i % 3) - 1) * 1.2
      const z = (Math.floor(i / 3) - 0.5) * 1.5
      bx(g, 0.95, 0.42, 0.62, 0x8b5a3c, x, 0, z)
      const c = bx(g, 1.1, 0.1, 0.8, i % 2 ? 0xffffff : col, x, 1.0, z)
      c.rotation.x = 0.12
      for (const dx of [-0.48, 0.48]) cyl(g, 0.03, 1.0, 0xcbd5e1, x + dx, 0, z + 0.34, 5)
      bx(g, 0.3, 0.2, 0.3, [0xe63946, 0x2a9d8f, 0xf4a261][i % 3], x - 0.25, 0.42, z)
      bx(g, 0.28, 0.16, 0.28, [0x2a9d8f, 0xf4a261, 0xe63946][i % 3], x + 0.22, 0.42, z)
    }
  },
  cafe(g, f, col) {
    const h = 0.9 + 0.45 * f
    wall(g, 2.2, h, 2.0, shade(col, 0.32), f, 2, -0.6, 0, -0.3)
    const aw = bx(g, 2.2, 0.12, 0.8, col, -0.6, 0.95, 0.9)
    aw.rotation.x = 0.3
    bx(g, 2.4, 0.2, 2.2, 0x3a3a3a, -0.6, h, -0.3)
    const n = Math.min(f, 3)
    for (let i = 0; i < n; i++) {
      const x = 1.05, z = -1.1 + i * 1.05
      cyl(g, 0.04, 1.0, 0xcbd5e1, x, 0, z, 5)
      mk(g, new THREE.ConeGeometry(0.55, 0.28, 8), i % 2 ? 0xffffff : col, x, 1.1, z)
      cyl(g, 0.25, 0.05, 0x6b4f3a, x, 0.45, z + 0.0, 10)
    }
  },
  cinema(g, f, col) {
    const h = 1.3 + 0.75 * f
    wall(g, 3.4, h, 2.6, 0x3b3358, f, 3, 0, 0, 0, 0x8d7bd6)
    bx(g, 2.7, 0.46, 0.9, 0xff4fa3, 0, 1.15, 1.55)
    bx(g, 2.9, 0.12, 1.05, 0x1b1b2b, 0, 1.6, 1.52)
    textPlane(g, 'CINEMA', 2.4, 0.55, '#1b1b2b', '#ffd166', 0, h - 0.35, 1.32)
    bx(g, 3.5, 0.18, 2.7, 0x24203a, 0, h, 0)
  },
  tech(g, f, col) {
    const h = 1.5 + 1.0 * f
    wall(g, 3.0, h, 2.8, 0x2a4a73, f * 2, 3, 0, 0, 0, 0x9ad0ff)
    bx(g, 3.2, 0.2, 3.0, 0x1b2d44, 0, h, 0)
    textPlane(g, 'TECH', 1.9, 0.5, '#0f1b2d', '#7bd0ff', 0, 1.25, 1.42)
    cyl(g, 0.05, 1.3, 0xb8c2cf, -0.8, h + 0.2, -0.7, 6)
    const dish = mk(g, new THREE.SphereGeometry(0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe5e9f0, 0.7, h + 0.55, 0.3)
    dish.rotation.x = -0.9
  },
  depot(g, f, col) {
    const h = 0.9 + 0.35 * f
    wall(g, 3.8, h, 2.4, 0xe5e7eb, f, 4, 0, 0, -0.4, 0x5b6575)
    bx(g, 3.82, 0.22, 2.42, col, 0, 0.3, -0.4)
    bx(g, 1.1, 0.7, 0.1, 0x2b3340, -0.9, 0, 0.82)
    bx(g, 1.1, 0.7, 0.1, 0x2b3340, 0.9, 0, 0.82)
    bx(g, 3.9, 0.18, 2.5, 0x4b5563, 0, h, -0.4)
    const bus = makeBus(col)
    bus.scale.setScalar(0.5)
    bus.position.set(0, 0, 1.45)
    g.add(bus)
  },
}

function kiosk(g, col) {
  bx(g, 1.3, 0.95, 1.3, shade(col, 0.25), 0, 0, 0)
  const aw = bx(g, 1.7, 0.1, 1.1, col, 0, 0.95, 0.55)
  aw.rotation.x = 0.3
  bx(g, 0.7, 0.25, 0.5, 0xe8d5b5, 0.9, 0, 0.5)
}

function makeCar(color) {
  const g = new THREE.Group()
  bx(g, 1.35, 0.38, 0.68, color, 0, 0.14, 0)
  bx(g, 0.72, 0.32, 0.6, shade(color, 0.28), -0.08, 0.5, 0)
  for (const x of [-0.42, 0.42]) for (const z of [-0.32, 0.32]) bx(g, 0.22, 0.22, 0.12, 0x1a1a1a, x, 0, z)
  return g
}
function makeBus(color = 0x2f6fd0) {
  const g = new THREE.Group()
  bx(g, 3.0, 0.9, 0.95, color, 0, 0.18, 0)
  bx(g, 2.7, 0.3, 0.97, 0xcfe8f5, 0, 0.62, 0)
  bx(g, 3.02, 0.1, 0.96, 0xffffff, 0, 0.5, 0)
  for (const x of [-0.9, 0.9]) for (const z of [-0.42, 0.42]) bx(g, 0.3, 0.3, 0.12, 0x1a1a1a, x, 0, z)
  return g
}

function makeVan(color = 0xf1f5f9) {
  const g = new THREE.Group()
  bx(g, 1.75, 0.62, 0.74, color, 0, 0.16, 0)
  bx(g, 0.5, 0.36, 0.76, 0xcfe8f5, 0.62, 0.52, 0)
  bx(g, 1.77, 0.08, 0.75, 0x2f6fd0, 0, 0.42, 0)
  for (const x of [-0.5, 0.5]) for (const z of [-0.34, 0.34]) bx(g, 0.24, 0.24, 0.12, 0x1a1a1a, x, 0, z)
  return g
}
function makeTruck(color = 0xf08a24) {
  const g = new THREE.Group()
  bx(g, 0.8, 0.6, 0.8, color, 1.05, 0.16, 0)
  bx(g, 0.34, 0.3, 0.82, 0xcfe8f5, 1.28, 0.5, 0)
  bx(g, 1.9, 0.9, 0.86, 0xe5e7eb, -0.4, 0.2, 0)
  for (const x of [-1.0, -0.2, 1.1]) for (const z of [-0.38, 0.38]) bx(g, 0.26, 0.26, 0.12, 0x1a1a1a, x, 0, z)
  return g
}

// a small swimming fish for the pavements of the ocean map. it faces +z like a person does, and its tail pivot wags.
function makeFish(color, rng) {
  const g = new THREE.Group()
  const body = mk(g, new THREE.SphereGeometry(0.2, 10, 8), color, 0, 0, 0)
  body.scale.set(0.55, 0.85, 1.6)
  const tail = new THREE.Group()
  tail.position.set(0, 0, -0.3)
  g.add(tail)
  const fin = mk(tail, new THREE.ConeGeometry(0.16, 0.26, 4), shade(color, -0.12), 0, 0, -0.12)
  fin.rotation.x = -Math.PI / 2 // the tip trails behind
  fin.scale.x = 0.35
  mk(g, new THREE.ConeGeometry(0.08, 0.15, 4), shade(color, 0.12), 0, 0.17, -0.02) // the fin on its back
  for (const sx of [-1, 1]) mk(g, new THREE.SphereGeometry(0.035, 6, 5), 0x111111, sx * 0.075, 0.05, 0.25, false)
  g.userData = { fish: true, tail, body }
  g.scale.setScalar(1.5 + rng() * 0.6)
  return g
}

// a diver: a person in a wetsuit with a mask, an air tank and flippers (used for walking, felling trees and fighting on the ocean map)
function makeDiver(rng) {
  const g = makePerson(rng)
  const u = g.userData
  u.hat.visible = false
  u.hands.forEach((h) => h.material.color.set(0x222222))
  mk(g, new THREE.BoxGeometry(0.23, 0.09, 0.05), 0x8fe3ff, 0, 1.02, 0.15, false) // the mask
  bx(g, 0.26, 0.03, 0.04, 0x111111, 0, 1.02, 0.13)
  cyl(g, 0.075, 0.42, 0xf4a000, 0, 0.3, -0.17, 10) // the air tank
  bx(g, 0.05, 0.08, 0.05, 0x777777, 0, 0.74, -0.17)
  for (const leg of u.legs) bx(leg, 0.14, 0.03, 0.3, 0x111111, 0, -0.47, 0.16) // flippers
  g.rotation.order = 'YXZ'
  u.diver = true
  return g
}

function makePerson(rng) {
  const g = new THREE.Group()
  const skin = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac][Math.floor(rng() * 5)]
  const legs = [], arms = [], thighs = [], shins = [], sleeves = [], hands = []
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(sx * 0.085, 0.44, 0)
    thighs.push(bx(leg, 0.13, 0.23, 0.15, 0x3b5bdb, 0, -0.23, 0))
    shins.push(bx(leg, 0.12, 0.23, 0.14, 0x3b5bdb, 0, -0.44, 0))
    bx(leg, 0.13, 0.05, 0.2, 0x2b2b2b, 0, -0.44, 0.03)
    g.add(leg); legs.push(leg)
    const arm = new THREE.Group()
    arm.position.set(sx * 0.18, 0.82, 0)
    sleeves.push(bx(arm, 0.1, 0.26, 0.11, 0xff6b6b, 0, -0.26, 0))
    hands.push(bx(arm, 0.09, 0.1, 0.1, skin, 0, -0.36, 0))
    g.add(arm); arms.push(arm)
  }
  const torso = bx(g, 0.34, 0.4, 0.2, 0xff6b6b, 0, 0.44, 0)
  const head = mk(g, new THREE.SphereGeometry(0.15, 10, 8), skin, 0, 1.0, 0)
  const hat = mk(g, new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd62828, 0, 1.03, 0)
  g.userData = { torso, head, hat, skin, legs, arms, thighs, shins, sleeves, hands }
  g.scale.setScalar(1.05)
  return g
}

function roundTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.6, 'rgba(255,255,255,.9)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.beginPath()
  g.arc(32, 32, 30, 0, Math.PI * 2)
  g.fill()
  return new THREE.CanvasTexture(c)
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MAPS = makeMaps({ THREE, bx, cyl, mk, wall, shade, makeCar, makeBus, makeVan, makeTruck, windowTex })
const M = (c) => (typeof c === 'number' ? L(c) : c)
const MAP_SKY = Object.fromEntries(MAP_LIST.map((m) => [m.id, m.hud === 'light' ? [m.sky[0], m.sky[1], m.sky[1]] : m.sky]))

const LOT_Q = [[1, -1], [1, 1], [-1, 1], [-1, -1]]
const CELLS = [[4.9, 4.9], [11.1, 4.9], [4.9, 11.1]] // the first 12 counties
// counties 13 to 24: the old park corner becomes a lot, and there are two more along the roads. the park moves out to the corner.
const CELLS_2 = [[11.1, 11.1], [17.3, 4.9], [4.9, 17.3]]
export const BIG_CITY = 12 // with more counties than this the city grows a second ring. dormant: the app allows 12 counties (MAX_COUNTIES in store.js), raise that to switch it on
// where the trees of a county stand, inside its plot (the last ones are cut first)
const TREE_SLOTS = [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8], [0, -2.1], [0, 2.1], [-2.1, 0], [2.1, 0]]
const HALF = [15, 22] // from the middle of the city to the edge of the board
const TAU = Math.PI * 2

// scene
export class CityScene {
  constructor(container, { onSelect, onViewChanged } = {}) {
    this.container = container
    this.onSelect = onSelect || (() => {})
    this.onViewChanged = onViewChanged || (() => {})
    this.rng = mulberry(7)
    this.crashes = [] // staged accidents: two cars that bumped, and the drivers fighting
    this.crashClock = 0
    this.odds = [] // for every lot: how much is spent in its county, its group and level (what decides where accidents happen)
    this.felling = [] // trees being cut down, with the worker
    this.growing = [] // trees being planted
    this.ring2 = false // the city grows a second ring when there are more than BIG_CITY counties
    this.E = HALF[0]
    this.lots = []
    this.walkers = []
    this.cars = []
    this.clock = { last: performance.now(), elapsedTime: 0, getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d } }
    this.moved = false
    this.selected = null
    this.map = null
    this.world = null
    this.lastList = null
    this.spinners = []
    this.dark = false
    this.tween = null
    this.filter = null
    this.running = false

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setClearColor(0x000000, 0)
    container.appendChild(this.renderer.domElement)

    this.outline = new OutlineEffect(this.renderer, { defaultThickness: 0.0035, defaultColor: [0.13, 0.1, 0.16], defaultAlpha: 1 })
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 1, 5, 600)

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x9fb0c4, 1.4)
    this.sun = new THREE.DirectionalLight(0xfff1cc, 2.4)
    this.sun.position.set(26, 44, 18)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const sc = this.sun.shadow.camera
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 5; sc.far = 140
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.hemi, this.sun)

    this.buildParticles()
    this.buildRings()

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.09
    this.controls.screenSpacePanning = false
    this.controls.rotateSpeed = 0.7
    this.controls.zoomSpeed = 0.9
    this.controls.minPolarAngle = 0.32
    this.controls.maxPolarAngle = 1.28
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    this.controls.addEventListener('change', () => this.checkMoved())
    this.controls.addEventListener('start', () => { this.tween = null })

    this.raycaster = new THREE.Raycaster()
    this.bindPointer()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize(true)
    this.setMap('city')
  }

  // world
  buildWorld() {
    const s = this.world
    const m = this.mats
    const rng = this.rng
    const T = this.T, C = T.c
    // board
    const E = this.E // half the width of the board
    bx(s, 2 * E, 0.9, 2 * E, C.base, 0, -1.4, 0)
    bx(s, 2 * E + 0.2, 0.12, 2 * E + 0.2, C.base2, 0, -1.55, 0)
    const g = mk(s, new THREE.BoxGeometry(2 * E, 0.5, 2 * E), m.grass, 0, -0.25, 0)
    g.castShadow = false
    // roads
    for (const [w, d] of [[2 * E, 3], [3, 2 * E]]) {
      const r = mk(s, new THREE.BoxGeometry(w, 0.06, d), C.road, 0, 0.03, 0, false)
      if (w === 3) r.position.y = 0.035
    }
    // pavement along the roads. people walk on this and nowhere else
    const pave = shade(C.pad, -0.14)
    for (const sg of [-1, 1]) {
      for (const hf of [-1, 1]) {
        const len = E - 1.5 // the pavement runs from the crossroad to the end of the board
        const mid = hf * (1.5 + len / 2)
        mk(s, new THREE.BoxGeometry(len, 0.05, 0.92), pave, mid, 0.1, sg * 1.96, false)
        mk(s, new THREE.BoxGeometry(0.92, 0.05, len), pave, sg * 1.96, 0.102, mid, false)
      }
    }
    if (T.dashes) {
      const dash = M(C.dash), cross = M(C.cross)
      const dm = Math.floor((E - 2) / 2) * 2 + 1
      for (let i = -dm; i <= dm; i += 2) {
        if (Math.abs(i) < 2.2) continue
        bx(s, 1.0, 0.02, 0.12, dash, i, 0.07, 0)
        bx(s, 0.12, 0.02, 1.0, dash, 0, 0.075, i)
      }
      for (const sgn of [-1, 1]) {
        for (let k = -1; k <= 1; k++) {
          bx(s, 0.5, 0.02, 0.28, cross, sgn * 2.1, 0.08, k * 0.75)
          bx(s, 0.28, 0.02, 0.5, cross, k * 0.75, 0.085, sgn * 2.1)
        }
      }
    }
    if (T.id === 'court') {
      const ring = mk(s, new THREE.RingGeometry(1.0, 1.12, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 0, 0.1, 0, false)
      ring.rotation.x = -Math.PI / 2
    }
    // slabs
    for (const [sx, sz] of LOT_Q) {
      const side = E - 2.2 // 12.8 in the small city
      const mid = 1.6 + side / 2
      const p = mk(s, new THREE.BoxGeometry(side, 0.1, side), m.pad, sx * mid, 0.05, sz * mid, false)
      p.receiveShadow = true
    }
    if (T.wire) {
      const grid = new THREE.GridHelper(2 * E, 2 * E, C.road, C.pad)
      grid.position.y = 0.02
      s.add(grid)
    }
    if (T.zone) {
      const zone = mk(s, new THREE.RingGeometry(E - 1.8, E - 1.5, 64), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), 0, 0.3, 0, false)
      zone.rotation.x = -Math.PI / 2
      const wallz = mk(s, new THREE.CylinderGeometry(E - 1.65, E - 1.65, 3, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.12, depthWrite: false }), 0, 1.8, 0, false)
      wallz.renderOrder = 2
    }
    if (T.studs) {
      const pts = []
      const sm = Math.floor(E - 1)
      for (let x = -sm; x <= sm; x++) for (let z = -sm; z <= sm; z++) if (Math.abs(x) > 1.7 && Math.abs(z) > 1.7) pts.push([x, z])
      const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 10), L(shade(new THREE.Color(m.pad.color).getHex(), -0.05)), pts.length)
      const mat = new THREE.Matrix4()
      pts.forEach(([x, z], k) => { mat.makeTranslation(x, 0.135, z); im.setMatrixAt(k, mat) })
      im.receiveShadow = true
      s.add(im)
    }
    // lamps
    for (const i of this.ring2 ? [-18, -12, -6, 6, 12, 18] : [-12, -6, 6, 12]) {
      for (const sg of [-1, 1]) {
        this.lamp(i, sg * 1.62)
        this.lamp(sg * 1.62, i)
      }
    }
    this.buildSignals()
    // decor cells
    const [dx, dz] = this.ring2 ? [17.3, 17.3] : [11.1, 11.1] // the park, court, fountain and grove corners
    const cells = [[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]]
    const defaults = [
      (x, z) => { // park with pond
        bx(s, 5.0, 0.14, 5.0, C.park, x, 0.1, z)
        const pond = mk(s, new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24), m.water, x + 0.2, 0.2, z + 0.1, false)
        pond.receiveShadow = true
        bx(s, 0.8, 0.12, 3.2, C.bench, x + 0.2, 0.26, z + 0.1)
        for (const [ox, oz, sc, t] of [[-1.9, -1.8, 1.1, 'r'], [1.9, -1.7, 1, 'p'], [-1.8, 1.8, 1.2, 'p'], [1.8, 1.9, 1, 'r'], [-2.2, 0.1, 0.9, 'r']]) this.tree(x + ox, z + oz, sc, t)
        mk(s, new THREE.DodecahedronGeometry(0.42), C.stone, x - 1.2, 0.5, z + 1.1)
      },
      (x, z) => { this.court(x, z, C.court); this.tree(x + 2.9, z - 2.7, 1, 'p') },
      (x, z) => { // fountain plaza
        bx(s, 4.6, 0.12, 4.6, C.plaza, x, 0.1, z)
        cyl(s, 1.1, 0.35, C.stone, x, 0.15, z, 20)
        mk(s, new THREE.CylinderGeometry(0.9, 0.9, 0.1, 20), m.water, x, 0.52, z, false)
        cyl(s, 0.1, 0.9, C.stone, x, 0.4, z, 8)
        for (const [ox, oz] of [[-2.1, -2.0], [2.2, 2.0]]) this.tree(x + ox, z + oz, 1, 'r')
        bx(s, 1.2, 0.12, 0.4, C.bench, x + 1.9, 0.45, z - 0.6)
      },
      (x, z) => { // grove
        bx(s, 4.6, 0.12, 4.6, C.grove, x, 0.1, z)
        for (const [ox, oz, sc, t] of [[-1.4, -1.3, 1.2, 'p'], [1.2, -1.5, 1, 'r'], [-1.2, 1.4, 1, 'r'], [1.5, 1.3, 1.3, 'p'], [0, 0, 1.1, 'r']]) this.tree(x + ox, z + oz, sc, t)
      },
    ]
    const courtCols = [C.park, C.court, C.plaza, C.grove]
    cells.forEach(([x, z], k) => {
      const lm = T.landmarks[k]
      if (lm === 'court') this.court(x, z, courtCols[k])
      else if (lm) { const r = lm(s, x, z); if (r && r.spin) this.spinners.push(r.spin) }
      else defaults[k](x, z)
    })
    // scattered gap decor
    for (const [sx, sz] of LOT_Q) {
      for (const [cx, cz] of this.ring2 ? [[8.0, 4.9], [4.9, 8.0], [8.0, 11.1], [11.1, 8.0], [14.2, 4.9], [4.9, 14.2]] : [[8.0, 4.9], [4.9, 8.0], [8.0, 11.1], [11.1, 8.0]]) {
        const x = sx * cx, z = sz * cz
        const r = rng()
        if (r < 0.4) this.tree(x + (rng() - 0.5) * 0.8, z + (rng() - 0.5) * 0.8, 0.8 + rng() * 0.4, rng() > 0.5 ? 'r' : 'p')
        else if (r < 0.7) bx(s, 0.9, 0.12, 0.35, C.bench, x, 0.45, z)
        else bx(s, 0.5, 0.4, 0.5, C.crate[Math.floor(rng() * 3)], x, 0.1, z)
      }
    }
    // the big city has two free cells in each corner next to the park: small groves
    if (this.ring2) {
      for (const [sx, sz] of LOT_Q) {
        for (const [cx, cz] of [[17.3, 11.1], [11.1, 17.3]]) {
          const x = sx * cx, z = sz * cz
          bx(s, 4.6, 0.12, 4.6, C.grove, x, 0.1, z)
          for (const [ox, oz, sc, t] of [[-1.2, -1.1, 1.1, 'p'], [1.1, -1.2, 1, 'r'], [-1, 1.2, 1, 'r'], [1.2, 1.1, 1.2, 'p']]) this.tree(x + ox, z + oz, sc, t)
        }
      }
    }
    // border trees
    const b = E - 1
    for (const [x, z] of [[-b, 0], [b, 0], [0, -b], [0, b], [-b - 0.2, 6], [b + 0.2, -6]]) this.tree(x, z, 0.8, 'p')
    if (T.tree === 'jungle') for (const [x, z] of [[-b, -9], [b, 9], [-9, b], [9, -b], [-b, 11], [11, -b - 0.2], [b, 3], [-3, b]]) this.tree(x, z, 1.1, 'r')

    // lots
    this.pickGroup = new THREE.Group()
    s.add(this.pickGroup)
    let i = 0
    for (const cells of this.ring2 ? [CELLS, CELLS_2] : [CELLS]) {
     for (const [sx, sz] of LOT_Q) {
      for (const [cx, cz] of cells) {
        const pos = new THREE.Vector3(sx * cx, 0, sz * cz)
        const holder = new THREE.Group()
        holder.position.copy(pos)
        holder.position.y = 0.1
        s.add(holder)
        const border = bx(s, 4.9, 0.1, 4.9, 0xffffff, pos.x, 0.07, pos.z)
        const pad = mk(s, new THREE.BoxGeometry(4.55, 0.16, 4.55), m.pad, pos.x, 0.12, pos.z, false)
        pad.receiveShadow = true
        const pick = new THREE.Mesh(new THREE.BoxGeometry(4.6, 6, 4.6), new THREE.MeshBasicMaterial({ visible: false }))
        pick.position.set(pos.x, 3, pos.z)
        pick.userData.lot = i
        this.pickGroup.add(pick)
        this.lots.push({
          i, pos, holder, border, pad, pick, size: LOT_SMALL, county: null, built: null, top: 1.5, pop: 1, target: 0, stepAt: 0, stepEvery: 0.5, crane: null, parts: {}, anims: [], dim: 0, dimTarget: 0, mats: [], bush: null,
        })
        const placed = this.lots[this.lots.length - 1]
        placed.trees = Array(TREES_PER_LOT).fill(null)
        for (let k = 0; k < TREES_PER_LOT; k++) this.plantTree(placed, k, false)
        // the road in front of the lot (only the lots next to a road have one) and the strip of it the county takes as it grows
        const nearX = Math.abs(Math.abs(pos.z) - 4.9) < 0.5, nearZ = Math.abs(Math.abs(pos.x) - 4.9) < 0.5
        placed.road = nearX ? { axis: 'x', along: pos.x, side: Math.sign(pos.z) } : nearZ ? { axis: 'z', along: pos.z, side: Math.sign(pos.x) } : null
        placed.taken = 0
        if (placed.road) {
          const along = placed.road.axis === 'x'
          const strip = mk(s, new THREE.BoxGeometry(along ? 4.9 : 1, 0.08, along ? 1 : 4.9), shade(C.pad, -0.22), 0, 0.075, 0, false)
          strip.visible = false
          placed.strip = strip
        }
        i++
      }
     }
    }
    this.traffic.lots = this.lots.map((l) => ({ x: l.pos.x, z: l.pos.z, size: l.size })) // the footpaths need to know how big each lot is
    this.lots.forEach((l) => this.sizeLot(l))
  }

  court(x, z, color) {
    const s = this.world, C = this.T.c
    const line = M(C.courtLine)
    bx(s, 4.6, 0.12, 4.6, color, x, 0.1, z)
    bx(s, 4.0, 0.02, 0.07, line, x, 0.23, z)
    bx(s, 0.07, 0.02, 3.2, line, x, 0.23, z)
    for (const sg of [-1, 1]) {
      cyl(s, 0.05, 1.7, 0xcbd5e1, x + sg * 2.0, 0.1, z, 5)
      bx(s, 0.05, 0.6, 0.8, 0xffffff, x + sg * 1.9, 1.5, z)
    }
  }

  // one traffic light in the middle of the crossroad, with a head facing every way in.
  // the middle is the one spot no car or person uses, so it stays in the way of nobody.
  buildSignals() {
    const S = this.T.signal
    const g = new THREE.Group()
    const H = 2.5
    if (S.shaft === 'bricks') {
      for (let i = 0; i < 6; i++) bx(g, 0.3, H / 6, 0.3, S.bricks[i % S.bricks.length], 0, (i * H) / 6, 0)
    } else cyl(g, S.shaft === 'log' ? 0.11 : 0.07, H, S.pole, 0, 0, 0, S.shaft === 'log' ? 7 : 8)
    if (S.base) bx(g, 0.26, 0.14, 0.26, S.base, 0, 0, 0)
    if (S.cap) mk(g, new THREE.SphereGeometry(0.13, 8, 6), S.cap, 0, H + 0.1, 0)

    this.signals = []
    // which way each head faces, and which road's cars it is for
    for (const [face, axis] of [[0, 'x'], [Math.PI, 'x'], [-Math.PI / 2, 'z'], [Math.PI / 2, 'z']]) {
      const head = new THREE.Group()
      bx(head, 0.1, 0.06, 0.06, S.pole || S.head, 0.1, 1.95, 0) // arm out to the head
      bx(head, 0.22, 0.8, 0.3, S.head, 0.3, 1.6, 0)
      if (S.rim) bx(head, 0.02, 0.86, 0.36, S.rim, 0.19, 1.57, 0)
      if (S.roof) bx(head, 0.3, 0.05, 0.38, S.roof, 0.3, 2.4, 0)
      const mats = LIT.map((c, i) => {
        const m = new THREE.MeshBasicMaterial({ color: c })
        const y = 2.24 - i * 0.24
        if (S.lamp === 'disc') mk(head, new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), m, 0.43, y, 0, false).rotation.z = Math.PI / 2
        else if (S.lamp === 'box') mk(head, new THREE.BoxGeometry(0.05, 0.15, 0.15), m, 0.43, y, 0, false)
        else mk(head, new THREE.SphereGeometry(0.085, 8, 6), m, 0.43, y, 0, false)
        return m
      })
      head.rotation.y = face
      g.add(head)
      this.signals.push({ axis, mats })
    }
    g.position.set(0, 0.07, 0)
    this.world.add(g)
    this.signalKey = null
  }

  // red on top, yellow, green below: light up the one that is on
  paintSignals() {
    const sig = this.traffic.sig
    const key = sig.axis + sig.mode
    if (key === this.signalKey) return
    this.signalKey = key
    for (const h of this.signals) {
      const on = h.axis !== sig.axis || sig.mode === 'red' ? 0 : sig.mode === 'yellow' ? 1 : 2
      h.mats.forEach((m, i) => m.color.setHex(i === on ? LIT[i] : OFF[i]))
    }
  }

  lamp(x, z) {
    const g = new THREE.Group()
    const C = this.T.c
    cyl(g, 0.06, 1.7, C.lampPole, 0, 0, 0, 6)
    mk(g, new THREE.SphereGeometry(0.14, 8, 6), this.T.glowLamps ? new THREE.MeshBasicMaterial({ color: C.lampGlow }) : C.lampGlow, 0, 1.78, 0, false)
    g.position.set(x, 0.08, z)
    this.world.add(g)
  }

  tree(x, z, sc = 1, type = 'r') {
    const g = new THREE.Group()
    const kind = this.T.tree, C = this.T.c, m = this.mats
    if (kind === 'lego') {
      bx(g, 0.3, 0.7 * sc, 0.3, C.trunk, 0, 0, 0)
      const ws = type === 'p' ? [1.3, 1.0, 0.7, 0.4] : [1.1, 1.4, 1.0]
      ws.forEach((w, k) => bx(g, w * sc, 0.42 * sc, w * sc, k % 2 ? m.blossom : m.round, 0, (0.7 + k * 0.42) * sc, 0))
      cyl(g, 0.14 * sc, 0.1, m.round, 0, (0.7 + ws.length * 0.42) * sc, 0, 8)
    } else if (kind === 'jungle') {
      if (type === 'p') {
        cyl(g, 0.1, 2.2 * sc, C.trunk, 0, 0, 0, 6)
        for (let k = 0; k < 6; k++) {
          const leaf = bx(g, 1.5 * sc, 0.05, 0.4 * sc, m.pine, 0, 2.2 * sc, 0)
          leaf.rotation.y = k * Math.PI / 3
          leaf.rotation.z = -0.35
          leaf.position.x = Math.cos(k * Math.PI / 3) * 0.6 * sc
          leaf.position.z = -Math.sin(k * Math.PI / 3) * 0.6 * sc
        }
      } else {
        cyl(g, 0.16, 1.5 * sc, C.trunk, 0, 0, 0, 6)
        mk(g, new THREE.IcosahedronGeometry(1.0 * sc, 0), m.round, 0, 2.0 * sc, 0)
        mk(g, new THREE.IcosahedronGeometry(0.7 * sc, 0), m.blossom, 0.7 * sc, 1.6 * sc, 0.3 * sc)
        mk(g, new THREE.IcosahedronGeometry(0.6 * sc, 0), m.pine, -0.6 * sc, 1.7 * sc, -0.3 * sc)
      }
    } else if (kind === 'neon') {
      cyl(g, 0.05, 1.3 * sc, C.trunk, 0, 0, 0, 5)
      const o = mk(g, new THREE.OctahedronGeometry(0.42 * sc, 0), type === 'p' ? m.pine : m.round, 0, 1.6 * sc, 0, false)
      o.scale.y = 1.5
    } else if (kind === 'coral') {
      if (type === 'p') {
        for (const [ox, oz, hh] of [[0, 0, 1.9], [0.25, 0.1, 1.4], [-0.2, 0.2, 1.6]]) mk(g, new THREE.ConeGeometry(0.1 * sc, hh * sc, 5), m.pine, ox, hh * sc / 2, oz)
      } else {
        const mat = [m.round, m.blossom][Math.floor(this.rng() * 2)]
        cyl(g, 0.13 * sc, 0.9 * sc, mat, 0, 0, 0, 6)
        for (const [rz, ox] of [[0.7, -0.3], [-0.7, 0.3]]) {
          const br = cyl(g, 0.09 * sc, 0.7 * sc, mat, ox * sc, 0.5 * sc, 0, 6)
          br.rotation.z = rz
        }
        mk(g, new THREE.SphereGeometry(0.2 * sc, 8, 6), mat, 0, 0.95 * sc, 0)
      }
    } else if (kind === 'snow') {
      if (type === 'p') {
        cyl(g, 0.12, 0.6 * sc, C.trunk, 0, 0, 0, 6)
        mk(g, new THREE.ConeGeometry(0.75 * sc, 1.3 * sc, 7), m.pine, 0, 1.2 * sc, 0)
        mk(g, new THREE.ConeGeometry(0.5 * sc, 0.75 * sc, 7), m.blossom, 0, 1.75 * sc, 0)
        mk(g, new THREE.ConeGeometry(0.34 * sc, 0.6 * sc, 7), m.blossom, 0, 2.3 * sc, 0)
      } else {
        mk(g, new THREE.ConeGeometry(0.4 * sc, 1.6 * sc, 5), m.water, 0, 0.8 * sc, 0)
        mk(g, new THREE.ConeGeometry(0.25 * sc, 0.9 * sc, 5), m.round, 0.4 * sc, 0.45 * sc, 0.2 * sc)
      }
    } else if (kind === 'cone') {
      if (type === 'p') {
        mk(g, new THREE.ConeGeometry(0.3 * sc, 0.8 * sc, 10), m.pine, 0, 0.4 * sc, 0)
        bx(g, 0.7 * sc, 0.05, 0.7 * sc, m.pine, 0, 0, 0)
      } else {
        mk(g, new THREE.SphereGeometry(0.4 * sc, 12, 10), m.round, 0, 0.4 * sc, 0)
      }
    } else {
      cyl(g, 0.12, 0.6 * sc, C.trunk, 0, 0, 0, 6)
      if (type === 'p') {
        mk(g, new THREE.ConeGeometry(0.75 * sc, 1.3 * sc, 7), m.pine, 0, 0.55 * sc + 0.65 * sc, 0)
        mk(g, new THREE.ConeGeometry(0.55 * sc, 1.0 * sc, 7), m.pine, 0, 1.3 * sc + 0.5 * sc, 0)
      } else {
        mk(g, new THREE.IcosahedronGeometry(0.78 * sc, 0), m.round, 0, 1.2 * sc, 0)
        mk(g, new THREE.IcosahedronGeometry(0.46 * sc, 0), m.blossom, 0.5 * sc, 1.45 * sc, 0.25 * sc)
      }
    }
    g.position.set(x, 0.1, z)
    g.rotation.y = this.rng() * TAU
    this.world.add(g)
    return g
  }

  // ---- the trees around a county: workers cut them down as it grows, and they are planted again when it shrinks ----
  slotAt(lot, k) {
    const [ox, oz] = TREE_SLOTS[k]
    return [lot.pos.x + ox, lot.pos.z + oz]
  }

  plantTree(lot, k, animate) {
    const [x, z] = this.slotAt(lot, k)
    const g = this.tree(x, z, 0.7 + (k % 3) * 0.06, k % 2 ? 'p' : 'r')
    lot.trees[k] = g
    if (animate) { g.scale.setScalar(0.01); this.growing.push({ g, t: 0 }) }
  }

  cutTree(lot, k, animate) {
    const g = lot.trees[k]
    lot.trees[k] = null
    if (!g) return
    if (!animate || this.felling.length >= 3) { this.disposePart(g); return } // never more than three workers at once
    const [x, z] = this.slotAt(lot, k)
    // the worker stands between the tree and the middle of the lot, and the tree falls away from him
    const dx = lot.pos.x - x, dz = lot.pos.z - z
    const len = Math.hypot(dx, dz) || 1
    const dir = new THREE.Vector3(dx / len, 0, dz / len)
    const pivot = new THREE.Group()
    pivot.position.set(x, 0.1, z)
    this.world.add(pivot)
    g.position.set(0, 0, 0)
    pivot.add(g)
    const worker = this.folk()
    worker.position.set(x + dir.x * 0.85, 0.1, z + dir.z * 0.85)
    worker.rotation.y = Math.atan2(-dir.x, -dir.z) // facing the tree
    const axe = new THREE.Group()
    bx(axe, 0.04, 0.5, 0.04, 0x8b5a2b, 0, -0.45, 0.14)
    bx(axe, 0.16, 0.1, 0.03, 0xbfc7d1, 0.07, -0.66, 0.14)
    worker.userData.arms[1].add(axe)
    this.world.add(worker)
    const axis = new THREE.Vector3(-dir.z, 0, dir.x).normalize() // tilts the top of the tree away from the worker
    this.felling.push({ pivot, g, worker, axis, t: 0 })
  }

  // make the trees around a lot match what its level leaves standing
  setTrees(lot, want, animate) {
    let up = lot.trees.filter(Boolean).length
    for (let k = TREES_PER_LOT - 1; k >= 0 && up > want; k--) if (lot.trees[k]) { this.cutTree(lot, k, animate); up-- }
    for (let k = 0; k < TREES_PER_LOT && up < want; k++) if (!lot.trees[k]) { this.plantTree(lot, k, animate); up++ }
  }

  updateTrees(dt) {
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const e = this.growing[i]
      e.t += dt / 1.2
      e.g.scale.setScalar(Math.min(1, 0.01 + e.t))
      if (e.t >= 1) this.growing.splice(i, 1)
    }
    for (let i = this.felling.length - 1; i >= 0; i--) {
      const f = this.felling[i]
      f.t += dt
      const t = f.t
      const swing = Math.sin(t * 10) * 0.55
      const u = f.worker.userData
      // 0 to 1.4 s: he chops (the tree shivers), then it falls (1 s), then it sinks away and he leaves
      if (t < 1.4) {
        f.pivot.quaternion.setFromAxisAngle(f.axis, Math.sin(t * 24) * 0.02)
        u.arms[1].rotation.x = -1.1 + swing
        u.arms[0].rotation.x = -0.4
      } else if (t < 2.4) {
        const k = (t - 1.4)
        f.pivot.quaternion.setFromAxisAngle(f.axis, 1.5 * k * k)
        u.arms[1].rotation.x = -0.3
      } else if (t < 3.2) {
        const k = 1 - (t - 2.4) / 0.8
        f.pivot.quaternion.setFromAxisAngle(f.axis, 1.5)
        f.g.scale.setScalar(Math.max(0.001, k))
        f.worker.scale.setScalar(1.05 * Math.max(0.001, k))
      } else {
        this.disposePart(f.worker)
        this.disposePart(f.pivot)
        this.felling.splice(i, 1)
      }
    }
  }

  // ---- the road in front of a county gets narrower with every floor ----
  updateRoads(dt) {
    for (const lot of this.lots) {
      if (!lot.road) continue
      const target = roadTaken(lot.built ? lot.built.L : 0)
      lot.taken += (target - lot.taken) * Math.min(1, dt * 2)
      const n = lot.taken
      lot.strip.visible = n > 0.01
      if (!lot.strip.visible) continue
      const { axis, along, side } = lot.road
      const mid = side * (1.5 - n / 2) // from the edge of the road inwards
      if (axis === 'x') { lot.strip.position.set(along, 0.075, mid); lot.strip.scale.set(1, 1, n) }
      else { lot.strip.position.set(mid, 0.075, along); lot.strip.scale.set(n, 1, 1) }
    }
  }

  // ---- accidents: the car behind bumps the one in front, the drivers get out and fight until the county's spending is zero ----
  maybeCrash(force = false) {
    if (this.crashes.length >= MAX_ACCIDENTS || this.cars.length < 6) return false
    const weights = accidentWeights(this.odds.map((o) => o || null), this.lots.map((l) => !!l.road))
    const danger = weights.reduce((a, b) => a + b, 0)
    if (!force && this.rng() > accidentChance(danger, 1)) return false
    const k = pickLot(weights, this.rng())
    if (k < 0 || this.crashes.some((a) => a.lot === k)) return false
    const lot = this.lots[k]
    const r = lot.road
    const free = (c) => c.active && !c.crash && !c.passing && c.road === r.axis && Math.abs(c.lat - c.lane) < 0.1
    // the front car: on the lot's side of the road, in front of the lot, and clear of the crossroad
    for (const front of this.cars) {
      if (!free(front) || Math.sign(front.lat) !== r.side || Math.abs(front.t - r.along) > 2.6 || Math.abs(front.t) < 5.2) continue
      let rear = null
      let best = 6
      for (const c of this.cars) {
        if (c === front || !free(c) || c.dir !== front.dir || Math.sign(c.lat) !== Math.sign(front.lat)) continue
        const gap = (front.t - c.t) * front.dir - front.hl - c.hl
        if (gap > 0.3 && gap < best) { best = gap; rear = c }
      }
      if (!rear) continue
      startCrash(front, rear)
      this.crashes.push({ lot: k, front, rear, phase: 'bump', t: 0, fighters: null })
      return true
    }
    return false
  }

  makeFighters(a) {
    const { front } = a
    const r = this.lots[a.lot].road
    const lat = front.lat + r.side * (front.hw + 0.4) // on the pavement side of the cars, next to the lot
    const hitAt = front.t - front.dir * front.hl // where the bumpers met
    a.axis = r.axis
    a.fighters = [0, 1].map((j) => {
      const p = this.folk()
      p.scale.setScalar(0.001)
      this.world.add(p)
      // the driver of the rear car stands behind the meeting point and faces forward, the other the other way round
      return { p, j, toward: (j === 0 ? 1 : -1) * front.dir, along: hitAt + (j === 0 ? -1 : 1) * front.dir * 0.28, lat }
    })
  }

  updateCrashes(dt) {
    for (let i = this.crashes.length - 1; i >= 0; i--) {
      const a = this.crashes[i]
      a.t += dt
      const lostCar = !a.front.active || !a.rear.active
      if (a.phase === 'bump') {
        if (lostCar || a.t > 15) { endCrash(a.front, a.rear); this.crashes.splice(i, 1); continue }
        if (a.rear.crash && a.rear.crash.hit) { a.phase = 'fight'; a.t = 0; this.makeFighters(a) }
        continue
      }
      const spent = (this.odds[a.lot] || { spent: 0 }).spent
      if (a.phase === 'fight' && !fightGoesOn(spent)) { a.phase = 'leave'; a.t = 0 }
      const scale = a.phase === 'leave' ? Math.max(0.001, 1 - a.t / 0.7) : Math.min(1, a.t / 0.6 + 0.001)
      for (const f of a.fighters) {
        const u = f.p.userData
        const t = this.clock.elapsedTime
        const lunge = Math.max(0, Math.sin(t * 9 + f.j * 3.1)) * 0.08 * f.toward // steps in with each punch
        const x = a.axis === 'x' ? f.along + lunge : f.lat
        const z = a.axis === 'x' ? f.lat : f.along + lunge
        f.p.position.set(x, 0.1 + Math.abs(Math.sin(t * 7 + f.j)) * 0.05, z)
        f.p.rotation.y = a.axis === 'x' ? (f.toward > 0 ? Math.PI / 2 : -Math.PI / 2) : (f.toward > 0 ? 0 : Math.PI)
        f.p.rotation.z = Math.sin(t * 8 + f.j) * 0.15
        u.arms[0].rotation.x = -1.5 + Math.sin(t * 13 + f.j) * 0.9
        u.arms[1].rotation.x = -1.5 + Math.sin(t * 13 + f.j + Math.PI) * 0.9
        f.p.scale.setScalar(1.05 * scale)
      }
      if (a.phase === 'leave' && a.t >= 0.7) {
        for (const f of a.fighters) this.disposePart(f.p)
        endCrash(a.front, a.rear)
        this.crashes.splice(i, 1)
      }
    }
    this.crashClock += dt
    if (this.crashClock >= 1) { this.crashClock = 0; this.maybeCrash() }
  }

  // somebody to work or fight: a person, or a diver under the sea
  folk() {
    return this.sea ? makeDiver(this.rng) : makePerson(this.rng)
  }

  buildWalkers() {
    const rng = this.rng
    const P = this.T.people
    this.walkers = placeWalkers(this.ring2 ? 12 : 8, rng)
    this.walkers.forEach((w, n) => {
      if (this.sea && n % 2 === 0) { // every other one is a fish
        const fish = makeFish(P.fish[Math.floor(rng() * P.fish.length)], rng)
        Object.assign(w, { p: fish, ph: rng() * 6, ci: Math.floor(rng() * 6), pi: 0 })
        this.world.add(fish)
        return
      }
      const p = this.sea ? makeDiver(rng) : makePerson(rng)
      Object.assign(w, { p, ph: rng() * 6, ci: Math.floor(rng() * 6), pi: Math.floor(rng() * 3) })
      const u = p.userData
      if (P.skin) { u.skin = P.skin; u.head.material.color.set(P.skin); u.hands.forEach((h) => h.material.color.set(P.skin)) }
      const coat = P.coats[w.ci % P.coats.length]
      const pants = P.pants[w.pi % P.pants.length]
      u.torso.material.color.set(coat)
      u.sleeves.forEach((mm) => mm.material.color.set(coat))
      u.thighs.forEach((mm) => mm.material.color.set(pants))
      u.shins.forEach((mm) => mm.material.color.set(P.shorts ? u.skin : pants))
      if (!u.diver) u.hat.visible = !!P.hat
      if (P.hat) u.hat.material.color.set(P.hats ? P.hats[w.ci % P.hats.length] : P.hat)
      this.world.add(p)
    })
  }

  buildCars() {
    // pool of vehicles, a few cross the roads at a time
    this.cars = this.T.vehicles().map((car) => {
      car.visible = false
      this.world.add(car)
      const size = new THREE.Box3().setFromObject(car) // how much room it takes up
      const hl = Math.max(-size.min.x, size.max.x), hw = Math.max(-size.min.z, size.max.z)
      return Object.assign(newCar(hl, hw), { car, ph: this.rng() * 6 })
    })
    this.spawnIn = 0.4
    for (let i = 0; i < 3; i++) this.spawnVehicle(true)
  }

  spawnVehicle(anywhere = false) {
    const c = spawnCar(this.cars, this.rng, anywhere)
    if (c) c.car.visible = true
  }

  buildParticles() {
    this.pN = 420
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(this.pN * 3)
    for (let i = 0; i < this.pN; i++) {
      pos[i * 3] = (this.rng() - 0.5) * 38
      pos[i * 3 + 1] = this.rng() * 24
      pos[i * 3 + 2] = (this.rng() - 0.5) * 38
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.pMat = new THREE.PointsMaterial({ size: 0.3, map: roundTex(), transparent: true, depthWrite: false, alphaTest: 0.02 })
    this.points = new THREE.Points(geo, this.pMat)
    this.points.visible = false
    this.points.frustumCulled = false
    this.scene.add(this.points)
  }

  buildRings() {
    const mkRing = (r0, r1, c) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }))
      m.rotation.x = -Math.PI / 2
      m.position.y = 0.32
      m.visible = false
      this.scene.add(m)
      return m
    }
    this.ringA = mkRing(2.35, 2.55, 0xf4c430)
    this.ringB = mkRing(1.95, 2.05, 0x4cc9f0)
  }

  // public
  setMap(name, force = false) {
    if (!MAPS[name]) name = 'city'
    const key = name === 'wire' && !this.dark ? 'wireLight' : name
    if (!force && this.mapKey === key && this.world) return
    this.map = name
    this.mapKey = key
    const T = (this.T = MAPS[key])
    this.sea = T.people.kind === 'sea'
    TOON = !!T.toon
    WIRE = !!T.wire
    if (this.world) {
      this.scene.remove(this.world)
      this.world.traverse((n) => {
        if (n.geometry) n.geometry.dispose()
        if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((mm) => mm.dispose())
      })
    }
    this.world = new THREE.Group()
    this.scene.add(this.world)
    this.lots = []
    this.walkers = []
    this.cars = []
    this.spinners = []
    this.felling = []
    this.growing = []
    this.crashes = []
    this.crashClock = 0
    this.odds = []
    this.E = HALF[this.ring2 ? 1 : 0]
    this.traffic = makeTraffic(this.E - 15)
    this.rng = mulberry(7)
    const C = T.c
    this.mats = { grass: M(C.grass), pad: M(C.pad), round: M(C.round), pine: M(C.pine), blossom: M(C.blossom), water: M(C.water) }
    this.buildWorld()
    this.buildWalkers()
    this.buildCars()
    const shadowCam = this.sun.shadow.camera // the shadows have to cover the whole board
    const grow = this.E / 15
    shadowCam.left = -24 * grow; shadowCam.right = 24 * grow; shadowCam.top = 24 * grow; shadowCam.bottom = -24 * grow
    shadowCam.updateProjectionMatrix()
    this.sun.color.set(T.sun[0])
    this.sunI = T.sun[1]
    this.hemi.color.set(T.hemi[0])
    this.hemi.groundColor.set(T.hemi[1])
    this.hemiI = T.hemi[2]
    this.scene.fog = T.fog ? new THREE.Fog(T.fog[0], T.fog[1], T.fog[2]) : null
    if (T.particle) {
      this.points.visible = true
      this.pMat.color.set(T.particle.color)
      this.pMat.size = T.particle.size
      this.pCfg = T.particle
    } else {
      this.points.visible = false
      this.pCfg = null
    }
    this.applyTheme()
    if (this.lastList) this.setCounties(this.lastList)
    this.start()
  }

  setDark(dark) {
    this.dark = dark
    if (this.map === 'wire') this.setMap('wire') // wireframe swaps its line colours between light and dark
    this.applyTheme()
  }

  applyTheme() {
    const T = this.T
    if (!T) return
    this.sun.intensity = this.sunI * (this.dark ? 0.62 : 1)
    this.hemi.intensity = this.hemiI * (this.dark ? 0.62 : 1)
    const st = this.container.style
    const sky = MAP_SKY[T.id]
    st.setProperty('--sky-a', this.dark ? '#000000' : sky[0])
    st.setProperty('--sky-b', this.dark ? '#000000' : sky[1])
    if (this.dark) st.setProperty('--sky-c', '#000000')
    else if (sky[2]) st.setProperty('--sky-c', sky[2])
    else st.removeProperty('--sky-c')
    if (this.scene.fog) this.scene.fog.color.set(this.dark ? 0x000000 : T.fog[0])
  }

  setCounties(list) {
    // list: [{id,name,group,style,color,spent,count,level}]
    this.lastList = list
    const big = list.length > BIG_CITY
    if (big !== this.ring2) { // a 13th county makes the city grow (and it shrinks back if counties are removed)
      this.ring2 = big
      this.setMap(this.map, true)
      this.resize(true)
      return
    }
    this.lots.forEach((lot, i) => {
      const c = list[i] || null
      lot.county = c
      this.odds[i] = c ? { spent: c.spent || 0, group: c.group, level: c.level || 0 } : null
      lot.pick.userData.countyId = c ? c.id : null
      if (!c) {
        lot.border.material.color.set(this.T.c.empty)
        lot.target = 0
        if (!lot.built || lot.built.key !== 'none') this.rebuildLot(lot, null, 0)
        return
      }
      lot.border.material.color.set(c.color)
      const L = c.spent > 0 ? Math.max(1, c.level || 1) : 0
      const look = c.style + '|' + c.color
      const same = lot.built && lot.built.look === look
      if (same && L > lot.built.L) {
        // new expense: build the new steps one by one
        const from = lot.target > lot.built.L ? lot.target : lot.built.L
        lot.target = L
        const n = L - lot.built.L
        lot.stepEvery = 3 * Math.min(6, Math.max(1, 0.5 + (L - from) * 0.5 + (from - lot.built.L) * 0.3)) / n
        if (!(lot.stepAt > performance.now())) lot.stepAt = performance.now() + 750
        this.setCrane(lot, true)
      } else if (!same || L !== lot.built.L) {
        lot.target = L
        this.rebuildLot(lot, c, L)
      }
    })
    this.applyFilter()
    this.start()
  }

  // what stands on the lot at this level
  plan(L) {
    const p = { found: L >= 1, hut: L === 2, M: L >= 3 ? 1 : 0, extras: L >= 4, A: 0, B: 0, last: 'found' }
    if (L === 2) p.last = 'hut'
    if (L === 3) p.last = 'M'
    if (L === 4) p.last = 'extras'
    const first = ['A', 'M', 'M', 'B'], cyc = ['M', 'A', 'M', 'M', 'B']
    for (let i = 5; i <= L; i++) {
      const k = i <= 8 ? first[i - 5] : cyc[(i - 9) % 5]
      p[k]++
      p.last = k
    }
    return p
  }

  setCrane(lot, on) {
    if (!on) { if (lot.crane) lot.crane.userData.leaving = true; return }
    if (lot.crane) { lot.crane.userData.leaving = false; return }
    const g = new THREE.Group()
    bx(g, 0.5, 0.2, 0.5, 0x6b7280, 0, 0, 0)
    const pole = bx(g, 0.14, 1, 0.14, 0xf4b400, 0, 0, 0)
    pole.geometry.translate(0, 0.5, 0)
    pole.position.y = 0.2
    const arm = new THREE.Group()
    bx(arm, 3.2, 0.12, 0.12, 0xf4b400, 1.1, 0, 0)
    bx(arm, 0.5, 0.3, 0.3, 0x4b5563, -0.5, -0.1, 0)
    bx(arm, 0.03, 1.1, 0.03, 0x2b2b2b, 2.3, -1.1, 0)
    bx(arm, 0.3, 0.2, 0.3, 0xf4b400, 2.3, -1.3, 0)
    g.add(arm)
    g.userData = { arm, pole, h: Math.max(3.2, lot.top + 2.2), grow: 0, leaving: false }
    g.position.set(lot.pos.x + 1.95 * lot.size, 0.2, lot.pos.z - 1.95 * lot.size)
    g.scale.setScalar(0.001)
    this.world.add(g)
    lot.crane = g
  }

  disposePart(g) {
    const shared = new Set(Object.values(this.mats))
    g.traverse((n) => {
      if (n.geometry) n.geometry.dispose()
      if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((mm) => { if (!shared.has(mm)) mm.dispose() })
    })
    g.parent && g.parent.remove(g)
  }

  // only rebuilds the pieces that changed
  rebuildLot(lot, c, L, animate = false) {
    const parts = (lot.parts ||= {})
    const want = {}
    if (c) {
      const colN = new THREE.Color(c.color).getHex()
      const T = this.T
      const P = this.plan(L)
      const main = (f, style) => (g) => {
        if (T.build) T.build(g, f, colN, style)
        else (STYLE_FN[style] || STYLE_FN.shop)(g, f, colN)
      }
      const alt = T.build ? [c.style + '-a', c.style + '-b'] : [c.style === 'house' ? 'shop' : 'house', c.style === 'cafe' ? 'market' : 'cafe']
      const look = c.style + '|' + c.color
      if (L === 0) want.sign = { sig: look, at: [0, 0, 0], sc: [1, 1], make: (g) => { cyl(g, 0.05, 0.9, 0x6b5a3e, 0, 0, 0, 5); bx(g, 0.9, 0.5, 0.06, colN, 0, 0.75, 0) } }
      if (P.found) want.found = { sig: look + (L === 1 ? ':stakes' : ''), at: [-0.55, 0, -0.55], sc: [1, 1], make: (g) => {
        bx(g, 2.3, 0.06, 2.3, 0x9aa0a8, 0, 0, 0)
        if (L === 1) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(g, 0.1, 0.5, 0.1, 0xf4b400, sx * 1.05, 0.06, sz * 1.05)
      } }
      if (P.hut) want.hut = { sig: look, at: [-0.55, 0.07, -0.55], sc: [0.9, 0.9], make: (g) => (T.kiosk || kiosk)(g, colN) }
      if (P.M) want.M = { sig: look + ':' + P.M, at: [-0.55, 0.07, -0.55], sc: [0.62, 0.8], make: main(P.M, c.style) }
      if (P.extras) want.extras = { sig: look, at: [0, 0, 0], sc: [1, 1], make: (g) => {
        for (let k = 0; k < 5; k++) bx(g, 0.08, 0.36, 0.08, colN, -2.0 + k * 0.5, 0, 2.05)
        bx(g, 2.1, 0.06, 0.05, colN, -1.0, 0.24, 2.05)
        cyl(g, 0.04, 1.3, 0x6b7280, 1.9, 0, 2.0, 5)
        bx(g, 0.5, 0.3, 0.03, colN, 1.63, 1.0, 2.0)
        bx(g, 0.5, 0.22, 0.5, new THREE.Color(this.mats.round.color).getHex(), 0.9, 0, -1.7)
      } }
      if (P.A) want.A = { sig: look + ':' + P.A, at: [1.3, 0, 0.85], sc: [0.4, 0.62], make: main(P.A, alt[0]) }
      if (P.B) want.B = { sig: look + ':' + P.B, at: [-1.25, 0, 1.3], sc: [0.34, 0.55], make: main(P.B, alt[1]) }
    } else {
      want.none = { sig: 'none', at: [0, 0, 0], sc: [1, 1], make: (g) => mk(g, new THREE.IcosahedronGeometry(0.5, 0), new THREE.Color(this.mats.round.color).getHex(), 0, 0.5, 0) }
    }
    for (const k of Object.keys(parts)) {
      if (!want[k]) { this.disposePart(parts[k].g); delete parts[k] }
    }
    lot.anims = (lot.anims || []).filter((a) => a.g.parent)
    for (const [k, w] of Object.entries(want)) {
      const old = parts[k]
      if (old && old.sig === w.sig) continue
      const g = new THREE.Group()
      w.make(g)
      g.position.set(w.at[0], w.at[1], w.at[2])
      g.scale.set(w.sc[0], w.sc[1], w.sc[0])
      lot.holder.add(g)
      const hgt = new THREE.Box3().setFromObject(g).max.y
      const mats = []
      g.traverse((n) => {
        if (!n.material) return
        for (const mm of Array.isArray(n.material) ? n.material : [n.material]) {
          if (mm.color && !mm.userData.base) { mm.userData.base = mm.color.clone(); mats.push(mm) }
        }
      })
      if (lot.dim > 0) for (const mm of mats) mm.color.copy(mm.userData.base).lerp(DIM, lot.dim * 0.78)
      if (animate) {
        // grow from the current height, or from the ground if new
        const from = old && old.h > 0 ? Math.min(0.97, (old.h * (old.g.scale.y / old.sy)) / hgt) : 0.02
        lot.anims = lot.anims.filter((a) => a.key !== k)
        lot.anims.push({ key: k, g, sy: w.sc[1], from, t: 0 })
        g.scale.y = w.sc[1] * from
      }
      if (old) this.disposePart(old.g)
      parts[k] = { g, sig: w.sig, h: hgt, sy: w.sc[1], mats }
    }
    lot.mats = Object.values(parts).flatMap((p) => p.mats)
    lot.top = Math.max(1, ...Object.values(parts).map((p) => p.h))
    lot.built = { key: c ? c.style + '|' + c.color + '|' + L : 'none', look: c ? c.style + '|' + c.color : 'none', L }
    if (lot.dim < 0) lot.dim = 0
    if (!animate) { lot.size = stageSize(lot); this.sizeLot(lot) }
    this.setTrees(lot, treesLeft(L), !!animate) // a new floor costs a tree or two
  }

  // a lot's outline, pad and everything on it are smaller while the county has little spending, which leaves the footpath beside it roomier
  sizeLot(lot) {
    const s = lot.size
    lot.border.scale.set(s, 1, s)
    lot.pad.scale.set(s, 1, s)
    lot.holder.scale.setScalar(s)
    if (lot.crane) lot.crane.position.set(lot.pos.x + 1.95 * s, 0.2, lot.pos.z - 1.95 * s)
  }

  setFilter(group, centroid = true) {
    this.filter = group
    this.applyFilter()
    if (group && centroid) {
      const hit = this.lots.filter((l) => l.county && l.county.group === group)
      if (hit.length) {
        const cx = hit.reduce((a, l) => a + l.pos.x, 0) / hit.length
        const cz = hit.reduce((a, l) => a + l.pos.z, 0) / hit.length
        this.flyTo({ x: cx * 0.6, z: cz * 0.6, radius: this.D0 * 0.78 })
      }
    } else if (!group && centroid) this.recenter()
    this.start()
  }

  applyFilter() {
    for (const lot of this.lots) lot.dimTarget = this.filter && lot.county && lot.county.group !== this.filter ? 1 : 0
  }

  select(id, fly = true) {
    this.selected = id
    const lot = this.lots.find((l) => l.county && l.county.id === id)
    if (lot) {
      this.ringA.position.set(lot.pos.x, 0.32, lot.pos.z)
      this.ringB.position.set(lot.pos.x, 0.34, lot.pos.z)
      this.ringA.visible = this.ringB.visible = true
      if (fly) this.flyTo({ x: lot.pos.x, z: lot.pos.z, radius: this.D0 * Math.min(1.6, 0.6 * Math.max(1, lot.top / 5)), phi: 0.95 })
    } else {
      this.ringA.visible = this.ringB.visible = false
    }
    this.start()
  }

  recenter() {
    this.flyTo({ x: 0, z: 0, radius: this.D0, theta: Math.PI / 4, phi: 0.98 })
  }

  pulse(id) {
    const lot = this.lots.find((l) => l.county && l.county.id === id)
    if (lot) this.start() // construction animation runs from setCounties
  }

  project(id) {
    const lot = this.lots.find((l) => l.county && l.county.id === id)
    if (!lot) return null
    const v = new THREE.Vector3(lot.pos.x, lot.top + 0.3, lot.pos.z).project(this.camera)
    const r = this.container.getBoundingClientRect()
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height }
  }

  // internals
  flyTo({ x, z, radius, theta, phi }) {
    const off = this.camera.position.clone().sub(this.controls.target)
    const sp = new THREE.Spherical().setFromVector3(off)
    let th = theta ?? sp.theta
    let d = th - sp.theta
    d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI
    this.tween = {
      t: 0, dur: 0.9,
      from: { x: this.controls.target.x, z: this.controls.target.z, r: sp.radius, th: sp.theta, ph: sp.phi },
      to: { x, z, r: radius, th: sp.theta + d, ph: phi ?? sp.phi },
    }
    this.start()
  }

  checkMoved() {
    const off = this.camera.position.clone().sub(this.controls.target)
    const sp = new THREE.Spherical().setFromVector3(off)
    const t = this.controls.target
    const moved = Math.hypot(t.x, t.z) > 1.5 || Math.abs(sp.radius - this.D0) > this.D0 * 0.1
    if (moved !== this.moved) {
      this.moved = moved
      this.onViewChanged(moved)
    }
  }

  resize(first) {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w < 50 || h < 50) return
    this.renderer.setSize(w, h, true)
    this.camera.aspect = w / h
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const grow = (this.E || 15) / 15 // the view has to fit a bigger city too
    const horiz = (20 * grow) / (tanV * this.camera.aspect)
    const vert = (14 * grow) / tanV
    this.D0 = Math.max(horiz, vert) / 2.2 // default view fills the screen
    this.camera.updateProjectionMatrix()
    if (this.controls) {
      this.controls.minDistance = this.D0 * 0.2
      this.controls.maxDistance = this.D0 * 2.75
    }
    if (first) {
      const th = Math.PI / 4, ph = 0.98
      this.camera.position.set(Math.sin(ph) * Math.sin(th) * this.D0, Math.cos(ph) * this.D0, Math.sin(ph) * Math.cos(th) * this.D0)
      this.camera.lookAt(0, 0, 0)
    }
    this.start()
  }

  bindPointer() {
    const el = this.renderer.domElement
    let down = null
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() } })
    el.addEventListener('pointerup', (e) => {
      if (!down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      const dt = performance.now() - down.t
      down = null
      if (moved > 7 || dt > 450) return
      const r = el.getBoundingClientRect()
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1
      this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera)
      const hit = this.raycaster.intersectObjects(this.pickGroup.children, false)
      const id = hit.length ? hit[0].object.userData.countyId : null
      this.onSelect(id || null)
    })
  }

  start() {
    this.idleSince = performance.now()
    if (this.running) return
    this.running = true
    this.clock.getDelta()
    this.renderer.setAnimationLoop(() => this.tick())
  }

  stop() {
    this.running = false
    this.renderer.setAnimationLoop(null)
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime

    if (this.tween) {
      const tw = this.tween
      tw.t += dt / tw.dur
      const k = Math.min(tw.t, 1)
      const e = 1 - Math.pow(1 - k, 3)
      const lerp = (a, b) => a + (b - a) * e
      const r = lerp(tw.from.r, tw.to.r), th = lerp(tw.from.th, tw.to.th), ph = lerp(tw.from.ph, tw.to.ph)
      const tx = lerp(tw.from.x, tw.to.x), tz = lerp(tw.from.z, tw.to.z)
      this.controls.target.set(tx, 0, tz)
      this.camera.position.set(tx + r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph), tz + r * Math.sin(ph) * Math.cos(th))
      if (k >= 1) this.tween = null
    }
    const tg = this.controls.target
    tg.x = THREE.MathUtils.clamp(tg.x, -(this.E - 2), this.E - 2)
    tg.z = THREE.MathUtils.clamp(tg.z, -(this.E - 2), this.E - 2)
    this.controls.update()

    // lots: pop / dim / label
    const camDist = this.camera.position.distanceTo(this.controls.target)
    if (this.scene.fog) { this.scene.fog.near = camDist - 14 * (this.E / 15); this.scene.fog.far = camDist + 70 * (this.E / 15) }
    this.updateTrees(dt)
    this.updateRoads(dt)
    this.updateCrashes(dt)
    for (const lot of this.lots) {
      // one step at a time until it reaches the target level
      const want = stageSize(lot)
      if (Math.abs(lot.size - want) > 0.001) { // grows or shrinks smoothly, about a second
        lot.size += (want - lot.size) * Math.min(1, dt * 2.5)
        this.sizeLot(lot)
      }
      this.traffic.lots[lot.i].size = lot.size
      if (lot.county && lot.built && lot.target > lot.built.L) {
        const now = performance.now()
        if (now >= lot.stepAt) {
          lot.stepAt = now + lot.stepEvery * 1000
          this.rebuildLot(lot, lot.county, lot.built.L + 1, true)
          if (lot.target <= lot.built.L) this.setCrane(lot, false)
          else if (lot.crane) lot.crane.userData.h = Math.max(lot.crane.userData.h, lot.top + 2.2)
        }
      }
      if (lot.crane) {
        const cu = lot.crane.userData
        cu.grow += ((cu.leaving ? 0 : 1) - cu.grow) * Math.min(1, dt * 5)
        cu.arm.rotation.y += dt * 1.2
        cu.pole.scale.y += (cu.h - cu.pole.scale.y) * Math.min(1, dt * 4)
        cu.arm.position.y = 0.2 + cu.pole.scale.y
        lot.crane.scale.setScalar(Math.max(0.001, cu.grow))
        if (cu.leaving && cu.grow < 0.02) { this.disposePart(lot.crane); lot.crane = null }
      }
      if (lot.anims && lot.anims.length) {
        const dur = Math.max(1, Math.min(2.7, lot.stepEvery * 1.6))
        for (const a of lot.anims) {
          a.t = Math.min(1, a.t + dt / dur)
          const e = a.t * a.t * (3 - 2 * a.t) // smooth start and stop, no bounce
          a.g.scale.y = a.sy * (a.from + (1 - a.from) * e)
        }
        lot.anims = lot.anims.filter((a) => a.t < 1)
      }
      if (Math.abs(lot.dim - lot.dimTarget) > 0.002) {
        lot.dim = lot.dim < 0 ? lot.dimTarget : lot.dim + (lot.dimTarget - lot.dim) * Math.min(1, dt * 7)
        for (const mm of lot.mats) {
          mm.color.copy(mm.userData.base).lerp(DIM, lot.dim * 0.78)
        }
      }
    }

    // rings
    if (this.ringA.visible) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 4)
      this.ringA.material.opacity = 0.5 + 0.5 * pulse
      const sc = 1 + 0.04 * Math.sin(t * 4)
      this.ringA.scale.setScalar(sc)
      this.ringB.scale.setScalar(2 - sc)
    }

    // the traffic rules decide who goes where, this just moves the models
    stepTraffic(this.cars, this.walkers, this.traffic, dt)
    this.paintSignals()
    for (const w of this.walkers) {
      w.ph += dt * w.speed * 7 // the stride follows how fast they really go, so waiting people stand still
      const k = Math.min(1, w.speed * 4)
      const sw = Math.sin(w.ph) * k
      const u = w.p.userData
      let lift = 0.1 // how high above the ground
      const t = this.clock.elapsedTime + w.ci * 1.7
      if (u.fish) { // a fish never stands still: the tail keeps wagging while it waits, and it drifts up and down
        const wag = Math.sin(t * (5 + k * 4))
        u.tail.rotation.y = wag * 0.55
        u.body.rotation.y = -wag * 0.12
        lift = 0.55 + Math.sin(t * 1.4) * 0.09
      } else if (u.diver) { // a diver swims: arms out in front, a gentle flutter kick, leaning forward, floating
        const kick = Math.sin(t * (4 + k * 3))
        u.legs[0].rotation.x = kick * 0.5
        u.legs[1].rotation.x = -kick * 0.5
        u.arms[0].rotation.x = -1.3 + Math.sin(t * 2) * 0.15
        u.arms[1].rotation.x = -1.3 - Math.sin(t * 2) * 0.15
        w.p.rotation.x = 0.35
        lift = 0.3 + Math.sin(t * 1.2) * 0.07
      } else {
        u.legs[0].rotation.x = sw * 0.75
        u.legs[1].rotation.x = -sw * 0.75
        u.arms[0].rotation.x = -sw * 0.6
        u.arms[1].rotation.x = sw * 0.6
        u.torso.rotation.y = sw * 0.08
        lift += Math.abs(Math.cos(w.ph)) * 0.045 * k
      }
      const bob = lift - 0.1
      if (w.axis === 'x') {
        w.p.position.set(w.t, 0.1 + bob, w.lat)
        w.p.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2
      } else {
        w.p.position.set(w.lat, 0.1 + bob, w.t)
        w.p.rotation.y = w.dir > 0 ? 0 : Math.PI
      }
    }
    // vehicles come in one end and leave at the other
    this.spawnIn -= dt
    if (this.spawnIn <= 0) { this.spawnIn = 2.6 + this.rng() * 3; this.spawnVehicle() }
    for (const c of this.cars) {
      c.car.visible = c.active
      if (!c.active) continue
      const ud = c.car.userData
      const vy = (ud.y ?? 0.08) + (ud.bob ? Math.sin(t * 2.2 + c.ph) * ud.bob : 0)
      if (ud.spin) ud.spin.rotation.z -= (c.speed * dt) / ud.r
      if (c.axis === 'x') {
        c.car.position.set(c.t, vy, c.lat)
        c.car.rotation.y = c.dir > 0 ? 0 : Math.PI
      } else {
        c.car.position.set(c.lat, vy, c.t)
        c.car.rotation.y = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2
      }
      if (c.crash && c.crash.hit) c.car.rotation.y += c.crash.role === 'front' ? 0.1 : -0.1 // the cars sit a little crooked after the bump
    }
    for (const sp of this.spinners) sp.rotation.z += dt * 0.25
    // particles
    if (this.pCfg) {
      const a = this.points.geometry.attributes.position
      for (let i = 0; i < this.pN; i++) {
        let y = a.getY(i) - this.pCfg.fall * dt
        let x = a.getX(i) + Math.sin(t * 0.8 + i) * this.pCfg.sway * dt
        if (y < 0) { y = 24; x = (this.rng() - 0.5) * 38 }
        else if (y > 24) { y = 0; x = (this.rng() - 0.5) * 38 }
        a.setXYZ(i, x, y, a.getZ(i))
      }
      a.needsUpdate = true
    }

    if (this.T.toon) this.outline.render(this.scene, this.camera)
    else this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.stop()
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

const DIM = new THREE.Color(0x9a9a98)
// the size of a lot follows its level: small while there is little spending, bigger (and the footpath thinner) the more is spent
const stageSize = (lot) => lotSize(lot.built ? lot.built.L : 0)

// traffic light colours: red, yellow, green, lit and switched off
const LIT = [0xff2b2b, 0xffc400, 0x2bff6a]
const OFF = [0x3a0d0d, 0x3a2e00, 0x0d3a1a]
