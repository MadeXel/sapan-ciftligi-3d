// Sapan Çiftliği — full-body cozy animal characters, built from code.
// One source for both the live 3D game and the offline UI portraits.
// Unit space: ground at y=0, animal faces +z, footprint fits a circle of radius ~1 (the physics circle).
import * as THREE from './three.module.min.js';
import { bake } from './bake.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const matCache = new Map();
export function mat(color, rough = 0.62, extra) {
  const key = color + rough + (extra ? JSON.stringify(Object.keys(extra)) + (extra.map ? extra.map.uuid : '') : '');
  if (!extra && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...(extra || {}) });
  if (!extra) matCache.set(key, m);
  return m;
}
const mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; };
const sph = (r, m, w = 28, h = 20) => mesh(new THREE.SphereGeometry(r, w, h), m);
const cap = (r, len, m) => mesh(new THREE.CapsuleGeometry(r, len, 8, 20), m);
const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

const EYE = mat('#1C1716', 0.18), WHITE_HL = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
// glossy eyes with two highlights; returns the eye group so the game can blink it (scale.y)
function eyes(head, hr, { spread = 0.42, up = 0.12, fwd = 0.84, size = 0.2, color } = {}) {
  const g = new THREE.Group(); g.name = 'eyes';
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * spread * hr, up * hr, fwd * hr);
    const ball = sph(size * hr, color ? mat(color, 0.18) : EYE, 20, 14); ball.scale.z = 0.55; e.add(ball);
    const h1 = sph(size * hr * 0.36, WHITE_HL, 10, 8); h1.castShadow = false; h1.position.set(-size * hr * 0.3, size * hr * 0.35, size * hr * 0.5); e.add(h1);
    const h2 = sph(size * hr * 0.15, WHITE_HL, 8, 6); h2.castShadow = false; h2.position.set(size * hr * 0.32, -size * hr * 0.3, size * hr * 0.5); e.add(h2);
    e.lookAt(e.position.clone().multiplyScalar(3)); g.add(e);
  }
  head.add(g); return g;
}
function blush(head, hr, { spread = 0.62, up = -0.12, fwd = 0.74, color = '#FF8FA3' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.16 * hr, 20), m); d.position.set(s * spread * hr, up * hr, fwd * hr);
    d.lookAt(d.position.clone().multiplyScalar(3)); head.add(d); }
}

// ---------- generic quadruped rig ----------
// b: body {len, r, color, y (leg length)}, head {r, color, lift, fwd}, leg {r, color, foot}, plus feature callbacks.
function quadruped(o) {
  const root = new THREE.Group(), rig = { legs: [], root };
  const legLen = o.legLen, br = o.bodyR, bl = o.bodyLen;
  const bodyM = o.bodyMat || mat(o.color);
  const body = cap(br, bl, bodyM); body.rotation.x = Math.PI / 2; body.scale.set(o.bodyW || 1, 1, o.bodyH || 1);
  const torso = new THREE.Group(); torso.position.y = legLen + br * (o.bodyH || 1) * 0.92; torso.add(body); torso.name = 'torso'; root.add(torso); rig.torso = torso;
  // legs pivot at the hip so they can swing while walking
  const legM = mat(o.legColor || o.color), footM = mat(o.footColor || o.legColor || o.color, 0.7);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group(); hip.position.set(sx * br * (o.bodyW || 1) * 0.55, legLen + br * 0.3, sz * bl * 0.36);
    const leg = cap(o.legR, Math.max(0.01, legLen - o.legR), legM); leg.position.y = -(legLen + br * 0.3) / 2 + o.legR * 0.2; hip.add(leg);
    const foot = sph(o.legR * 1.12, footM, 14, 10); foot.scale.y = 0.6; foot.position.set(0, -(legLen + br * 0.3) + o.legR * 0.55, o.legR * 0.2); hip.add(foot);
    hip.name = 'leg'; root.add(hip); rig.legs.push(hip);
  }
  // head on a neck pivot so it can bob / look around
  const neck = new THREE.Group(); neck.position.set(0, torso.position.y + br * (o.neckUp ?? 0.55), bl / 2 + br * (o.neckFwd ?? 0.55)); neck.name = 'neck'; root.add(neck); rig.neck = neck;
  const hr = o.headR, head = new THREE.Group(); head.position.set(0, hr * (o.headLift ?? 0.45), hr * (o.headFwd ?? 0.25)); head.name = 'head'; neck.add(head); rig.head = head;
  const skull = sph(hr, o.headMat || mat(o.headColor || o.color), 32, 24); skull.scale.set(o.headSx || 1, o.headSy || 0.95, o.headSz || 1); head.add(skull);
  rig.eyes = eyes(head, hr, o.eyes || {}); if (o.blush !== false) blush(head, hr, o.blushOpt || {});
  // tail pivot at the back
  const tail = new THREE.Group(); tail.position.set(0, torso.position.y + br * 0.35, -bl / 2 - br * 0.75); tail.name = 'tail'; root.add(tail); rig.tail = tail;
  if (o.features) o.features({ root, torso, head, hr, br, bl, legLen, tail, rig });
  root.userData.rig = rig; return root;
}

// ---------- the cast ----------
export const CAST3D = {
  chick() {
    const root = new THREE.Group(), rig = { legs: [], root };
    const torso = new THREE.Group(); torso.name = 'torso'; torso.position.y = 0.72; root.add(torso); rig.torso = torso;
    const b = sph(0.72, mat('#FFD84A', 0.6), 36, 28); b.scale.set(1, 0.95, 1.02); torso.add(b);
    const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.2, 0.18); torso.add(head); rig.head = head; rig.neck = head;
    rig.eyes = eyes(head, 0.7, { spread: 0.36, up: 0.18, fwd: 0.88, size: 0.18 }); blush(head, 0.7, { spread: 0.55, up: -0.02, fwd: 0.8 });
    const beak = mesh(new THREE.ConeGeometry(0.1, 0.2, 14), mat('#FF9A2E', 0.4)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.02, 0.78); head.add(beak);
    for (const [x, rz] of [[0, 0], [-0.1, 0.5], [0.1, -0.5]]) { const f = sph(0.1, mat('#FFC93A')); f.scale.set(0.5, 1.5, 0.5); f.position.set(x, 0.72, 0.05); f.rotation.z = rz; torso.add(f); }
    for (const s of [-1, 1]) { const w = sph(0.26, mat('#FFC93A')); w.scale.set(0.35, 0.8, 0.9); w.position.set(s * 0.68, -0.05, -0.05); w.rotation.z = s * 0.35; torso.add(w); }
    for (const s of [-1, 1]) { const hip = new THREE.Group(); hip.position.set(s * 0.25, 0.2, 0.05);
      const leg = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), mat('#FF9A2E', 0.5)); leg.position.y = -0.1; hip.add(leg);
      const foot = sph(0.1, mat('#FF9A2E', 0.5), 12, 8); foot.scale.set(1, 0.35, 1.4); foot.position.set(0, -0.2, 0.06); hip.add(foot); hip.name = 'leg'; root.add(hip); rig.legs.push(hip); }
    const tail = new THREE.Group(); tail.name = 'tail'; tail.position.set(0, 0.8, -0.7); root.add(tail); rig.tail = tail;
    const tf = sph(0.12, mat('#FFC93A')); tf.scale.set(1, 0.6, 1.3); tail.add(tf);
    root.userData.rig = rig; return root;
  },
  mouse() {
    return quadruped({ color: '#C9C2BC', legLen: 0.26, legR: 0.09, bodyR: 0.5, bodyLen: 0.55, headR: 0.5, legColor: '#E8B8C0', footColor: '#F2A6B6',
      eyes: { spread: 0.36, up: 0.1, size: 0.18 },
      features: ({ head, hr, tail }) => {
        for (const s of [-1, 1]) { const e = mesh(new THREE.CylinderGeometry(0.34 * hr, 0.34 * hr, 0.06, 28), mat('#C9C2BC')); e.rotation.x = Math.PI / 2 - 0.2; e.position.set(s * 0.62 * hr, 0.72 * hr, -0.05); head.add(e);
          const i = mesh(new THREE.CylinderGeometry(0.23 * hr, 0.23 * hr, 0.03, 28), mat('#F4B3C0')); i.rotation.x = Math.PI / 2 - 0.2; i.position.set(s * 0.62 * hr, 0.72 * hr, -0.01); head.add(i); }
        const n = sph(0.1 * hr * 1.4, mat('#F48FA6', 0.4), 14, 10); n.position.set(0, -0.06 * hr, 1.0 * hr); head.add(n);
        for (const s of [-1, 1]) for (const k of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 5), mat('#6B5B55')); w.rotation.z = Math.PI / 2 + s * k * 0.15; w.position.set(s * 0.32 * hr, -0.08 * hr + k * 0.04, 0.9 * hr); head.add(w); }
        const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.1, 0.05, -0.35), V(-0.1, 0.25, -0.6), V(0.05, 0.45, -0.72)]);
        tail.add(mesh(new THREE.TubeGeometry(curve, 20, 0.035, 8), mat('#E8B8C0')));
      } });
  },
  rabbit() {
    return quadruped({ color: '#F4EEF0', legLen: 0.22, legR: 0.12, bodyR: 0.56, bodyLen: 0.35, bodyH: 1.08, headR: 0.5, neckUp: 0.75, neckFwd: 0.35, footColor: '#FFFFFF',
      eyes: { spread: 0.38, up: 0.12, size: 0.19 },
      features: ({ head, hr, tail }) => {
        for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(s * 0.26 * hr, 0.8 * hr, -0.08); g.rotation.set(-0.25, 0, -s * 0.18);
          const e = cap(0.16 * hr, 0.9 * hr, mat('#F4EEF0')); e.position.y = 0.5 * hr; g.add(e);
          const i = cap(0.08 * hr, 0.7 * hr, mat('#F7B7C3')); i.position.set(0, 0.5 * hr, 0.1 * hr); g.add(i); head.add(g); }
        const n = sph(0.08 * hr * 1.4, mat('#F48FA6', 0.4), 14, 10); n.scale.set(1.3, 0.8, 1); n.position.set(0, -0.08 * hr, 0.98 * hr); head.add(n);
        for (const s of [-1, 1]) { const t = mesh(new THREE.BoxGeometry(0.07, 0.09, 0.03), mat('#FFFFFF', 0.3)); t.position.set(s * 0.04, -0.28 * hr, 0.92 * hr); head.add(t); }
        tail.add(sph(0.2, mat('#FFFFFF', 0.9), 16, 12));
      } });
  },
  cat() {
    const stripes = tex(512, 256, (c, w, h) => { c.fillStyle = '#F4A445'; c.fillRect(0, 0, w, h); c.fillStyle = '#DA7E28';
      for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(w * (i / 14), h * 0.3, 11, 54, 0, 0, 7); c.fill(); } c.fillStyle = '#FFF1DA'; c.fillRect(0, h * 0.78, w, h * 0.22); });
    return quadruped({ color: '#F4A445', bodyMat: mat('#FFFFFF', 0.62, { map: stripes }), legLen: 0.32, legR: 0.12, bodyR: 0.46, bodyLen: 0.6, headR: 0.52, legColor: '#F4A445', footColor: '#FFF1DA',
      eyes: { spread: 0.38, up: 0.12, size: 0.18, color: '#2A2016' },
      features: ({ head, hr, tail }) => {
        for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.28 * hr, 0.5 * hr, 4), mat('#F4A445')); e.position.set(s * 0.52 * hr, 0.78 * hr, 0); e.rotation.set(0, Math.PI / 4, -s * 0.28); head.add(e);
          const i = mesh(new THREE.ConeGeometry(0.15 * hr, 0.3 * hr, 4), mat('#F7B7C3')); i.position.set(s * 0.5 * hr, 0.74 * hr, 0.1 * hr); i.rotation.set(0, Math.PI / 4, -s * 0.28); head.add(i); }
        const muz = sph(0.34 * hr, mat('#FFF1DA'), 20, 14); muz.scale.set(1.2, 0.7, 0.6); muz.position.set(0, -0.22 * hr, 0.82 * hr); head.add(muz);
        const n = mesh(new THREE.ConeGeometry(0.07 * hr * 1.4, 0.08, 3), mat('#F48FA6', 0.4)); n.rotation.x = Math.PI / 2 + 0.6; n.position.set(0, -0.08 * hr, 0.99 * hr); head.add(n);
        for (let i = 0; i < 3; i++) { const s = mesh(new THREE.BoxGeometry(0.035, 0.18, 0.02), mat('#DA7E28')); s.position.set((i - 1) * 0.12 * hr, 0.72 * hr, 0.62 * hr); s.rotation.x = -0.7; head.add(s); }
        const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.2, -0.25), V(0, 0.6, -0.35), V(0.08, 0.85, -0.2)]);
        tail.add(mesh(new THREE.TubeGeometry(curve, 20, 0.08, 10), mat('#F4A445')));
      } });
  },
  dog() {
    return quadruped({ color: '#E0A868', legLen: 0.36, legR: 0.13, bodyR: 0.48, bodyLen: 0.7, headR: 0.55, footColor: '#FFF4E2',
      eyes: { spread: 0.38, up: 0.16, size: 0.18 },
      features: ({ head, hr, tail, torso, br }) => {
        const muz = sph(0.38 * hr, mat('#FFF4E2'), 20, 14); muz.scale.set(1.15, 0.78, 0.8); muz.position.set(0, -0.22 * hr, 0.8 * hr); head.add(muz);
        const n = sph(0.12 * hr * 1.3, mat('#2A1E1A', 0.18), 14, 10); n.scale.set(1.3, 0.9, 1); n.position.set(0, -0.08 * hr, 1.1 * hr); head.add(n);
        const tg = sph(0.08 * hr * 1.4, mat('#F4738F', 0.4), 12, 10); tg.scale.set(1, 1.3, 0.5); tg.position.set(0.05, -0.42 * hr, 1.0 * hr); head.add(tg);
        const spot = sph(0.3 * hr, mat('#8A5A34')); spot.scale.set(1, 0.9, 0.4); spot.position.set(0.32 * hr, 0.35 * hr, 0.8 * hr); spot.lookAt(0, 0, 3); head.add(spot);
        for (const s of [-1, 1]) { const e = sph(0.3 * hr, mat('#8A5A34')); e.scale.set(0.5, 1.15, 0.3); e.position.set(s * 0.9 * hr, 0.1 * hr, 0.05); e.rotation.z = s * 0.35; head.add(e); }
        const back = sph(br * 0.7, mat('#8A5A34')); back.scale.set(1, 0.4, 1.2); back.position.set(0.15, br * 0.75, -0.1); torso.add(back);
        const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.25, -0.18), V(0, 0.5, -0.12)]);
        tail.add(mesh(new THREE.TubeGeometry(curve, 16, 0.08, 10), mat('#E0A868'))); tail.userData.wag = 1;
      } });
  },
  pig() {
    return quadruped({ color: '#F7AFC0', legLen: 0.26, legR: 0.14, bodyR: 0.6, bodyLen: 0.55, bodyW: 1.05, headR: 0.55, neckUp: 0.3, neckFwd: 0.35, headLift: 0.2, footColor: '#B8566F',
      eyes: { spread: 0.4, up: 0.2, size: 0.16 }, blushOpt: { color: '#FF6F8C' },
      features: ({ head, hr, tail }) => {
        const sn = mesh(new THREE.CylinderGeometry(0.28 * hr, 0.3 * hr, 0.22 * hr, 28), mat('#F28AA5', 0.45)); sn.rotation.x = Math.PI / 2; sn.position.set(0, -0.12 * hr, 0.98 * hr); head.add(sn);
        for (const s of [-1, 1]) { const n = sph(0.06 * hr, mat('#B8566F', 0.5), 10, 8); n.scale.z = 0.4; n.position.set(s * 0.1 * hr, -0.12 * hr, 1.1 * hr); head.add(n); }
        for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.26 * hr, 0.42 * hr, 3), mat('#F29AB0')); e.scale.z = 0.45; e.position.set(s * 0.58 * hr, 0.68 * hr, 0.25 * hr); e.rotation.set(1.1, 0, -s * 0.5); head.add(e); }
        const curve = new THREE.CatmullRomCurve3(Array.from({ length: 14 }, (_, i) => { const a = i * 0.9; return V(Math.cos(a) * 0.1, i * 0.018 + Math.sin(a) * 0.1, -i * 0.012); }));
        tail.add(mesh(new THREE.TubeGeometry(curve, 40, 0.035, 8), mat('#F29AB0')));
      } });
  },
  sheep() {
    const woolM = mat('#F7F3EA', 0.95);
    return quadruped({ color: '#F7F3EA', bodyMat: woolM, legLen: 0.32, legR: 0.1, bodyR: 0.55, bodyLen: 0.55, headR: 0.44, legColor: '#4E3F3A', headColor: '#5E4C46',
      eyes: { spread: 0.36, up: 0.08, size: 0.2 }, blushOpt: { spread: 0.55, up: -0.25 },
      features: ({ torso, head, hr, br, bl, tail }) => {
        let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 46; i++) { const u = Math.acos(1 - 2 * r()), v = r() * 6.283, d = V(Math.sin(u) * Math.cos(v), Math.cos(u), Math.sin(u) * Math.sin(v));
          const b = sph(0.22 + r() * 0.08, woolM, 14, 10); b.position.set(d.x * br * 1.02, Math.abs(d.y) * br * 0.95 - 0.05, d.z * (bl / 2 + br) * 0.95); torso.add(b); }
        for (let i = 0; i < 7; i++) { const b = sph(0.13, woolM, 12, 8); const a = i / 7 * Math.PI * 2; b.position.set(Math.cos(a) * 0.28 * hr, 0.72 * hr + Math.sin(a) * 0.1, 0.1 * hr + Math.sin(a) * 0.12); head.add(b); }
        for (const k of [-1, 1]) { const e = sph(0.2 * hr, mat('#5E4C46')); e.scale.set(1.6, 0.55, 0.6); e.position.set(k * 0.95 * hr, 0.18 * hr, 0); e.rotation.z = k * -0.35; head.add(e); }
        tail.add(sph(0.18, woolM, 12, 10));
      } });
  },
  horse() {
    return quadruped({ color: '#B97E50', legLen: 0.55, legR: 0.12, bodyR: 0.44, bodyLen: 0.78, headR: 0.36, headSx: 0.95, headSz: 1.3, neckUp: 1.05, neckFwd: 0.2, headLift: 1.15, headFwd: 0.55, footColor: '#3F2A16',
      eyes: { spread: 0.5, up: 0.25, size: 0.2, fwd: 0.72 },
      features: ({ head, hr, neck, tail, rig }) => {
        const nk = cap(0.22, 0.42, mat('#B97E50')); nk.position.set(0, 0.2, 0.08); nk.rotation.x = 0.45; rig.neck.add(nk);
        const muz = sph(0.42 * hr, mat('#E8C39A')); muz.scale.set(1.05, 0.8, 0.9); muz.position.set(0, -0.28 * hr, 1.0 * hr); head.add(muz);
        for (const s of [-1, 1]) { const n = sph(0.05 * hr, mat('#6B4222', 0.5), 10, 8); n.position.set(s * 0.14 * hr, -0.26 * hr, 1.36 * hr); head.add(n); }
        for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.14 * hr, 0.4 * hr, 4), mat('#B97E50')); e.position.set(s * 0.36 * hr, 0.9 * hr, -0.1); e.rotation.z = -s * 0.2; head.add(e); }
        const mane = mat('#5A361E', 0.7);
        for (let i = 0; i < 6; i++) { const m = sph(0.12, mane, 14, 10); m.scale.set(0.7, 1.1, 1.1); m.position.set(0, 0.62 - i * 0.1, -0.02 - i * 0.07); rig.neck.add(m); }
        const fl = sph(0.14, mane, 14, 10); fl.scale.set(1.3, 0.6, 1); fl.position.set(0.05, 0.9 * hr, 0.35 * hr); fl.rotation.z = -0.4; head.add(fl);
        const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.2, -0.2), V(0, -0.55, -0.22)]);
        tail.add(mesh(new THREE.TubeGeometry(curve, 16, 0.1, 10), mane));
      } });
  },
  cow() {
    const spots = tex(512, 256, (c, w, h) => { c.fillStyle = '#FBFAF6'; c.fillRect(0, 0, w, h); c.fillStyle = '#2E2624'; let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (const [x, y, rr] of [[0.15, 0.35, 44], [0.42, 0.5, 38], [0.7, 0.3, 46], [0.9, 0.62, 30], [0.3, 0.12, 26], [0.58, 0.72, 30]]) { c.beginPath(); for (let a = 0; a < 6.3; a += 0.4) { const q = rr * (0.75 + r() * 0.45); c.lineTo(x * w + Math.cos(a) * q * 1.3, y * h + Math.sin(a) * q); } c.fill(); } });
    return quadruped({ color: '#FBFAF6', bodyMat: mat('#FFFFFF', 0.62, { map: spots }), legLen: 0.42, legR: 0.14, bodyR: 0.56, bodyLen: 0.75, bodyW: 1.05, headR: 0.5, headSz: 1.1, footColor: '#3A2E2A',
      eyes: { spread: 0.46, up: 0.2, size: 0.17 },
      features: ({ head, hr, tail }) => {
        const muz = sph(0.46 * hr, mat('#F6B6C4', 0.45)); muz.scale.set(1.2, 0.75, 0.75); muz.position.set(0, -0.3 * hr, 0.85 * hr); head.add(muz);
        for (const s of [-1, 1]) { const n = sph(0.06 * hr, mat('#B8566F', 0.5), 10, 8); n.position.set(s * 0.16 * hr, -0.28 * hr, 1.18 * hr); head.add(n); }
        for (const s of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(0.08 * hr * 1.4, 0.36 * hr, 14), mat('#F4E6C8', 0.4)); h.position.set(s * 0.45 * hr, 0.9 * hr, 0); h.rotation.z = -s * 0.55; head.add(h);
          const e = sph(0.22 * hr, mat('#2E2624')); e.scale.set(1.6, 0.55, 0.7); e.position.set(s * 0.95 * hr, 0.35 * hr, 0); e.rotation.z = s * 0.3; head.add(e); }
        const tuft = sph(0.14 * hr, mat('#2E2624')); tuft.position.set(0, 0.95 * hr, 0.25 * hr); head.add(tuft);
        const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.25, -0.12), V(0, -0.5, -0.1)]);
        tail.add(mesh(new THREE.TubeGeometry(curve, 12, 0.04, 8), mat('#FBFAF6'))); const tt = sph(0.08, mat('#2E2624')); tt.position.set(0, -0.52, -0.1); tail.add(tt);
      } });
  },
  elephant() {
    return quadruped({ color: '#A9B7C9', legLen: 0.4, legR: 0.2, bodyR: 0.62, bodyLen: 0.6, bodyW: 1.05, headR: 0.58, neckUp: 0.6, neckFwd: 0.3, footColor: '#8E9BAD',
      eyes: { spread: 0.44, up: 0.24, size: 0.15 },
      features: ({ head, hr, tail }) => {
        for (const s of [-1, 1]) { const e = sph(0.62 * hr, mat('#A9B7C9')); e.scale.set(0.2, 1.05, 0.95); e.position.set(s * 0.95 * hr, 0.08 * hr, -0.1 * hr); e.rotation.y = s * 0.5; head.add(e);
          const i = sph(0.46 * hr, mat('#E6B7C3')); i.scale.set(0.12, 0.95, 0.85); i.position.set(s * 1.0 * hr, 0.08 * hr, 0.02 * hr); i.rotation.y = s * 0.5; head.add(i); }
        const curve = new THREE.CatmullRomCurve3([V(0, -0.1 * hr, 0.8 * hr), V(0, -0.5 * hr, 1.15 * hr), V(0, -0.95 * hr, 1.2 * hr), V(0, -1.2 * hr, 1.45 * hr)]);
        head.add(mesh(new THREE.TubeGeometry(curve, 28, 0.16 * hr, 14), mat('#A9B7C9')));
        for (const s of [-1, 1]) { const t = mesh(new THREE.ConeGeometry(0.06, 0.32, 12), mat('#FFF8EA', 0.35)); t.position.set(s * 0.28 * hr, -0.45 * hr, 0.9 * hr); t.rotation.x = 2.3; head.add(t); }
        const curve2 = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.25, -0.1), V(0, -0.45, -0.08)]);
        tail.add(mesh(new THREE.TubeGeometry(curve2, 12, 0.04, 8), mat('#A9B7C9')));
      } });
  },
  whale() {
    const root = new THREE.Group(), rig = { legs: [], root };
    const skin = tex(512, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4E9FE0'); g.addColorStop(0.6, '#5DB0EE'); g.addColorStop(0.62, '#E2F3FF'); g.addColorStop(1, '#E2F3FF'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    // a little puddle so the whale is comfy on the lawn
    const pud = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshStandardMaterial({ color: '#8FD3F5', roughness: 0.08, transparent: true, opacity: 0.75 }));
    pud.rotation.x = -Math.PI / 2; pud.position.y = 0.01; pud.scale.set(1, 0.85, 1); pud.receiveShadow = true; pud.name = 'puddle'; root.add(pud); rig.puddle = pud;
    const torso = new THREE.Group(); torso.name = 'torso'; torso.position.y = 0.6; root.add(torso); rig.torso = torso;
    const b = sph(0.8, mat('#FFFFFF', 0.45, { map: skin }), 40, 30); b.scale.set(1, 0.78, 1.18); torso.add(b);
    const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.05, 0.35); torso.add(head); rig.head = head; rig.neck = head;
    rig.eyes = eyes(head, 0.75, { spread: 0.62, up: 0.02, fwd: 0.78, size: 0.14 }); blush(head, 0.75, { spread: 0.8, up: -0.14, fwd: 0.6 });
    for (const s of [-1, 1]) { const m = mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16, Math.PI), mat('#27456A', 0.5)); m.position.set(s * 0.08, -0.16, 0.72); m.rotation.z = Math.PI; head.add(m); }
    for (const s of [-1, 1]) { const f = sph(0.26, mat('#4E9FE0', 0.45)); f.scale.set(1.3, 0.25, 0.7); f.position.set(s * 0.82, -0.3, 0.2); f.rotation.z = s * -0.4; torso.add(f); }
    const tail = new THREE.Group(); tail.name = 'tail'; tail.position.set(0, 0.35, -0.95); torso.add(tail); rig.tail = tail;
    const stem = cap(0.18, 0.3, mat('#4E9FE0', 0.45)); stem.rotation.x = 0.8; tail.add(stem);
    for (const s of [-1, 1]) { const f = sph(0.26, mat('#4E9FE0', 0.45)); f.scale.set(1.3, 0.22, 0.7); f.position.set(s * 0.22, 0.28, -0.15); f.rotation.y = s * 0.4; tail.add(f); }
    const water = new THREE.MeshStandardMaterial({ color: '#CDEFFF', roughness: 0.1, transparent: true, opacity: 0.9 });
    const spout = new THREE.Group(); spout.name = 'spout'; spout.position.set(0, 0.62, 0.1); torso.add(spout); rig.spout = spout;
    for (const [x, y, r] of [[0, 0.1, 0.09], [-0.12, 0.26, 0.07], [0.12, 0.27, 0.07], [0, 0.38, 0.06]]) { const d = sph(r, water, 12, 8); d.castShadow = false; d.position.set(x, y, 0); spout.add(d); }
    root.userData.rig = rig; return root;
  },
  unicorn() {
    const g = CAST3D.horse(), rig = g.userData.rig;
    g.traverse(o => { if (o.isMesh && o.material && o.material.color) { const hex = '#' + o.material.color.getHexString();
      if (hex === '#b97e50') o.material = mat('#FFF7FB'); else if (hex === '#e8c39a') o.material = mat('#FBE3EE'); else if (hex === '#5a361e') o.material = mat('#C3A6FF', 0.6); else if (hex === '#3f2a16') o.material = mat('#F2C14E', 0.4); } });
    const cols = ['#FF8FB1', '#FFC76B', '#FFE66E', '#8FE3A8', '#8FCBFF', '#C3A6FF']; let i = 0;
    g.traverse(o => { if (o.isMesh && o.material === mat('#C3A6FF', 0.6)) o.material = mat(cols[i++ % 6], 0.6); });
    const horn = new THREE.Group(); const cone = mesh(new THREE.ConeGeometry(0.08, 0.45, 20), mat('#F4C65A', 0.3)); cone.position.y = 0.22; horn.add(cone);
    for (let k = 0; k < 4; k++) { const r = mesh(new THREE.TorusGeometry(0.07 - k * 0.015, 0.012, 6, 16), mat('#DDA02A', 0.3)); r.position.y = 0.06 + k * 0.1; r.rotation.x = Math.PI / 2; horn.add(r); }
    horn.position.set(0, 0.42, 0.3); horn.rotation.x = 0.35; rig.head.add(horn);
    return g;
  },
};
export const CAST_KEYS = ['chick', 'mouse', 'rabbit', 'cat', 'dog', 'pig', 'sheep', 'horse', 'cow', 'elephant', 'whale'];

const RIG_PARTS = new Set(['torso', 'neck', 'head', 'leg', 'tail', 'eyes', 'spout', 'puddle']);
// Build each character once, then hand out cheap clones (shared geometry & materials).
const PROTO = {};
export function spawnAnimal(key) {
  if (!PROTO[key]) { const p = CAST3D[key](); const r0 = p.userData.rig; p.userData = { wag: !!(r0.tail && r0.tail.userData.wag) };
    bake(p, RIG_PARTS); PROTO[key] = p; }
  const o = PROTO[key].clone(true), rig = { legs: [], root: o };
  o.traverse(n => { if (n.name === 'leg') rig.legs.push(n); else if (n.name && !rig[n.name]) rig[n.name] = n; });
  if (!rig.neck) rig.neck = rig.head;
  o.userData = { rig, key };
  if (rig.tail) rig.tail.userData.wag = PROTO[key].userData.wag;
  return o;
}
