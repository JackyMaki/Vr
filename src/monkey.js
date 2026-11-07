import * as THREE from 'three';
import { tex } from './textures.js';

// Textured, faceted gorilla in the Gorilla Tag silhouette: ridged skull with a crest, brow,
// muzzle with nostrils, ears, a barrel chest with pecs, and two long arms with elbows that
// bend through two-bone IK. `monster` builds the big scarred one with red eyes and fangs.
// Static parts sharing a material are merged, so a model is ~14 draw calls.

const geoCache = {};
function geo(name, make) { return geoCache[name] || (geoCache[name] = make()); }

function merge(items) {
  const pos = [], nor = [], uv = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const it of items) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    e.set(...(it.rot || [0, 0, 0])); q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(it.pos || [0, 0, 0])), q, new THREE.Vector3(...(it.scale || [1, 1, 1])));
    g.applyMatrix4(m);
    pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array);
    uv.push(g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2));
  }
  const cat = (arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0); const out = new Float32Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
  out.setAttribute('uv', new THREE.BufferAttribute(cat(uv), 2));
  return out;
}

const matCache = new Map();
export function furMaterial(color, monster = false) {
  const key = (monster ? 'mfur' : 'fur') + color;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshPhongMaterial({ color, map: tex(monster ? 'monsterFur' : 'fur'), flatShading: true, shininess: 2 }));
  }
  return matCache.get(key);
}
const skinMat = new THREE.MeshPhongMaterial({ color: 0x4a3c40, map: tex('skin'), flatShading: true, shininess: 6 });
const monsterSkin = new THREE.MeshPhongMaterial({ color: 0x3a2428, map: tex('skin'), flatShading: true, shininess: 10 });
const eyeWhite = new THREE.MeshPhongMaterial({ color: 0xe8e4dc, shininess: 60 });
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
const monsterEye = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
const toothMat = new THREE.MeshPhongMaterial({ color: 0xe9e2c8, map: tex('bone'), flatShading: true });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a0004 });
const bloodMat = new THREE.MeshPhongMaterial({ color: 0x5a0007, shininess: 30 });
const nailMat = new THREE.MeshPhongMaterial({ color: 0x2a2226, shininess: 20 });

const sph = (r = 1) => new THREE.SphereGeometry(r, 9, 6);
const low = (r = 1) => new THREE.SphereGeometry(r, 7, 5);

export function buildHand(color, side = 1, monster = false) {
  const hand = new THREE.Group();
  const fur = furMaterial(color, monster);
  const palm = new THREE.Mesh(geo('palm', () => merge([
    { geo: new THREE.BoxGeometry(0.11, 0.045, 0.12), pos: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.12, 0.05, 0.05), pos: [0, 0.005, -0.06] },   // wrist/knuckle ridge
  ])), fur);
  hand.add(palm);
  const fingers = new THREE.Mesh(geo('fingers' + side + monster, () => {
    const items = [];
    const seg = new THREE.BoxGeometry(0.022, 0.026, 0.045);
    for (let i = 0; i < 4; i++) {
      const x = -0.04 + i * 0.027, len = i === 0 || i === 3 ? 0.9 : 1;
      items.push({ geo: seg, pos: [x, -0.004, 0.08], rot: [0.35, 0, 0], scale: [1, 1, len] });
      items.push({ geo: seg, pos: [x, -0.02, 0.115 * len], rot: [0.9, 0, 0], scale: [0.9, 0.9, len] });
    }
    items.push({ geo: seg, pos: [side * 0.065, -0.005, 0.02], rot: [0.3, side * 0.9, 0] });
    items.push({ geo: seg, pos: [side * 0.085, -0.02, 0.05], rot: [0.8, side * 0.9, 0], scale: [0.9, 0.9, 0.9] });
    return merge(items);
  }), monster ? monsterSkin : skinMat);
  hand.add(fingers);
  const nails = new THREE.Mesh(geo('nails' + side + monster, () => {
    const items = [];
    const n = monster ? new THREE.ConeGeometry(0.014, 0.09, 4).rotateX(Math.PI / 2) : new THREE.BoxGeometry(0.016, 0.01, 0.02);
    for (let i = 0; i < 4; i++) items.push({ geo: n, pos: [-0.04 + i * 0.027, -0.03, monster ? 0.17 : 0.14], rot: [monster ? 0.9 : 0.6, 0, 0] });
    items.push({ geo: n, pos: [side * 0.1, -0.03, monster ? 0.09 : 0.07], rot: [0.8, side * 0.9, 0] });
    return merge(items);
  }), monster ? toothMat : nailMat);
  hand.add(nails);
  hand.userData.bloodable = [palm];
  return hand;
}

export function buildHead(color, monster) {
  const head = new THREE.Group();
  const fur = furMaterial(color, monster);
  head.add(new THREE.Mesh(geo('headFur' + monster, () => merge([
    { geo: sph(), pos: [0, 0.06, -0.02], scale: [0.29, 0.31, 0.33] },                    // skull
    { geo: low(), pos: [0, 0.3, -0.06], scale: [0.14, 0.17, 0.2] },                      // sagittal crest
    { geo: low(), pos: [0, 0.17, 0.2], scale: [0.2, 0.08, 0.12] },                       // brow ridge
    { geo: new THREE.BoxGeometry(0.34, 0.09, 0.1), pos: [0, 0.14, 0.24], rot: [0.3, 0, 0] },
    { geo: low(), pos: [-0.3, 0.05, -0.02], scale: [0.05, 0.08, 0.06] },                 // ears
    { geo: low(), pos: [0.3, 0.05, -0.02], scale: [0.05, 0.08, 0.06] },
    { geo: low(), pos: [0, -0.1, -0.1], scale: [0.26, 0.2, 0.22] },                      // jaw back
  ])), fur));
  head.add(new THREE.Mesh(geo('headSkin' + monster, () => merge([
    { geo: new THREE.BoxGeometry(0.3, 0.26, 0.14), pos: [0, 0.0, 0.26], rot: [0.05, 0, 0] },   // face plate
    { geo: low(), pos: [0, -0.1, 0.36], scale: [0.14, 0.11, 0.1] },                            // muzzle
    { geo: low(), pos: [-0.05, -0.08, 0.44], scale: [0.03, 0.02, 0.02] },                      // nostrils
    { geo: low(), pos: [0.05, -0.08, 0.44], scale: [0.03, 0.02, 0.02] },
    { geo: new THREE.BoxGeometry(0.2, 0.05, 0.08), pos: [0, -0.19, 0.38] },                   // lips
    { geo: low(), pos: [-0.29, 0.05, 0], scale: [0.03, 0.05, 0.035] },                         // inner ears
    { geo: low(), pos: [0.29, 0.05, 0], scale: [0.03, 0.05, 0.035] },
  ])), monster ? monsterSkin : skinMat));
  const eyeGeo = geo('eyes' + monster, () => merge([-1, 1].map(s => ({
    geo: new THREE.SphereGeometry(0.045, 8, 6), pos: [s * 0.08, 0.06, 0.3], scale: monster ? [1.4, 0.9, 1.1] : [1, 1, 1] }))));
  head.add(new THREE.Mesh(eyeGeo, monster ? monsterEye : eyeWhite));
  if (!monster) {
    head.add(new THREE.Mesh(geo('pupils', () => merge([-1, 1].map(s => ({ geo: new THREE.SphereGeometry(0.022, 6, 5), pos: [s * 0.08, 0.06, 0.338] })))), pupilMat));
    // Eyelids: a fur strip above the eyes gives the heavy-lidded gorilla look.
    head.add(new THREE.Mesh(geo('lids', () => merge([-1, 1].map(s => ({ geo: new THREE.BoxGeometry(0.1, 0.03, 0.05), pos: [s * 0.08, 0.1, 0.31], rot: [0.5, 0, 0] })))), fur));
  } else {
    const mouth = new THREE.Mesh(geo('mouth', () => new THREE.BoxGeometry(0.22, 0.14, 0.06)), mouthMat);
    mouth.position.set(0, -0.17, 0.4); head.add(mouth);
    head.add(new THREE.Mesh(geo('teeth', () => {
      const tg = new THREE.ConeGeometry(0.016, 0.06, 4), fang = new THREE.ConeGeometry(0.02, 0.11, 4); const items = [];
      for (let i = 0; i < 6; i++) {
        items.push({ geo: tg, pos: [-0.09 + i * 0.036, -0.12, 0.42], rot: [Math.PI, 0, 0] });
        items.push({ geo: tg, pos: [-0.075 + i * 0.03, -0.225, 0.42] });
      }
      items.push({ geo: fang, pos: [-0.1, -0.15, 0.41], rot: [Math.PI, 0, 0] });
      items.push({ geo: fang, pos: [0.1, -0.15, 0.41], rot: [Math.PI, 0, 0] });
      return merge(items);
    }), toothMat));
    head.add(new THREE.Mesh(geo('scars', () => merge([
      { geo: new THREE.BoxGeometry(0.025, 0.22, 0.02), pos: [0.12, 0.08, 0.33], rot: [0, 0, 0.5] },
      { geo: new THREE.BoxGeometry(0.02, 0.14, 0.02), pos: [-0.14, 0.0, 0.3], rot: [0, 0, -0.3] },
      { geo: new THREE.BoxGeometry(0.03, 0.1, 0.03), pos: [-0.22, 0.2, 0.1], rot: [0.4, 0, 0.9] },
    ])), bloodMat));
  }
  head.userData.color = color;
  return head;
}

export function buildMonkey({ color = 0x888888, scale = 1, monster = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = furMaterial(color, monster);

  body.add(new THREE.Mesh(geo('torso', () => merge([
    { geo: sph(), pos: [0, 0.95, 0], rot: [0.25, 0, 0], scale: [0.42, 0.5, 0.36] },        // torso
    { geo: low(), pos: [0, 1.28, -0.02], scale: [0.5, 0.2, 0.3] },                          // shoulders
    { geo: low(), pos: [0, 1.2, -0.25], scale: [0.3, 0.3, 0.2] },                           // hump
    { geo: low(), pos: [-0.17, 1.12, 0.26], scale: [0.16, 0.12, 0.1] },                     // pecs
    { geo: low(), pos: [0.17, 1.12, 0.26], scale: [0.16, 0.12, 0.1] },
  ])), fur));
  body.add(new THREE.Mesh(geo('belly', () => merge([
    { geo: sph(), pos: [0, 0.82, 0.2], scale: [0.3, 0.33, 0.2] },
  ])), monster ? monsterSkin : skinMat));

  const head = buildHead(color, monster);
  head.position.set(0, 1.5, 0.14);
  body.add(head);

  if (monster) {
    body.add(new THREE.Mesh(geo('spines', () => {
      const sg = new THREE.ConeGeometry(0.06, 0.3, 4); const items = [];
      for (let i = 0; i < 6; i++) items.push({ geo: sg, pos: [0, 1.36 - i * 0.13, -0.26 - i * 0.03], rot: [-0.9, 0, 0], scale: [1, 1 - i * 0.08, 1] });
      // Ribs showing through the side.
      const rib = new THREE.BoxGeometry(0.02, 0.03, 0.2);
      for (let i = 0; i < 4; i++) { items.push({ geo: rib, pos: [0.4, 0.95 - i * 0.07, 0.05], rot: [0, 0, 0.2] }); items.push({ geo: rib, pos: [-0.4, 0.95 - i * 0.07, 0.05], rot: [0, 0, -0.2] }); }
      return merge(items);
    }), toothMat));
    body.add(new THREE.Mesh(geo('bodyScars', () => merge([
      { geo: new THREE.BoxGeometry(0.03, 0.3, 0.02), pos: [0.2, 1.0, 0.33], rot: [0, 0, 0.7] },
      { geo: new THREE.BoxGeometry(0.03, 0.2, 0.02), pos: [-0.25, 1.15, 0.28], rot: [0, 0, -0.4] },
    ])), bloodMat));
  }

  // Arms: shoulder -> upper (along +Z) -> elbow -> forearm (along +Z) -> hand.
  const L1 = 0.5, L2 = 0.55;
  const arms = {};
  const upperGeo = geo('upper', () => merge([{ geo: new THREE.CylinderGeometry(0.11, 0.1, L1, 7).rotateX(Math.PI / 2), pos: [0, 0, L1 / 2] },
    { geo: low(), pos: [0, 0, 0], scale: [0.13, 0.13, 0.13] }]));   // shoulder ball
  const foreGeo = geo('fore', () => merge([{ geo: new THREE.CylinderGeometry(0.1, 0.085, L2, 7).rotateX(Math.PI / 2), pos: [0, 0, L2 / 2] },
    { geo: low(), pos: [0, 0, 0], scale: [0.11, 0.11, 0.11] }]));   // elbow
  for (const [name, side] of [['armL', -1], ['armR', 1]]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.4, 1.28, 0.02);
    body.add(arm);
    arm.add(new THREE.Mesh(upperGeo, fur));
    const fore = new THREE.Group();
    fore.position.z = L1;
    arm.add(fore);
    fore.add(new THREE.Mesh(foreGeo, fur));
    const hand = buildHand(color, side, monster);
    hand.position.z = L2 + 0.03;
    hand.rotation.x = -Math.PI / 2;
    fore.add(hand);
    arms[name] = arm; arms[name + 'fore'] = fore;
    arms[name === 'armL' ? 'handL' : 'handR'] = hand;
  }

  root.scale.setScalar(scale);
  root.userData.parts = { body, head, ...arms };
  root.userData.L1 = L1; root.userData.L2 = L2;
  root.userData.monster = monster;
  root.userData.color = color;
  root.userData.phase = Math.random() * 10;
  root.userData.targets = [new THREE.Vector3(), new THREE.Vector3()];
  return root;
}

// ---------- Two-bone IK ----------
const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _dir = new THREE.Vector3(), _pole = new THREE.Vector3();
const _perp = new THREE.Vector3(), _elbow = new THREE.Vector3(), _q = new THREE.Quaternion();

function solveArm(model, arm, fore, target, side) {
  const s = model.scale.x;
  const L1 = model.userData.L1 * s, L2 = model.userData.L2 * s;
  arm.getWorldPosition(_S);
  _T.copy(target);
  _dir.subVectors(_T, _S);
  let d = _dir.length();
  const maxD = (L1 + L2) * 0.995;
  if (d > maxD) { _dir.multiplyScalar(maxD / d); d = maxD; _T.copy(_S).add(_dir); }
  if (d < 1e-4) return;
  _dir.divideScalar(d);
  // Elbow pole: behind and outward relative to the body.
  model.getWorldQuaternion(_q);
  _pole.set(side * 0.6, 0.1, -1).applyQuaternion(_q);
  _perp.copy(_pole).addScaledVector(_dir, -_pole.dot(_dir));
  if (_perp.lengthSq() < 1e-6) _perp.set(0, 1, 0).addScaledVector(_dir, -_dir.y);
  _perp.normalize();
  const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _elbow.copy(_S).addScaledVector(_dir, L1 * cosA).addScaledVector(_perp, L1 * sinA);
  arm.lookAt(_elbow);
  fore.lookAt(_T);
}

const _w = new THREE.Vector3();

// speed: m/s of the body. handTargets: optional world positions (remote VR players).
// Without targets the hands knuckle-walk along the ground.
export function animateMonkey(model, time, speed, handTargets) {
  const p = model.userData.parts;
  const s = Math.min(1, speed / 4);
  const ph = time * (5 + 5 * s) + model.userData.phase;
  p.body.position.y = Math.abs(Math.sin(ph)) * 0.07 * s;
  p.body.rotation.x = 0.12 * s;
  p.head.rotation.x = -0.1 * s + Math.sin(ph * 0.5) * 0.04;
  for (const [idx, side] of [[0, -1], [1, 1]]) {
    const arm = idx ? p.armR : p.armL, fore = idx ? p.armRfore : p.armLfore;
    let t = model.userData.targets[idx];
    if (handTargets && handTargets[idx]) t.copy(handTargets[idx]);
    else {
      const k = ph + (idx ? Math.PI : 0);
      const lift = Math.max(0, Math.sin(k)) * 0.35 * s;
      t.set(side * 0.46, lift + 0.02, 0.4 + Math.cos(k) * 0.45 * s);
      model.localToWorld(t);
    }
    solveArm(model, arm, fore, t, side);
  }
}

// Monster kill choreography: phases by t. victim = world position of the victim's head.
export function poseKill(model, t, victim) {
  const p = model.userData.parts;
  const s = model.scale.x;
  const base = new THREE.Vector3(0, 1.5, 0.14).multiplyScalar(s);
  model.localToWorld(base);
  const lift = Math.min(1, Math.max(0, (t - 0.5) / 0.9));
  p.body.rotation.x = -0.1 - lift * 0.15;
  p.head.rotation.x = -0.3 * lift;
  const tL = model.userData.targets[0], tR = model.userData.targets[1];
  if (t < 1.4) {
    // Both hands on the victim's head/neck.
    tL.copy(victim).add(new THREE.Vector3(-0.18 * s, -0.1, 0)); tR.copy(victim).add(new THREE.Vector3(0.18 * s, -0.1, 0));
  } else {
    // Rip: right hand yanks up and out holding the head, left hand holds the body down.
    const r = Math.min(1, (t - 1.4) / 0.25);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    tR.copy(base).addScaledVector(right, 0.6 * s).addScaledVector(fwd, 0.5 * s); tR.y += 0.6 * s * r;
    tL.copy(base).addScaledVector(fwd, 0.7 * s); tL.y -= 0.9 * s;
    if (t > 2.4) { const k = Math.max(0, Math.sin((t - 2.4) * 8)); tR.y -= k * 0.8 * s; tL.y -= k * 0.3 * s; }   // slams
  }
  solveArm(model, p.armL, p.armLfore, tL, -1);
  solveArm(model, p.armR, p.armRfore, tR, 1);
}

// Dead victim as others see it: lifted by the killer, then dropped headless.
export function poseVictim(model, t, killer) {
  const p = model.userData.parts;
  if (killer && t < 1.4) {
    const s = killer.scale.x;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(killer.getWorldQuaternion(new THREE.Quaternion()));
    const lift = Math.min(1, Math.max(0, (t - 0.5) / 0.9));
    model.position.copy(killer.position).addScaledVector(fwd, 0.9 * s);
    model.position.y = killer.position.y + lift * 1.1 * s - 0.3;
    model.rotation.y = Math.atan2(-fwd.x, -fwd.z);
    p.body.rotation.x = -0.3; p.body.position.y = 0;
    p.head.visible = true;
  } else {
    p.head.visible = false;
    const k = Math.min(1, (t - 1.4) / 0.5), e = 1 - (1 - k) * (1 - k);
    p.body.rotation.x = 1.4 * e; p.body.position.y = -0.8 * e;
  }
}
