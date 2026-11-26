// the opening splash of every map: the $ and the ? drawn on screen in that map's own way (the same pictures as the app icons).
// each scene is a function of "go" (the animation starts when it turns true) and takes about three seconds.
import { MAP_LIST } from './maps.js'

export const SPLASH_MS = 3000 // the animation and the sound last this long
export const SPLASH_HOLD = 300 // then the finished $? stays on screen this long (ms) before the splash starts to fade away
// every scene is written with its own times; "k" stretches or squeezes a scene so that its LAST stroke, brick or bounce finishes exactly when the splash (and the scissor cut) ends:
// k = (SPLASH_MS - the 0.15 s before it starts) / the length the scene is written for (measured: 2.60, 2.95, 2.98, 2.95, 2.60, 3.20 seconds)
export const SPLASH_SLOW = 1

const S = 'M108 64c-18-8-38 2-38 18 0 20 40 22 40 44 0 16-22 24-42 14M92 48 86 178'
const Q = 'M140 94c2-20 36-26 44-8 8 18-18 24-24 38'
const S1 = 'M108 64c-18-8-38 2-38 18 0 20 40 22 40 44 0 16-22 24-42 14'
const S2 = 'M88 50 82 180'

// a line that draws itself
const Draw = ({ go, d, dur = 1, delay = 0, ...rest }) => (
  <path className={'draw' + (go ? ' go' : '')} pathLength="1" style={{ '--dur': dur + 's', '--delay': delay + 's' }} d={d} fill="none" strokeLinecap="round" strokeLinejoin="round" {...rest} />
)
const Circ = ({ go, cx, cy, r, dur = 0.6, delay = 0, ...rest }) => (
  <circle className={'draw' + (go ? ' go' : '')} pathLength="1" style={{ '--dur': dur + 's', '--delay': delay + 's' }} cx={cx} cy={cy} r={r} fill="none" strokeLinecap="round" {...rest} />
)

/* ---------- Classic City: the green $ and the red ? drawn in turn ---------- */
function City({ go }) {
  return (
    <svg viewBox="0 0 240 240" aria-label="$?">
      <Draw go={go} d={Q} dur=".85" delay="0.1" stroke="#e5383b" strokeWidth="14" />
      <circle className={'sp-pop'} style={{ '--delay': '1.0s' }} cx="158" cy="152" r="8" fill="#e5383b" />
      <g transform="translate(-4 4)">
        <Draw go={go} d={S1} dur="1.1" delay="1.1" stroke="#1faa59" strokeWidth="13" />
        <Draw go={go} d={S2} dur=".5" delay="2.1" stroke="#1faa59" strokeWidth="13" />
      </g>
    </svg>
  )
}

/* ---------- Lego: bricks fall one by one and build the letters ---------- */
const LD = ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..']
const LQ = ['.##.', '#..#', '...#', '..#.', '.#..', '....', '.#..']
function Brick({ x, y, w, c, dk, lt, delay }) { // (built in place: pressed down onto the brick below with a small click, not dropped from above)
  const cx = x + w / 2
  return (
    <g className="sp-snap" style={{ '--delay': delay + 's' }}>
      <rect x={x} y={y + 9} width={w} height="14" rx="2" fill={dk} />
      <rect x={x} y={y + 5} width={w} height="14" fill={c} />
      <rect x={x} y={y} width={w} height="8" rx="2" fill={lt} />
      <rect x={cx - 7.5} y={y - 4} width="15" height="6" fill={dk} />
      <ellipse cx={cx} cy={y + 2} rx="7.5" ry="3.6" fill={dk} />
      <ellipse cx={cx} cy={y - 3} rx="7.5" ry="4.2" fill={lt} />
      <ellipse cx={cx - 2} cy={y - 4} rx="3" ry="1.4" fill="#fff" opacity=".6" />
    </g>
  )
}
const legoBricks = () => {
  const out = []
  const cw = 22, rh = 21, oy = 34
  ;[[LD, 6, '#ffd500', '#b39400', '#ffe55c', 0], [LQ, 138, '#e3000b', '#8f0007', '#ff5a62', 0.25]].forEach(([m, x0, c, dk, lt, off]) =>
    m.forEach((row, r) => [...row].forEach((ch, i) => { if (ch === '#') out.push({ x: x0 + i * cw, y: oy + r * rh, w: cw, c, dk, lt, delay: +(0.75 + off + (6 - r) * 0.26 + i * 0.045).toFixed(2) }) }))) // (the letters grow from the bottom row up, like a build)
  ;[[60, '#fff', '#b5b5b5', '#fff'], [98, '#0057b8', '#003a7a', '#3b86e8'], [136, '#fff', '#b5b5b5', '#fff']].forEach(([x, c, dk, lt], k) => out.push({ x, y: 196, w: 34, c, dk, lt, delay: +(0.1 + k * 0.2).toFixed(2) })) // (the three base bricks are laid first)
  return out
}
const LEGO_BRICKS = legoBricks()
function Lego() {
  return (
    <svg viewBox="0 0 240 240" aria-label="$?">
      <ellipse cx="120" cy="196" rx="104" ry="14" fill="#000" opacity=".22" />
      {LEGO_BRICKS.map((b, i) => <Brick key={i} {...b} />)}
    </svg>
  )
}

/* ---------- Japan: 円 and 何 written stroke by stroke in thick black brush lines ---------- */
const KANJI = [
  'M26 64V188', 'M26 64H104V176Q104 188 90 188', 'M26 122H104', 'M65 64V188', // 円
  'M146 66 130 112', 'M140 94V190', 'M166 70H224', 'M208 70V178Q208 190 192 188', 'M168 104H192V148H168Z', // 何
]
function Japan({ go }) {
  return (
    <svg viewBox="0 0 240 240" aria-label="円 何">
      <g transform="translate(120 120) scale(.72) translate(-125 -127)">
        {KANJI.map((d, i) => <Draw key={i} go={go} d={d} dur=".42" delay={+(0.15 + i * 0.3).toFixed(2)} stroke="#111" strokeWidth="11" />)}
      </g>
    </svg>
  )
}

/* ---------- Wireframe: pencil sketch on dotted paper, in the same order as the Classic splash (the ? first, then its dot, then the $ in two strokes) ---------- */
const PAPER = '#f4f3ef', PENCIL = '#1f2340', RED = '#d8232a'
// (these are outside of Wire on purpose: a component made inside another one is a NEW component on every render, so React would take it out and put it back,
// and its animation would start over, for instance when the splash begins to fade: the ? was drawn a second time and the $ disappeared)
const REVEAL = { stroke: '#fff', strokeWidth: 30, strokeLinecap: 'round' } // (round, a little wider than the lines it shows, so the ends of a stroke are never cut off)
const WireMask = ({ go, id, d, dur, delay }) => (
  <mask id={id} maskUnits="userSpaceOnUse" x="-60" y="-60" width="360" height="360">
    <rect x="-60" y="-60" width="360" height="360" fill="#000" />
    <Draw go={go} d={d} dur={dur} delay={delay} {...REVEAL} />
  </mask>
)
const LINE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
function Wire({ go }) {
  // the finished drawing (exactly the icon) is there all the time, but hidden; a mask for every stroke, written by the pen, shows it bit by bit,
  // so what is on screen is always a piece of the finished letters (no half-drawn tubes)
  return (
    <svg viewBox="0 0 240 240" aria-label="$?">
      <defs>
        <filter id="sp-sketch" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="7" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="4" /></filter>
        <WireMask go={go} id="sp-wq" d={Q} dur=".85" delay="0.1" />
        <WireMask go={go} id="sp-ws1" d={S1} dur="1.1" delay="1.1" />
        <WireMask go={go} id="sp-ws2" d={S2} dur=".5" delay="2.1" />
      </defs>
      <g filter="url(#sp-sketch)">
        <g transform="translate(120 120) scale(.74) translate(-128 -118)">
          <path d={Q} stroke={PENCIL} strokeWidth="26" mask="url(#sp-wq)" {...LINE} />
          <path d={Q} stroke={PAPER} strokeWidth="20" mask="url(#sp-wq)" {...LINE} />
          <Circ go={go} cx="158" cy="154" r="14" dur=".5" delay="1.0" stroke={RED} strokeWidth="5" />
          <g transform="translate(-4 4)">
            {/* the $ is two strokes: the pencil lines of both go down first and the paper over them after, so they join into one outlined letter; the bar is red like the dot */}
            <g mask="url(#sp-ws1)"><path d={S1} stroke={PENCIL} strokeWidth="26" {...LINE} /></g>
            <g mask="url(#sp-ws2)"><path d={S2} stroke={RED} strokeWidth="26" {...LINE} /></g>
            <g mask="url(#sp-ws1)"><path d={S1} stroke={PAPER} strokeWidth="20" {...LINE} /></g>
            <g mask="url(#sp-ws2)"><path d={S2} stroke={PAPER} strokeWidth="20" {...LINE} /></g>
          </g>
        </g>
      </g>
    </svg>
  )
}

/* ---------- Basketball Court: the $ and ? are written, then the ball bounces in as the dot ---------- */
function Court({ go }) {
  return (
    <svg viewBox="0 0 240 240" aria-label="$?">
      <g stroke="#fff" strokeWidth="3" fill="none" opacity=".55"><rect x="14" y="14" width="212" height="212" rx="4" /><path d="M120 14V226" /><circle cx="120" cy="120" r="46" /></g>
      <g transform="translate(-4 4)"><Draw go={go} d={S} dur="1.3" delay="0.1" stroke="#1d3f8a" strokeWidth="14" /></g>
      <Draw go={go} d={Q} dur=".9" delay="1.4" stroke="#fff" strokeWidth="14" />
      <ellipse className="sp-fade" style={{ '--delay': '1.9s' }} cx="158" cy="192" rx="15" ry="4" fill="#000" opacity=".3" />
      <g className="sp-ball" style={{ '--delay': '1.9s' }}>
        <circle cx="158" cy="176" r="15" fill="#e8742a" />
        <path d="M143 176h30M158 161v30M148 166c6 6 6 14 0 20M168 166c-6 6-6 14 0 20" stroke="#6b2a0a" strokeWidth="1.6" fill="none" />
      </g>
    </svg>
  )
}

/* ---------- Santy: a candy cane $, a pine tree ? with a pinecone, and Santa's sleigh with the reindeer ride in ---------- */
const needlePoints = () => {
  try {
    const NS = 'http://www.w3.org/2000/svg'
    const holder = document.createElementNS(NS, 'svg')
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', 'M140 98c2-20 36-26 44-8 8 18-18 24-24 38')
    holder.appendChild(p)
    const L = p.getTotalLength(), out = []
    for (let l = 6; l < L - 2; l += 15) {
      const a = p.getPointAtLength(l), b = p.getPointAtLength(l + 1)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      for (const sd of [-1, 1]) {
        const nx = -Math.sin(ang) * sd, ny = Math.cos(ang) * sd, c = Math.cos(ang), s = Math.sin(ang)
        out.push(`M${a.x - c * 6 + nx * 10} ${a.y - s * 6 + ny * 10}L${a.x + nx * 24 + c * 7} ${a.y + ny * 24 + s * 7}L${a.x + c * 6 + nx * 10} ${a.y + s * 6 + ny * 10}z`)
      }
    }
    return out
  } catch { return [] }
}
let NEEDLES = null
function Santy({ go }) {
  if (NEEDLES === null) NEEDLES = needlePoints()
  return (
    <svg viewBox="0 0 240 240" aria-label="$?">
      <defs>
        <filter id="sp-rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" /></filter>
      </defs>
      <g fill="#fff">{[[24, 0], [70, .7], [112, 1.4], [160, .35], [204, 1.05], [226, 1.8], [46, 2.1], [140, 2.4]].map(([x, d], i) => <circle key={i} className="sp-snow" style={{ '--delay': d + 's' }} cx={x} cy={-8 + (i % 3) * 6} r={2 + (i % 2)} />)}</g>
      <g filter="url(#sp-rough)" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <g transform="translate(26 4) scale(.62)">
          <g transform="rotate(-4 90 112)">
            <Draw go={go} d={S} dur="1" delay="0.1" stroke="#111" strokeWidth="40" />
            <Draw go={go} d={S} dur="1" delay="0.5" stroke="#e6e3dc" strokeWidth="28" />
            <path className="sp-fade" style={{ '--delay': '1.2s' }} d={S} stroke="#8e1b1b" strokeWidth="28" strokeDasharray="15 21" strokeLinecap="butt" />
          </g>
          <g transform="rotate(6 170 110)">
            <Draw go={go} d={Q} dur=".9" delay="1.0" stroke="#111" strokeWidth="40" />
            <Draw go={go} d={Q} dur=".9" delay="1.3" stroke="#2f6a45" strokeWidth="28" />
            <g fill="#2f6a45" stroke="#111" strokeWidth="5">{NEEDLES.map((d, i) => <path key={i} className="sp-pop" style={{ '--delay': (1.8 + i * 0.045).toFixed(2) + 's' }} d={d} />)}</g>
            <path className="sp-pop" style={{ '--delay': '2.3s' }} d="M176 62l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#d9a62b" stroke="#111" strokeWidth="4" />
          </g>
          <g className="sp-drop" style={{ '--delay': '2.4s' }}>
            <ellipse cx="158" cy="158" rx="14" ry="19" fill="#8a5a2c" stroke="#111" strokeWidth="6" />
            <path d="M146 150l12 6 12-6M146 162l12 6 12-6M148 140l10 5 10-5" stroke="#111" strokeWidth="3.6" />
          </g>
        </g>
        <g className="sp-ride" style={{ '--delay': '0.5s' }} stroke="#111" strokeWidth="4.5">
          <g transform="translate(14 150)"><path d="M12 38v18M26 38v18M46 38v18M58 38v18" strokeWidth="5" /><ellipse cx="36" cy="30" rx="28" ry="14" fill="#8a5a2c" /><path d="M60 26l12-18" strokeWidth="7" /><ellipse cx="74" cy="8" rx="10" ry="8" fill="#8a5a2c" /><circle cx="82" cy="10" r="3.6" fill="#d8232a" strokeWidth="2.5" /><path d="M70 0l-6-12M70 0l4-12M76 0l8-10M64-12l-6-2M74-12l-4-6" strokeWidth="3.2" /></g>
          <g transform="translate(-2 160) scale(.92)"><path d="M12 36v16M26 36v16M46 36v16M58 36v16" strokeWidth="5" /><ellipse cx="36" cy="28" rx="28" ry="13" fill="#a2703a" /><path d="M60 24l12-18" strokeWidth="7" /><ellipse cx="74" cy="6" rx="10" ry="8" fill="#a2703a" /><circle cx="82" cy="8" r="3.4" fill="#d8232a" strokeWidth="2.5" /><path d="M70-2l-6-12M70-2l4-12M76-2l8-10" strokeWidth="3.2" /></g>
          <path d="M96 182h26" strokeWidth="3.5" />
          <g transform="translate(110 118)">
            <path d="M4 88q-10 0-8-10M4 88h108q10 0 8-10" strokeWidth="8" /><path d="M26 88v-12M92 88v-12" strokeWidth="6" />
            <path d="M6 40Q4 76 28 80H96Q120 74 118 40Q100 58 70 58Q40 58 6 40Z" fill="#8e1b1b" strokeWidth="7" />
            <path d="M12 44Q40 62 70 62T112 44" stroke="#e6e3dc" strokeWidth="6" />
            <g fill="#2f6a45" strokeWidth="4"><rect x="16" y="14" width="22" height="22" /><path d="M27 14v22M16 25h22" strokeWidth="2.4" /></g>
            <g strokeWidth="4.5"><circle cx="64" cy="10" r="13" fill="#f0c9a5" /><path d="M52 14q12 20 24 0q-2 16-12 18q-10-2-12-18z" fill="#fff" strokeWidth="3.5" /><path d="M50 8Q64-18 80 6Q70 0 50 8z" fill="#d8232a" /><circle cx="82" cy="6" r="5" fill="#fff" strokeWidth="3" /><rect x="50" y="5" width="28" height="7" rx="3.5" fill="#fff" strokeWidth="3" /><path d="M52 46q12-12 24 0v8H52z" fill="#d8232a" /></g>
            <g strokeWidth="4"><rect x="86" y="22" width="24" height="24" fill="#d9a62b" /></g>
          </g>
        </g>
      </g>
    </svg>
  )
}

// the background of each splash (as a style), and its scene. the ids are the ids of the maps.
export const SPLASHES = {
  city: { Scene: City, k: 1.096, style: {} },
  lego: { Scene: Lego, k: 0.966, style: { '--sbg': '#2fa043', backgroundImage: 'radial-gradient(circle, #46c25b 0 28%, transparent 30%)', backgroundSize: '44px 44px' } },
  japan: { Scene: Japan, k: 0.956, style: { '--sbg': '#f2f2f2' } },
  ice: { Scene: Santy, k: 0.966, style: { '--sbg': '#e6e3dc' } },
  wire: { Scene: Wire, k: 1.096, style: { '--sbg': PAPER, backgroundImage: 'radial-gradient(circle, rgba(31,35,64,.35) 0 1.2px, transparent 1.7px)', backgroundSize: '22px 22px' } },
  court: { Scene: Court, k: 0.891, style: { '--sbg': '#d9a066' } },
}
export const splashFor = (id) => SPLASHES[id] || SPLASHES.city
export const SPLASH_IDS = MAP_LIST.map((m) => m.id)
