// Sapan Çiftliği — real-time 3D view. The game logic (physics, scoring, anti-cheat replay) is untouched:
// this module only *draws* the state it is given. Game units /10 = scene units; game x → X, game y → Z.
import * as THREE from './three.module.min.js';
import { spawnAnimal, mat } from './animals3d.js';
import { bake } from './bake.js';

const U = 0.1; // game unit → scene unit
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(7);
// place an object: position (and optional rotation / scale) — three.js vectors are read-only properties
const setp = (o, pos, rot, scl) => { o.position.copy(pos); if (rot) o.rotation.copy(rot); if (scl) o.scale.copy(scl); return o; };
const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };

// ---------- biomes: each cosmetic theme becomes a little world around the pen ----------
const BIOME = {
  cayir:   { grass: ['#6FB358', '#66A84F'], outer: '#79B85C', outer2: '#5E9E48', hay: '#D9B36B', straw: ['#EFCB7E', '#B8904C'], rail: '#A0683A', post: '#7A4B24', fl: ['#FFF6D6', '#FFD84D', '#F7B6D2'],
             trees: ['pine', 'pine', 'round'], leaf: ['#4F9A3E', '#5EAE48', '#3F8A34'], extra: 'mushroom', sky: '#BFE6F5' },
  sonbahar:{ grass: ['#A99A46', '#B6A64F'], outer: '#A99040', outer2: '#8C7A34', hay: '#C98E52', straw: ['#E3AE70', '#9C6A38'], rail: '#A0683A', post: '#6A3F1E', fl: ['#D9582B', '#E89A2E', '#A23A1C'],
             trees: ['round', 'round', 'pine'], leaf: ['#E0662C', '#E89A2E', '#C8452A', '#F2B441'], extra: 'pumpkin', sky: '#F6D2A8' },
  kis:     { grass: ['#E4EDF4', '#EDF3F8'], outer: '#EEF4F9', outer2: '#D8E4EE', hay: '#C6DAE9', straw: ['#FFFFFF', '#A2BCD1'], rail: '#8C6A4A', post: '#5E4632', fl: ['#FFFFFF', '#CFE2F0'],
             trees: ['snowpine', 'snowpine', 'snowpine'], leaf: ['#3F7A5A', '#4C8A66'], extra: 'snowman', sky: '#D8E9F5' },
  lavanta: { grass: ['#8A78BE', '#9483C6'], outer: '#8FB86A', outer2: '#7AA85A', hay: '#D8C08A', straw: ['#F0DDA8', '#AE9458'], rail: '#B07A45', post: '#6B4A2A', fl: ['#EDE6FF', '#C7B5F2', '#FFFFFF'],
             trees: ['birch', 'lavender', 'lavender'], leaf: ['#9C86D6', '#B6A2E8', '#7E68BE'], extra: 'beehive', sky: '#E6DDF7' },
  altin:   { grass: ['#D2AA45', '#DCB651'], outer: '#D8B45A', outer2: '#C49A3E', hay: '#B7874A', straw: ['#E2B774', '#8C6330'], rail: '#E0B83A', post: '#9C7A1C', fl: ['#FFF3B0', '#F4D35E', '#FFFFFF'],
             trees: ['wheat', 'wheat', 'round'], leaf: ['#E8C14E', '#D9A93A'], extra: 'haybale', sky: '#FBE7B5' },
};
const TOD = {
  day:     { sky: null, key: '#FFF1D8', keyI: 2.5, hemiS: '#DCEFFF', hemiG: '#7DAF5C', hemiI: 1.15, fog: 0, lamps: false, exposure: 1.0 },
  morning: { sky: '#F9E2C4', key: '#FFE2B8', keyI: 2.3, hemiS: '#FFE6CC', hemiG: '#7DAF5C', hemiI: 1.05, fog: 0, lamps: false, exposure: 1.0 },
  evening: { sky: '#F2A874', key: '#FFB077', keyI: 2.0, hemiS: '#FFC89A', hemiG: '#6A7E44', hemiI: 0.9, fog: 0, lamps: true, exposure: 1.0 },
  night:   { sky: '#1B2A4A', key: '#A9BEFF', keyI: 0.9, hemiS: '#5A6FA8', hemiG: '#2A3A34', hemiI: 0.75, fog: 0, lamps: true, exposure: 1.1 },
};

function canvasTex(w, h, draw, repeat) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); } return t; }

export function create3D(canvas, { W, H, F, DANGER_Y, SL }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
  const hemi = new THREE.HemisphereLight('#DCEFFF', '#7DAF5C', 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF1D8', 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 }); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  const CX = W * U / 2, CZ = H * U / 2; sun.target.position.set(CX, 0, CZ); sun.position.set(CX - 30, 50, CZ + 38); scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#FFFFFF', 0.45); rim.position.set(CX + 30, 25, CZ - 40); scene.add(rim);

  const world = new THREE.Group(); scene.add(world);
  const actors = new THREE.Group(); scene.add(actors);
  const fx = new THREE.Group(); scene.add(fx);
  let biomeId = null, todId = 'day', lamps = [], flies = null, skyCol = new THREE.Color('#BFE6F5');

  // ---------- pen floor: striped lawn + hay zone inside the fence ----------
  function penTexture(B) {
    return canvasTex(840, 1440, (g, w, h) => { g.scale(2, 2); let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let y = 0, i = 0; y < 720; y += 40, i++) { g.fillStyle = B.grass[i % 2]; g.fillRect(0, y, 420, 40); }
      for (let i = 0; i < 220; i++) { const x = r() * 420, y = r() * 570, rr = 6 + r() * 24, gr = g.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, r() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 4000; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; g.fillRect(r() * 420, r() * 570, 1, 2.5); }
      g.fillStyle = B.hay; g.fillRect(0, DANGER_Y, 420, 720 - DANGER_Y);
      for (let i = 0; i < 2200; i++) { const x = r() * 420, y = DANGER_Y + r() * (720 - DANGER_Y), a = r() * Math.PI, l = 4 + r() * 9; g.strokeStyle = B.straw[r() < .5 ? 0 : 1]; g.globalAlpha = .7; g.lineWidth = .9;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } g.globalAlpha = 1;
      const sh = g.createLinearGradient(0, DANGER_Y, 0, DANGER_Y + 16); sh.addColorStop(0, 'rgba(60,40,10,.28)'); sh.addColorStop(1, 'rgba(60,40,10,0)'); g.fillStyle = sh; g.fillRect(0, DANGER_Y, 420, 16);
      g.strokeStyle = 'rgba(110,70,25,.33)'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const x of [70, 140, 280, 350]) for (const y of [DANGER_Y + 40, DANGER_Y + 95]) { g.beginPath(); g.moveTo(x - 12, y + 7); g.lineTo(x, y - 5); g.lineTo(x + 12, y + 7); g.stroke(); }
      for (const [x0, y0, x1, y1, ww, hh] of [[0, 0, 22, 0, 22, 720], [420, 0, 398, 0, 22, 720], [0, 0, 0, 22, 420, 22]]) { const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(20,30,10,.28)'); gr.addColorStop(1, 'rgba(20,30,10,0)'); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), ww, hh); }
    });
  }
  function outerTexture(B) {
    return canvasTex(512, 512, (g, w, h) => { let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      g.fillStyle = B.outer; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h, rr = 20 + r() * 60, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, B.outer2 + '66'); gr.addColorStop(1, B.outer2 + '00'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 3000; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'; g.fillRect(r() * w, r() * h, 1.5, 3); }
    }, [14, 14]);
  }

  // ---------- props ----------
  const P = {
    pine(B, s) { const g = new THREE.Group(); g.add(setp(mesh(new THREE.CylinderGeometry(.18, .26, 1.2, 8), mat('#7A4B24', .9)), V(0, .6, 0), undefined, undefined));
      for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(1.5 - i * .38, 1.7, 9), mat(B.leaf[i % B.leaf.length], .85, { flatShading: true })); c.position.y = 1.5 + i * 1.05; c.rotation.y = i; g.add(c); }
      g.scale.setScalar(s); return g; },
    snowpine(B, s) { const g = P.pine(B, 1); const snow = mat('#FFFFFF', .9, { flatShading: true });
      for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry((1.5 - i * .38) * .62, .7, 9), snow); c.position.y = 1.95 + i * 1.05; c.rotation.y = i; g.add(c); } g.scale.setScalar(s); return g; },
    round(B, s) { const g = new THREE.Group(); g.add(setp(mesh(new THREE.CylinderGeometry(.16, .24, 1.6, 8), mat('#7A4B24', .9)), V(0, .8, 0), undefined, undefined));
      for (const [x, y, z, r] of [[0, 2.1, 0, 1.1], [-.6, 1.8, .2, .8], [.6, 1.85, -.1, .85], [.1, 2.7, -.1, .75]]) { const b = mesh(new THREE.IcosahedronGeometry(r, 1), mat(B.leaf[Math.floor(rnd() * B.leaf.length)], .85, { flatShading: true })); b.position.set(x, y, z); g.add(b); }
      g.scale.setScalar(s); return g; },
    birch(B, s) { const g = new THREE.Group(); g.add(setp(mesh(new THREE.CylinderGeometry(.12, .16, 2.4, 8), mat('#F2EEE6', .8)), V(0, 1.2, 0), undefined, undefined));
      for (const [x, y, z, r] of [[0, 2.6, 0, .9], [-.4, 2.2, .2, .6], [.45, 2.3, 0, .65]]) { const b = mesh(new THREE.IcosahedronGeometry(r, 1), mat('#8FC46A', .85, { flatShading: true })); b.position.set(x, y, z); g.add(b); }
      g.scale.setScalar(s); return g; },
    lavender(B, s) { const g = new THREE.Group(); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, st = mesh(new THREE.CapsuleGeometry(.1, .5, 4, 8), mat(B.leaf[i % 3], .8)); st.position.set(Math.cos(a) * .35, .55 + (i % 3) * .1, Math.sin(a) * .35); st.rotation.set(Math.sin(a) * .25, 0, Math.cos(a) * .25); g.add(st); }
      g.add(setp(mesh(new THREE.SphereGeometry(.45, 10, 8), mat('#6E9A4E', .9)), V(0, .2, 0), undefined, V(1, .5, 1))); g.scale.setScalar(s * 1.3); return g; },
    wheat(B, s) { const g = new THREE.Group(), stalkM = mat('#E3BE5A', .8), headM = mat('#D9A93A', .7);
      for (let i = 0; i < 14; i++) { const x = (rnd() - .5) * 1.4, z = (rnd() - .5) * 1.4, st = mesh(new THREE.CylinderGeometry(.03, .03, 1.2, 5), stalkM, false); st.position.set(x, .6, z); st.rotation.z = (rnd() - .5) * .2; g.add(st);
        const hd = mesh(new THREE.CapsuleGeometry(.07, .22, 4, 6), headM); hd.position.set(x, 1.25, z); g.add(hd); } g.scale.setScalar(s * 1.2); return g; },
    rock(B, s) { const r = mesh(new THREE.DodecahedronGeometry(.6, 0), mat('#A9A195', .9, { flatShading: true })); r.scale.set(s, s * .6, s * .8); r.position.y = .2 * s; r.rotation.y = rnd() * 3; return r; },
    flower(B) { const g = new THREE.Group(), c = B.fl[Math.floor(rnd() * B.fl.length)];
      for (let p = 0; p < 5; p++) { const pe = mesh(new THREE.SphereGeometry(.12, 8, 6), mat(c, .6), false); pe.scale.y = .5; pe.position.set(Math.cos(p * 1.26) * .15, .25, Math.sin(p * 1.26) * .15); g.add(pe); }
      g.add(setp(mesh(new THREE.SphereGeometry(.09, 8, 6), mat('#E0A020', .5), false), V(0, .28, 0), undefined, undefined));
      g.add(setp(mesh(new THREE.CylinderGeometry(.02, .02, .25, 4), mat('#4F8E3E'), false), V(0, .12, 0), undefined, undefined)); return g; },
    mushroom() { const g = new THREE.Group(); g.add(setp(mesh(new THREE.CylinderGeometry(.12, .15, .4, 10), mat('#FFF6E6')), V(0, .2, 0), undefined, undefined));
      const cap = mesh(new THREE.SphereGeometry(.34, 16, 10, 0, 6.3, 0, 1.6), mat('#D9483B', .5)); cap.position.y = .4; g.add(cap);
      for (let i = 0; i < 5; i++) { const d = mesh(new THREE.SphereGeometry(.05, 8, 6), mat('#FFFFFF'), false); const a = i * 1.3; d.position.set(Math.cos(a) * .2, .62, Math.sin(a) * .2); g.add(d); } g.scale.setScalar(1.4); return g; },
    pumpkin() { const g = new THREE.Group(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, s = mesh(new THREE.SphereGeometry(.42, 14, 10), mat('#E8872E', .6)); s.scale.set(.55, .8, .55); s.position.set(Math.cos(a) * .25, .34, Math.sin(a) * .25); g.add(s); }
      g.add(setp(mesh(new THREE.CylinderGeometry(.05, .07, .3, 6), mat('#5E7A2E')), V(0, .72, 0), undefined, undefined)); g.scale.setScalar(1.5); return g; },
    snowman() { const g = new THREE.Group(), snow = mat('#FFFFFF', .85);
      for (const [y, r] of [[.6, .65], [1.45, .48], [2.1, .34]]) g.add(setp(mesh(new THREE.SphereGeometry(r, 20, 14), snow), V(0, y, 0), undefined, undefined));
      const nose = mesh(new THREE.ConeGeometry(.07, .4, 10), mat('#F28C28', .5)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.1, .45); g.add(nose);
      for (const x of [-.12, .12]) g.add(setp(mesh(new THREE.SphereGeometry(.045, 8, 6), mat('#222222', .3)), V(x, 2.2, .3), undefined, undefined));
      const sc = mesh(new THREE.TorusGeometry(.36, .09, 8, 20), mat('#C8453A', .8)); sc.rotation.x = Math.PI / 2; sc.position.y = 1.8; g.add(sc);
      const hat = mesh(new THREE.CylinderGeometry(.24, .24, .42, 16), mat('#2B2118', .6)); hat.position.y = 2.55; g.add(hat); g.add(setp(mesh(new THREE.CylinderGeometry(.38, .38, .05, 16), mat('#2B2118', .6)), V(0, 2.35, 0), undefined, undefined));
      g.scale.setScalar(1.3); return g; },
    beehive() { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const t = mesh(new THREE.TorusGeometry(.5 - i * .1, .18, 10, 20), mat('#E8B84A', .7)); t.rotation.x = Math.PI / 2; t.position.y = .2 + i * .3; g.add(t); }
      g.add(setp(mesh(new THREE.CircleGeometry(.12, 12), mat('#3A2412')), V(0, .35, .6), undefined, undefined)); g.scale.setScalar(1.3); return g; },
    haybale() { const b = mesh(new THREE.CylinderGeometry(.8, .8, 1.3, 20), mat('#E7BE5C', .9)); b.rotation.z = Math.PI / 2; b.position.y = .8; const g = new THREE.Group(); g.add(b);
      for (const x of [-.35, .35]) { const r = mesh(new THREE.TorusGeometry(.81, .04, 6, 24), mat('#9C6A2E')); r.rotation.y = Math.PI / 2; r.position.set(x, .8, 0); g.add(r); } return g; },
  };

  function buildWorld(id) {
    world.clear(); lamps = []; const B = BIOME[id] || BIOME.cayir;
    const outer = mesh(new THREE.PlaneGeometry(260, 260), mat('#FFFFFF', 1, { map: outerTexture(B) }), false); outer.rotation.x = -Math.PI / 2; outer.position.set(CX, -0.02, CZ); world.add(outer);
    const floor = mesh(new THREE.PlaneGeometry(W * U, H * U), mat('#FFFFFF', 1, { map: penTexture(B) }), false); floor.rotation.x = -Math.PI / 2; floor.position.set(CX, 0, CZ); world.add(floor);
    // fence with lantern posts at the corners
    const postM = mat(B.post, .8), railM = mat(B.rail, .75), capM = mat('#3F2A16', .7), e = F * U / 2, w = W * U, h = H * U;
    const post = (x, z, lamp) => { const p = mesh(new THREE.BoxGeometry(.9, 2.3, .9), postM); p.position.set(x, 1.15, z); world.add(p);
      const c = mesh(new THREE.ConeGeometry(.72, .5, 4), capM); c.rotation.y = Math.PI / 4; c.position.set(x, 2.55, z); world.add(c);
      if (lamp) { const L = new THREE.Group(); L.name = 'lantern'; L.position.set(x, 3.05, z);
        const body = mesh(new THREE.BoxGeometry(.5, .6, .5), new THREE.MeshStandardMaterial({ color: '#FFE3A0', emissive: '#FFB347', emissiveIntensity: 0, roughness: .4, transparent: true, opacity: .92 })); L.add(body);
        L.add(setp(mesh(new THREE.ConeGeometry(.42, .3, 4), capM), V(0, .45, 0), new THREE.Euler(0, Math.PI / 4, 0), undefined));
        const pl = new THREE.PointLight('#FFB347', 0, 14, 1.6); pl.position.set(0, 0, 0); L.add(pl); world.add(L); lamps.push({ body, pl }); } };
    const rail = (x1, z1, x2, z2, y) => { const len = Math.hypot(x2 - x1, z2 - z1), r = mesh(new THREE.BoxGeometry(x1 === x2 ? .32 : len, .32, x1 === x2 ? len : .32), railM); r.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); world.add(r); };
    for (const y of [.8, 1.6]) { rail(0, e, w, e, y); rail(e, 0, e, h, y); rail(w - e, 0, w - e, h, y); rail(0, h - e, w * .3, h - e, y); rail(w * .7, h - e, w, h - e, y); }
    const nx = 6, nz = 10;
    for (let i = 0; i <= nx; i++) { const x = Math.min(w - e, Math.max(e, i * w / nx)); post(x, e, i === 0 || i === nx); if (i / nx <= .3 || i / nx >= .7) post(x, h - e, i === 0 || i === nx); }
    for (let i = 1; i < nz; i++) { const z = i * h / nz; post(e, z); post(w - e, z); }
    // launch gate: two stepping stones with a paw print where the slingshot stands
    for (const [x, z, s] of [[CX - 2.6, h + 1.4, 1], [CX + 2.4, h + 1.8, .8], [CX, h + 2.8, 1.2]]) { const st = mesh(new THREE.CylinderGeometry(.9 * s, 1 * s, .18, 14), mat('#D8D2C4', .9)); st.position.set(x, .06, z); world.add(st); }
    // scenery ring: trees at the back and sides, low props near the camera so nothing hides the pen
    const R = BIOME[id].trees; let s = 17; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const place = (fn, x, z, sc) => { const o = P[fn](B, sc); o.position.set(x, 0, z); o.rotation.y = r() * 6.28; world.add(o); };
    for (let i = 0; i < 46; i++) { const side = i % 3, t = r();
      let x, z; if (side === 0) { x = CX + (t - .5) * 70; z = -4 - r() * 16; } else { x = side === 1 ? -3 - r() * 16 : w + 3 + r() * 16; z = t * (h + 6) - 2; }
      place(R[Math.floor(r() * R.length)], x, z, .9 + r() * .7); }
    for (let i = 0; i < 26; i++) { const x = r() < .5 ? -2 - r() * 10 : w + 2 + r() * 10, z = r() * (h + 10); place('flower', x, z, 1); }
    for (let i = 0; i < 12; i++) { const x = r() < .5 ? -3 - r() * 12 : w + 3 + r() * 12, z = r() * (h + 8); place('rock', x, z, .6 + r() * .9); }
    const ex = B.extra; if (ex) for (const [x, z] of [[-5.5, h * .35], [w + 5.2, h * .62], [w + 6, h * .15], [-6, h * .72]]) { const o = P[ex](B, 1); o.scale.multiplyScalar(2); o.position.set(x, 0, z); o.rotation.y = (r() - .5) * 1.2; world.add(o); }
    // lanterns keep their own meshes (they glow); everything else in the world is merged per material
    for (const L of lamps) L.body.userData.noBake = true;
    bake(world, new Set(['lantern']));
    // fireflies (visible in the evening and at night)
    const n = 40, fg = new THREE.InstancedMesh(new THREE.SphereGeometry(.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#FFF2A0' }), n); fg.castShadow = false;
    fg.userData.seed = Array.from({ length: n }, () => [r() * (w + 20) - 10, .6 + r() * 2.4, r() * (h + 10) - 5, r() * 6]); world.add(fg); flies = fg;
    applyTod();
  }
  function applyTod() {
    const T = TOD[todId] || TOD.day, B = BIOME[biomeId] || BIOME.cayir;
    skyCol.set(T.sky || B.sky); scene.background = skyCol; scene.fog = new THREE.Fog(skyCol, dist * 1.25, dist * 2.6);
    sun.color.set(T.key); sun.intensity = T.keyI; hemi.color.set(T.hemiS); hemi.groundColor.set(T.hemiG); hemi.intensity = T.hemiI; renderer.toneMappingExposure = T.exposure;
    for (const L of lamps) { L.body.material.emissiveIntensity = T.lamps ? 2.2 : 0; L.pl.intensity = T.lamps ? (todId === 'night' ? 24 : 10) : 0; }
    if (flies) flies.visible = T.lamps;
  }

  // ---------- slingshot ----------
  const sling = new THREE.Group(); scene.add(sling);
  const forkM = mat('#7A4B24', .7), bandM = mat('#5A2E14', .6);
  const prongs = [-1, 1].map(sd => { const p = mesh(new THREE.CylinderGeometry(.16, .22, 2.2, 10), forkM); p.position.y = 1.1; const g = new THREE.Group(); g.add(p);
    const tip = mesh(new THREE.SphereGeometry(.24, 12, 10), forkM); tip.position.y = 2.2; g.add(tip); sling.add(g); return g; });
  const bands = [0, 1, 2].map(() => { const b = mesh(new THREE.CylinderGeometry(.09, .09, 1, 8), bandM, false); sling.add(b); return b; });
  function stretch(o, a, b) { const d = b.clone().sub(a), L = d.length(); o.position.copy(a).addScaledVector(d, .5); o.scale.set(1, Math.max(L, .001), 1); o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); }
  let slingSkin = null;
  function setSling(sk) { slingSkin = sk; forkM.color.set(sk.post || '#7A4B24'); bandM.color.set(sk.band || (sk.grad ? sk.grad[Math.floor(sk.grad.length / 2)] : '#5A2E14')); }

  // ---------- actors ----------
  const live = new Map(); let pouch = null, pouchKey = '';
  const DIR = [0, 0];
  function actorFor(id, key) { let a = live.get(id); if (!a || a.userData.key !== key) { if (a) actors.remove(a); a = spawnAnimal(key); a.userData.heading = Math.PI + (rnd() - .5) * 1.2; a.userData.phase = rnd() * 6;
      a.userData.ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.22, 40, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: '#E63B2E', transparent: true, opacity: .9, depthWrite: false }));
      a.userData.ring.rotation.x = -Math.PI / 2; a.userData.ring.position.y = .05; a.add(a.userData.ring); actors.add(a); live.set(id, a); } return a; }
  function animate(a, b, t, dt) {
    const u = a.userData, rig = u.rig, sp = Math.hypot(b.vx, b.vy), s = b.r * U * 1.2;
    a.position.set(b.x * U, 0, b.y * U);
    // face where you're going; when resting, slowly look around (mostly toward the player)
    if (sp > 25) u.target = Math.atan2(b.vx, b.vy); else if (u.target == null || rnd() < dt * .15) u.target = Math.PI * 0 + (rnd() - .5) * 2.4 + (rnd() < .6 ? 0 : Math.PI);
    let dh = ((u.target - u.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; u.heading += dh * Math.min(1, dt * (sp > 25 ? 8 : 1.8)); a.rotation.y = u.heading;
    // walk cycle + idle breathing
    u.phase += dt * (3 + Math.min(sp, 500) * .045);
    const amp = Math.min(.9, sp / 260), pop = .35 + .65 * easeBack(Math.min(1, b.pop)), sq = b.sq || 0;
    rig.legs.forEach((l, i) => { l.rotation.x = Math.sin(u.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * .7 * amp; });
    if (rig.torso) rig.torso.position.y = (rig.torso.userData.y0 ??= rig.torso.position.y) + Math.abs(Math.sin(u.phase)) * .08 * amp + Math.sin(t * 2.2 + b.id) * .02;
    if (rig.neck) rig.neck.rotation.x = Math.sin(t * 1.7 + b.id) * .06 - amp * .1;
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * (rig.tail.userData.wag ? 14 : 3) + b.id) * (rig.tail.userData.wag ? .5 : .15);
    // blink on its own rhythm; squeeze eyes on a hard bump
    const ph = (t + b.id * 1.37) % (3.4 + (b.id % 5) * .55); if (rig.eyes) rig.eyes.scale.y = (ph < .13 || sq > .55) ? .12 : 1;
    if (rig.spout) { const k = (t * .35 + b.id * .2) % 1; rig.spout.visible = k < .18; rig.spout.scale.setScalar(.6 + k * 3); }
    const squash = 1 - .22 * sq; a.scale.set(s * pop * (1 + .12 * sq), s * pop * squash, s * pop * (1 + .12 * sq));
    // danger countdown ring on the ground
    const ring = u.ring; if (b.danger > 0) { ring.visible = true; ring.geometry.dispose(); ring.geometry = new THREE.RingGeometry(1.08, 1.24, 40, 1, Math.PI / 2, Math.min(6.283, b.danger / 3 * 6.283)); } else ring.visible = false;
  }
  const easeBack = x => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  // ---------- FX: confetti ribbons, sparkle ring, dust ----------
  const CONF = 260, confGeo = new THREE.PlaneGeometry(.42, 1.15), confMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .5, vertexColors: false });
  const conf = new THREE.InstancedMesh(confGeo, confMat, CONF); conf.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CONF * 3), 3); conf.castShadow = false; conf.frustumCulled = false; fx.add(conf);
  const cs = Array.from({ length: CONF }, () => ({ life: 0, max: 0, p: V(0, -50, 0), v: V(), r: V(), w: V() })); let ci = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler(), one = V(1, 1, 1), col = new THREE.Color();
  const rings = [];
  function burst(gx, gy, colors, n, power = 1, big = false) {
    for (let i = 0; i < n; i++) { const c = cs[ci = (ci + 1) % CONF], a = rnd() * 6.283, sp = (2 + rnd() * 5) * power;
      c.p.set(gx * U, 1.5 + rnd() * 1.2, gy * U); c.v.set(Math.cos(a) * sp * 1.6, 9 + rnd() * 9 * power, Math.sin(a) * sp * 1.6); c.r.set(rnd() * 6, rnd() * 6, rnd() * 6); c.w.set(rnd() * 12 - 6, rnd() * 12 - 6, rnd() * 12 - 6);
      c.life = 0; c.max = 1.2 + rnd() * .9; col.set(colors[i % colors.length]); conf.setColorAt((ci), col); }
    conf.instanceColor.needsUpdate = true;
    const rg = new THREE.Mesh(new THREE.RingGeometry(.6, .95, 48), new THREE.MeshBasicMaterial({ color: big ? '#FFE45E' : '#FFF8E4', transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }));
    rg.rotation.x = -Math.PI / 2; rg.position.set(gx * U, .12, gy * U); rg.userData = { life: 0, max: .55, s: big ? 7 : 4 }; fx.add(rg); rings.push(rg);
  }
  function stepFx(dt) {
    for (let i = 0; i < CONF; i++) { const c = cs[i]; if (c.life >= c.max) { m4.makeScale(0, 0, 0); conf.setMatrixAt(i, m4); continue; }
      c.life += dt; c.v.y -= 14 * dt; c.v.multiplyScalar(Math.exp(-2.2 * dt)); c.p.addScaledVector(c.v, dt); if (c.p.y < .05) { c.p.y = .05; c.v.set(0, 0, 0); c.w.multiplyScalar(.9); }
      c.r.addScaledVector(c.w, dt); eul.set(c.r.x, c.r.y, c.r.z); q.setFromEuler(eul); const k = Math.min(1, (c.max - c.life) * 3); m4.compose(c.p, q, V(k, k, k)); conf.setMatrixAt(i, m4); }
    conf.instanceMatrix.needsUpdate = true;
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i], u = r.userData; u.life += dt; const k = u.life / u.max; r.scale.setScalar(1 + k * u.s); r.material.opacity = .9 * (1 - k); if (k >= 1) { fx.remove(r); r.geometry.dispose(); r.material.dispose(); rings.splice(i, 1); } }
  }

  // ---------- camera: fit the pen to any screen, plus shake and cinematic merge punch-ins ----------
  const PITCH = 60 * Math.PI / 180; let dist = 60, look = V(CX, 0, CZ), vw = 1, vh = 1, shakeA = 0, punch = { k: 0, x: CX, z: CZ };
  function placeCam(d, target) { camera.position.set(target.x, target.y + Math.sin(PITCH) * d, target.z + Math.cos(PITCH) * d); camera.lookAt(target); camera.updateMatrixWorld(); }
  function fit() {
    // pen corners (+ fence height, + the slingshot area below the pen) must fit inside the screen
    const pts = []; for (const x of [0, W * U]) for (const z of [0, H * U + 3.5]) for (const y of [0, 2.6]) pts.push(V(x, y, z));
    const tgt = V(CX, 0, CZ + 1.5), inside = () => pts.every(p => { const n = p.clone().project(camera); return Math.abs(n.x) < .95 && n.y > -.93 && n.y < .9; });
    let d = 60;
    for (let it = 0; it < 4; it++) {
      let lo = 5, hi = 500; for (let k = 0; k < 32; k++) { const mid = (lo + hi) / 2; placeCam(mid, tgt); if (inside()) hi = mid; else lo = mid; }
      d = hi; placeCam(d, tgt);
      let mn = 9, mx = -9; for (const p of pts) { const n = p.clone().project(camera); mn = Math.min(mn, n.y); mx = Math.max(mx, n.y); }
      tgt.z -= (mn + mx) / 2 * d * .25;           // re-centre the pen vertically, then fit again
    }
    dist = d; look.copy(tgt); placeCam(dist, look);
    if (scene.fog) { scene.fog.near = dist * 1.25; scene.fog.far = dist * 2.6; }
  }
  function resize(w, h, dpr) { vw = w; vh = h; renderer.setPixelRatio(Math.min(dpr, 2)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fit(); }
  const tmp = V();
  function project(gx, gy, hgt = 0) { tmp.set(gx * U, hgt * U, gy * U).project(camera); return { x: (tmp.x + 1) / 2 * vw, y: (1 - tmp.y) / 2 * vh, z: tmp.z }; }
  function pxPerUnit(gx, gy) { const a = project(gx, gy), b = project(gx + 10, gy); return Math.hypot(b.x - a.x, b.y - a.y) / 10; }

  let last = 0;
  function frame(st) {
    const t = st.time, dt = Math.min(.05, Math.max(0, t - last)); last = t;
    // camera (shake + gentle punch toward big merges)
    punch.k = Math.max(0, punch.k - dt * .9); const pk = Math.sin(Math.min(1, punch.k) * Math.PI / 2);
    const tg = look.clone().lerp(V(punch.x, 0, punch.z), pk * .18); shakeA = Math.max(0, st.shake || 0);
    placeCam(dist * (1 - pk * .08), tg); if (shakeA > 0) { camera.position.x += (Math.random() - .5) * shakeA * 1.2; camera.position.y += (Math.random() - .5) * shakeA * .8; }
    // actors
    const seen = new Set();
    for (const b of st.bodies) { const key = b.uni ? 'unicorn' : st.keys[b.lv], a = actorFor(b.id, key); seen.add(b.id); animate(a, b, t, dt); }
    for (const [id, a] of live) if (!seen.has(id)) { actors.remove(a); live.delete(id); }
    // slingshot and the animal waiting in the pouch
    const p = st.pull && st.pull.power > 0 ? st.pull : { power: 0, ux: 0, uy: -1 }, sl = st.SL;
    const r0 = st.cur ? st.cur.r : 20, L = V((sl.x - r0 - 14) * U, 2.1, (sl.y + 4) * U), Rr = V((sl.x + r0 + 14) * U, 2.1, (sl.y + 4) * U);
    prongs[0].position.set(L.x, 0, L.z); prongs[1].position.set(Rr.x, 0, Rr.z);
    const px = (sl.x - p.ux * p.power * 52) * U, pz = (sl.y - p.uy * p.power * 52) * U, py = 1.2, nx = -p.uy, nz = p.ux, rr = r0 * U * .85;
    const pa = V(px - nx * rr - p.ux * rr * .5, py, pz - nz * rr - p.uy * rr * .5), pb = V(px + nx * rr - p.ux * rr * .5, py, pz + nz * rr - p.uy * rr * .5);
    stretch(bands[0], L, pa); stretch(bands[1], pa, pb); stretch(bands[2], pb, Rr);
    sling.visible = st.showSling;
    if (st.cur && st.showSling) { const key = st.cur.uni ? 'unicorn' : st.keys[st.cur.lv]; if (!pouch || pouchKey !== key) { if (pouch) actors.remove(pouch); pouch = spawnAnimal(key); pouchKey = key; actors.add(pouch); }
      pouch.visible = true; pouch.position.set(px, 0, pz); pouch.rotation.y = p.power > 0 ? Math.atan2(p.ux, p.uy) : Math.PI; const sc = r0 * U * 1.2; pouch.scale.set(sc, sc * (1 - p.power * .12), sc);
      const pr = pouch.userData.rig; if (pr.eyes) { const ph = (t * 1.1) % 3.1; pr.eyes.scale.y = (ph < .13 || p.power > .85) ? .12 : 1; } pr.legs.forEach(l => l.rotation.x = 0); }
    else if (pouch) pouch.visible = false;
    // fireflies drift
    if (flies && flies.visible) { const sd = flies.userData.seed; for (let i = 0; i < sd.length; i++) { const [x, y, z, ph] = sd[i]; m4.makeTranslation(x + Math.sin(t * .6 + ph) * 1.2, y + Math.sin(t * 1.3 + ph) * .3, z + Math.cos(t * .5 + ph) * 1.2);
      const k = .6 + .4 * Math.sin(t * 3 + ph * 2); m4.scale(V(k, k, k)); flies.setMatrixAt(i, m4); } flies.instanceMatrix.needsUpdate = true; }
    for (const L of lamps) if (L.pl.intensity > 0) L.pl.intensity = (todId === 'night' ? 24 : 10) * (0.94 + Math.sin(t * 7 + L.body.id) * .03 + Math.sin(t * 13) * .03);
    stepFx(dt);
    renderer.render(scene, camera);
  }
  return {
    setBiome(id) { if (id === biomeId) return; biomeId = id; buildWorld(id); },
    setTod(id) { todId = id; applyTod(); },
    setSling, resize, frame, burst, project, pxPerUnit,
    punchAt(gx, gy, k = 1) { punch.x = gx * U; punch.z = gy * U; punch.k = Math.max(punch.k, k); },
    clear() { for (const [, a] of live) actors.remove(a); live.clear(); },
    renderer,
  };
}
