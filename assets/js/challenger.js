/* ==========================================================================
   Tristate — Dodge Challenger inspired 3D showroom (three.js)
   Procedurally modelled (no external model file needed). Works on desktop &
   mobile: adaptive pixel ratio, pauses off-screen, horizontal-drag rotate that
   never blocks vertical page scrolling.
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PAINTS = {
  black:   { body: '#0a0b0d', stripe: '#8fd43d' },
  sublime: { body: '#7cc72c', stripe: '#0b0c0e' },
  red:     { body: '#b8120f', stripe: '#0b0c0e' },
  silver:  { body: '#a9adb3', stripe: '#c11a14' },
};

/* ---------- small helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
function keyed(keys) { // cosine-interpolated piecewise curve
  return x => {
    if (x <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [x1, y1] = keys[i];
      if (x <= x1) {
        const [x0, y0] = keys[i - 1];
        const t = (x - x0) / (x1 - x0);
        return y0 + (y1 - y0) * (1 - Math.cos(t * Math.PI)) / 2;
      }
    }
    return keys[keys.length - 1][1];
  };
}
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const spow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

/* ---------- Car dimensions (metres, x = forward) ---------- */
const FRONT = 2.5, REAR = -2.5;
const WHEEL_R = 0.372, TRACK = 0.80;
const WF = 1.52, WR = -1.43; // wheel centre x

const yTop = keyed([[-2.5, 0.93], [-2.44, 1.0], [-2.25, 1.04], [-1.6, 1.055], [-0.5, 1.045], [0.9, 1.02], [1.7, 1.0], [2.3, 0.97], [2.44, 0.94], [2.5, 0.9]]);
const yBotBase = keyed([[-2.5, 0.42], [-2.3, 0.34], [-1.9, 0.31], [2.0, 0.30], [2.35, 0.27], [2.5, 0.27]]);
const halfW = x => 0.925 + 0.028 * bump(x, WF, 0.55) + 0.04 * bump(x, WR, 0.65) - 0.03 * smooth(clamp((x - 2.2) / 0.3, 0, 1)) - 0.02 * smooth(clamp((-x - 2.2) / 0.3, 0, 1));
function yArch(x) {
  let y = -1;
  for (const c of [WF, WR]) {
    const R = 0.47, d = x - c;
    if (Math.abs(d) < R) y = Math.max(y, WHEEL_R + 0.035 + Math.sqrt(R * R - d * d));
  }
  return y;
}
const yBot = x => Math.max(yBotBase(x), yArch(x));
const cabinTop = keyed([[-1.62, 1.05], [-1.42, 1.12], [-1.1, 1.27], [-0.8, 1.385], [-0.4, 1.405], [0.0, 1.395], [0.3, 1.3], [0.62, 1.16], [0.95, 1.02]]);

/* ---------- Geometry builders ---------- */
function stationsX() {
  const xs = [];
  const x0 = REAR + 0.1, x1 = FRONT - 0.08, n = 170;
  for (let k = 8; k >= 1; k--) xs.push(x0 - 0.1 * Math.sin((k / 8) * Math.PI / 2)); // rounded tail
  for (let i = 0; i <= n; i++) xs.push(x0 + (x1 - x0) * i / n);
  for (let k = 1; k <= 8; k++) xs.push(x1 + 0.08 * Math.sin((k / 8) * Math.PI / 2)); // rounded nose
  return xs;
}
function endScale(x) {
  const x0 = REAR + 0.1, x1 = FRONT - 0.08;
  if (x > x1) { const s = (x - x1) / 0.08; return Math.sqrt(Math.max(0, 1 - s * s)); }
  if (x < x0) { const s = (x0 - x) / 0.1; return Math.sqrt(Math.max(0, 1 - s * s)); }
  return 1;
}
function planarUV(x, z) { return [(x - REAR) / (FRONT - REAR), (z + 1.05) / 2.1]; }

function buildBody() {
  const xs = stationsX();
  const S = 96, nz = 7, ny = 4.5;
  const pos = [], uv = [], idx = [];
  xs.forEach(x => {
    const e = endScale(x);
    const yb = yBotBase(x), yt = yTop(x), ya = yArch(x);
    const yc = (yb + yt) / 2, H = (yt - yb) / 2 * (0.25 + 0.75 * e), W = halfW(x) * (0.15 + 0.85 * e);
    for (let i = 0; i < S; i++) {
      const th = (i / S) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      // tumblehome above the shoulder line, slight tuck-under below
      const up = clamp(s, 0, 1), dn = clamp(-s, 0, 1);
      const z = W * spow(c, 2 / nz) * (1 - 0.07 * up ** 3 - 0.05 * dn ** 2);
      let y = yc + H * spow(s, 2 / ny);
      if (ya > 0 && e > 0.99) y = Math.max(y, ya); // clean wheel-arch cut
      pos.push(x, y, z);
      uv.push(...planarUV(x, z));
    }
  });
  for (let j = 0; j < xs.length - 1; j++) for (let i = 0; i < S; i++) {
    const a = j * S + i, b = j * S + (i + 1) % S, c = (j + 1) * S + i, d = (j + 1) * S + (i + 1) % S;
    idx.push(a, c, b, b, c, d);
  }
  // caps (fan) to close the ends
  const capEnds = [0, xs.length - 1];
  capEnds.forEach((j, k) => {
    const x = xs[j]; const yc = (yBot(x) + yTop(x)) / 2;
    const ci = pos.length / 3; pos.push(x + (k ? 0.001 : -0.001), yc, 0); uv.push(...planarUV(x, 0));
    for (let i = 0; i < S; i++) { const a = j * S + i, b = j * S + (i + 1) % S; k ? idx.push(a, b, ci) : idx.push(b, a, ci); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildCabin() {
  const x0 = -1.62, x1 = 0.95, N = 110, M = 48, n = 5.5;
  const pos = [], uv = [], cs = [];
  for (let j = 0; j <= N; j++) {
    const x = x0 + (x1 - x0) * j / N;
    const base = yTop(x) - 0.012;
    const h = Math.max(0, cabinTop(x) - base);
    const Wb = halfW(x) * 0.86, Wt = 0.66;
    for (let i = 0; i <= M; i++) {
      const ph = (i / M) * Math.PI;
      const c = spow(Math.cos(ph), 2 / n), s = Math.abs(Math.sin(ph)) ** (2 / n);
      const z = c * (Wb + (Wt - Wb) * s);
      const y = base + h * s;
      pos.push(x, y, z); uv.push(...planarUV(x, z)); cs.push(c, s, x);
    }
  }
  const isGlass = (c, s, x) => {
    const ac = Math.abs(c);
    if (s < 0.2 && ac > 0.6) return false;                 // window sill
    if (x > 0.9) return false;
    if (x > -0.86 && x < 0.02 && s > 0.93) return false;     // roof panel
    if (x > -0.06 && ac > 0.8 && ac < 0.94) return false;    // A-pillars
    if (x < -0.84 && ac > 0.52) return false;               // wide C-pillars
    if (x < -0.84 && s < 0.25) return false;
    return true;
  };
  const paint = [], glass = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) {
    const a = j * (M + 1) + i, b = a + 1, c = a + (M + 1), d = c + 1;
    const mc = (cs[a * 3] + cs[d * 3]) / 2, ms = (cs[a * 3 + 1] + cs[d * 3 + 1]) / 2, mx = (cs[a * 3 + 2] + cs[d * 3 + 2]) / 2;
    (isGlass(mc, ms, mx) ? glass : paint).push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...paint, ...glass]);
  g.addGroup(0, paint.length, 0);
  g.addGroup(paint.length, glass.length, 1);
  g.computeVertexNormals();
  return g;
}

function paintTexture(body, stripe) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = body; x.fillRect(0, 0, 1024, 512);
  // twin racing stripes along length, centred on z = 0  (v = (z+1.05)/2.1)
  const zv = z => (z + 1.05) / 2.1 * 512;
  x.fillStyle = stripe;
  for (const [a, b] of [[0.07, 0.29], [-0.29, -0.07]]) x.fillRect(0, zv(a), 1024, zv(b) - zv(a));
  // pin lines
  x.fillStyle = 'rgba(255,255,255,0.25)';
  for (const z of [0.3, -0.3, 0.06, -0.06]) x.fillRect(0, zv(z) - 1, 1024, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function glowTexture(inner, outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.45)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 64, 4, 128, 64, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.45, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  return new THREE.CanvasTexture(c);
}
function grilleTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#050505'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#2a2d31'; x.lineWidth = 2;
  for (let i = -128; i < 640; i += 12) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 128); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 128); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildWheel(mats, mirror) {
  const wheel = new THREE.Group();
  const spin = new THREE.Group();
  wheel.add(spin);
  // tyre (lathe around Y then turned to Z axis)
  const prof = [[0.262, -0.125], [0.31, -0.138], [0.352, -0.13], [0.369, -0.105], [WHEEL_R, -0.07], [WHEEL_R, 0.07], [0.369, 0.105], [0.352, 0.13], [0.31, 0.138], [0.262, 0.125]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), mats.tyre);
  tyre.rotation.x = Math.PI / 2;
  spin.add(tyre);
  // barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.24, 48, 1, true), mats.barrel);
  barrel.rotation.x = Math.PI / 2; spin.add(barrel);
  // rim face with 5 split spokes
  const shape = new THREE.Shape(); shape.absarc(0, 0, 0.258, 0, Math.PI * 2, false);
  const spokes = 5;
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * Math.PI * 2 + 0.2, a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.2;
    const hole = new THREE.Path();
    const ri = 0.085, ro = 0.222;
    hole.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
    for (let t = 0; t <= 12; t++) { const a = a0 + (a1 - a0) * t / 12; hole.lineTo(Math.cos(a) * ro, Math.sin(a) * ro); }
    for (let t = 12; t >= 0; t--) { const a = a0 + 0.06 + (a1 - a0 - 0.12) * t / 12; hole.lineTo(Math.cos(a) * ri, Math.sin(a) * ri); }
    shape.holes.push(hole);
    // split line in the middle of each spoke
    const am = a1 + 0.2;
    const slit = new THREE.Path();
    slit.moveTo(Math.cos(am - 0.025) * 0.12, Math.sin(am - 0.025) * 0.12);
    slit.lineTo(Math.cos(am - 0.012) * 0.21, Math.sin(am - 0.012) * 0.21);
    slit.lineTo(Math.cos(am + 0.012) * 0.21, Math.sin(am + 0.012) * 0.21);
    slit.lineTo(Math.cos(am + 0.025) * 0.12, Math.sin(am + 0.025) * 0.12);
    shape.holes.push(slit);
  }
  const rimGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 2, curveSegments: 40 });
  const rim = new THREE.Mesh(rimGeo, mats.rim);
  rim.position.z = 0.075; spin.add(rim);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.257, 0.011, 10, 64), mats.chrome);
  lip.position.z = 0.12; spin.add(lip);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.03, 32), mats.chrome);
  cap.rotation.x = Math.PI / 2; cap.position.z = 0.13; spin.add(cap);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.04, 32), mats.badge);
  badge.position.z = 0.1455; spin.add(badge);
  // brake disc (spins) + caliper (fixed)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.028, 48), mats.disc);
  disc.rotation.x = Math.PI / 2; disc.position.z = 0.0; spin.add(disc);
  const caliper = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.042, 10, 20, 1.0), mats.caliper);
  caliper.position.z = 0.035; caliper.rotation.z = Math.PI * 0.62;
  wheel.add(caliper);
  if (mirror) wheel.rotation.y = Math.PI;
  wheel.userData.spin = spin;
  wheel.userData.dir = mirror ? 1 : -1;
  return wheel;
}

/* ---------- Main factory ---------- */
export function createShowroom(container, opts = {}) {
  const mode = opts.mode || 'hero';
  const isCoarse = matchMedia('(pointer: coarse)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower = isCoarse || (navigator.hardwareConcurrency || 8) <= 4;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lowPower || devicePixelRatio < 2, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    container.closest('[data-showroom]')?.classList.add('no-webgl');
    return null;
  }
  const maxDpr = lowPower ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D Dodge Challenger muscle car — drag sideways to rotate');
  renderer.domElement.setAttribute('role', 'img');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  /* Materials */
  const paintMap = paintTexture(PAINTS.black.body, PAINTS.black.stripe);
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ map: paintMap, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25 }),
    paintSolid: new THREE.MeshPhysicalMaterial({ color: PAINTS.black.body, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0e13, metalness: 0.5, roughness: 0.03, clearcoat: 1, envMapIntensity: 1.1 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.82, metalness: 0.0 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }),
    rim: new THREE.MeshPhysicalMaterial({ color: 0x1b1c1f, metalness: 1, roughness: 0.22, clearcoat: 0.6, envMapIntensity: 1.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08, envMapIntensity: 1.6 }),
    badge: new THREE.MeshStandardMaterial({ color: 0xe3261f, metalness: 0.4, roughness: 0.3 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.9, roughness: 0.38 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: 0xd61f18, metalness: 0.3, roughness: 0.35, clearcoat: 1 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.55, metalness: 0.3 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.15, metalness: 0.6, clearcoat: 1 }),
    grille: new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.6, metalness: 0.5 }),
    halo: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfe6ff, emissiveIntensity: 0, roughness: 0.3 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x0e1014, metalness: 1, roughness: 0.05, clearcoat: 1, envMapIntensity: 2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a10, emissiveIntensity: 0, roughness: 0.3 }),
    under: new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1 }),
  };

  /* Car */
  const car = new THREE.Group();
  const body = new THREE.Mesh(buildBody(), mats.paint);
  car.add(body);
  const cabin = new THREE.Mesh(buildCabin(), [mats.paint, mats.glass]);
  car.add(cabin);

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = car) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  // underbody & wheel houses (hide see-through gaps)
  add(new THREE.BoxGeometry(4.5, 0.16, 1.5), mats.under, 0, 0.33, 0);
  for (const wx of [WF, WR]) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.98, 0.5, 0.05), mats.under, wx, 0.6, s * 0.56);
  for (const wx of [WF, WR]) add(new THREE.BoxGeometry(0.98, 0.04, 1.2), mats.under, wx, 0.86, 0);

  // Front fascia: full-width grille with quad halo headlamps (Challenger signature)
  add(new THREE.BoxGeometry(0.06, 0.24, 1.66), mats.gloss, FRONT - 0.03, 0.735, 0);
  add(new THREE.PlaneGeometry(1.0, 0.16), mats.grille, FRONT + 0.002, 0.735, 0, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(0.02, 0.012, 1.62), mats.chrome, FRONT + 0.004, 0.858, 0);
  add(new THREE.BoxGeometry(0.02, 0.012, 1.62), mats.chrome, FRONT + 0.004, 0.612, 0);
  const halos = [];
  for (const z of [-0.68, -0.47, 0.47, 0.68]) {
    add(new THREE.CircleGeometry(0.075, 40), mats.lens, FRONT + 0.004, 0.735, z, 0, Math.PI / 2);
    const ring = add(new THREE.TorusGeometry(0.068, 0.011, 12, 48), mats.halo, FRONT + 0.008, 0.735, z, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(0.03, 20, 12), mats.chrome, FRONT - 0.005, 0.735, z);
    halos.push(ring);
  }
  // lower intake & chin splitter
  add(new THREE.BoxGeometry(0.05, 0.11, 1.2), mats.grille, FRONT - 0.01, 0.42, 0);
  add(new THREE.BoxGeometry(0.28, 0.025, 1.78), mats.black, FRONT - 0.1, 0.265, 0);
  // hood scoop (low, centred) + bonnet pins
  const scoopGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.5, 4, 1);
  scoopGeo.rotateY(Math.PI / 4); scoopGeo.rotateZ(Math.PI / 2); scoopGeo.scale(1, 0.16, 1.1);
  const scoop = add(scoopGeo, mats.gloss, 1.45, 1.015, 0);
  add(new THREE.BoxGeometry(0.02, 0.035, 0.3), mats.grille, 1.71, 1.02, 0);
  for (const z of [-0.6, 0.6]) add(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 20), mats.chrome, 2.3, 0.972, z);
  // side mirrors
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.03, 0.12), mats.black, 0.66, 1.08, s * 0.83);
    const mg = new THREE.SphereGeometry(0.08, 20, 12); mg.scale(1.1, 0.6, 0.85);
    add(mg, mats.paintSolid, 0.64, 1.11, s * 0.93);
  }
  // chrome window trim along the beltline
  for (const s of [-1, 1]) {
    const pts = [];
    for (let x = -0.9; x <= 0.75; x += 0.05) pts.push(new THREE.Vector3(x, yTop(x) + 0.03, s * (halfW(x) * 0.86 - 0.004)));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.007, 6), mats.chrome, 0, 0, 0);
  }
  // door handles & side scallop line
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.16, 0.022, 0.012), mats.chrome, -0.35, 0.94, s * 0.932);
    add(new THREE.BoxGeometry(2.9, 0.008, 0.008), mats.black, 0.05, 0.72, s * 0.952);
  }
  // rear: black panel + full-width tail light bar, spoiler, exhaust
  add(new THREE.BoxGeometry(0.04, 0.2, 1.7), mats.gloss, REAR + 0.03, 0.86, 0);
  const tail = add(new THREE.BoxGeometry(0.02, 0.07, 1.6), mats.tail, REAR + 0.008, 0.86, 0);
  add(new THREE.BoxGeometry(0.022, 0.07, 0.04), mats.gloss, REAR + 0.006, 0.86, 0);
  add(new THREE.BoxGeometry(0.16, 0.035, 1.56), mats.paintSolid, REAR + 0.13, yTop(REAR + 0.13) + 0.012, 0, 0, 0, 0.18);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 24, 1, true), mats.chrome, REAR + 0.02, 0.37, s * 0.55, 0, 0, Math.PI / 2);
    add(new THREE.CircleGeometry(0.05, 24), mats.under, REAR + 0.04, 0.37, s * 0.55, 0, -Math.PI / 2);
  }
  add(new THREE.BoxGeometry(0.06, 0.06, 1.5), mats.black, REAR + 0.06, 0.45, 0);

  // light glows (sprites — cheap fake bloom)
  const glowW = new THREE.SpriteMaterial({ map: glowTexture('rgba(220,235,255,1)'), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glowR = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,40,20,1)'), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const z of [-0.68, -0.47, 0.47, 0.68]) { const s = new THREE.Sprite(glowW); s.scale.set(0.5, 0.5, 1); s.position.set(FRONT + 0.06, 0.735, z); car.add(s); }
  for (const z of [-0.6, 0, 0.6]) { const s = new THREE.Sprite(glowR); s.scale.set(0.9, 0.35, 1); s.position.set(REAR - 0.05, 0.86, z); car.add(s); }

  // wheels
  const wheels = [];
  for (const wx of [WF, WR]) for (const s of [-1, 1]) {
    const w = buildWheel(mats, s < 0);
    w.position.set(wx, WHEEL_R, s * TRACK);
    car.add(w); wheels.push(w);
  }

  // speed lines on floor (visible when engine runs)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x8fd43d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = [];
  for (let i = 0; i < (lowPower ? 10 : 18); i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + Math.random() * 1.2, 0.012), i % 3 ? lineMat : lineMat.clone());
    if (!(i % 3)) m.material.color.set(0xe3261f);
    m.rotation.x = -Math.PI / 2;
    m.position.set(Math.random() * 8 - 4, 0.006, (Math.random() < 0.5 ? -1 : 1) * (1.05 + Math.random() * 1.4));
    m.userData.v = 0.6 + Math.random() * 0.8;
    car.add(m); lines.push(m);
  }
  car.position.y = 0.0;
  scene.add(car);

  /* Showroom stage */
  const stage = new THREE.Group(); scene.add(stage);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.6, 0.08, 96), new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.8, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.6 }));
  plat.position.y = -0.04; stage.add(plat);
  const ringLime = new THREE.Mesh(new THREE.TorusGeometry(3.52, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: 0x8fd43d }));
  ringLime.rotation.x = Math.PI / 2; ringLime.position.y = 0.001; stage.add(ringLime);
  const ringRed = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.006, 8, 160, Math.PI * 1.2), new THREE.MeshBasicMaterial({ color: 0xe3261f, transparent: true, opacity: 0.7 }));
  ringRed.rotation.x = Math.PI / 2; ringRed.position.y = 0.002; stage.add(ringRed);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.0), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.95 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; car.add(shadow);
  // floor glow under platform
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(143,212,61,0.35)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.y = -0.085; stage.add(floorGlow);

  // dust particles
  let dust;
  if (mode === 'hero') {
    const n = lowPower ? 140 : 320, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 14; p[i * 3 + 1] = Math.random() * 5; p[i * 3 + 2] = (Math.random() - 0.5) * 10; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.025, color: 0xcfd6dc, transparent: true, opacity: 0.45, depthWrite: false }));
    scene.add(dust);
  }

  /* Lights */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x0a0a0a, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 7, 5); scene.add(key);
  const rimR = new THREE.PointLight(0xff2a1a, 30, 14, 2); rimR.position.set(-4.5, 2.4, -3); scene.add(rimR);
  const rimG = new THREE.PointLight(0x8fd43d, 26, 14, 2); rimG.position.set(4.5, 2.2, -3.4); scene.add(rimG);
  const top = new THREE.SpotLight(0xffffff, 60, 14, 0.6, 0.6, 1.5); top.position.set(0, 6.5, 0); top.target = car; scene.add(top);
  const beam = new THREE.SpotLight(0xe6f0ff, 0, 12, 0.45, 0.7, 1.4); beam.position.set(FRONT, 0.75, 0); beam.target.position.set(FRONT + 6, 0, 0);
  car.add(beam); car.add(beam.target);

  /* State */
  const state = {
    rot: mode === 'hero' ? -0.55 : -0.8, vel: 0, auto: reduce ? 0 : (mode === 'hero' ? 0.12 : 0.18),
    lights: 0, lightsTarget: 0, engine: false, wheelSpeed: 0, shake: 0,
    intro: 0, scroll: 0, px: 0, py: 0, visible: true, paint: 'black', paintT: 1,
    dragging: false, lastX: 0, w: 1, h: 1,
  };

  /* Sizing & framing */
  function frame() {
    const r = container.getBoundingClientRect();
    state.w = Math.max(1, r.width); state.h = Math.max(1, r.height);
    renderer.setSize(state.w, state.h, false);
    camera.aspect = state.w / state.h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(frame); ro.observe(container); frame();

  const target = new THREE.Vector3();
  function placeCamera(dt) {
    const a = camera.aspect;
    const wide = a > 1.15 && state.w > 900;
    // distance that fits the car (≈6.2m incl. margins) horizontally
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * a);
    const span = mode === 'hero' ? (wide ? 7.8 : 6.1) : (wide ? 9.0 : 6.4);
    let dist = (span / 2) / Math.tan(hfov / 2);
    dist = clamp(dist, wide ? 8.5 : 9.5, 26);
    const introK = 1 - smooth(clamp(state.intro, 0, 1));
    dist *= 1 + 0.35 * introK - 0.12 * state.scroll;
    const elev = 0.13 + 0.04 * state.py + 0.1 * introK + 0.1 * state.scroll;
    const az = 0.0 + 0.12 * state.px;
    camera.position.set(Math.sin(az) * dist * Math.cos(elev), 0.7 + Math.sin(elev) * dist, Math.cos(az) * dist * Math.cos(elev));
    target.set(0, 0.62, 0);
    // compose: push car to the right on wide hero, lower on tall screens
    if (mode === 'hero') {
      if (wide) { const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)); target.addScaledVector(right, -dist * (a > 1.7 ? 0.17 : 0.2)); target.y += 0.1; }
      else target.y += dist * 0.035;
    } else {
      if (wide) { const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)); target.addScaledVector(right, -dist * 0.16); }
      else target.y += dist * 0.09;
    }
    camera.lookAt(target);
  }

  /* Paint */
  function setPaint(name) {
    if (!PAINTS[name] || name === state.paint) return;
    state.paint = name;
    const p = PAINTS[name];
    // animate via canvas redraw at end; quick flash of clearcoat for feel
    const old = mats.paint.map;
    mats.paint.map = paintTexture(p.body, p.stripe);
    mats.paint.needsUpdate = true;
    old.dispose();
    mats.paint.metalness = mats.paintSolid.metalness = name === 'silver' ? 0.85 : name === 'sublime' ? 0.45 : 0.55;
    mats.paintSolid.color.set(p.body);
    state.paintT = 0;
  }

  /* Engine */
  function setEngine(on) {
    state.engine = on;
    state.lightsTarget = on ? 1 : (mode === 'hero' ? 0.55 : 0.55);
    if (on) state.shake = 1;
  }

  /* Interaction: horizontal drag rotates; vertical stays native scroll */
  const el = renderer.domElement;
  let startY = 0, decided = false, horizontal = false;
  el.addEventListener('pointerdown', e => { state.dragging = true; decided = false; horizontal = e.pointerType === 'mouse'; state.lastX = e.clientX; startY = e.clientY; if (e.pointerType === 'mouse') el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    state.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    state.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    if (!decided && e.pointerType !== 'mouse') {
      if (Math.abs(dx) + Math.abs(e.clientY - startY) > 8) { decided = true; horizontal = Math.abs(dx) > Math.abs(e.clientY - startY); }
    }
    if (horizontal) { state.vel = dx * 0.006; state.rot += dx * 0.008; }
    state.lastX = e.clientX;
  });
  const end = () => { state.dragging = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointerleave', () => { end(); state.px *= 0.5; state.py *= 0.5; });

  /* Visibility */
  const io = new IntersectionObserver(([en]) => { state.visible = en.isIntersecting; if (state.visible) loop(); }, { threshold: 0.01 });
  io.observe(container);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });

  /* Scroll link (hero only) */
  if (mode === 'hero') {
    const onScroll = () => {
      const r = container.getBoundingClientRect();
      state.scroll = clamp(-r.top / Math.max(1, r.height), 0, 1);
    };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* Loop */
  const clock = new THREE.Clock();
  let raf = 0, running = false, t = 0, idleLights = mode === 'hero' ? 0.55 : 0.6;
  setTimeout(() => { state.lightsTarget = Math.max(state.lightsTarget, idleLights); }, mode === 'hero' ? 900 : 200);
  if (mode !== 'hero') state.intro = 0.6;

  function tick() {
    raf = 0;
    if (!state.visible || document.hidden) { running = false; return; }
    const dt = Math.min(clock.getDelta(), 0.05); t += dt;
    state.intro = Math.min(1, state.intro + dt * 0.55);

    // rotation
    if (!state.dragging) { state.vel *= 0.94; state.rot += state.vel + state.auto * dt * (state.engine ? 0.6 : 1); }
    car.rotation.y = state.rot + state.scroll * 0.9;
    stage.rotation.y = car.rotation.y * 0.3;
    ringRed.rotation.z = t * 0.2;

    // lights (with an ignition flicker)
    let flick = 1;
    if (state.lights < 0.95 && state.lightsTarget > state.lights) flick = 0.6 + 0.4 * Math.abs(Math.sin(t * 38));
    state.lights += (state.lightsTarget - state.lights) * Math.min(1, dt * 3);
    const L = state.lights * flick;
    mats.halo.emissiveIntensity = 3.2 * L;
    glowW.opacity = 0.9 * L;
    mats.tail.emissiveIntensity = 2.5 * L;
    glowR.opacity = 0.7 * L;
    beam.intensity = state.engine ? 40 * L : 0;

    // engine: wheels spin, body shake, speed lines
    state.wheelSpeed += ((state.engine ? 14 : 0) - state.wheelSpeed) * Math.min(1, dt * 1.4);
    for (const w of wheels) w.userData.spin.rotation.z += w.userData.dir * state.wheelSpeed * dt;
    state.shake *= 0.96;
    const idle = state.engine ? 0.0025 : 0;
    body.position.y = cabin.position.y = (Math.sin(t * 60) * (idle + state.shake * 0.01));
    scoop.position.y = 1.015 + body.position.y;
    const k = clamp(state.wheelSpeed / 14, 0, 1);
    for (const m of lines) {
      m.material.opacity = 0.65 * k;
      m.position.x -= m.userData.v * state.wheelSpeed * dt * 0.6;
      if (m.position.x < -5) m.position.x = 5;
    }

    if (dust) { dust.rotation.y = t * 0.02; dust.position.y = Math.sin(t * 0.3) * 0.1; }

    placeCamera(dt);
    renderer.render(scene, camera);
    if (!state.ready) { state.ready = true; container.closest('[data-showroom]')?.classList.add('is-ready'); }
    raf = requestAnimationFrame(tick);
  }
  function loop() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(tick); }
  loop();

  return {
    setPaint, setEngine,
    get engine() { return state.engine; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); renderer.dispose(); },
  };
}

/* ---------- Auto-init ---------- */
function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
document.querySelectorAll('[data-showroom]').forEach(root => {
  const mount = root.querySelector('[data-canvas]');
  if (!mount) return;
  if (!webglOK()) { root.classList.add('no-webgl', 'is-ready'); return; }
  const api = createShowroom(mount, { mode: root.dataset.showroom });
  if (!api) return;
  root.querySelectorAll('[data-paint]').forEach(b => b.addEventListener('click', () => {
    api.setPaint(b.dataset.paint);
    root.querySelectorAll('[data-paint]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
  const eng = root.querySelector('[data-engine-btn]');
  if (eng) eng.addEventListener('click', () => {
    const on = !api.engine; api.setEngine(on);
    eng.classList.toggle('is-on', on);
    eng.setAttribute('aria-pressed', String(on));
    const lbl = eng.querySelector('[data-engine-label]'); if (lbl) lbl.textContent = on ? 'Engine On' : 'Start Engine';
  });
});
