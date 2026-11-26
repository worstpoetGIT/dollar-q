import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'
import { makeMaps, MAP_LIST } from './maps.js'
import { treesLeft, TREES_PER_LOT, treeSpot, roadTaken, accidentWeights, fightGoesOn, accidentIsDue } from './cityRules.js'
import { compare, timelineWithin, paintEdge, KITS, LIFT, BUILD_SECONDS } from './construction.js'
import { setObstacles, sweepClear, uArc, newCar, makeTraffic, placeWalkers, spawnCar, stepTraffic, LOT_SMALL, lotSize, startHit, endCrash, carPose, dispatchCar, sendWatcher, releaseWatcher, walkTip, TIP_FADE } from './traffic.js'

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

// make a material see-through (or solid again). the shader is built differently for solid and see-through materials, so it is rebuilt when that changes (and only then)
function setSeeThrough(m, on, k) {
  if (m.transparent !== on) { m.transparent = on; m.needsUpdate = true }
  m.opacity = on ? Math.max(0.02, k) : 1
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
  if (!WIRE) m.userData.win = { floors, cols, glass: glass ?? 0x2b3a55 } // (a real building site leaves gaps for these and fits window panes)
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
function makeAmbulance() {
  const g = makeVan(0xf8fafc)
  bx(g, 1.77, 0.1, 0.76, 0xe11d48, 0, 0.5, 0)
  bx(g, 0.34, 0.34, 0.77, 0xe11d48, -0.3, 0.2, 0)
  bx(g, 0.1, 0.34, 0.77, 0xe11d48, -0.3, 0.2, 0)
  const l1 = bx(g, 0.14, 0.1, 0.22, 0xff2b2b, 0.55, 0.78, -0.2)
  const l2 = bx(g, 0.14, 0.1, 0.22, 0x3b82f6, 0.55, 0.78, 0.2)
  g.userData = { lights: [l1, l2] }
  return g
}
function makePolice() {
  const g = makeCar(0x1f3b73)
  bx(g, 0.5, 0.2, 0.7, 0xf8fafc, 0.3, 0.17, 0)
  const l1 = bx(g, 0.14, 0.1, 0.22, 0xff2b2b, -0.08, 0.8, -0.18)
  const l2 = bx(g, 0.14, 0.1, 0.22, 0x3b82f6, -0.08, 0.8, 0.18)
  g.userData = { lights: [l1, l2] }
  return g
}
function makeTruck(color = 0xf08a24) {
  const g = new THREE.Group()
  bx(g, 0.8, 0.6, 0.8, color, 1.05, 0.16, 0)
  bx(g, 0.34, 0.3, 0.82, 0xcfe8f5, 1.31, 0.5, 0) // (the front of the glass sticks out past the cab: two faces in the same place flicker)
  bx(g, 1.9, 0.9, 0.86, 0xe5e7eb, -0.4, 0.2, 0)
  for (const x of [-1.0, -0.2, 1.1]) for (const z of [-0.38, 0.38]) bx(g, 0.26, 0.26, 0.12, 0x1a1a1a, x, 0, z)
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
    this.accident = null // the one that is happening: a car that hit somebody on the footpath, and everything that follows
    this.accClock = 0
    this.lastAcc = 0 // when the last accident started (0 every time the app is opened: one is due at once, and then one every hour for as long as the app stays open)
    this.assess = { ready: false, top: null } // where the money goes, from the last ten days (set by setCounties)
    this.hunt = null // while one is due: { lot, until }, more traffic is sent down that county's street
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
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) window.__traffic = { sweepClear, uArc } // (for looking into things from the browser)
    this.lampPosts = (this.ring2 ? [-18, -12, -6, 6, 12, 18] : [-12, -6, 6, 12]).flatMap((i) => [-1, 1].flatMap((sg) => [{ x: i, z: sg * 1.62, r: 0.1 }, { x: sg * 1.62, z: i, r: 0.1 }]))
    setObstacles(this.lampPosts) // the lamp posts, for the cars that turn round
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
    } else cyl(g, S.shaft === 'log' ? 0.12 : 0.1, H, shade(S.pole ?? S.head ?? 0x444444, 0.16), 0, 0, 0, S.shaft === 'log' ? 7 : 8) // (a thick, lighter pole: from any side it is plainly a pole that holds the lights, not something that blends into the heads or into somebody walking past)
    bx(g, 0.34, 0.12, 0.34, S.base || shade(S.pole ?? S.head ?? 0x444444, 0.1), 0, 0, 0)
    bx(g, 0.22, 0.06, 0.22, shade(S.pole ?? S.head ?? 0x444444, 0.24), 0, 0.12, 0)
    if (S.cap) mk(g, new THREE.SphereGeometry(0.13, 8, 6), S.cap, 0, H + 0.1, 0)

    this.signals = []
    // which way each head faces, and which road's cars it is for
    for (const [face, axis] of [[0, 'x'], [Math.PI, 'x'], [-Math.PI / 2, 'z'], [Math.PI / 2, 'z']]) {
      const head = new THREE.Group()
      bx(head, 0.1, 0.06, 0.06, S.pole || S.head, 0.1, 1.95, 0) // arm out to the head
      bx(head, 0.22, 0.8, 0.3, S.head, 0.3, 1.6, 0)
      if (S.rim) bx(head, 0.02, 1.26, 0.36, S.rim, 0.19, 1.17, 0) // (the back frame covers the lamps and the arrows)
      if (S.roof) bx(head, 0.3, 0.05, 0.38, S.roof, 0.3, 2.4, 0)
      const mats = LIT.map((c, i) => {
        const m = new THREE.MeshBasicMaterial({ color: c })
        const y = 2.24 - i * 0.24
        if (S.lamp === 'disc') mk(head, new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), m, 0.43, y, 0, false).rotation.z = Math.PI / 2
        else if (S.lamp === 'box') mk(head, new THREE.BoxGeometry(0.05, 0.15, 0.15), m, 0.43, y, 0, false)
        else mk(head, new THREE.SphereGeometry(0.085, 8, 6), m, 0.43, y, 0, false)
        return m
      })
      // the two arrows under the lamps, as the driver sees them (the head looks along +x, the driver looks back along -x, so his left is +z).
      // same box as the lamps above it, a flat dark plate for each arrow, and the arrow lies flat on the plate: nothing sticks out
      bx(head, 0.22, 0.4, 0.3, S.head, 0.3, 1.18, 0)
      const arrow = (side) => {
        bx(head, 0.008, 0.15, 0.13, 0x15171b, 0.414, 1.325, side * 0.075)
        const m = new THREE.MeshBasicMaterial({ color: ARROW_OFF, side: THREE.DoubleSide })
        const geo = new THREE.ExtrudeGeometry(ARROW_SHAPE, { depth: 0.012, bevelEnabled: false })
        geo.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2) // the tip points to his left (+z) or his right (-z), the flat side lies on the plate
        const a = new THREE.Mesh(geo, m)
        a.position.set(side > 0 ? 0.418 + 0.012 : 0.418, 1.4, side * 0.075)
        head.add(a)
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

  // ---- accidents: on the narrowed road a car loses control, goes up on the footpath and hits somebody walking there ----
  // an ambulance takes the one who was hit, the police take the driver, onlookers come to see and go when the place is clear.
  // only the county where the most is spent (judged over ten days, see assessSpending) has them, one every four hours (by the real clock, remembered)
  // for as long as that county has spending this month
  crashWeights() {
    const a = this.assess || { ready: false, top: null }
    const only = this.odds.map((o, i) => (a.ready && o && this.lots[i].county && this.lots[i].county.id === a.top ? o : null))
    return accidentWeights(only, this.lots.map((l) => !!l.road))
  }

  // which street, if one is due: the top county, while it has spending, and four hours after the last
  accidentLot() {
    const a = this.assess || { ready: false, top: null }
    if (!a.ready) return -1
    const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fights') // (a preview link with ?fights: one at once, then every minute)
    const k = this.lots.findIndex((l, i) => l.road && l.county && l.county.id === a.top && this.odds[i])
    if (k < 0) return -1
    const spent = this.odds[k].spent
    if (demo) return fightGoesOn(spent) && Date.now() - (this.lastDemo || 0) > 60000 ? k : -1
    return accidentIsDue(Date.now(), this.lastAcc, spent) ? k : -1 // (this.lastAcc starts at 0 every time the app is opened: the first one is due at once)
  }

  // a car that is on its way out of the crossroad and somebody walking the footpath ahead of it on its own side of the road
  tryAccident(k) {
    const r = this.lots[k].road
    const cap = 13.2 + (this.E - 15) // the end of the footpath
    const pairs = []
    for (const c of this.cars) {
      if (!c.active || c.special || c.crash || c.passing || c.arc || c.waitMerge || c.road !== r.axis || c.turn !== 'straight' || Math.abs(c.lat - c.lane) > 0.1 || c.dir * c.t < 2.2) continue
      for (const w of this.walkers) {
        if (!w.active || w.down || w.watch || w.axis !== r.axis || w.waiting || w.crossing || w.inPlaza || Math.sign(w.lat) !== Math.sign(c.lat) || Math.abs(w.lat) < 1.6 || Math.abs(w.lat - w.lane) > 0.03 || Math.abs(w.goal - w.lane) > 0.03 || w.passing || Math.sign(w.t) !== Math.sign(c.t)) continue // (the outer lane: the car goes up on the footpath, clear of the road and of the ambulance's lane)
        const gap = (w.t - c.t) * c.dir
        const away = Math.abs(w.t)
        if (this.walkers.some((o) => o !== w && o.active && o.axis === w.axis && o.side === w.side && Math.abs(o.t - w.t) < 3.5)) continue // (nobody else close to them)
        const from = c.t - c.dir * (c.hl + 1.5), to = w.t + c.dir * 1.5 // (the stretch of footpath the car will sweep over)
        if (this.walkers.some((o) => o !== w && o.active && o.axis === w.axis && o.side === w.side && (o.t - from) * (o.t - to) <= 0)) continue
        const out = w.dir === Math.sign(w.t) // (walking out towards the end of the footpath: they will be about three further out when the car reaches them)
        if (gap < 5.5 || gap > 11 || away < 4.4 || away + (out ? 3.2 : 0) > Math.min(cap - 1.5, 11.6) || Math.abs(w.t - r.along) > 12) continue
        pairs.push({ c, w })
      }
    }
    if (!pairs.length) return false
    const { c, w } = pairs[Math.floor(this.rng() * pairs.length)]
    startHit(c, w, Math.sign(c.lat))
    this.accident = { lot: k, axis: r.axis, s: Math.sign(c.lat), dir: c.dir, car: c, vic: w, phase: 'hit', t: 0, t0: 0, amb: null, pol: null, watchers: [], actors: [], driver: null, carFree: false, cleared: false }
    return true
  }

  maybeAccident() {
    const now = performance.now()
    if (this.hunt && now > this.hunt.until) { this.hunt = null; return false } // no luck this time: it is tried again later
    const k = this.hunt ? this.hunt.lot : this.accidentLot()
    if (k < 0) { this.hunt = null; return false }
    if (!this.hunt) this.hunt = { lot: k, until: now + 60000 }
    const before = { acc: this.lastAcc, demo: this.lastDemo }
    if (this.tryAccident(k)) {
      this.hunt = null
      this.accident.before = before // (an accident that is called off does not count)
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('fights')) this.lastDemo = Date.now()
      else this.lastAcc = Date.now()
      return true
    }
    return false
  }

  // ---- the people of the accident ----
  makeActor(kind, x, z, yaw = 0) {
    const p = this.folk()
    p.rotation.order = 'YXZ'
    const u = p.userData
    const dress = { medic: [0xf5f5f5, 0x2b3a67], officer: [0x1f3b73, 0x14213d] }[kind]
    if (dress) {
      u.torso.material.color.set(dress[0]); u.sleeves.forEach((m) => m.material.color.set(dress[0]))
      u.thighs.forEach((m) => m.material.color.set(dress[1])); u.shins.forEach((m) => m.material.color.set(dress[1]))
    }
    u.hat.visible = kind === 'officer'
    if (kind === 'officer') u.hat.material.color.set(0x0b1530)
    if (kind === 'medic') { u.hat.visible = true; u.hat.material.color.set(0xd62828) }
    p.scale.setScalar(0.001)
    this.world.add(p)
    return { p, kind, x, z, yaw, ph: 0, moving: false, pts: [], k: 0, hidden: false }
  }

  // a person walks from point to point (at a walking pace, turning to face the way they go)
  walkActor(a, dt, A = null) {
    if (a.manual) return true // (carried along by the code that lifts the patient)
    const pt = a.pts[0]
    if (!pt) { a.moving = false; return true }
    const dx = pt[0] - a.x, dz = pt[1] - a.z, d = Math.hypot(dx, dz), len = 1.4 * dt
    if (A && d > 1e-6) { // somebody just walking by is in the way: wait a moment for them to go on (never for long)
      const [nt, nl] = this.tOf(A, a.x + (dx / d) * Math.min(d, 0.5), a.z + (dz / d) * Math.min(d, 0.5))
      if ((a.pause || 0) < 4 && this.walkers.some((w) => w.active && w.axis === A.axis && !w.down && w !== A.vic && !this.watchers.includes(w) && Math.abs(w.t - nt) < 0.5 && Math.abs(w.lat - nl) < 0.5)) { a.pause = (a.pause || 0) + dt; a.moving = false; return false }
    }
    const want = Math.atan2(dx, dz)
    const turn = Math.atan2(Math.sin(want - a.yaw), Math.cos(want - a.yaw))
    a.yaw += Math.max(-dt * 7, Math.min(dt * 7, turn))
    a.moving = true
    a.ph += dt * 8
    if (d <= len) { a.x = pt[0]; a.z = pt[1]; a.pts.shift(); if (!a.pts.length) a.moving = false; return !a.pts.length }
    a.x += (dx / d) * len; a.z += (dz / d) * len
    return false
  }

  showActor(a, dt) {
    a.k = Math.max(0, Math.min(1, a.k + (a.hidden ? -dt : dt) / 0.4))
    const u = a.p.userData, sw = a.moving ? Math.sin(a.ph) * 0.75 : 0
    a.p.position.set(a.x, 0.1, a.z)
    a.p.rotation.set(0, a.yaw, 0)
    u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw
    u.arms[0].rotation.x = -sw * 0.8; u.arms[1].rotation.x = sw * 0.8
    a.p.scale.setScalar(1.05 * Math.max(0.001, a.k))
    a.p.visible = a.k > 0.01
  }

  // world position from (along the road, across it)
  at(A, t, lat) { return A.axis === 'x' ? [t, lat] : [lat, t] }
  tOf(A, x, z) { return A.axis === 'x' ? [x, z] : [z, x] }

  // the ambulance or the police car is let in at the end of the road, same lane and way as the car that crashed, and parks where it is needed
  sendEmergency(A, kind) {
    const car = this.cars.find((c) => c.kind === kind)
    if (!car || car.active) return false
    const lane = A.car.lane
    const sp = kind === 'ambulance'
      ? A.vic.t + A.dir * (1.0 + 2 * car.hl) // the back doors are just ahead of the one who was hit
      : A.car.t - A.dir * (A.car.hl + 1.6) // behind the car that crashed, with room between them for the driver and the officer
    if (!dispatchCar(car, this.cars, A.axis, lane, sp, kind)) return false
    car.car.visible = true
    return { car, spot: sp, stage: 'coming', hold: 0, k: 0 }
  }

  // door point on the pavement side of an emergency vehicle, and the middle of its back doors
  doorOf(A, e, back = false) {
    const c = carPose(e.car)
    const h = [c.hx, c.hz]
    const n = A.axis === 'x' ? [0, A.s] : [A.s, 0]
    const hw = e.car.hw
    return back ? [c.x - h[0] * (e.car.hl + 0.3) + n[0] * 0.1, c.z - h[1] * (e.car.hl + 0.3) + n[1] * 0.1] : [c.x + n[0] * (hw + 0.55), c.z + n[1] * (hw + 0.55)]
  }

  accidentBegins(A) {
    const { car, vic } = A
    if (Math.abs(car.lat) - (car.hwe || car.hw) < 1.3) { this.accidentAbort(A); return } // the car did not get properly up on the footpath, it would block the road: not this time
    A.phase = 'scene'
    A.t0 = A.t
    A.lie = { t: vic.t, lat: A.s * Math.max(Math.abs(vic.lat), 1.85) } // the one who was hit lies across the footpath (the middle of the body here), head to the outside
    vic.p.rotation.order = 'YXZ'
    // onlookers: from the extra walkers, each to a spot on the footpath further out, nearest the one who was hit first
    const spots = []
    for (let i = 0; i < 4; i++) {
      const s = Math.abs(vic.t) + 1.3 + 0.9 * i
      if (s <= 13.2 + (this.E - 15) - 1.2) spots.push(Math.sign(vic.t) * s)
    }
    A.watchers = spots.map((spot, i) => ({ w: this.watchers[i], spot, at: 1.5 + i * 1.5, sent: false })).filter((o) => o.w && !o.w.active) // (one who is still on their way out from the last time stays out of it)
    A.retry = { amb: 0.5, pol: 1.5 }
  }

  updateAccident(dt) {
    const A = this.accident
    if (!A) return
    A.t += dt
    const { car, vic } = A
    if (A.phase === 'hit') {
      if (car.crash && car.crash.stopped) this.accidentBegins(A)
      else if (A.t > 14 || !car.active) this.accidentAbort(A)
      return
    }
    const tt = A.t - A.t0
    // the one who was hit lies there until the medics lift them
    if (!A.lifted) {
      const yaw = A.axis === 'x' ? (A.s > 0 ? Math.PI : 0) : -A.s * Math.PI / 2
      const [px, pz] = this.at(A, A.lie.t, A.lie.lat - A.s * 0.525) // (the feet are here, the head is at the other end)
      vic.p.position.set(px, 0.24, pz)
      vic.p.rotation.set(-Math.PI / 2, yaw, 0)
      const u = vic.p.userData
      u.arms[0].rotation.x = 0.3; u.arms[1].rotation.x = -0.3; u.legs[0].rotation.x = 0; u.legs[1].rotation.x = 0
    }
    // the ambulance, then the police, are let in at the end of the road (tried again until there is room for them)
    for (const kind of ['amb', 'pol']) {
      if (A[kind] || tt < A.retry[kind]) continue
      if (kind === 'pol' && !A.amb) continue
      A.retry[kind] = tt + 0.6
      const e = this.sendEmergency(A, kind === 'amb' ? 'ambulance' : 'police')
      if (e) A[kind] = e
    }
    const E = A.amb
    if (E) {
      if (E.stage === 'coming' && E.car.park && E.car.park.at) { // parked: the medics get out of the back and walk to the one on the ground
        const door = this.doorOf(A, E, true)
        A.medics = [0, 1].map((i) => {
          const o = (i ? 0.25 : -0.25) * A.s // (the one who will stand nearer the road starts nearer the road: they never cross)
          const m = this.makeActor('medic', door[0] + (A.axis === 'x' ? 0 : o), door[1] + (A.axis === 'x' ? o : 0), 0)
          m.dst = this.at(A, A.lie.t + A.dir * 0.65, A.lie.lat + (i ? 0.38 : -0.38) * A.s)
          m.pts = [m.dst]
          A.actors.push(m)
          return m
        })
        E.stage = 'walk'
      } else if (E.stage === 'walk') {
        if (A.medics.every((m) => !m.pts.length)) { E.stage = 'carry'; E.k = 0; A.lifted = true; A.medics.forEach((m) => { m.manual = true }) }
      } else if (E.stage === 'carry') { // they lift them and carry them to the back of the ambulance
        E.k = Math.min(1, E.k + dt / 2)
        const k = E.k * E.k * (3 - 2 * E.k)
        const door = this.doorOf(A, E, true)
        const [vx, vz] = this.at(A, A.lie.t, A.lie.lat - A.s * 0.525)
        vic.p.position.set(vx + (door[0] - vx) * k, 0.24 + 0.3 * Math.sin(k * Math.PI), vz + (door[1] - vz) * k)
        A.medics.forEach((m, i) => {
          const off = (i ? 0.3 : -0.3) * A.s
          m.x = m.dst[0] + (door[0] + (A.axis === 'x' ? 0 : off) - m.dst[0]) * k
          m.z = m.dst[1] + (door[1] + (A.axis === 'x' ? off : 0) - m.dst[1]) * k
          m.moving = k < 1; m.ph += dt * 8
        })
        if (E.k >= 1) { vic.active = false; vic.down = false; A.medics.forEach((m) => { m.hidden = true }); E.hold = 0; E.stage = 'board' } // (into the ambulance)
      } else if (E.stage === 'board') {
        E.hold += dt
        if (E.hold > 0.6) { E.car.park = null; E.stage = 'leaving' }
      } else if (E.stage === 'leaving' && !E.car.active) E.stage = 'gone'
    }
    const P = A.pol
    if (P) {
      if (P.stage === 'coming' && P.car.park && P.car.park.at) { // an officer gets out and walks to the driver
        const door = this.doorOf(A, P, false)
        // there is no room beside the car (the footpath is taken by the car, the road by the police car): the driver gets out at the back of the car and the officer comes to meet them there
        A.meetLat = A.s * Math.max(1.8, Math.abs(A.car.lat))
        const meet = this.at(A, A.car.t - A.dir * (A.car.hl + 0.6), A.meetLat)
        A.driver = this.makeActor('driver', meet[0], meet[1], 0)
        A.officer = this.makeActor('officer', door[0], door[1], 0)
        A.officer.pts = [this.at(A, A.car.t - A.dir * (A.car.hl + 1.1), A.meetLat)]
        A.actors.push(A.driver, A.officer)
        P.stage = 'walk'
      } else if (P.stage === 'walk') {
        if (!A.officer.pts.length) {
          P.hold += dt
          if (P.hold > 1) { // both walk to the police car (the officer ahead, the driver behind, so they never cross)
            const door = this.doorOf(A, P, false)
            const [dt2, dl2] = this.tOf(A, door[0], door[1])
            A.officer.pts = [this.at(A, dt2 - A.dir * 0.35, dl2)]
            A.driver.pts = [this.at(A, dt2 + A.dir * 0.35, dl2)]
            P.stage = 'escort'
          }
        }
      } else if (P.stage === 'escort') {
        if (!A.driver.pts.length) A.driver.hidden = true
        if (!A.officer.pts.length) { A.officer.hidden = true; P.hold = 0; P.stage = 'board' }
      } else if (P.stage === 'board') {
        P.hold += dt
        if (P.hold > 0.6) { P.car.park = null; P.stage = 'leaving' }
      } else if (P.stage === 'leaving' && !P.car.active) P.stage = 'gone'
    }
    // onlookers walk in from the end of the footpath and stand and watch
    for (const o of A.watchers) if (!o.sent && tt > o.at) { o.sent = sendWatcher(o.w, this.walkers, A.axis, A.s, o.spot); if (!o.sent) o.at += 0.8 }
    // clear: when both have driven off, the car that waited all this time drives off the footpath, and then the onlookers go
    if (A.amb && A.pol && A.amb.stage === 'gone' && A.pol.stage === 'gone' && !A.carFree) { A.carFree = true; endCrash(car) }
    if (A.carFree && !A.cleared && (!car.active || Math.abs(car.lat - car.lane) < 0.3)) this.accidentClears(A)
    if (tt > 50 && !A.forced) { // nothing may hang about: after 50 seconds everybody is sent on their way (and it is all over a few seconds later, inside the 70)
      A.forced = true
      if (A.amb) A.amb.car.park = null
      if (A.pol) A.pol.car.park = null
      this.accidentClears(A)
    }
    if (tt > 62 && !A.carFree) { A.carFree = true; endCrash(car) } // (the car waits for the police and the ambulance to be gone: only if they are still here after 62 seconds does it go anyway)
    if (A.cleared && (A.watchers.every((o) => !o.sent || !o.w.active) || tt > 64) && (!A.amb || A.amb.stage === 'gone' || tt > 64) && (!A.pol || A.pol.stage === 'gone' || tt > 64)) this.accidentEnds(A)
  }

  accidentClears(A) {
    A.cleared = true
    for (const o of A.watchers) if (o.sent) releaseWatcher(o.w, this.traffic.lots)
  }

  // the street is clear again: the person who was hit is a pedestrian again (they come back in from the end of the footpath)
  accidentEnds(A) {
    for (const a of A.actors) this.disposePart(a.p)
    const w = A.vic
    w.p.rotation.set(0, 0, 0)
    w.hitBy = null; w.down = false; w.active = false
    this.restoring.push(w)
    this.accident = null
  }

  accidentAbort(A) {
    if (A.before) { this.lastAcc = A.before.acc; this.lastDemo = A.before.demo }
    endCrash(A.car)
    A.vic.down = false; A.vic.hitBy = null; A.vic.p.rotation.set(0, 0, 0)
    if (!A.vic.active) A.vic.away = 1.5 // (they were already in the ambulance: they walk back on to the street)
    for (const o of A.watchers || []) if (o.sent && o.w.active && o.w.watch) releaseWatcher(o.w, this.traffic.lots) // (the onlookers go on their way)
    for (const e of [A.amb, A.pol]) if (e) e.car.park = null
    for (const a of A.actors || []) this.disposePart(a.p)
    this.accident = null
  }

  // each frame: show the people of the accident, and tell the walkers who is in the way on the footpath
  accidentFrame(dt) {
    const A = this.accident
    this.restoring = this.restoring.filter((w) => !sendWatcher(w, this.walkers, w.axis, w.side, null)) // those who were taken away walk back on to the street, when there is room
    if (A && A.phase === 'hit') { this.traffic.blockers = [{ active: true, road: A.axis + A.s, t: A.car.t + A.dir * A.car.hl * 0.5, lat: A.car.lat, goal: A.car.lat, hw: (A.car.hwe || A.car.hw) + 0.3, hl: A.car.hl + 1.2, dir: 0, speed: 0 }]; return } // (people keep clear of a car that has lost control)
    if (!A) { this.traffic.blockers = []; return }
    for (const a of A.actors) { this.walkActor(a, dt, A); this.showActor(a, dt) }
    const mk2 = (x, z, hw, hl) => { const [t, lat] = this.tOf(A, x, z); return { active: true, road: A.axis + Math.sign(A.lie.lat), t, lat, goal: lat, hw, hl, dir: 0, speed: 0 } }
    const list = []
    if (!A.carFree) list.push({ active: true, road: A.axis + A.s, t: A.car.t, lat: A.car.lat, goal: A.car.lat, hw: A.car.hwe || A.car.hw, hl: A.car.hl, dir: 0, speed: 0 })
    if (!A.lifted) list.push({ active: true, road: A.axis + A.s, t: A.lie.t, lat: A.lie.lat, goal: A.lie.lat, hw: 0.6, hl: 0.3, dir: 0, speed: 0 })
    for (const a of A.actors) if (!a.hidden) list.push(mk2(a.x, a.z, 0.25, 0.25))
    // the whole stretch of footpath where it happens is closed: from the back of the police car to the front of the ambulance. people come up to it and wait (or turn back), nobody walks in among the people of the accident
    let lo = Math.min(A.car.t - A.car.hl, A.lie.t), hi = Math.max(A.car.t + A.car.hl, A.lie.t)
    for (const e of [A.amb, A.pol]) if (e && e.car.active) { lo = Math.min(lo, e.car.t - e.car.hl); hi = Math.max(hi, e.car.t + e.car.hl) }
    lo -= 0.5; hi += 0.5
    list.push({ active: true, road: A.axis + A.s, t: (lo + hi) / 2, lat: A.s * 1.95, goal: A.s * 1.95, hw: 1.0, hl: (hi - lo) / 2, dir: 0, speed: 0 })
    this.traffic.blockers = list
  }

  // ---- building a floor for real ----
  // the new model is built hidden. what stands is compared with it (see construction.js), the old roof is lifted off, the walls are laid
  // brick by brick by bricklayers on a scaffold that rises with them, painters follow behind and the finished wall shows up under their
  // rollers, the crane lifts the roof, domes and slabs into place. then the scaffold comes down and the finished model takes over.

  // what a model is made of, in the frame of its group
  describe(g, frame) { // (everything described in the frame of 'frame', so the parts of a lot, each with its own size, can be built together)
    g.updateMatrixWorld(true)
    frame.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert()
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
        out.push({ root: g, mesh: m, kind: 'box', cx: p.x, cy: p.y, cz: p.z, w, d, h, bottom: p.y - h / 2, top: p.y + h / 2, color, upright: flat && quarter, win: m.userData.win })
      } else if (m.geometry.type === 'CylinderGeometry') {
        const h = par.height * s.y
        out.push({ root: g, mesh: m, kind: 'cyl', cx: p.x, cy: p.y, cz: p.z, rt: par.radiusTop * s.x, rb: par.radiusBottom * s.x, seg: par.radialSegments, h, bottom: p.y - h / 2, top: p.y + h / 2, color, upright: flat })
      } else {
        const b = new THREE.Box3().setFromObject(m).applyMatrix4(inv)
        const c = b.getCenter(new THREE.Vector3()), z = b.getSize(new THREE.Vector3())
        out.push({ root: g, mesh: m, kind: 'other', cx: c.x, cy: c.y, cz: c.z, w: z.x, d: z.z, h: z.y, bottom: b.min.y, top: b.max.y, color, upright: false })
      }
    })
    return out
  }

  // somebody to work (a yellow hard hat, small kids on the Lego map)
  makeCrewman(lot, role, k, kit) {
    const p = this.folk()
    const u = p.userData
    u.hat.visible = true
    u.hat.material.color.set(0xffd60a)
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

  // everything that changed in the lot (every floor, every building, however many) is built together, in one go
  queueBuild(lot, jobs) {
    this.setCrane(lot, true)
    this.startBuild(lot, jobs, BUILD_SECONDS)
  }

  startBuild(lot, jobs, seconds) {
    const id = this.T.id
    const site = new THREE.Group() // bricks and scaffold live here: a frame the size of a typical building model, at the middle of the lot
    site.scale.setScalar(FRAME)
    lot.holder.add(site)
    site.updateMatrixWorld(true)
    const plan = compare(jobs.flatMap((j) => (j.old ? this.describe(j.old.g, site) : [])), jobs.flatMap((j) => this.describe(j.g, site)))
    const tl = timelineWithin(plan, KITS[id] || KITS.city, Math.max(3.5, seconds))
    const kitColors = (BRICK_KITS[id] || BRICK_KITS.city).colors

    const B = { jobs, plan, tl, site, t: 0, landed: 0, ptr: [0, 0, 0, 0], sides: [[], [], [], []], pieces: [], removes: [], scaf: null, platforms: new Map(), layers: [], painters: [] }
    lot.build = B

    // nothing of the new model shows until it is built: only the finished walls, behind a cut that rises with the work
    const wallMeshes = new Set(plan.walls.map((w) => w.d.mesh))
    for (const j of jobs) {
      j.g.visible = true
      j.g.traverse((n) => { if (n.isMesh && !wallMeshes.has(n)) n.visible = false })
    }
    const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e4) // keeps what is above the painters' edge (nothing at first)
    B.clipLow = top
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

    // everything that is put in place by something other than a bricklayer: the fence, pit and footing, the frame, and the pieces of the model
    B.items = []
    const addItem = (mesh, spec, top, by) => {
      mesh.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(mesh)
      const gp = mesh.geometry && mesh.geometry.parameters
      B.items.push({ mesh, parent: mesh.parent, mode: spec.mode, start: spec.start, dur: spec.dur, by, top, pos: mesh.position.clone(), scale: mesh.scale.clone(), halfH: gp && gp.height ? (gp.height * mesh.scale.y) / 2 : (box.max.y - box.min.y) / 2, worldHalfH: (box.max.y - box.min.y) / 2, done: false })
    }
    const prop = (spec) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), L(spec.color))
      m.position.set(spec.x, spec.y, spec.z)
      m.castShadow = m.receiveShadow = true
      m.visible = false
      site.add(m)
      addItem(m, spec, spec.y + spec.h / 2)
    }
    if (tl.site) { tl.site.fence.forEach(prop); prop(tl.site.pit); prop(tl.site.footing) }
    tl.frame.forEach(prop)
    for (const p of tl.pieces) {
      p.d.root.attach(p.d.mesh)
      addItem(p.d.mesh, p, p.d.top, p.by)
    }
    for (const r of tl.removes) B.removes.push({ ...r, mesh: r.d.mesh, y0: r.d.mesh.position.y, done: false })
    // the window panes, all in one drawing
    B.paneShown = 0
    B.paneDone = []
    if (tl.panes.length) {
      const glass = L(0xffffff)
      glass.userData.outlineParameters = { visible: false }
      B.panes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glass, tl.panes.length)
      B.panes.frustumCulled = false
      B.panes.count = 0
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color()
      tl.panes.forEach((p, i) => {
        m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx * 0.25, p.sy * 0.25, p.sz * 0.25))
        B.panes.setMatrixAt(i, m4)
        B.panes.setColorAt(i, col.setHex(p.glass))
      })
      B.panes.instanceMatrix.needsUpdate = true
      if (B.panes.instanceColor) B.panes.instanceColor.needsUpdate = true
      site.add(B.panes)
    }
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
    const { t, tl, site } = B
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

    // the painters bring the finished wall down from the top
    const edge = paintEdge(tl, t)
    B.clipLow.constant = -B.toWorldY(edge)
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
    const yardSpot = (i) => tmp.set(lot.pos.x + (0.9 + 0.35 * i) * lot.size, 0.1, lot.pos.z - (0.9 - 0.2 * i) * lot.size)
    B.layers.forEach((c, s) => {
      const list = B.sides[s]
      while (B.ptr[s] < list.length && list[B.ptr[s]].land <= t) B.ptr[s]++
      const cur = list[B.ptr[s]], last = list[B.ptr[s] - 1]
      const ref = cur || last
      const fly = B.fly[s]
      fly.visible = false
      const u = c.p.userData
      if (!ref || t < tl.brickStart - 0.4) { // waiting at the yard while the site is made ready and the frame goes up
        const y = yardSpot(s)
        moveTo(c, y.x, 0.1, y.z, -1, 1)
        u.arms[0].rotation.x = u.arms[1].rotation.x = -0.4
        return
      }
      const [, fy] = feetAt(ref.y)
      site.localToWorld(tmp.set(ref.x + ref.nx * 0.55, 0, ref.z + ref.nz * 0.55))
      moveTo(c, tmp.x, fy, tmp.z, -ref.nx, -ref.nz)
      const k = cur && t >= cur.start ? (t - cur.start) / Math.max(0.03, cur.land - cur.start) : 1
      u.arms[0].rotation.x = -0.9
      u.arms[1].rotation.x = -1.25 + Math.sin(k * Math.PI) * 0.4 // reaches to the wall, lays, comes back
      if (cur && t >= cur.start && t < cur.land) { // the brick travels the short way from the hand to its place
        const hand = site.worldToLocal(new THREE.Vector3(c.p.position.x, c.p.position.y + 0.95 * c.size * crewK, c.p.position.z))
        fly.position.set(hand.x + (cur.x - hand.x) * k, hand.y + (cur.y - hand.y) * k, hand.z + (cur.z - hand.z) * k)
        fly.rotation.set(0, cur.ry, 0)
        fly.scale.set(cur.sx, cur.sy, cur.sz)
        fly.material.color.setHex((BRICK_KITS[this.T.id] || BRICK_KITS.city).colors[cur.ci])
        fly.visible = true
      }
    })
    const centre = B.scaf ? [(B.scaf.x0 + B.scaf.x1) / 2, (B.scaf.z0 + B.scaf.z1) / 2] : [0, 0]
    B.painters.forEach((c, i) => {
      const u = c.p.userData
      const item = B.items.find((p) => p.mode === 'hand' && p.by === i && t >= p.start - 0.7 && t <= p.start + p.dur + 0.15) // something small to set in place
      let pane = null
      if (!item) for (let k = Math.max(0, B.paneShown - 14); k < Math.min(tl.panes.length, B.paneShown + 3); k++) if (k % 2 === i && t >= tl.panes[k].start - 0.25 && t <= tl.panes[k].start + tl.panes[k].dur + 0.3) { pane = tl.panes[k]; break }
      const at = item ? item.pos : pane ? { x: pane.x, y: pane.y, z: pane.z } : null
      if (at) { // fitting a window, or something small: beside it, on the platform
        const [, fy] = feetAt(at.y)
        site.localToWorld(tmp.set(at.x, 0, at.z))
        const away = tmp2.set(at.x - centre[0], 0, at.z - centre[1]).normalize()
        moveTo(c, tmp.x + away.x * 0.6, B.scaf ? fy : 0.1, tmp.z + away.z * 0.6, -away.x, -away.z)
        u.arms[1].rotation.x = -1.3 + Math.sin(t * 9) * 0.3
        u.arms[0].rotation.x = -0.9
      } else if (B.scaf && t >= tl.paintStart && t <= tl.paintEnd + 0.3) { // painting, from the top down, at the edge of the finished wall
        const s = i === 0 ? 0 : 2
        const sc = B.scaf
        const along = Math.sin(t * 0.8 + i * 2) * 0.7
        const x = s === 0 ? centre[0] + along * (sc.x1 - sc.x0) / 2 : centre[0] - along * (sc.x1 - sc.x0) / 2
        const z = s === 0 ? sc.z1 - 0.1 : sc.z0 + 0.1
        const [, fy] = feetAt(Math.max(edge + 0.35, 0.3))
        site.localToWorld(tmp.set(x, 0, z))
        moveTo(c, tmp.x, fy, tmp.z, 0, s === 0 ? -1 : 1)
        u.arms[1].rotation.x = -1.3 + Math.sin(t * 7 + i) * 0.6
        u.arms[0].rotation.x = -0.5
      } else {
        const y = yardSpot(4 + i)
        moveTo(c, y.x, 0.1, y.z, -1, 1)
        u.arms[1].rotation.x = u.arms[0].rotation.x = -0.4
      }
    })

    // the scaffold: poles first, a platform wherever somebody works; it comes down at the end
    if (B.scaf) {
      B.scaf.grow += ((t < tl.end - 0.8 ? 1 : 0) - B.scaf.grow) * Math.min(1, dt * 6)
      B.scaf.group.scale.set(1, Math.max(0.001, B.scaf.grow), 1)
      B.scaf.group.visible = t >= tl.scaffoldAt
    }

    // the site, the frame and the pieces: slabs and columns poured or risen, small things set in by hand, big things hoisted by the crane
    const cu = lot.crane && lot.crane.userData
    let load = null
    for (const p of B.items) {
      if (p.done || t < p.start) continue
      const f = Math.min(1, (t - p.start) / p.dur)
      const m = p.mesh
      m.visible = true
      if (p.mode === 'pour') { // grows up from the ground
        const sc = Math.max(0.02, f)
        m.scale.set(p.scale.x, p.scale.y * sc, p.scale.z)
        m.position.y = p.pos.y - p.halfH * (1 - sc)
      } else if (p.mode === 'hand') {
        const e = f * f * (3 - 2 * f)
        m.scale.set(p.scale.x * (0.3 + 0.7 * e), p.scale.y * (0.3 + 0.7 * e), p.scale.z * (0.3 + 0.7 * e))
      } else if (lot.crane) {
        p.parent.updateMatrixWorld(false)
        const aim = p.parent.localToWorld(p.pos.clone()) // (where it ends up, in the world: the lot may still be growing)
        const yard = new THREE.Vector3(lot.crane.position.x - 0.9, 0.1 + p.worldHalfH, lot.crane.position.z + 0.9)
        const hoist = Math.max(aim.y + 0.7, B.toWorldY(Math.max(tl.topAll, p.top)) + 0.9)
        let x, y, z
        if (f < 0.12) { x = yard.x; z = yard.z; y = yard.y } // waiting for the hook
        else if (f < 0.45) { const e = (f - 0.12) / 0.33; x = yard.x; z = yard.z; y = yard.y + (hoist - yard.y) * (e * e * (3 - 2 * e)) } // up
        else if (f < 0.75) { const e = (f - 0.45) / 0.3, sm = e * e * (3 - 2 * e); x = yard.x + (aim.x - yard.x) * sm; z = yard.z + (aim.z - yard.z) * sm; y = hoist } // across
        else { const e = (f - 0.75) / 0.25, sm = e * e * (3 - 2 * e); x = aim.x; z = aim.z; y = hoist + (aim.y - hoist) * sm } // down
        m.position.copy(p.parent.worldToLocal(new THREE.Vector3(x, y, z)))
        load = { x, y, z, top: y + p.worldHalfH }
      }
      if (f >= 1) { p.done = true; m.position.copy(p.pos); m.scale.copy(p.scale) }
    }

    // the windows are fitted one after the other, popping into their gaps
    if (B.panes) {
      const P = tl.panes
      while (B.paneShown < P.length && P[B.paneShown].start <= t) B.paneShown++
      B.panes.count = B.paneShown
      const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion()
      let touched = false
      for (let i = Math.max(0, B.paneShown - 16); i < B.paneShown; i++) {
        const f = Math.min(1, (t - P[i].start) / P[i].dur)
        if (f >= 1 && B.paneDone[i]) continue
        const e = 0.25 + 0.75 * f * f * (3 - 2 * f)
        m4.compose(pos.set(P[i].x, P[i].y, P[i].z), q, sc.set(P[i].sx * e, P[i].sy * e, P[i].sz * e))
        B.panes.setMatrixAt(i, m4)
        if (f >= 1) B.paneDone[i] = true
        touched = true
      }
      if (touched) B.panes.instanceMatrix.needsUpdate = true
    }

    if (cu) { // the crane arm swings to its load, or rests
      const cx = lot.crane.position.x, cz = lot.crane.position.z
      const aimX = load ? load.x : lot.pos.x - 0.55 * lot.size, aimZ = load ? load.z : lot.pos.z - 0.55 * lot.size
      const want = Math.atan2(-(aimZ - cz), aimX - cx) + (load ? 0 : Math.sin(t * 0.5) * 0.5)
      const diff = Math.atan2(Math.sin(want - cu.arm.rotation.y), Math.cos(want - cu.arm.rotation.y))
      const swing = 2.6 * Math.max(1, tl.speed) // (the arm turns faster when the whole build is squeezed into seven seconds)
      cu.arm.rotation.y += Math.max(-dt * swing, Math.min(dt * swing, diff))
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
      for (const j of B.jobs) j.g.traverse((n) => { if (n.isMesh) n.visible = true })
      for (const mm of B.clipped) { mm.clippingPlanes = null; delete mm.userData.outlineParameters; mm.needsUpdate = true }
      for (const p of B.items) { p.mesh.position.copy(p.pos); p.mesh.scale.copy(p.scale) }
      for (const j of B.jobs) if (j.old) this.disposePart(j.old.g)
      if (B.inst) B.inst.dispose()
      if (B.studs) B.studs.dispose()
      if (B.panes) B.panes.dispose()
      this.disposePart(B.site)
      this.disposePart(B.rope)
      for (const c of B.crew) this.disposePart(c.p)
      lot.build = null
    }
    if (!all && lot.target <= (lot.built ? lot.built.L : 0)) this.setCrane(lot, false) // (if more spending came in meanwhile, the next build starts on its own)
  }


  // ---- changing the map only changes the look ----
  // what is going on in the city, so that it can go on in the new look: where everybody is, which way they go, the lights
  snapshotLife() {
    const WALKER = ['active', 'axis', 'side', 'road', 'dir', 't', 'lat', 'lane', 'alt', 'goal', 'speed', 'base', 'crossing', 'inPlaza', 'waiting', 'still', 'blocked', 'away', 'watch', 'leaving', 'down', 'face', 'ph']
    const CAR = ['active', 'axis', 'road', 'lane', 'alt', 'lat', 'goal', 'dir', 't', 'speed', 'base', 'still', 'turn', 'arc', 'waitMerge', 'yaw', 'stuck', 'backed', 'hwe', 'rerouted', 'park', 'freeSlide']
    const take = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r }
    const iC = (c) => (c ? this.cars.indexOf(c) : -1), iW = (w) => (w ? this.walkers.indexOf(w) : -1)
    const A = this.accident
    const key = A ? new Set([A.car, A.amb && A.amb.car, A.pol && A.pol.car]) : new Set()
    let accident = null
    if (A) { // an accident in the middle of it goes on in the new look: everybody and everything of it is written down, and put back after
      const { car, vic, amb, pol, watchers, actors, driver, officer, medics, ...rest } = A
      accident = {
        rest, car: iC(car), vic: iW(vic),
        amb: amb && { ...amb, car: iC(amb.car) }, pol: pol && { ...pol, car: iC(pol.car) },
        watchers: (watchers || []).map((o) => ({ ...o, w: iW(o.w) })),
        actors: (actors || []).map((a) => ({ kind: a.kind, x: a.x, z: a.z, yaw: a.yaw, ph: a.ph, moving: a.moving, k: a.k, hidden: a.hidden, manual: a.manual, dst: a.dst, pause: a.pause, pts: a.pts.map((q) => [...q]) })),
        refs: { driver: (actors || []).indexOf(driver), officer: (actors || []).indexOf(officer), medics: medics ? medics.map((m) => actors.indexOf(m)) : null },
      }
    }
    return {
      sig: { ...this.traffic.sig, hold: null },
      walkers: this.walkers.map((w) => take(w, WALKER)),
      cars: this.cars.map((c, i) => (c.active ? { idx: i, must: key.has(c), special: c.special, hl: c.hl, hw: c.hw, state: take(c, CAR), crash: c.crash ? { ...c.crash, other: iW(c.crash.other) } : null, passing: iC(c.passing) } : null)).filter(Boolean),
      accident,
      restoring: this.restoring.map(iW),
      E: this.E,
    }
  }

  restoreLife(life) {
    Object.assign(this.traffic.sig, life.sig)
    if (life.E !== this.E) { // the city grew or shrank: the old places do not fit, everybody starts again (and an accident is called off)
      if (life.accident && life.accident.rest.before) { this.lastAcc = life.accident.rest.before.acc; this.lastDemo = life.accident.rest.before.demo }
      return
    }
    life.walkers.forEach((st, i) => { const w = this.walkers[i]; if (w) { Object.assign(w, st); w.passing = null } })
    const free = this.cars.filter((c) => !c.active)
    const placed = []
    const into = new Map() // which new vehicle each old one went into
    const clash = (a, b) => { // would these two overlap (on the same road, or both in the crossroad)?
      if (a.road === b.road) return Math.abs(a.lat - b.lat) < a.hw + b.hw + 0.25 && Math.abs(a.t - b.t) < a.hl + b.hl + 0.5
      return Math.abs(a.t) < 3.2 && Math.abs(b.t) < 3.2
    }
    // each vehicle goes into the one of about the same size in the new look (a different size is fine when it fits where it is), and is gone if it does not fit.
    // the ones that belong to an accident go first
    const order = life.cars.slice().sort((p, q) => (q.must ? 1 : 0) - (p.must ? 1 : 0) || Math.abs(p.state.t) - Math.abs(q.state.t))
    for (const v of order) {
      const d = (c) => Math.abs(c.hl - v.hl) + 2 * Math.abs(c.hw - v.hw)
      const same = (c) => (v.special ? c.special === v.special : !c.special)
      const fits = (c) => (v.must && !v.special ? true : v.must || v.state.arc ? d(c) < 0.25 : d(c) < 1.2) // (the car that hit somebody goes into the closest one whatever its size: the accident goes on)
      const ok = free.filter((c) => same(c) && fits(c)).sort((p, q) => d(p) - d(q))
      for (const c of ok) {
        const probe = { road: v.state.road, lat: v.state.lat, t: v.state.t, hl: c.hl, hw: c.hw }
        if (!v.must && placed.some((o) => clash(probe, o))) continue
        free.splice(free.indexOf(c), 1)
        Object.assign(c, v.state, { crash: null, passing: null })
        if (v.must && !v.special && v.crash && v.crash.hit && life.accident) { // (a different size: its nose stays where it touched the person)
          const vic = this.walkers[life.accident.vic]
          if (vic) c.t = vic.t - c.dir * (vic.hl + 0.05 + c.hl)
        }
        placed.push(probe)
        into.set(v.idx, c)
        break
      }
    }
    for (const v of life.cars) { // what refers to what (who a car is overtaking, who the car that hit somebody hit)
      const c = into.get(v.idx)
      if (!c) continue
      if (v.crash) c.crash = { ...v.crash, other: this.walkers[v.crash.other] }
      if (v.passing >= 0) { c.passing = into.get(v.passing) || null; if (!c.passing) { c.goal = c.lane; c.waitMerge = false } }
    }
    this.restoring = life.restoring.map((i) => this.walkers[i]).filter(Boolean)

    const a = life.accident
    if (!a) return
    const car = into.get(a.car) || (a.rest.carFree ? this.cars.find((c) => !c.special && !c.active) : null), vic = this.walkers[a.vic] // (a car that has already driven off is still part of it)
    const pool = (kind) => this.cars.find((c) => c.kind === kind) // (an ambulance or police car that has just driven off, or is just about to, is not on the street at this moment, but it is still part of it: it has its own place in the pool)
    const amb = a.amb && (into.get(a.amb.car) || pool('ambulance')), pol = a.pol && (into.get(a.pol.car) || pool('police'))
    if (!car || !vic || (a.amb && !amb) || (a.pol && !pol)) { // something of it has no place in the new look: it is called off (it comes again, and does not count)
      if (a.rest.before) { this.lastAcc = a.rest.before.acc; this.lastDemo = a.rest.before.demo }
      if (car) car.crash = null
      for (const e of [amb, pol]) if (e) e.park = null
      if (vic) { vic.down = false; if (!vic.active) vic.away = 1.5 }
      for (const o of a.watchers) { const w = this.walkers[o.w]; if (w && o.sent && w.active && w.watch) releaseWatcher(w, this.traffic.lots) }
      return
    }
    // the car that hit somebody may be longer or shorter in the new look: what stands behind it (the police car, the driver and the officer) moves with its back end
    const was = life.cars.find((v) => v.idx === a.car)
    const shift = was && car && a.rest.phase === 'scene' && !a.rest.carFree ? -a.rest.dir * 2 * (car.hl - was.hl) : 0
    const mv = (q) => (a.rest.axis === 'x' ? [q[0] + shift, q[1]] : [q[0], q[1] + shift])
    if (shift && pol && a.pol.stage !== 'gone') { if (pol.park && pol.park.at) pol.t += shift; if (pol.park) pol.park = { ...pol.park, t: pol.park.t + shift }; a.pol.spot += shift } // (one that is still on its way only gets a new place to stop)
    const actors = a.actors.map((sa) => { // the people of the accident are made again, in the same places, doing the same
      const [nx, nz] = shift && (sa.kind === 'driver' || sa.kind === 'officer') ? mv([sa.x, sa.z]) : [sa.x, sa.z]
      const n = this.makeActor(sa.kind, nx, nz, sa.yaw)
      Object.assign(n, { ph: sa.ph, moving: sa.moving, k: sa.k, hidden: sa.hidden, manual: sa.manual, dst: sa.dst, pause: sa.pause, pts: shift && (sa.kind === 'driver' || sa.kind === 'officer') ? sa.pts.map(mv) : sa.pts })
      return n
    })
    const at = (i) => (i >= 0 ? actors[i] : undefined)
    vic.p.rotation.order = 'YXZ'
    this.accident = {
      ...a.rest, car, vic, amb: a.amb && { ...a.amb, car: amb }, pol: a.pol && { ...a.pol, car: pol },
      watchers: a.watchers.map((o) => ({ ...o, w: this.walkers[o.w] })).filter((o) => o.w),
      actors, driver: at(a.refs.driver), officer: at(a.refs.officer), medics: a.refs.medics ? a.refs.medics.map(at) : undefined,
    }
  }

  // how see-through a vehicle is (1: solid), the same way as for people
  fadeCar(c, k) {
    if (k >= 1 && !c.faded) return
    if (!c.mats) { c.mats = []; c.car.traverse((o) => { if (o.isMesh) c.mats.push(o.material) }) }
    const solid = k >= 1
    for (const m of c.mats) { setSeeThrough(m, !solid, k) } // (depth is still written: the boxes of one vehicle hide each other and do not pile up into something solid)
    c.faded = !solid
  }

  // how see-through somebody is (1: solid). the materials are made see-through only while they are fading, so the rest of the time nothing is drawn differently
  fadePerson(w, k) {
    if (k >= 1 && !w.faded) return
    if (!w.mats) { w.mats = []; w.p.traverse((o) => { if (o.isMesh) w.mats.push(o.material) }) }
    const solid = k >= 1
    for (const m of w.mats) setSeeThrough(m, !solid, k)
    w.faded = !solid
  }

  // somebody to work or fight
  folk() {
    return makePerson(this.rng)
  }

  buildWalkers() {
    const rng = this.rng
    const P = this.T.people
    const N = this.ring2 ? 12 : 8
    this.walkers = placeWalkers(N + 4, rng, this.E - 15)
    this.watchers = this.walkers.slice(N) // four more who are not on the street: they come when there is an accident to see
    for (const w of this.watchers) { w.active = false; w.base = 0.9 + rng() * 0.25 }
    this.walkers.forEach((w) => {
      const p = makePerson(rng)
      Object.assign(w, { p, ph: rng() * 6, ci: Math.floor(rng() * 6), pi: Math.floor(rng() * 3) })
      const u = p.userData
      if (P.skin) { u.skin = P.skin; u.head.material.color.set(P.skin); u.hands.forEach((h) => h.material.color.set(P.skin)) }
      const coat = P.coats[w.ci % P.coats.length]
      const pants = P.pants[w.pi % P.pants.length]
      u.torso.material.color.set(coat)
      u.sleeves.forEach((mm) => mm.material.color.set(coat))
      u.thighs.forEach((mm) => mm.material.color.set(pants))
      u.shins.forEach((mm) => mm.material.color.set(P.shorts ? u.skin : pants))
      u.hat.visible = !!P.hat
      if (P.hat) u.hat.material.color.set(P.hats ? P.hats[w.ci % P.hats.length] : P.hat)
      p.rotation.order = 'YXZ'
      p.visible = !!w.active
      this.world.add(p)
    })
  }

  buildCars(carried = false) {
    // pool of vehicles, a few cross the roads at a time
    this.cars = this.T.vehicles().map((car) => {
      car.visible = false
      this.world.add(car)
      const size = new THREE.Box3().setFromObject(car) // how much room it takes up
      const hl = Math.max(-size.min.x, size.max.x), hw = Math.max(-size.min.z, size.max.z)
      return Object.assign(newCar(hl, hw), { car, ph: this.rng() * 6 })
    })
    for (const [kind, car] of [['ambulance', makeAmbulance()], ['police', makePolice()]]) { // (they only come to an accident: the traffic never uses them)
      car.visible = false
      this.world.add(car)
      const size = new THREE.Box3().setFromObject(car)
      const hl = Math.max(-size.min.x, size.max.x), hw = Math.max(-size.min.z, size.max.z)
      this.cars.push(Object.assign(newCar(hl, hw), { car, kind, ph: 0, special: kind }))
    }
    this.spawnIn = 0.4
    if (!carried) for (let i = 0; i < 3; i++) this.spawnVehicle(true)
  }

  spawnVehicle(anywhere = false, prefer = null) {
    const c = spawnCar(this.cars, this.rng, anywhere, prefer)
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
    const life = this.world ? this.snapshotLife() : null // (only the look changes: the people, the vehicles and the lights carry on where they were)
    this.map = name
    this.mapKey = key
    const T = (this.T = MAPS[key])
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
    this.accident = null
    this.accClock = 0
    this.restoring = []
    this.hunt = null
    this.odds = []
    this.E = HALF[this.ring2 ? 1 : 0]
    this.traffic = makeTraffic(this.E - 15)
    this.rng = mulberry(7)
    const C = T.c
    this.mats = { grass: M(C.grass), pad: M(C.pad), round: M(C.round), pine: M(C.pine), blossom: M(C.blossom), water: M(C.water) }
    this.buildWorld()
    this.buildWalkers()
    this.buildCars(!!life)
    if (life) this.restoreLife(life)
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
    if (this.selected) this.select(this.selected, false) // (the county that was picked stays picked, and the camera stays where it is)
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
    this.accClock += dt
    if (this.accClock >= 0.5) { this.accClock = 0; if (!this.accident && this.cars.length >= 4) this.maybeAccident() } // is one due? (cars are sent down that street until the right ones are there)
    this.updateAccident(dt)
    this.accidentFrame(dt)
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
          this.rebuildLot(lot, lot.county, lot.target, true) // straight to where the spending says: every floor and building it needs, built together
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
      if (w.down || !w.active) { w.p.visible = !!(w.active || w.down); continue } // (somebody lying on the footpath is placed by the accident, somebody not on the street is not drawn)
      w.p.visible = true
      // at the tip of the footpath people fade out as they leave and fade in as they arrive
      const fade = Math.max(0, Math.min(1, (walkTip() - Math.abs(w.t)) / TIP_FADE))
      this.fadePerson(w, fade)
      w.ph += dt * w.speed * 7 // the stride follows how fast they really go, so waiting people stand still
      const k = Math.min(1, w.speed * 4)
      const sw = Math.sin(w.ph) * k
      const u = w.p.userData
      let lift = 0.1 // how high above the ground
      u.legs[0].rotation.x = sw * 0.75
      u.legs[1].rotation.x = -sw * 0.75
      u.arms[0].rotation.x = -sw * 0.6
      u.arms[1].rotation.x = sw * 0.6
      u.torso.rotation.y = sw * 0.08
      lift += Math.abs(Math.cos(w.ph)) * 0.045 * k
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
    if (this.spawnIn <= 0) {
      const hunt = this.hunt && this.lots[this.hunt.lot].road // a crash is due on this street: more cars come down it
      this.spawnIn = hunt ? 1.2 + this.rng() * 1.2 : 2.6 + this.rng() * 3
      // (while an accident is waited for there is more traffic, but both roads get the same: the cars go down the two roads in turn)
      this.huntFlip = !this.huntFlip
      this.spawnVehicle(false, hunt ? { axis: this.huntFlip ? hunt.axis : hunt.axis === 'x' ? 'z' : 'x' } : null)
    }
    for (const c of this.cars) {
      c.car.visible = c.active
      if (!c.active) continue
      const ud = c.car.userData
      const vy = (ud.y ?? 0.08) + (ud.bob ? Math.sin(t * 2.2 + c.ph) * ud.bob : 0)
      if (ud.spin) ud.spin.rotation.z -= (c.speed * dt) / ud.r
      const pose = carPose(c) // also right in the middle of a turn
      c.car.position.set(pose.x, vy, pose.z)
      // at the edge of the board vehicles fade out as they leave and fade in as they arrive (nothing is cut off, nothing hangs in the air outside)
      const k = Math.max(0, Math.min(1, (this.E + 0.2 - Math.max(Math.abs(pose.x), Math.abs(pose.z))) / (c.hl + 0.8)))
      this.fadeCar(c, k)
      if (k < 0.02) c.car.visible = false
      c.car.rotation.y = Math.atan2(-pose.hz, pose.hx)
      if (c.special) { const on = Math.floor(t * 5) % 2, L = c.car.userData.lights; L[0].material.color.setHex(on ? 0xff2b2b : 0x4a0d0d); L[1].material.color.setHex(on ? 0x16306b : 0x3b82f6) } // the lights flash
      if (c.crash && c.crash.hit && c.crash.kind !== 'hit') c.car.rotation.y += c.crash.role === 'front' ? 0.1 : -0.1 // the cars sit a little crooked after the bump
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
  court: { colors: [0xe8742a], shape: 'ball' },
}

// the size of a lot follows its level: small while there is little spending, bigger (and the footpath thinner) the more is spent
const stageSize = (lot) => lotSize(lot.built ? lot.built.L : 0)

// traffic light colours: red, yellow, green, lit and switched off
const LIT = [0xff2b2b, 0xffc400, 0x2bff6a]
const OFF = [0x3a0d0d, 0x3a2e00, 0x0d3a1a]
const FRAME = 0.62 // the size of the frame a build is planned in (the size of a typical building model in its lot)
const ARROW_OFF = 0x2e4034
// an arrow lying flat (pointing along +x): a shaft and a triangle head, small enough to sit inside its plate
const ARROW_SHAPE = (() => {
  const L = 0.105, hl = 0.05, hw = 0.045, sw = 0.016
  const sh = new THREE.Shape()
  sh.moveTo(-L / 2, -sw); sh.lineTo(L / 2 - hl, -sw); sh.lineTo(L / 2 - hl, -hw); sh.lineTo(L / 2, 0)
  sh.lineTo(L / 2 - hl, hw); sh.lineTo(L / 2 - hl, sw); sh.lineTo(-L / 2, sw); sh.closePath()
  return sh
})()
