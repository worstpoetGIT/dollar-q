import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'
import { makeMaps, MAP_LIST } from './maps.js'
import { treesLeft, TREES_PER_LOT, treeSpot, roadTaken, accidentWeights, pickLot, accidentChance, fightGoesOn, MAX_ACCIDENTS } from './cityRules.js'
import { compare, timeline, claddingHeight, KITS, LIFT } from './construction.js'
import { newCar, makeTraffic, placeWalkers, spawnCar, stepTraffic, LOT_SMALL, lotSize, startCrash, endCrash, carPose } from './traffic.js'

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
    this.assess = { ready: false, top: null } // where the money goes, from the last ten days (set by setCounties)
    this.crashDue = false // the dice said an accident should happen: keep trying to place the cars until it works
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
    this.renderer.localClippingEnabled = true // the finished wall shows up under the painters
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
        for (const [ox, oz, sc, t] of [[-1.9, -1.8, 1.1, 'r'], [1.8, 1.9, 1, 'r']]) this.tree(x + ox, z + oz, sc, t)
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
        for (const [ox, oz, sc, t] of [[-1.4, -1.3, 1.2, 'p'], [1.5, 1.3, 1.3, 'p']]) this.tree(x + ox, z + oz, sc, t)
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
        if (r < 0.12) this.tree(x + (rng() - 0.5) * 0.8, z + (rng() - 0.5) * 0.8, 0.8 + rng() * 0.4, rng() > 0.5 ? 'r' : 'p')
        else if (r < 0.55) bx(s, 0.9, 0.12, 0.35, C.bench, x, 0.45, z)
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
    for (const [x, z] of [[-b - 0.2, 6], [b + 0.2, -6]]) this.tree(x, z, 0.8, 'p')
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
          i, pos, holder, border, pad, pick, size: LOT_SMALL, county: null, built: null, top: 1.5, pop: 1, target: 0, stepAt: 0, stepEvery: 0.5, crane: null, parts: {}, build: null, queue: [], dim: 0, dimTarget: 0, mats: [], bush: null,
        })
        const placed = this.lots[this.lots.length - 1]
        placed.trees = Array(TREES_PER_LOT).fill(null)
        for (let k = 0; k < TREES_PER_LOT; k++) this.plantTree(placed, k, false)
        // the road in front of the lot (only the lots next to a road have one) and the strip of it the county takes as it grows
        const nearX = Math.abs(Math.abs(pos.z) - 4.9) < 0.5, nearZ = Math.abs(Math.abs(pos.x) - 4.9) < 0.5
        placed.road = nearX ? { axis: 'x', along: pos.x, side: Math.sign(pos.z) } : nearZ ? { axis: 'z', along: pos.z, side: Math.sign(pos.x) } : null
        placed.taken = 0
        if (placed.road) {
          // the part of the road the county takes: a sandy strip with a yellow edge and orange cones. in its own little group,
          // whose local +z points from the edge of the road towards the middle of it
          const zone = new THREE.Group()
          const base = mk(zone, new THREE.BoxGeometry(4.9, 0.08, 1), 0xc9a66b, 0, 0, 0, false)
          const edge = bx(zone, 4.9, 0.1, 0.07, 0xffc400, 0, 0.01, 0)
          const cones = [-1.9, -0.95, 0, 0.95, 1.9].map((x) => mk(zone, new THREE.ConeGeometry(0.07, 0.22, 7), 0xff6a00, x, 0.12, 0, false))
          const { axis, side } = placed.road
          zone.position.set(axis === 'x' ? placed.road.along : side * 1.5, 0.075, axis === 'x' ? side * 1.5 : placed.road.along)
          zone.rotation.y = axis === 'x' ? (side > 0 ? Math.PI : 0) : -side * Math.PI / 2
          zone.visible = false
          s.add(zone)
          placed.strip = zone
          zone.userData = { base, edge, cones }
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
      // the two arrows under the lamps: left and right as the driver sees them (the head looks along +x, the driver looks back along -x, so his left is +z)
      bx(head, 0.22, 0.4, 0.38, S.head, 0.3, 1.18, 0)
      const arrow = (side) => {
        const m = new THREE.MeshBasicMaterial({ color: ARROW_OFF })
        mk(head, new THREE.ConeGeometry(0.08, 0.2, 3), m, 0.43, 1.38, side * 0.095, false).rotation.x = side * (Math.PI / 2)
        return m
      }
      const left = arrow(1), right = arrow(-1)
      head.rotation.y = face
      g.add(head)
      this.signals.push({ axis, dir: face === 0 ? -1 : face === Math.PI ? 1 : face === -Math.PI / 2 ? -1 : 1, mats, left, right })
    }
    g.position.set(0, 0.07, 0)
    this.world.add(g)
    this.signalKey = null
  }

  // red on top, yellow, green below: light up the one that is on
  paintSignals() {
    const sig = this.traffic.sig
    const key = sig.phase + sig.mode
    if (key === this.signalKey) return
    this.signalKey = key
    const shade = sig.mode === 'yellow' ? 1 : 2 // which lamp colour is lit when this road has its turn
    for (const h of this.signals) {
      const through = sig.left === 0 && h.axis === sig.axis && sig.mode !== 'red' // the round lamps only show green or yellow in a road's through phase
      const on = through ? shade : 0
      h.mats.forEach((m, i) => m.color.setHex(i === on ? LIT[i] : OFF[i]))
      const mine = sig.left === h.dir && h.axis === sig.axis && sig.mode !== 'red' // this head's left arrow has its own phase
      h.left.color.setHex(mine ? (sig.mode === 'yellow' ? LIT[1] : LIT[2]) : ARROW_OFF)
      h.right.color.setHex(through ? (sig.mode === 'yellow' ? LIT[1] : LIT[2]) : ARROW_OFF) // a right turn goes with the through light
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
    return treeSpot(lot.pos.x, lot.pos.z, k) // never over the pavement, see cityRules.js
  }

  plantTree(lot, k, animate) {
    const [x, z] = this.slotAt(lot, k)
    const g = this.tree(x, z, 0.6 + (k % 3) * 0.05, k % 2 ? 'p' : 'r')
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
      const u = lot.strip.userData // measured from the edge of the road inwards
      u.base.scale.z = n
      u.base.position.z = n / 2
      u.edge.position.z = n
      for (const c of u.cones) c.position.z = n
    }
  }

  // ---- accidents: the car behind bumps the one in front, the drivers get out and fight until the county's spending is zero ----
  // only the county where the most is spent (judged over ten days, see assessSpending) has accidents, and only once there are ten days to judge by
  crashWeights() {
    const a = this.assess || { ready: false, top: null }
    const only = this.odds.map((o, i) => (a.ready && o && this.lots[i].county && this.lots[i].county.id === a.top ? o : null))
    return accidentWeights(only, this.lots.map((l) => !!l.road))
  }

  maybeCrash(force = false) {
    const cap = this.cars.length >= 8 ? MAX_ACCIDENTS : 1 // a map with few vehicles can only spare one pair
    if (this.crashes.length >= cap || this.cars.length < 4) return false
    const weights = this.crashWeights()
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
    return this.summonCrash(k) // nobody was in the right place: two cars come up the road in front of the county
  }

  summonCrash(k) {
    const lot = this.lots[k]
    const r = lot.road
    const spare = this.cars.filter((c) => !c.active)
    if (spare.length < 2) return false
    const [front, rear] = spare
    const lane = r.side * 0.75
    const dir = r.axis === 'x' ? (lane > 0 ? 1 : -1) : (lane > 0 ? -1 : 1) // the way traffic goes in that lane
    const out = Math.sign(r.along) // which way from the crossroad the county is
    const tFront = out * Math.max(5.9, Math.abs(r.along) + 1.4) // in front of the county, as far from the crossroad as it allows
    const tRear = tFront - dir * (front.hl + rear.hl + 1.2) // just behind it
    if (Math.abs(tRear) < 4.2 || Math.abs(tRear) > this.E - 1) return false // not into the crossroad, and not off the board
    for (const c of this.cars) { // not on top of another car
      if (!c.active || c.road !== r.axis || Math.abs(c.lat - lane) > 0.6) continue
      if (Math.abs(c.t - tFront) < front.hl + c.hl + 0.6 || Math.abs(c.t - tRear) < rear.hl + c.hl + 0.6) return false
    }
    const base = 2.2
    for (const [c, t] of [[front, tFront], [rear, tRear]]) {
      Object.assign(c, { active: true, axis: r.axis, road: r.axis, lane, alt: -lane, lat: lane, goal: lane, dir, t, base, speed: base, passing: null, still: 0, crash: null })
    }
    startCrash(front, rear)
    this.crashes.push({ lot: k, front, rear, phase: 'bump', t: 0, fighters: null })
    return true
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
    // the fighters are in the way of anybody walking on that footpath
    this.traffic.blockers = this.crashes.flatMap((a) => (a.fighters || []).map((f) => ({ active: true, road: a.axis + Math.sign(f.lat), t: f.along, lat: f.lat, goal: f.lat, hw: 0.3, hl: 0.32, dir: 0, speed: 0 })))
    this.crashClock += dt
    if (this.crashClock >= 0.5) {
      this.crashClock = 0
      if (!this.crashDue) {
        const danger = this.crashWeights().reduce((a, b) => a + b, 0)
        if (this.crashes.length < MAX_ACCIDENTS && this.rng() < accidentChance(danger, 0.5)) this.crashDue = true
      }
      if (this.crashDue && this.maybeCrash(true)) this.crashDue = false
    }
  }

  // ---- building a floor for real ----
  // the new model is built hidden. what stands is compared with it (see construction.js), the old roof is lifted off, the walls are laid
  // brick by brick by bricklayers on a scaffold that rises with them, painters follow behind and the finished wall shows up under their
  // rollers, the crane lifts the roof, domes and slabs into place. then the scaffold comes down and the finished model takes over.

  // what a model is made of, in the frame of its group
  describe(g) {
    g.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert()
    const out = []
    g.traverse((m) => {
      if (!m.isMesh) return
      const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
      rel.decompose(p, q, s)
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ')
      const mat = Array.isArray(m.material) ? m.material[0] : m.material
      const color = mat && mat.color ? mat.color.getHex() : 0
      const par = m.geometry.parameters || {}
      const flat = Math.abs(e.x) < 0.03 && Math.abs(e.z) < 0.03
      const quarter = Math.abs(Math.sin(2 * e.y)) < 0.03 // turned a quarter at most, so the sides still run along the axes
      if (m.geometry.type === 'BoxGeometry') {
        const turned = Math.abs(Math.sin(e.y)) > 0.7
        const w = (turned ? par.depth * s.z : par.width * s.x), d = (turned ? par.width * s.x : par.depth * s.z), h = par.height * s.y
        out.push({ mesh: m, kind: 'box', cx: p.x, cy: p.y, cz: p.z, w, d, h, bottom: p.y - h / 2, top: p.y + h / 2, color, upright: flat && quarter })
      } else if (m.geometry.type === 'CylinderGeometry') {
        const h = par.height * s.y
        out.push({ mesh: m, kind: 'cyl', cx: p.x, cy: p.y, cz: p.z, rt: par.radiusTop * s.x, rb: par.radiusBottom * s.x, seg: par.radialSegments, h, bottom: p.y - h / 2, top: p.y + h / 2, color, upright: flat })
      } else {
        const b = new THREE.Box3().setFromObject(m).applyMatrix4(inv)
        const c = b.getCenter(new THREE.Vector3()), z = b.getSize(new THREE.Vector3())
        out.push({ mesh: m, kind: 'other', cx: c.x, cy: c.y, cz: c.z, w: z.x, d: z.z, h: z.y, bottom: b.min.y, top: b.max.y, color, upright: false })
      }
    })
    return out
  }

  // somebody to work (a yellow hard hat, small kids on the Lego map)
  makeCrewman(lot, role, k, kit) {
    const p = this.folk()
    const u = p.userData
    if (!u.diver) { u.hat.visible = true; u.hat.material.color.set(0xffd60a) }
    const [sx, sz] = treeSpot(lot.pos.x, lot.pos.z, k)
    p.position.set(sx + (lot.pos.x - sx) * 0.4, 0.1, sz + (lot.pos.z - sz) * 0.4)
    p.scale.setScalar(0.001)
    this.world.add(p)
    if (role === 'painter') { // the roller, in the county's colour
      const roller = new THREE.Group()
      bx(roller, 0.03, 0.4, 0.03, 0x6b5a3e, 0, -0.5, 0.12)
      bx(roller, 0.24, 0.1, 0.1, new THREE.Color(lot.county.color).getHex(), 0, -0.72, 0.12)
      u.arms[1].add(roller)
    }
    return { p, role, size: this.T.id === 'lego' ? 0.78 : 1.05, last: null }
  }

  queueBuild(lot, jobs) {
    lot.queue.push(...jobs)
    this.setCrane(lot, true)
    if (!lot.build) this.nextBuild(lot)
  }

  nextBuild(lot) {
    const job = lot.queue.shift()
    if (!job) { if (lot.target <= (lot.built ? lot.built.L : 0)) this.setCrane(lot, false); return }
    const pending = Math.max(0, lot.target - lot.built.L) + lot.queue.length * 0.6
    this.startBuild(lot, job, 1 + 0.7 * pending)
  }

  startBuild(lot, job, speed) {
    const { g, old } = job
    const id = this.T.id
    const plan = compare(old ? this.describe(old.g) : [], this.describe(g))
    const tl = timeline(plan, KITS[id] || KITS.city, Math.min(5, speed))
    const kitColors = (BRICK_KITS[id] || BRICK_KITS.city).colors

    const site = new THREE.Group() // bricks and scaffold live here, in the same frame as the model
    site.position.copy(g.position)
    site.scale.copy(g.scale)
    lot.holder.add(site)
    site.updateMatrixWorld(true)

    const B = { job, g, old, plan, tl, site, t: 0, landed: 0, ptr: [0, 0, 0, 0], sides: [[], [], [], []], pieces: [], removes: [], scaf: null, platforms: new Map(), layers: [], painters: [] }
    lot.build = B

    // nothing of the new model shows until it is built: only the finished walls, behind a cut that rises with the work
    const wallMeshes = new Set(plan.walls.map((w) => w.d.mesh))
    g.visible = true
    g.traverse((n) => { if (n.isMesh && !wallMeshes.has(n)) n.visible = false })
    const top = new THREE.Plane(new THREE.Vector3(0, -1, 0), -1e4)
    B.clipTop = top
    B.clipped = []
    const toWorldY = (y) => site.localToWorld(new THREE.Vector3(0, y, 0)).y
    B.toWorldY = toWorldY
    for (const w of plan.walls) {
      const planes = [top]
      if (w.grown) { const bot = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); w.bot = bot; planes.push(bot) } // the part that stood is the old model's
      for (const mm of Array.isArray(w.d.mesh.material) ? w.d.mesh.material : [w.d.mesh.material]) {
        mm.clippingPlanes = planes
        mm.userData.outlineParameters = { visible: false }
        mm.needsUpdate = true
        B.clipped.push(mm)
      }
    }

    // the bricks: one drawing for all of them, shown one at a time as they are laid
    const n = tl.bricks.length
    if (n) {
      const round = tl.kit.shape === 'ball' || tl.kit.shape === 'shell'
      const geo = round ? new THREE.SphereGeometry(0.5, 8, 6) : new THREE.BoxGeometry(1, 1, 1)
      const mat = L(0xffffff)
      mat.userData.outlineParameters = { visible: false }
      const inst = new THREE.InstancedMesh(geo, mat, n)
      inst.frustumCulled = false
      inst.castShadow = inst.receiveShadow = true
      inst.count = 0
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color()
      const up = new THREE.Vector3(0, 1, 0)
      const lego = tl.kit.shape === 'lego'
      const studs = lego ? new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), mat, n * 2) : null
      if (studs) { studs.frustumCulled = false; studs.castShadow = true; studs.count = 0 }
      tl.bricks.forEach((b, i) => {
        b.ci = Math.floor(this.rng() * kitColors.length)
        q.setFromAxisAngle(up, b.ry)
        m4.compose(pos.set(b.x, b.y, b.z), q, sc.set(b.sx, b.sy, b.sz))
        inst.setMatrixAt(i, m4)
        col.setHex(kitColors[b.ci])
        inst.setColorAt(i, col)
        if (studs) for (const sgn of [-1, 1]) {
          const dx = Math.cos(b.ry) * sgn * b.sx * 0.22, dz = -Math.sin(b.ry) * sgn * b.sx * 0.22
          m4.compose(pos.set(b.x + dx, b.y + b.sy / 2 + 0.03, b.z + dz), q, sc.set(0.1, 0.07, 0.1))
          studs.setMatrixAt(i * 2 + (sgn > 0 ? 1 : 0), m4)
          studs.setColorAt(i * 2 + (sgn > 0 ? 1 : 0), col)
        }
        this.sidesOf(b, plan)
        B.sides[b.side].push(b)
      })
      inst.instanceMatrix.needsUpdate = true
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      site.add(inst)
      B.inst = inst
      if (studs) { studs.instanceMatrix.needsUpdate = true; if (studs.instanceColor) studs.instanceColor.needsUpdate = true; site.add(studs); B.studs = studs }
      B.fly = [0, 1, 2, 3].map(() => {
        const f = new THREE.Mesh(geo, L(0xffffff))
        f.visible = false
        f.castShadow = true
        site.add(f)
        return f
      })
    }

    // the scaffold goes round the walls
    if (plan.walls.length) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const w of plan.walls) {
        const d = w.d
        const rx = d.kind === 'box' ? d.w / 2 : Math.max(d.rt, d.rb), rz = d.kind === 'box' ? d.d / 2 : Math.max(d.rt, d.rb)
        x0 = Math.min(x0, d.cx - rx); x1 = Math.max(x1, d.cx + rx); z0 = Math.min(z0, d.cz - rz); z1 = Math.max(z1, d.cz + rz)
      }
      const o = 0.62 // the scaffold stands this far from the wall
      B.scaf = { group: new THREE.Group(), x0: x0 - o, x1: x1 + o, z0: z0 - o, z1: z1 + o, grow: 0 }
      site.add(B.scaf.group)
      const hgt = tl.topAll + 0.5
      for (const [x, z] of [[B.scaf.x0, B.scaf.z0], [B.scaf.x1, B.scaf.z0], [B.scaf.x0, B.scaf.z1], [B.scaf.x1, B.scaf.z1]]) bx(B.scaf.group, 0.07, hgt, 0.07, 0x8d8f94, x, 0, z)
    }

    // the people: a bricklayer for each side, two painters who also fit the small things
    if (n) for (let s = 0; s < 4; s++) B.layers.push(this.makeCrewman(lot, 'layer', s, tl.kit))
    for (let s = 0; s < 2; s++) B.painters.push(this.makeCrewman(lot, 'painter', 4 + s, tl.kit))
    B.crew = [...B.layers, ...B.painters]

    // pieces that are fitted (new) and lifted off (old roof)
    for (const p of tl.pieces) {
      const m = p.d.mesh
      g.attach(m)
      B.pieces.push({ ...p, mesh: m, pos: m.position.clone(), scale: m.scale.clone(), done: false })
    }
    for (const r of tl.removes) B.removes.push({ ...r, mesh: r.d.mesh, y0: r.d.mesh.position.y, done: false })
    B.rope = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.03), L(0x2b2b2b))
    B.rope.visible = false
    this.world.add(B.rope)
    if (lot.crane) lot.crane.userData.h = Math.max(lot.crane.userData.h, lot.top + 2.2)
  }

  // which way a brick faces outwards (for the bricklayer to stand on)
  sidesOf(b, plan) {
    const w = plan.walls[b.wall]
    if (w.d.kind === 'box') { const nx = [0, 1, 0, -1][b.side], nz = [1, 0, -1, 0][b.side]; b.nx = nx; b.nz = nz } else { const l = Math.hypot(b.x - w.d.cx, b.z - w.d.cz) || 1; b.nx = (b.x - w.d.cx) / l; b.nz = (b.z - w.d.cz) / l }
  }

  // a platform of the scaffold at this height, put up when a bricklayer first needs it
  platform(B, k) {
    if (!B.scaf || B.platforms.has(k)) return
    const { scaf } = B
    const y = k * LIFT
    const gp = new THREE.Group()
    const len = (a, b) => b - a
    bx(gp, len(scaf.x0, scaf.x1) + 0.5, 0.05, 0.42, 0xb08a52, (scaf.x0 + scaf.x1) / 2, y, scaf.z0 - 0.1)
    bx(gp, len(scaf.x0, scaf.x1) + 0.5, 0.05, 0.42, 0xb08a52, (scaf.x0 + scaf.x1) / 2, y, scaf.z1 + 0.1)
    bx(gp, 0.42, 0.05, len(scaf.z0, scaf.z1) + 0.5, 0xb08a52, scaf.x0 - 0.1, y, (scaf.z0 + scaf.z1) / 2)
    bx(gp, 0.42, 0.05, len(scaf.z0, scaf.z1) + 0.5, 0xb08a52, scaf.x1 + 0.1, y, (scaf.z0 + scaf.z1) / 2)
    bx(gp, len(scaf.x0, scaf.x1), 0.04, 0.04, 0x8d8f94, (scaf.x0 + scaf.x1) / 2, y + 0.42, scaf.z0 - 0.28)
    bx(gp, len(scaf.x0, scaf.x1), 0.04, 0.04, 0x8d8f94, (scaf.x0 + scaf.x1) / 2, y + 0.42, scaf.z1 + 0.28)
    scaf.group.add(gp)
    B.platforms.set(k, gp)
  }

  updateBuild(lot, dt) {
    const B = lot.build
    B.t += dt
    const { t, tl, site, g } = B
    const kIn = Math.min(1, t / 0.45), kOut = Math.max(0.001, Math.min(1, (tl.end - t) / 0.8))
    const crewK = Math.max(0.001, kIn * kOut)
    site.updateMatrixWorld(true)
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3()

    // the old roof is lifted off first
    for (const r of B.removes) {
      const f = Math.min(1, Math.max(0, (t - r.start) / r.dur))
      r.mesh.position.y = r.y0 + 2.6 * f * f
      if (f >= 1 && !r.done) { r.done = true; r.mesh.visible = false }
    }

    // bricks land one after another
    if (B.inst) {
      while (B.landed < tl.bricks.length && tl.bricks[B.landed].land <= t) B.landed++
      B.inst.count = B.landed
      if (B.studs) B.studs.count = B.landed * 2
    }

    // the finished wall shows up behind the bricklayers
    const clip = claddingHeight(tl, t)
    B.clipTop.constant = B.toWorldY(clip)
    for (const w of B.plan.walls) if (w.bot) w.bot.constant = -B.toWorldY(w.from)

    // workers: where they stand, which way they face, what the arms do
    const moveTo = (c, wx, wy, wz, fx, fz) => {
      c.p.position.x += (wx - c.p.position.x) * Math.min(1, dt * 5)
      c.p.position.z += (wz - c.p.position.z) * Math.min(1, dt * 5)
      c.p.position.y += (wy - c.p.position.y) * Math.min(1, dt * 9)
      c.p.rotation.y = Math.atan2(fx, fz)
      c.p.scale.setScalar(c.size * crewK)
    }
    const feetAt = (y) => { const k = Math.max(0, Math.floor((y - 0.3) / LIFT)); this.platform(B, k); return [k, site.localToWorld(tmp2.set(0, k * LIFT + 0.04, 0)).y] }
    B.layers.forEach((c, s) => {
      const list = B.sides[s]
      while (B.ptr[s] < list.length && list[B.ptr[s]].land <= t) B.ptr[s]++
      const cur = list[B.ptr[s]], last = list[B.ptr[s] - 1]
      const ref = cur || last
      const fly = B.fly[s]
      fly.visible = false
      if (!ref) return
      const [, fy] = feetAt(ref.y)
      site.localToWorld(tmp.set(ref.x + ref.nx * 0.55, 0, ref.z + ref.nz * 0.55))
      const out = tmp2.set(ref.nx, 0, ref.nz)
      moveTo(c, tmp.x, fy, tmp.z, -ref.nx, -ref.nz)
      const u = c.p.userData
      const k = cur && t >= cur.start ? (t - cur.start) / Math.max(0.03, cur.land - cur.start) : 1
      u.arms[0].rotation.x = -0.9
      u.arms[1].rotation.x = -1.25 + Math.sin(k * Math.PI) * 0.4 // reaches to the wall, lays, comes back
      if (cur && t >= cur.start && t < cur.land) { // the brick travels the short way from the hand to its place
        const hand = site.worldToLocal(new THREE.Vector3(c.p.position.x, c.p.position.y + 0.95 * c.size * crewK, c.p.position.z).addScaledVector(out, 0))
        const f = k
        fly.position.set(hand.x + (cur.x - hand.x) * f, hand.y + (cur.y - hand.y) * f, hand.z + (cur.z - hand.z) * f)
        fly.rotation.set(0, cur.ry, 0)
        fly.scale.set(cur.sx, cur.sy, cur.sz)
        fly.material.color.setHex((BRICK_KITS[this.T.id] || BRICK_KITS.city).colors[cur.ci])
        fly.visible = true
      }
    })
    B.painters.forEach((c, i) => {
      const u = c.p.userData
      const hand = B.pieces.find((p) => p.mode === 'hand' && p.by === i && t >= p.start - 0.7 && t <= p.start + p.dur + 0.15)
      if (hand) { // fitting something small
        const d = hand.pos
        const [, fy] = feetAt(d.y)
        site.localToWorld(tmp.set(d.x, 0, d.z))
        const away = tmp2.set(d.x - (B.scaf ? (B.scaf.x0 + B.scaf.x1) / 2 : 0), 0, d.z - (B.scaf ? (B.scaf.z0 + B.scaf.z1) / 2 : 0))
        away.normalize()
        moveTo(c, tmp.x + away.x * 0.6, B.scaf ? fy : 0.1, tmp.z + away.z * 0.6, -away.x, -away.z)
        u.arms[1].rotation.x = -1.3 + Math.sin((t - hand.start) * 9) * 0.3
        u.arms[0].rotation.x = -0.9
      } else if (B.scaf && t >= tl.brickStart) { // painting: up and down the wall, where the finished wall is just showing
        const s = i === 0 ? 0 : 2
        const sc = B.scaf
        const along = Math.sin(t * 0.8 + i * 2) * 0.7
        const x = s === 0 ? (sc.x0 + sc.x1) / 2 + along * (sc.x1 - sc.x0) / 2 : (sc.x0 + sc.x1) / 2 - along * (sc.x1 - sc.x0) / 2
        const z = s === 0 ? sc.z1 - 0.1 : sc.z0 + 0.1
        const [, fy] = feetAt(Math.max(clip - 0.2, 0.3))
        site.localToWorld(tmp.set(x, 0, z))
        moveTo(c, tmp.x, fy, tmp.z, 0, s === 0 ? -1 : 1)
        u.arms[1].rotation.x = -1.3 + Math.sin(t * 7 + i) * 0.6
        u.arms[0].rotation.x = -0.5
      } else {
        const yard = tmp.set(lot.pos.x + 0.9 * lot.size, 0.1, lot.pos.z - 0.9 * lot.size)
        moveTo(c, yard.x, 0.1, yard.z, -1, 1)
        u.arms[1].rotation.x = -0.4
        u.arms[0].rotation.x = -0.4
      }
    })

    // the scaffold: poles first, a platform wherever somebody works; it comes down at the end
    if (B.scaf) {
      B.scaf.grow += ((t < tl.end - 0.8 ? 1 : 0) - B.scaf.grow) * Math.min(1, dt * 6)
      B.scaf.group.scale.set(1, Math.max(0.001, B.scaf.grow), 1)
      B.scaf.group.visible = t >= tl.removes.reduce((m, r) => Math.max(m, r.start + r.dur), 0) * 0.8
    }

    // pieces: slabs poured, small things set in by hand, big things hoisted by the crane
    const cu = lot.crane && lot.crane.userData
    let load = null
    for (const p of B.pieces) {
      if (p.done || t < p.start) continue
      const f = Math.min(1, (t - p.start) / p.dur)
      const m = p.mesh
      m.visible = true
      if (p.mode === 'pour') {
        m.scale.set(p.scale.x, Math.max(0.02, p.scale.y * f), p.scale.z)
        m.position.y = p.pos.y - (p.scale.y * (1 - Math.max(0.02, f))) * (p.d.h / 2)
      } else if (p.mode === 'hand') {
        const e = f * f * (3 - 2 * f)
        m.scale.set(p.scale.x * (0.3 + 0.7 * e), p.scale.y * (0.3 + 0.7 * e), p.scale.z * (0.3 + 0.7 * e))
      } else if (lot.crane) {
        const aim = site.localToWorld(new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z))
        const yard = new THREE.Vector3(lot.crane.position.x - 0.9, 0.1 + p.d.h * 0.5, lot.crane.position.z + 0.9)
        const hoist = Math.max(aim.y + 0.7, B.toWorldY(Math.max(tl.topAll, p.d.top)) + 0.9)
        let x, y, z
        if (f < 0.12) { x = yard.x; z = yard.z; y = yard.y } // waiting for the hook
        else if (f < 0.45) { const e = (f - 0.12) / 0.33; x = yard.x; z = yard.z; y = yard.y + (hoist - yard.y) * (e * e * (3 - 2 * e)) } // up
        else if (f < 0.75) { const e = (f - 0.45) / 0.3, s = e * e * (3 - 2 * e); x = yard.x + (aim.x - yard.x) * s; z = yard.z + (aim.z - yard.z) * s; y = hoist } // across
        else { const e = (f - 0.75) / 0.25, s = e * e * (3 - 2 * e); x = aim.x; z = aim.z; y = hoist + (aim.y - hoist) * s } // down
        m.position.copy(g.worldToLocal(new THREE.Vector3(x, y, z)))
        load = { x, y, z, top: y + p.d.h / 2 * g.scale.y }
      }
      if (f >= 1) { p.done = true; m.position.copy(p.pos); m.scale.copy(p.scale) }
    }
    if (cu) { // the crane arm swings to its load, or rests
      const cx = lot.crane.position.x, cz = lot.crane.position.z
      const aimX = load ? load.x : lot.pos.x - 0.55 * lot.size, aimZ = load ? load.z : lot.pos.z - 0.55 * lot.size
      const want = Math.atan2(-(aimZ - cz), aimX - cx) + (load ? 0 : Math.sin(t * 0.5) * 0.5)
      const diff = Math.atan2(Math.sin(want - cu.arm.rotation.y), Math.cos(want - cu.arm.rotation.y))
      cu.arm.rotation.y += Math.max(-dt * 2.6, Math.min(dt * 2.6, diff))
      B.rope.visible = !!load
      if (load) {
        const tipY = lot.crane.position.y + cu.arm.position.y * cu.grow
        const len = Math.max(0.1, tipY - load.top)
        B.rope.position.set(load.x, load.top + len / 2, load.z)
        B.rope.scale.set(1, len, 1)
      }
    }

    if (t >= tl.end) this.finishBuild(lot)
  }

  // the model is done (or a change came in: then it is done at once)
  finishBuild(lot, all = false) {
    const B = lot.build
    if (B) {
      const { g, old, site, plan } = B
      g.traverse((n) => { if (n.isMesh) n.visible = true })
      for (const mm of B.clipped) { mm.clippingPlanes = null; delete mm.userData.outlineParameters; mm.needsUpdate = true }
      for (const p of B.pieces) { p.mesh.position.copy(p.pos); p.mesh.scale.copy(p.scale) }
      if (old) this.disposePart(old.g)
      if (B.inst) B.inst.dispose()
      if (B.studs) B.studs.dispose()
      this.disposePart(site)
      this.disposePart(B.rope)
      for (const c of B.crew) this.disposePart(c.p)
      lot.build = null
      void plan
    }
    if (all) { // the rest of the queue goes in without a crew
      while (lot.queue.length) {
        const j = lot.queue.shift()
        j.g.traverse((n) => { if (n.isMesh) n.visible = true })
        j.g.visible = true
        if (j.old) this.disposePart(j.old.g)
      }
      return
    }
    this.nextBuild(lot)
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
    this.crashDue = false
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

  setCounties(list, assess) {
    // list: [{id,name,group,style,color,spent,count,level}]
    this.lastList = list
    if (assess) this.assess = assess // (a rebuild of the map re-applies the list without it: keep what we had)
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
    this.finishBuild(lot, true) // a change while a crew is working: their job is done at once, with the rest of the queue
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
    const jobs = []
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
      const building = animate && c && L > 0 // a county that levels up gets a real building site
      if (building) { g.visible = false; jobs.push({ k, g, old, w }) } else if (old) this.disposePart(old.g)
      parts[k] = { g, sig: w.sig, h: hgt, sy: w.sc[1], mats }
    }
    lot.mats = Object.values(parts).flatMap((p) => p.mats)
    lot.top = Math.max(1, ...Object.values(parts).map((p) => p.h))
    lot.built = { key: c ? c.style + '|' + c.color + '|' + L : 'none', look: c ? c.style + '|' + c.color : 'none', L }
    if (lot.dim < 0) lot.dim = 0
    if (!animate) { lot.size = stageSize(lot); this.sizeLot(lot) }
    this.setTrees(lot, treesLeft(L), !!animate) // a new floor costs a tree or two
    if (jobs.length) this.queueBuild(lot, jobs) // and a crew builds it: walls brick by brick, the roof by crane
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
      if (lot.county && lot.built && lot.target > lot.built.L && !lot.build && !lot.queue.length) { // the next floor starts when the crew is done with this one
        const now = performance.now()
        if (now >= lot.stepAt) {
          lot.stepAt = now + lot.stepEvery * 1000
          this.rebuildLot(lot, lot.county, lot.built.L + 1, true)
          if (lot.target <= lot.built.L && !lot.build) this.setCrane(lot, false)
          else if (lot.crane) lot.crane.userData.h = Math.max(lot.crane.userData.h, lot.top + 2.2)
        }
      }
      if (lot.crane) {
        const cu = lot.crane.userData
        cu.grow += ((cu.leaving ? 0 : 1) - cu.grow) * Math.min(1, dt * 5)
        if (!lot.build) cu.arm.rotation.y += dt * 1.2 // (a crew's crane is steered by the crew)
        cu.pole.scale.y += (cu.h - cu.pole.scale.y) * Math.min(1, dt * 4)
        cu.arm.position.y = 0.2 + cu.pole.scale.y
        lot.crane.scale.setScalar(Math.max(0.001, cu.grow))
        if (cu.leaving && cu.grow < 0.02) { this.disposePart(lot.crane); lot.crane = null }
      }
      if (lot.build) this.updateBuild(lot, dt)
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
      } else if (u.diver) { // a diver really swims: lying flat, face down, arms stretched out in front, flippers kicking, drifting up and down
        const kick = Math.sin(t * (6 + k * 3))
        u.legs[0].rotation.x = kick * 0.45
        u.legs[1].rotation.x = -kick * 0.45
        u.arms[0].rotation.x = 3.0 + Math.sin(t * 2.2) * 0.35 // arms reach forward past the head and paddle gently
        u.arms[1].rotation.x = 3.0 - Math.sin(t * 2.2) * 0.35
        w.p.rotation.x = 1.4 + Math.sin(t * 1.3) * 0.1 // nearly horizontal, the body undulates a little
        w.p.rotation.z = Math.sin(t * 2.2) * 0.12 // and rolls from side to side with the strokes
        lift = 0.75 + Math.sin(t * 1.1) * 0.18 // floating in the water, not walking on the ground
      } else {
        u.legs[0].rotation.x = sw * 0.75
        u.legs[1].rotation.x = -sw * 0.75
        u.arms[0].rotation.x = -sw * 0.6
        u.arms[1].rotation.x = sw * 0.6
        u.torso.rotation.y = sw * 0.08
        lift += Math.abs(Math.cos(w.ph)) * 0.045 * k
      }
      const bob = lift - 0.1
      const heading = w.axis === 'x' ? (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (w.dir > 0 ? 0 : Math.PI) // the way they walk
      if (w.face === undefined) w.face = heading
      const turn = Math.atan2(Math.sin(heading - w.face), Math.cos(heading - w.face)) // the short way round
      w.face += Math.max(-dt * 8, Math.min(dt * 8, turn)) // they swing round when they turn back, not flip
      w.p.position.set(w.axis === 'x' ? w.t : w.lat, 0.1 + bob, w.axis === 'x' ? w.lat : w.t)
      w.p.rotation.y = w.face
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
      const pose = carPose(c) // also right in the middle of a turn
      c.car.position.set(pose.x, vy, pose.z)
      c.car.rotation.y = Math.atan2(-pose.hz, pose.hx)
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

// what each map builds with: bricks on the classic map, Lego bricks, planks, ice cubes, sandbags, shells, basketballs
const BRICK_KITS = {
  city: { colors: [0xb5543a, 0xc9694b, 0xa04632], shape: 'brick' },
  lego: { colors: [0xe3000b, 0xffd500, 0x0057b8, 0x00852b], shape: 'lego' },
  japan: { colors: [0x8b5a2b, 0xb08968, 0xd9c7a0], shape: 'plank' },
  ice: { colors: [0xcfeeff, 0xe8f6ff, 0xaee1ff], shape: 'cube' },
  wire: { colors: [0x0a66c2, 0x0a8f3c, 0xc2187a], shape: 'cube' },
  war: { colors: [0x9a8562, 0x7a6a4a, 0x5d6b3a], shape: 'sandbag' },
  ocean: { colors: [0xff7f6e, 0xffd166, 0xc77dff], shape: 'shell' },
  court: { colors: [0xe8742a], shape: 'ball' },
}

// the size of a lot follows its level: small while there is little spending, bigger (and the footpath thinner) the more is spent
const stageSize = (lot) => lotSize(lot.built ? lot.built.L : 0)

// traffic light colours: red, yellow, green, lit and switched off
const LIT = [0xff2b2b, 0xffc400, 0x2bff6a]
const OFF = [0x3a0d0d, 0x3a2e00, 0x0d3a1a]
const ARROW_OFF = 0x1b2a20
