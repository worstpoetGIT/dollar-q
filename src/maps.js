// map skins: ground, roads, buildings, vehicles, people, trees and sky for each one

export const MAP_LIST = [
  { id: 'city', name: 'Classic City', sky: ['#bfe3ff', '#eaf6ff'], ground: '#74c44a', road: '#48556b', accent: ['#e5383b', '#3a86ff', '#f4a259'] },
  { id: 'lego', name: 'Lego', sky: ['#aee1ff', '#f0faff'], ground: '#3fae49', road: '#6b7280', accent: ['#e3000b', '#ffd500', '#0057b8'] },
  { id: 'japan', name: 'Japan', sky: ['#8fd3ff', '#ffd6ea'], ground: '#8fd16a', road: '#5a6072', accent: ['#e63946', '#ffffff', '#ffb7d5'] },
  { id: 'ice', name: 'Santy', sky: ['#9db8e8', '#f1f6ff'], ground: '#f4f9fd', road: '#8fa3bf', accent: ['#c0392b', '#2f8f5a', '#f2c94c'] },
  { id: 'wire', name: 'Wireframe', sky: ['#ffffff', '#ffffff'], ground: '#eef3f8', road: '#0a66c2', accent: ['#0a66c2', '#0a8f3c', '#c2187a'] },
  { id: 'court', name: 'Basketball Court', sky: ['#ffe3c2', '#fff5e8'], ground: '#d9a066', road: '#1d3f8a', accent: ['#e8742a', '#ffffff', '#c0392b'] },
]

export function makeMaps(h) {
  const { THREE, bx, cyl, mk, wall, shade, makeCar, makeBus, makeVan, makeTruck, windowTex } = h
  const N = (c) => new THREE.MeshBasicMaterial({ color: c })
  const G = () => new THREE.Group()
  const variant = (style) => Math.abs([...String(style)].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 3

  // buildings
  const build = {
    lego(g, f, col, style) {
      const v = variant(style)
      const w = [3.2, 2.8, 3.4][v], d = [2.8, 2.8, 2.4][v], fh = 0.62
      for (let i = 0; i < f; i++) {
        bx(g, w, fh - 0.04, d, i % 2 ? shade(col, 0.14) : col, 0, i * fh, 0)
        bx(g, w * 0.55, 0.3, 0.06, 0x9ad0ff, 0, i * fh + 0.16, d / 2 + 0.01)
      }
      const top = f * fh
      bx(g, w, 0.12, d, shade(col, -0.08), 0, top, 0)
      for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) cyl(g, 0.17, 0.1, col, (ix - 1.5) * (w / 4.2), top + 0.12, (iz - 1) * (d / 3.3), 10)
    },
    japan(g, f, col, style) {
      const v = variant(style)
      const wallC = [0xfdf6e9, 0xf3e3c8, 0xffffff][v]
      let y = 0
      bx(g, 3.5, 0.2, 3.5, 0x8a8f99, 0, 0, 0)
      y = 0.2
      for (let i = 0; i < f; i++) {
        const k = Math.max(0.62, 1 - i * 0.035)
        const w = 2.7 * k
        bx(g, w, 0.62, w, wallC, 0, y, 0)
        bx(g, w + 0.04, 0.1, w + 0.04, 0x7a3b2e, 0, y + 0.26, 0)
        for (const sx of [-1, 1]) bx(g, 0.12, 0.62, 0.12, 0xc0392b, sx * (w / 2), y, w / 2)
        const roof = mk(g, new THREE.CylinderGeometry(w * 0.52, w * 0.98, 0.34, 4), i === f - 1 ? shade(col, -0.06) : col, 0, y + 0.62 + 0.17, 0)
        roof.rotation.y = Math.PI / 4
        y += 0.96
      }
      const cap = mk(g, new THREE.ConeGeometry(0.75, 0.7, 4), shade(col, -0.06), 0, y + 0.3, 0)
      cap.rotation.y = Math.PI / 4
      cyl(g, 0.04, 0.7, 0xf4c430, 0, y + 0.6, 0, 5)
      bx(g, 0.55, 0.8, 0.08, 0x3b2a20, 0, 0.2, 1.36)
    },
    ice(g, f, col) {
      for (let i = 0; i < f; i++) {
        const k = Math.max(0.6, 1 - i * 0.03)
        bx(g, 3.0 * k, 0.66, 2.7 * k, i % 2 ? 0xf2e8d5 : 0xc0392b, 0, i * 0.7, 0)
        bx(g, 3.0 * k + 0.06, 0.1, 2.7 * k + 0.06, col, 0, i * 0.7 + 0.5, 0)
      }
      const top = f * 0.7, k = Math.max(0.6, 1 - (f - 1) * 0.03)
      const cap = mk(g, new THREE.SphereGeometry(1.75 * k, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, 0, top - 0.05, 0)
      cap.scale.y = 0.45
      bx(g, 0.7, 0.8, 0.1, 0x3b2a20, 0, 0, 1.36)
      for (const sx of [-1, 1]) mk(g, new THREE.ConeGeometry(0.22, 0.9, 5), 0x2f8f5a, sx * 1.7, 0.45, 1.2)
    },
    court(g, f, col) {
      const fh = 0.64
      for (let i = 0; i < f; i++) bx(g, 3.2, fh - 0.03, 2.6, i % 2 ? 0xffffff : col, 0, i * fh, 0)
      const top = f * fh
      bx(g, 3.3, 0.12, 2.7, 0x2b2b2b, 0, top, 0)
      cyl(g, 0.06, 1.2, 0x9aa5b1, 0, top + 0.1, 0.6, 6)
      bx(g, 1.3, 0.85, 0.08, 0xffffff, 0, top + 0.9, 0.7)
      bx(g, 0.5, 0.36, 0.09, 0xe8742a, 0, top + 1.0, 0.72)
      const rim = mk(g, new THREE.TorusGeometry(0.27, 0.04, 6, 14), 0xe85d04, 0, top + 1.0, 1.05)
      rim.rotation.x = Math.PI / 2
      mk(g, new THREE.SphereGeometry(0.42, 14, 10), 0xe8742a, -0.95, top + 0.54, -0.5)
    },
  }

  const kiosks = {
    lego(g, col) {
      bx(g, 1.4, 0.6, 1.4, col, 0, 0, 0)
      for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) cyl(g, 0.17, 0.1, col, x, 0.6, z, 10)
    },
    japan(g, col) {
      for (const sx of [-1, 1]) cyl(g, 0.09, 1.5, 0xd62828, sx * 0.7, 0, 0, 8)
      bx(g, 2.0, 0.14, 0.22, 0xd62828, 0, 1.5, 0)
      bx(g, 1.6, 0.1, 0.16, 0xd62828, 0, 1.2, 0)
      bx(g, 2.2, 0.08, 0.3, col, 0, 1.64, 0)
    },
    ice(g, col) {
      mk(g, new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, 0, 0, 0)
      bx(g, 0.5, 0.5, 0.5, 0x3b2a20, 0, 0, 0.8)
      bx(g, 0.56, 0.08, 0.56, col, 0, 0.5, 0.8)
    },
    court(g, col) {
      bx(g, 1.2, 0.3, 1.2, col, 0, 0, 0)
      mk(g, new THREE.SphereGeometry(0.42, 14, 10), 0xe8742a, 0, 0.72, 0)
    },
  }

  // vehicles
  const stud = (g, c, x, y, z) => cyl(g, 0.13, 0.08, c, x, y, z, 8)
  const legoCar = (c) => { const g = makeCar(c); stud(g, shade(c, 0.28), -0.25, 0.82, 0); stud(g, shade(c, 0.28), 0.1, 0.82, 0); return g }
  const ball = () => {
    const g = G()
    const m = mk(g, new THREE.SphereGeometry(0.45, 16, 12), 0xe8742a, 0, 0, 0)
    const band = mk(g, new THREE.TorusGeometry(0.455, 0.02, 4, 20), 0x1a1a1a, 0, 0, 0, false)
    m.add(band)
    band.position.set(0, 0, 0)
    g.userData = { y: 0.5, spin: m, r: 0.45 }
    return g
  }

  const train = () => {
    const g = G()
    bx(g, 3.4, 0.7, 0.9, 0xffffff, 0, 0.14, 0)
    bx(g, 3.42, 0.14, 0.92, 0x1d5fd0, 0, 0.36, 0)
    bx(g, 3.0, 0.2, 0.92, 0x2b3a55, -0.1, 0.56, 0)
    const nose = mk(g, new THREE.ConeGeometry(0.46, 0.9, 4), 0xffffff, 2.1, 0.44, 0)
    nose.rotation.z = -Math.PI / 2
    nose.rotation.x = Math.PI / 4
    nose.scale.set(0.8, 1, 1)
    for (const x of [-1.1, 0, 1.1]) for (const z of [-0.4, 0.4]) bx(g, 0.26, 0.2, 0.1, 0x1a1a1a, x, 0, z)
    return g
  }
  const kei = (c) => {
    const g = G()
    bx(g, 1.15, 0.5, 0.66, c, 0, 0.14, 0)
    bx(g, 0.95, 0.34, 0.62, 0xcfe8f5, -0.04, 0.6, 0)
    bx(g, 1.0, 0.06, 0.66, c, -0.04, 0.94, 0)
    for (const x of [-0.36, 0.36]) for (const z of [-0.31, 0.31]) bx(g, 0.2, 0.2, 0.12, 0x1a1a1a, x, 0, z)
    return g
  }
  const ramen = () => {
    const g = makeVan(0xfff3d6)
    bx(g, 0.9, 0.3, 0.8, 0xd62828, -0.3, 0.8, 0)
    mk(g, new THREE.SphereGeometry(0.16, 8, 6), N(0xffb347), -0.3, 1.25, 0, false)
    return g
  }

  // reindeer: slim body, neck, head with antlers and a red nose, thin legs, a white tail
  const reindeer = (c = 0x9a6b3c, sc = 1) => {
    const g = G()
    bx(g, 1.15, 0.45, 0.42, c, 0, 0.5, 0)
    bx(g, 0.22, 0.5, 0.22, shade(c, 0.04), 0.62, 0.78, 0).rotation.z = -0.35
    bx(g, 0.34, 0.24, 0.24, shade(c, 0.06), 0.86, 1.18, 0)
    mk(g, new THREE.SphereGeometry(0.075, 8, 6), N(0xff2b2b), 1.05, 1.17, 0, false)
    for (const z of [-0.08, 0.08]) {
      const a = mk(g, new THREE.ConeGeometry(0.035, 0.46, 5), 0x4a3018, 0.8, 1.5, z * 2); a.rotation.x = z * 5
      const a2 = mk(g, new THREE.ConeGeometry(0.028, 0.26, 5), 0x4a3018, 0.84, 1.6, z * 4.2); a2.rotation.x = z * 9; a2.rotation.z = -0.5
    }
    for (const x of [-0.42, 0.42]) for (const z of [-0.14, 0.14]) bx(g, 0.1, 0.5, 0.1, shade(c, -0.1), x, 0, z)
    bx(g, 0.14, 0.14, 0.14, 0xffffff, -0.62, 0.62, 0)
    bx(g, 0.9, 0.08, 0.44, 0xc0392b, 0, 0.74, 0) // (a red harness blanket)
    g.scale.setScalar(sc)
    g.userData = { y: 0.08, bob: 0.04 }
    return g
  }
  // Santa on his sleigh: red sleigh body on gold runners, a sack of gifts, Santa in his hat and beard
  const santaSleigh = () => {
    const g = G()
    for (const z of [-0.3, 0.3]) bx(g, 1.7, 0.06, 0.06, 0xf2c94c, 0.05, 0, z)
    bx(g, 1.4, 0.3, 0.7, 0xc0392b, 0, 0.1, 0)
    bx(g, 1.42, 0.06, 0.72, 0xffffff, 0, 0.36, 0)
    bx(g, 0.5, 0.42, 0.46, 0x6b4a2b, -0.5, 0.4, 0) // the sack
    bx(g, 0.34, 0.34, 0.3, 0xc0392b, 0.15, 0.42, 0)
    bx(g, 0.36, 0.06, 0.32, 0x111111, 0.15, 0.55, 0)
    mk(g, new THREE.SphereGeometry(0.15, 10, 8), 0xf1c27d, 0.15, 0.92, 0)
    mk(g, new THREE.SphereGeometry(0.13, 10, 8), 0xffffff, 0.22, 0.84, 0)
    mk(g, new THREE.ConeGeometry(0.15, 0.3, 8), 0xd62828, 0.15, 1.18, 0)
    mk(g, new THREE.SphereGeometry(0.05, 6, 5), 0xffffff, 0.15, 1.34, 0)
    bx(g, 0.5, 0.3, 0.3, 0x2f8f5a, 1.2, 0.05, 0) // a green gift on the front
    g.userData = { y: 0.04, bob: 0.03 }
    return g
  }
  // a cart of wrapped presents
  const giftCart = () => {
    const g = G()
    bx(g, 1.1, 0.42, 0.42, 0x2f8f5a, 0, 0.3, 0)
    bx(g, 0.4, 0.4, 0.4, 0xc0392b, 0.7, 0.45, 0)
    bx(g, 0.1, 0.44, 0.44, 0xf2c94c, 0, 0.3, 0)
    bx(g, 0.1, 0.44, 0.44, 0xf2c94c, 0.7, 0.45, 0)
    for (const x of [-0.4, 0.4]) for (const z of [-0.15, 0.15]) bx(g, 0.12, 0.3, 0.12, 0x5c3b1c, x, 0, z)
    bx(g, 0.5, 0.08, 0.08, 0xf2c94c, -0.8, 0.55, 0)
    g.userData = { y: 0.08, bob: 0.05 }
    return g
  }

  const vehicles = {
    city: () => [makeCar(0xf4c430), makeCar(0xe63946), makeCar(0x2a9d8f), makeCar(0xffffff), makeCar(0x8e5bd9), makeCar(0x3b82f6), makeVan(), makeVan(0xfde68a), makeBus(), makeTruck(), makeBus(0xd9534f)],
    lego: () => [legoCar(0xe3000b), legoCar(0xffd500), legoCar(0x0057b8), legoCar(0x00852b), legoCar(0xffffff), legoCar(0xff7a00), makeBus(0xe3000b), makeTruck(0xffd500), makeVan(0x0057b8)],
    japan: () => [train(), kei(0xffb7d5), kei(0xa8e6cf), kei(0xfff3b0), kei(0xffffff), makeCar(0x2e8b57), makeCar(0xf4c430), ramen(), kei(0x9ad0ff), train()],
    ice: () => [santaSleigh(), reindeer(), reindeer(0x8d6e4a, 0.85), santaSleigh(), reindeer(0xb08a5a, 0.95), giftCart(), santaSleigh(), reindeer(0x7a5230, 1.05)],
    wire: () => vehicles.city(),
    court: () => [ball(), ball(), ball(), makeBus(0xc0392b), makeBus(0x1d3f8a), makeCar(0xffffff), ball()],
  }

  // landmarks (replace a decor cell)
  const land = {
    fuji(s, x, z) {
      bx(s, 4.8, 0.12, 4.8, 0x7fc96a, x, 0.1, z)
      mk(s, new THREE.ConeGeometry(2.3, 3.6, 24), 0x5b7fd6, x, 2.0, z)
      mk(s, new THREE.ConeGeometry(0.93, 1.45, 24), 0xffffff, x, 3.1, z)
      for (const [ox, oz] of [[-1.9, 1.9], [1.9, 1.8], [2.0, -1.9]]) {
        cyl(s, 0.1, 0.5, 0x6b3f2a, x + ox, 0.2, z + oz, 6)
        mk(s, new THREE.IcosahedronGeometry(0.55, 1), 0xffb7d5, x + ox, 1.05, z + oz)
      }
    },
    shrine(s, x, z) {
      bx(s, 4.6, 0.12, 4.6, 0xe9e2d0, x, 0.1, z)
      const red = 0xd62828
      for (const sx of [-1, 1]) cyl(s, 0.16, 3.0, red, x + sx * 1.3, 0.2, z + 1.3, 10)
      bx(s, 3.8, 0.24, 0.4, red, x, 3.2, z + 1.3)
      bx(s, 4.2, 0.14, 0.5, 0x2b2b2b, x, 3.44, z + 1.3)
      bx(s, 3.0, 0.18, 0.3, red, x, 2.6, z + 1.3)
      bx(s, 2.2, 1.0, 1.6, 0xfdf6e9, x, 0.22, z - 0.9)
      const r = mk(s, new THREE.CylinderGeometry(0.9, 1.9, 0.6, 4), 0x3d5a80, x, 1.52, z - 0.9)
      r.rotation.y = Math.PI / 4
      for (const sx of [-1, 1]) {
        cyl(s, 0.05, 0.9, 0x555555, x + sx * 0.7, 0.2, z + 0.3, 6)
        mk(s, new THREE.SphereGeometry(0.16, 8, 6), N(0xffb347), x + sx * 0.7, 1.2, z + 0.3, false)
      }
    },
    xmasTree(s, x, z) { // a big decorated Christmas tree in the snow
      bx(s, 4.8, 0.12, 4.8, 0xe6f4fb, x, 0.1, z)
      cyl(s, 0.3, 0.7, 0x5c3b1c, x, 0.2, z, 8)
      const cols = [0xff3b3b, 0xffd23b, 0x4aa3ff, 0xffffff]
      ;[[1.5, 1.3, 0.8], [1.15, 1.2, 1.75], [0.8, 1.1, 2.6]].forEach(([r, hh, y]) => {
        mk(s, new THREE.ConeGeometry(r, hh, 9), 0x1f7a46, x, y, z)
        for (let k = 0; k < 6; k++) { const a = k * 1.05 + y; mk(s, new THREE.SphereGeometry(0.1, 6, 5), N(cols[(k + Math.round(y)) % 4]), x + Math.cos(a) * r * 0.72, y - hh * 0.22, z + Math.sin(a) * r * 0.72, false) }
      })
      mk(s, new THREE.OctahedronGeometry(0.28, 0), N(0xffd23b), x, 3.5, z, false)
    },
    giftPile(s, x, z) { // a heap of presents with ribbons, a snowman at the side
      bx(s, 4.6, 0.12, 4.6, 0xe6f4fb, x, 0.1, z)
      const gifts = [[0, 0, 1.4, 1.0, 0xc0392b, 0xf2c94c], [1.1, 0.7, 0.9, 0.8, 0x2f8f5a, 0xffffff], [-1.1, 0.5, 1.0, 0.7, 0xf2c94c, 0xc0392b], [0.2, -0.2, 0.9, 0.7, 0x4aa3ff, 0xffffff]]
      gifts.forEach(([ox, oz, w, hh, c, r], i) => {
        const y = i === 3 ? 1.1 : 0.2
        bx(s, w, hh, w, c, x + ox, y, z + oz)
        bx(s, 0.14, hh + 0.02, w + 0.02, r, x + ox, y, z + oz)
        bx(s, w + 0.02, hh + 0.02, 0.14, r, x + ox, y, z + oz)
      })
      mk(s, new THREE.SphereGeometry(0.42, 10, 8), 0xffffff, x - 1.6, 0.75, z + 1.5)
      mk(s, new THREE.SphereGeometry(0.3, 10, 8), 0xffffff, x - 1.6, 1.4, z + 1.5)
      mk(s, new THREE.ConeGeometry(0.06, 0.25, 6), N(0xff7a1c), x - 1.6, 1.4, z + 1.8, false).rotation.x = Math.PI / 2
    },
    scoreboard(s, x, z) {
      bx(s, 4.6, 0.12, 4.6, 0xb97a45, x, 0.1, z)
      for (const sg of [-1, 1]) cyl(s, 0.09, 2.6, 0x4b5563, x + sg * 1.4, 0.2, z, 6)
      bx(s, 3.6, 1.7, 0.3, 0x15151f, x, 2.4, z)
      bx(s, 1.2, 0.8, 0.05, N(0xff3b30), x - 0.95, 2.85, z + 0.17)
      bx(s, 1.2, 0.8, 0.05, N(0xfcee0a), x + 0.95, 2.85, z + 0.17)
      bx(s, 0.5, 0.35, 0.05, N(0x39ff14), x, 3.3, z + 0.17)
      for (let i = 0; i < 3; i++) bx(s, 4.0, 0.3, 0.6, i % 2 ? 0xc0392b : 0x1d3f8a, x, 0.2 + i * 0.3, z - 1.5 - i * 0.3)
    },
  }

  // the traffic light in the middle of the crossroad. same parts on every map, dressed up differently:
  // shaft (round / bricks / log), colours, shape of the lamps, a base, a cap on top, a roof over each head, a rim around it
  const signals = {
    city: { shaft: 'round', pole: 0x2a2f38, head: 0x1d1f24, lamp: 'ball', base: 0x6b7280 },
    lego: { shaft: 'bricks', bricks: [0xe3000b, 0xffd500, 0x0057b8, 0x00852b], head: 0xffd500, lamp: 'disc', rim: 0x111111 },
    japan: { shaft: 'round', pole: 0xc0392b, head: 0xf5f0e6, lamp: 'ball', base: 0x2b2b2b, cap: 0x2b2b2b, roof: 0x2b2b2b },
    ice: { shaft: 'log', pole: 0xc0392b, head: 0x1f6f43, lamp: 'ball', base: 0xffffff, cap: 0xffffff },
    wire: { shaft: 'round', pole: 0x0a66c2, head: 0xc2187a, lamp: 'ball', base: 0x0a8f3c },
    court: { shaft: 'round', pole: 0xe8742a, head: 0xffffff, lamp: 'ball', base: 0x1d3f8a, cap: 0xe8742a, rim: 0x1d3f8a },
  }

  const base = {
    c: {
      base: 0xc9a569, base2: 0xa8844f, grass: 0x74c44a, pad: 0xe8e2d4, road: 0x48556b, dash: 0xe5e7eb, cross: 0xf1f5f9,
      lampPole: 0x2d3748, lampGlow: 0xfff3b0, water: 0x4fb8ee, round: 0x3f9f3c, pine: 0x2f7d3a, blossom: 0x3f9f3c, trunk: 0x7a5230,
      park: 0x5fae45, court: 0xd97a3a, courtLine: 0xfff7ed, plaza: 0xdcd6c8, stone: 0xb8c0cc, grove: 0x74b650, bench: 0x8b5a3c,
      crate: [0xe63946, 0x2a9d8f, 0xf4a261], empty: 0xd9d6cc,
    },
    sun: [0xfff1cc, 2.5], hemi: [0xffffff, 0x9fb0c4, 1.45], fog: null, glowLamps: false,
    people: { coats: [0xff6b6b, 0xffd93d, 0x4dd0e1, 0xffffff, 0xff9f1c, 0x80ed99], pants: [0x3b5bdb, 0x4a5568, 0xf4a261], hat: 0xe9c46a, shorts: true },
    particle: null, tree: 'std', dashes: true, studs: false, landmarks: {}, build: null, kiosk: null,
  }
  const T = (id, o) => ({ ...base, ...o, id, c: { ...base.c, ...(o.c || {}) }, vehicles: vehicles[id], build: build[id] || null, kiosk: kiosks[id] || null, signal: signals[id] })

  return {
    city: T('city', {}),
    lego: T('lego', {
      c: { base: 0x2f8f3a, base2: 0x237a2e, grass: 0x3fae49, pad: 0xc9ccd1, road: 0x6b7280, park: 0x00852b, court: 0xff7a00, plaza: 0xffd500, stone: 0xffffff, grove: 0x00852b, bench: 0xe3000b, crate: [0xe3000b, 0xffd500, 0x0057b8], round: 0x00852b, pine: 0x00852b, blossom: 0x4cc35a, trunk: 0x6b3f1d, water: 0x1e90ff },
      people: { coats: [0xe3000b, 0x0057b8, 0x00852b, 0xff7a00, 0xffffff, 0x8e44ad], pants: [0x0057b8, 0x2b2b2b, 0xe3000b], hat: null, shorts: false, skin: 0xffd500 },
      tree: 'lego', studs: true,
    }),
    japan: T('japan', {
      c: { base: 0xb98b5e, base2: 0x8f6a45, grass: 0x8fd16a, pad: 0xf3ead8, road: 0x5a6072, lampPole: 0x7a3b2e, lampGlow: 0xff8c5a, water: 0x58c4f0, round: 0xffb7d5, pine: 0x3f9f5a, blossom: 0xff8fc0, trunk: 0x6b3f2a, park: 0x7fc96a, court: 0xe9e2d0, plaza: 0xe9e2d0, stone: 0xb9bec8, grove: 0x7fc96a, bench: 0x8a4b32, crate: [0xd62828, 0xffb7d5, 0x3d5a80] },
      sun: [0xfff2e0, 2.7], hemi: [0xffffff, 0xffc9de, 1.6], glowLamps: true, toon: true,
      people: { coats: [0x1d3557, 0xffffff, 0xd62828, 0xffb7d5, 0x2b2d42, 0x9ad0ff], pants: [0x1d3557, 0x2b2d42, 0x6b7280], hat: 0x1c1c1c, hats: [0x1c1c1c, 0x5c3b1c, 0xff8fc0, 0x3a86ff, 0xf4c430, 0x8e5bd9], shorts: false },
      landmarks: { 1: land.fuji, 2: land.shrine },
    }),
    ice: T('ice', {
      c: { base: 0xb7d9ee, base2: 0x8fc0de, grass: 0xf4f9fd, pad: 0xe3f1fa, road: 0x8fa3bf, lampPole: 0xc0392b, lampGlow: 0xffd24d, water: 0x9fdcf7, round: 0xeaf6fd, pine: 0x1f7a46, blossom: 0xffffff, trunk: 0x5c3b1c, park: 0xe6f4fb, court: 0xd7ecf8, courtLine: 0xffffff, plaza: 0xe6f4fb, stone: 0x9aa5b1, grove: 0xe6f4fb, bench: 0x6e4623, crate: [0xc0392b, 0x2f8f5a, 0xf2c94c], empty: 0xc9dfee },
      sun: [0xf2f8ff, 2.2], hemi: [0xffffff, 0xb7d9ee, 1.6], glowLamps: true,
      people: { coats: [0xc0392b, 0x2f8f5a, 0xffffff, 0xf2c94c, 0xd62828, 0x1f6f43], pants: [0x2b2d42, 0x4a403a, 0x1d3557], hat: 0xd62828, shorts: false, xmas: true },
      tree: 'snow', dashes: false, landmarks: { 1: land.xmasTree, 2: land.giftPile },
    }),
    wire: T('wire', {
      c: { base: 0x0b1830, base2: 0x00e5ff, grass: 0x0b1830, pad: 0x12305a, road: 0x00e5ff, dash: 0x39ff14, cross: 0x39ff14, lampPole: 0x00e5ff, lampGlow: 0xffffff, water: 0x00e5ff, round: 0x39ff14, pine: 0x39ff14, blossom: 0x00ffa8, trunk: 0x00e5ff, park: 0x39ff14, court: 0xff2bd6, courtLine: 0xffffff, plaza: 0xfcee0a, stone: 0x9ad0ff, grove: 0x39ff14, bench: 0xfcee0a, crate: [0xff2bd6, 0x00e5ff, 0xfcee0a], empty: 0x2a4a7a },
      wire: true, glowLamps: true,
      people: { coats: [0xff2bd6, 0x00e5ff, 0x39ff14, 0xfcee0a, 0xffffff, 0xff6b00], pants: [0x00e5ff, 0x39ff14, 0xffffff], hat: null, shorts: false, skin: 0xffffff },
    }),
    wireLight: T('wire', {
      c: { base: 0x9fb4c8, base2: 0x0a66c2, grass: 0xb9c7d6, pad: 0x8aa2bb, road: 0x0a66c2, dash: 0x0a8f3c, cross: 0x0a8f3c, lampPole: 0x0a66c2, lampGlow: 0x111111, water: 0x0a66c2, round: 0x0a8f3c, pine: 0x0a8f3c, blossom: 0x0b7a5a, trunk: 0x0a66c2, park: 0x0a8f3c, court: 0xc2187a, courtLine: 0x111111, plaza: 0xb8860b, stone: 0x4a6a8a, grove: 0x0a8f3c, bench: 0xb8860b, crate: [0xc2187a, 0x0a66c2, 0xb8860b], empty: 0x6a7f95 },
      wire: true, glowLamps: true,
      people: { coats: [0xc2187a, 0x0a66c2, 0x0a8f3c, 0xb8860b, 0x111111, 0xd9480f], pants: [0x0a66c2, 0x0a8f3c, 0x111111], hat: null, shorts: false, skin: 0x111111 },
    }),
    court: T('court', {
      c: { base: 0x8a5a2b, base2: 0x6e4623, grass: 0xd9a066, pad: 0xe7b97f, road: 0x1d3f8a, dash: 0xffffff, cross: 0xffffff, lampPole: 0x4b5563, lampGlow: 0xffffff, park: 0x1d3f8a, court: 0xc0392b, plaza: 0x2a9d8f, grove: 0xb97a45, round: 0xe8742a, pine: 0xff6b00, blossom: 0xe8742a, trunk: 0x4b5563, bench: 0x4b5563, crate: [0xe8742a, 0xc0392b, 0x1d3f8a], empty: 0xc98f55 },
      sun: [0xfff3dd, 2.4], hemi: [0xffffff, 0xb08a5a, 1.5],
      people: { coats: [0xc0392b, 0x1d3f8a, 0xfcee0a, 0xffffff, 0x2a9d8f, 0x6a4c93], pants: [0xc0392b, 0x1d3f8a, 0x111111], hat: null, shorts: true },
      tree: 'cone', landmarks: { 0: 'court', 2: 'court', 3: land.scoreboard },
    }),
  }
}
