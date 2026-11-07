import * as THREE from 'three';

// Procedural low-poly gorilla in the Gorilla Tag silhouette: big faceted head, egg torso,
// no legs, two long arms with fingered hands. `monster` builds the scarier, bigger variant.
// Static parts that share a material are merged into one geometry, so a player costs about
// 12 draw calls and a monster about 15. Replace geometry here (or load a GLB into the same
// slots) to restyle: everything else only uses model.userData.parts.

const geoCache = {};
function geo(name, make) { return geoCache[name] || (geoCache[name] = make()); }

// Merge [{ geo, pos, rot, scale }] into one non-indexed geometry.
function merge(items) {
  const pos = [], nor = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const it of items) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    e.set(...(it.rot || [0, 0, 0])); q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(it.pos || [0, 0, 0])), q, new THREE.Vector3(...(it.scale || [1, 1, 1])));
    g.applyMatrix4(m);
    pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array);
  }
  const cat = (arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0); const out = new Float32Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
  return out;
}

const matCache = new Map();
export function furMaterial(color) {
  const key = 'fur' + color;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return matCache.get(key);
}
const skinMat = new THREE.MeshLambertMaterial({ color: 0x3b3236, flatShading: true });
const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
const monsterEye = new THREE.MeshBasicMaterial({ color: 0xff2010 });
const toothMat = new THREE.MeshLambertMaterial({ color: 0xe9e2c8, flatShading: true });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a0004 });
const bloodMat = new THREE.MeshLambertMaterial({ color: 0x5a0007 });

const ico = () => new THREE.IcosahedronGeometry(1, 1);

export function buildHand(color, side = 1, monster = false) {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(geo('palm', () => new THREE.BoxGeometry(0.11, 0.05, 0.13)), furMaterial(color));
  hand.add(palm);
  const key = (monster ? 'claws' : 'fingers') + side;
  const fingers = new THREE.Mesh(geo(key, () => {
    const fg = monster ? new THREE.ConeGeometry(0.018, 0.14, 4).rotateX(Math.PI / 2) : new THREE.BoxGeometry(0.024, 0.03, 0.09);
    const items = [];
    for (let i = 0; i < 4; i++) items.push({ geo: fg, pos: [-0.04 + i * 0.027, -0.005, 0.1], rot: [monster ? 0.2 : 0.35, 0, 0] });
    items.push({ geo: fg, pos: [side * 0.065, 0, 0.03], rot: [0, side * 0.8, 0] });
    return merge(items);
  }), monster ? toothMat : skinMat);
  hand.add(fingers);
  hand.userData.bloodable = [palm];
  return hand;
}

export function buildMonkey({ color = 0x888888, scale = 1, monster = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();            // bobbing part
  root.add(body);
  const fur = furMaterial(color);

  const torso = new THREE.Mesh(geo('torso', ico), fur);
  torso.scale.set(0.42, 0.5, 0.36); torso.position.set(0, 0.95, 0); torso.rotation.x = 0.25;
  body.add(torso);
  const belly = new THREE.Mesh(geo('belly', ico), skinMat);
  belly.scale.set(0.3, 0.33, 0.22); belly.position.set(0, 0.85, 0.2);
  body.add(belly);

  const head = new THREE.Group();
  head.position.set(0, 1.55, 0.12);
  body.add(head);
  head.add(new THREE.Mesh(geo('headFur', () => merge([
    { geo: ico(), pos: [0, 0.05, 0], scale: [0.3, 0.34, 0.33] },                       // skull
    { geo: new THREE.ConeGeometry(0.22, 0.3, 5), pos: [0, 0.36, -0.05] },              // crest
    { geo: new THREE.BoxGeometry(0.36, 0.08, 0.12), pos: [0, 0.14, 0.26] },            // brow
  ])), fur));
  head.add(new THREE.Mesh(geo('headSkin', () => merge([
    { geo: new THREE.BoxGeometry(0.34, 0.3, 0.16), pos: [0, -0.02, 0.24] },            // face
    { geo: new THREE.BoxGeometry(0.22, 0.16, 0.14), pos: [0, -0.12, 0.34] },           // muzzle
  ])), skinMat));
  const eyes = new THREE.Mesh(geo(monster ? 'eyesM' : 'eyes', () => merge([-1, 1].map(s => ({
    geo: new THREE.SphereGeometry(0.05, 6, 5), pos: [s * 0.085, 0.04, 0.31], scale: monster ? [1.5, 1.0, 1.2] : [1, 1, 1] })))),
    monster ? monsterEye : eyeWhite);
  head.add(eyes);
  if (!monster) {
    head.add(new THREE.Mesh(geo('pupils', () => merge([-1, 1].map(s => ({
      geo: new THREE.SphereGeometry(0.025, 5, 4), pos: [s * 0.085, 0.04, 0.35] })))), pupilMat));
  } else {
    // Gaping mouth full of teeth, a scar, and a spined back.
    const mouth = new THREE.Mesh(geo('mouth', () => new THREE.BoxGeometry(0.2, 0.12, 0.06)), mouthMat);
    mouth.position.set(0, -0.14, 0.42); head.add(mouth);
    head.add(new THREE.Mesh(geo('teeth', () => {
      const tg = new THREE.ConeGeometry(0.018, 0.07, 4); const items = [];
      for (let i = 0; i < 5; i++) {
        items.push({ geo: tg, pos: [-0.08 + i * 0.04, -0.1, 0.44], rot: [Math.PI, 0, 0] });
        items.push({ geo: tg, pos: [-0.06 + i * 0.03, -0.19, 0.44] });
      }
      return merge(items);
    }), toothMat));
    const scar = new THREE.Mesh(geo('scar', () => new THREE.BoxGeometry(0.03, 0.22, 0.02)), bloodMat);
    scar.position.set(0.12, 0.05, 0.33); scar.rotation.z = 0.5; head.add(scar);
    body.add(new THREE.Mesh(geo('spines', () => {
      const sg = new THREE.ConeGeometry(0.06, 0.28, 4); const items = [];
      for (let i = 0; i < 5; i++) items.push({ geo: sg, pos: [0, 1.3 - i * 0.14, -0.28 - i * 0.03], rot: [-0.9, 0, 0] });
      return merge(items);
    }), toothMat));
  }

  // Arms: pivot at the shoulder, built along +Z so lookAt(target) aims them.
  const armLen = 0.95;
  const arms = {};
  const upperGeo = geo('upper', () => new THREE.CylinderGeometry(0.11, 0.13, 1, 6).rotateX(Math.PI / 2));
  for (const [name, side] of [['armL', -1], ['armR', 1]]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.38, 1.3, 0.02);
    body.add(arm);
    const upper = new THREE.Mesh(upperGeo, fur);
    upper.scale.set(1, 1, armLen); upper.position.z = armLen / 2;
    arm.add(upper);
    const hand = buildHand(color, side, monster);
    hand.position.z = armLen + 0.05;
    hand.rotation.x = -Math.PI / 2;      // fingers point along the arm
    arm.add(hand);
    arms[name] = arm;
    arms[name === 'armL' ? 'handL' : 'handR'] = hand;
  }

  root.scale.setScalar(scale);
  root.userData.parts = { body, head, torso, eyes, ...arms };
  root.userData.armLen = armLen;
  root.userData.monster = monster;
  root.userData.color = color;
  root.userData.phase = Math.random() * 10;
  return root;
}

const _t = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Procedural walk: arms swing like a knuckle-walker, body bobs. If handTargets (world
// positions) are given, arms aim at those instead (used for remote VR players).
export function animateMonkey(model, time, speed, handTargets) {
  const p = model.userData.parts;
  const s = Math.min(1, speed / 4);
  const ph = time * (6 + 4 * s) + model.userData.phase;
  p.body.position.y = Math.abs(Math.sin(ph)) * 0.08 * s;
  p.body.rotation.x = 0.1 * s;
  p.head.rotation.x = -0.15 * s + Math.sin(ph * 0.5) * 0.05;
  for (const [arm, side, idx] of [[p.armL, -1, 0], [p.armR, 1, 1]]) {
    if (handTargets && handTargets[idx]) {
      arm.lookAt(handTargets[idx]);
      // Stretch/shrink the arm so the hand sits on the real hand position.
      arm.getWorldPosition(_w);
      const d = _w.distanceTo(handTargets[idx]) / model.scale.x;
      const k = Math.max(0.35, Math.min(1.6, d / (model.userData.armLen + 0.05)));
      arm.scale.z = k;
      arm.children[1].scale.setScalar(1 / k);
    } else {
      const swing = Math.sin(ph + (idx ? Math.PI : 0)) * 0.55 * s;
      _t.set(side * 0.1, -1, 0.1 + swing);
      arm.scale.z = 1; arm.children[1].scale.setScalar(1);
      arm.position.set(side * 0.38, 1.3, 0.02);
      arm.getWorldPosition(_w);
      _t.applyQuaternion(model.getWorldQuaternion(_q)).add(_w);
      arm.lookAt(_t);
    }
  }
}

// Collapsed, bloodied corpse pose for a dead player seen by others.
export function poseDead(model, t) {
  const p = model.userData.parts;
  const k = Math.min(1, t / 0.6);
  const e = 1 - (1 - k) * (1 - k);
  p.body.rotation.x = e * 1.5;
  p.body.position.y = -e * 0.75;
  p.head.rotation.x = e * 0.8;
}
