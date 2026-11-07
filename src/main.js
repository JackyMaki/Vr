import * as THREE from 'three';
import { CFG } from './config.js';
import { World, groundHeight } from './world.js';
import { biomeAt } from './biomes.js';
import { Player } from './player.js';
import { Monsters, KILL_LIFT_END } from './monsters.js';
import { Gore } from './gore.js';
import { Audio } from './audio.js';
import { Terminal, PaintStation, Guide } from './terminal.js';
import { Net } from './net.js';
import { Items } from './items.js';
import { Flashlight } from './flashlight.js';
import { Voice } from './voice.js';
import { Death } from './death.js';
import { buildMonkey, buildHead, animateMonkey } from './monkey.js';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060a);
scene.fog = new THREE.FogExp2(0x04060a, CFG.fogDensity);
const hemi = new THREE.HemisphereLight(0x33424f, 0x0d0b09, 0.85);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x8a9bc4, 0.55);
moon.position.set(-3, 8, -4);
scene.add(moon);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 140);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Systems ----------
const audio = new Audio();
const world = new World(scene);
const player = new Player(renderer, scene, world, camera);
const monsters = new Monsters(scene, world, audio);
const gore = new Gore(scene);
const items = new Items(scene, world, audio);
const flashlight = new Flashlight(audio);
const voice = new Voice(audio);
const death = new Death(player, camera, world, gore, audio, monsters);
const remotes = new Map();
const heads = [];                // severed heads flying around (other players' deaths)
const $ = (id) => document.getElementById(id);
function myId() { return net.id || 'me'; }

world.onItems = (k, specs) => items.onChunk(k, specs);
for (const s of world.spawnItems) items.spawn(s.type, s.x, s.y, s.z, null);

// ---------- Networking ----------
const net = new Net({
  onStatus: (s) => terminal.setStatus(s),
  onWorld: (players, mon) => {
    for (const [id, s] of Object.entries(players)) if (id !== net.id) touchRemote(id, s);
    for (const id of [...remotes.keys()]) if (!(id in players)) removeRemote(id);
    monsters.applyNet(mon);
  },
  onKill: (id, mi) => handleKill(id, mi),
  onPeerLeft: (id) => removeRemote(id),
});
net.onPeer = (peer, id) => voice.bindPeer(peer, id);

// ---------- Panels ----------
const terminal = new Terminal(world.terminalScreen, {
  onName: (n) => { player.name = n; terminal.setStatus('Name set to ' + n); },
  onJoin: (code) => { net.join(code); voice.start(); },
  onLeave: () => { net.leave(); voice.stop(); for (const id of [...remotes.keys()]) removeRemote(id); },
});
const paint = new PaintStation(world.paintScreen, { onColor: (c) => { player.setColor(c); rebuildPreview(); } });
new Guide(world.guideScreen);
const panels = [terminal, paint];
const panelMeshes = panels.map(p => p.mesh);

let preview = null;
function rebuildPreview() {
  if (preview) world.previewAnchor.remove(preview);
  preview = buildMonkey({ color: player.color });
  world.previewAnchor.add(preview);
}
rebuildPreview();

// ---------- Pointing at screens ----------
const raycaster = new THREE.Raycaster();
const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
dot.visible = false; scene.add(dot);
const lasers = [];
for (const h of player.hands) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6 }));
  line.visible = false; h.ctrl.add(line); lasers.push(line);
  h.ctrl.addEventListener('selectstart', () => { audio.unlock(); pointAndClick(h.ctrl, true); });
}
const _o = new THREE.Vector3(), _dir = new THREE.Vector3(), _qq = new THREE.Quaternion();
function castFrom(obj) {
  obj.getWorldPosition(_o);
  _dir.set(0, 0, -1).applyQuaternion(obj.getWorldQuaternion(_qq));
  raycaster.set(_o, _dir); raycaster.far = 6;
  return raycaster.intersectObjects(panelMeshes, false)[0] || null;
}
function pointAndClick(obj, click) {
  const hit = castFrom(obj);
  if (!hit) { if (!click) { dot.visible = false; for (const p of panels) p.setHover(null); } return false; }
  const panel = panels.find(p => p.mesh === hit.object);
  dot.position.copy(hit.point); dot.visible = true;
  if (click) { if (panel.click(hit.uv)) audio.click(); return true; }
  panel.setHover(hit.uv);
  return true;
}

// ---------- Grabbing and throwing ----------
const desktopHold = new THREE.Object3D();
desktopHold.position.set(0.32, -0.22, -0.6);
camera.add(desktopHold);
let desktopItem = null;
const _hp = new THREE.Vector3();
player.onSqueeze = (i, down) => {
  const h = player.hands[i];
  if (down) {
    if (h.held) return;
    player.handPos(i, _hp);
    const it = items.nearest(_hp, 0.33);
    if (it) { items.grab(it, h.grip, new THREE.Vector3(0, -0.03, -0.03)); h.held = it; audio.click(); }
  } else if (h.held) {
    items.release(h.held, h.velocity.clone().multiplyScalar(1.25));
    h.held = null;
  }
};
player.onButton = (i, name) => { if (name === 'primary') flashlight.toggle(); };
document.addEventListener('keydown', (e) => {
  audio.unlock();
  if (player.inVR || player.dead) return;
  if (e.code === 'KeyF') flashlight.toggle();
  if (e.code === 'KeyE' && !desktopItem) {
    camera.getWorldPosition(_o); _dir.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_qq));
    const it = items.nearestOnRay(_o, _dir, 3.5, 0.6);
    if (it) { items.grab(it, desktopHold, new THREE.Vector3()); desktopItem = it; audio.click(); }
  }
  if (e.code === 'KeyQ' && desktopItem) { items.release(desktopItem, new THREE.Vector3(0, 0, 0)); desktopItem = null; }
});
renderer.domElement.addEventListener('mousedown', () => {
  audio.unlock();
  if (player.inVR || player.dead) return;
  if (pointAndClick(camera, true)) return;
  if (desktopItem) {
    _dir.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_qq));
    items.release(desktopItem, _dir.multiplyScalar(15).add(new THREE.Vector3(0, 2.5, 0)).add(player.vel));
    desktopItem = null;
  }
});
items.onHitMonster = (m, it, force) => { if (isHost() && force > 4) monsters.stun(m); };
items.onNoise = (pos, loud) => { if (isHost()) monsters.hear(pos, loud); };

// ---------- VR session ----------
const vrbtn = $('vrbtn');
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    vrbtn.style.display = 'block';
    vrbtn.onclick = async () => {
      audio.unlock();
      if (renderer.xr.getSession()) { renderer.xr.getSession().end(); return; }
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);
      vrbtn.style.display = 'none';
      session.addEventListener('end', () => { vrbtn.style.display = 'block'; });
    };
  }).catch(() => {});
}

// ---------- Death presentation ----------
const deathDome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x5a0000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
deathDome.renderOrder = 999; deathDome.visible = false; camera.add(deathDome);
const blackout = new THREE.Mesh(deathDome.geometry,
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
blackout.renderOrder = 1000; blackout.visible = false; camera.add(blackout);
let fadeT = -1;
const recentKills = new Map();
function isHost() { return !net.room || net.isHost; }

function handleKill(id, mi) {
  const m = monsters.list[mi] || monsters.list[0];
  if (!m) return;
  if (id === myId()) { if (!player.dead) { death.start(m); deathDome.visible = true; blackout.visible = true; } }
  else { const r = remotes.get(id); if (r) { r.deadT = 0; r.killer = m; r.ripped = false; } }
}
monsters.onKill = (id, mi) => { recentKills.set(id, now); net.broadcastKill(id, mi); handleKill(id, mi); };

// ---------- Remote players ----------
function touchRemote(id, s) {
  let r = remotes.get(id);
  if (!r || r.color !== s.c) {
    if (r) scene.remove(r.model);
    const model = buildMonkey({ color: s.c });
    scene.add(model);
    r = { model, color: s.c, name: null, label: null, head: new THREE.Vector3(s.p[0], s.p[1], s.p[2]),
          l: new THREE.Vector3(), r: new THREE.Vector3(), quat: new THREE.Quaternion(), state: s, deadT: -1, killer: null, ripped: false };
    remotes.set(id, r);
  }
  if (r.name !== s.n) {
    r.name = s.n;
    if (r.label) r.model.remove(r.label);
    r.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeText(s.n, '#ffffff'), transparent: true }));
    r.label.scale.set(1.2, 0.3, 1); r.label.position.set(0, 2.15, 0);
    r.model.add(r.label);
  }
  r.state = s;
  if (!s.d && r.deadT >= 0 && r.deadT > 3) { r.deadT = -1; r.model.userData.parts.head.visible = true; r.model.userData.parts.body.rotation.x = 0; r.model.userData.parts.body.position.y = 0; }
}
function removeRemote(id) { const r = remotes.get(id); if (r) { scene.remove(r.model); remotes.delete(id); } }
const _e = new THREE.Euler(), _vh = new THREE.Vector3(), _f = new THREE.Vector3();
function updateRemotes(dt) {
  for (const r of remotes.values()) {
    const s = r.state, k = Math.min(1, dt * 12);
    if (r.deadT >= 0 && r.killer) {
      r.deadT += dt;
      const p = r.model.userData.parts;
      if (r.deadT < KILL_LIFT_END) {
        monsters.victimHead(r.killer, r.deadT, _vh);
        _f.set(0, 0, 1).applyQuaternion(r.killer.model.getWorldQuaternion(_qq));
        r.model.position.set(_vh.x - _f.x * 0.14, _vh.y - 1.5, _vh.z - _f.z * 0.14);
        r.model.rotation.y = Math.atan2(-_f.x, -_f.z);
        p.body.rotation.x = -0.3; p.body.position.y = 0; p.head.visible = true;
        animateMonkey(r.model, now, 0, [r.l.lerp(_vh.clone().add(new THREE.Vector3(-0.3, -0.4, 0)), k), r.r.lerp(_vh.clone().add(new THREE.Vector3(0.3, -0.4, 0)), k)]);
      } else {
        if (!r.ripped) {
          r.ripped = true;
          monsters.victimHead(r.killer, KILL_LIFT_END, _vh);
          gore.burst(_vh, 200, 6); audio.ripAt(_vh);
          throwHead(r.color, _vh, r.killer);
          r.model.position.y = groundHeight(r.model.position.x, r.model.position.z) + 0.2;
        }
        p.head.visible = false;
        const kk = Math.min(1, (r.deadT - KILL_LIFT_END) / 0.5), e = 1 - (1 - kk) * (1 - kk);
        p.body.rotation.x = 1.4 * e; p.body.position.y = -0.8 * e;
      }
      continue;
    }
    r.head.lerp(new THREE.Vector3(s.p[0], s.p[1], s.p[2]), k);
    r.l.lerp(new THREE.Vector3(s.l[0], s.l[1], s.l[2]), k);
    r.r.lerp(new THREE.Vector3(s.r[0], s.r[1], s.r[2]), k);
    r.quat.slerp(new THREE.Quaternion(s.q[0], s.q[1], s.q[2], s.q[3]), k);
    _e.setFromQuaternion(r.quat, 'YXZ');
    r.model.position.set(r.head.x, r.head.y - 1.5, r.head.z);
    r.model.rotation.y = _e.y + Math.PI;
    r.model.userData.parts.head.rotation.x = -_e.x;
    const speed = Math.hypot(s.p[0] - r.head.x, s.p[2] - r.head.z) * 10;
    animateMonkey(r.model, now, speed, [r.l, r.r]);
  }
}
function throwHead(color, pos, killer) {
  const h = buildHead(color, false);
  h.position.copy(pos);
  _f.set(0, 0, 1).applyQuaternion(killer.model.getWorldQuaternion(_qq));
  const side = Math.random() < 0.5 ? -1 : 1;
  h.userData.vel = new THREE.Vector3(_f.z * side * 3.2 + _f.x * 2.2, 4.2, -_f.x * side * 3.2 + _f.z * 2.2);
  h.userData.spin = new THREE.Vector3(7, 2, 5); h.userData.life = 30; h.userData.bleed = 0;
  scene.add(h); heads.push(h);
  if (heads.length > 6) scene.remove(heads.shift());
}
function updateHeads(dt) {
  for (const h of heads) {
    const u = h.userData; if (u.resting) continue;
    u.vel.y -= 9.81 * dt; h.position.addScaledVector(u.vel, dt);
    h.rotation.x += u.spin.x * dt; h.rotation.z += u.spin.z * dt;
    u.bleed += dt; if (u.bleed > 0.06) { u.bleed = 0; gore.drip(h.position); }
    const f = world.floorAt(h.position.x, h.position.z, h.position.y + 1) + 0.2;
    if (h.position.y < f) { h.position.y = f; if (u.vel.y < -1.5) { u.vel.y *= -0.35; u.vel.x *= 0.5; u.vel.z *= 0.5; u.spin.multiplyScalar(0.5); gore.splat(h.position, 0.4); } else { u.resting = true; gore.splat(h.position, 0.6); } }
  }
}

// ---------- State for the network and the monsters ----------
const _head = new THREE.Vector3(), _hl = new THREE.Vector3(), _hr = new THREE.Vector3(), _q = new THREE.Quaternion();
function myState() {
  player.headPos(_head); player.handPos(0, _hl); player.handPos(1, _hr); camera.getWorldQuaternion(_q);
  return { n: player.name, c: player.color, d: player.dead ? 1 : 0,
    p: [r2(_head.x), r2(_head.y), r2(_head.z)], q: [r3(_q.x), r3(_q.y), r3(_q.z), r3(_q.w)],
    l: [r2(_hl.x), r2(_hl.y), r2(_hl.z)], r: [r2(_hr.x), r2(_hr.y), r2(_hr.z)] };
}
function playersForAI() {
  const list = [];
  const inSafe = (p) => Math.hypot(p.x, p.z) < CFG.safeRadius;
  const recently = (id) => recentKills.has(id) && now - recentKills.get(id) < 6.5;
  player.headPos(_head);
  list.push({ id: myId(), pos: _head.clone(), dead: player.dead || recently(myId()), inSafe: inSafe(_head) });
  for (const [id, r] of remotes) list.push({ id, pos: r.head.clone(), dead: !!r.state.d || recently(id) || r.deadT >= 0, inSafe: inSafe(r.head) });
  return list;
}

// ---------- Biome lighting ----------
const curSky = new THREE.Color(), curGround = new THREE.Color(), curFog = new THREE.Color();
let curBiome = null;
function updateLighting(dt, x, z) {
  const b = biomeAt(x, z);
  const inSpawn = Math.hypot(x, z) < CFG.safeRadius + 30;
  const L = inSpawn ? { sky: 0x33424f, ground: 0x0d0b09, i: 0.85, moon: 0.55 } : b.light;
  const F = inSpawn ? { color: 0x04060a, d: CFG.fogDensity } : b.fog;
  const k = Math.min(1, dt * 1.2);
  hemi.color.lerp(curSky.set(L.sky), k); hemi.groundColor.lerp(curGround.set(L.ground), k);
  hemi.intensity += (L.i - hemi.intensity) * k;
  moon.intensity += (L.moon - moon.intensity) * k;
  scene.fog.color.lerp(curFog.set(F.color), k); scene.background.copy(scene.fog.color);
  scene.fog.density += (F.d - scene.fog.density) * k;
  if (b.id !== curBiome) { curBiome = b.id; audio.setBiome(inSpawn ? 'forest' : b.id); }
  // Backrooms lights flicker as a whole now and then.
  if (b.id === 'backrooms' && !inSpawn && Math.random() < 0.01) hemi.intensity *= 0.3;
}

// ---------- Loop ----------
const timer = new THREE.Timer();
let now = 0, netAcc = 0, uiAcc = 0;
monsters.setCount(CFG.baseMonsters + 1);
const voicePositions = new Map();

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  now += dt;
  player.update(dt);
  if (death.active) {
    const done = death.update(dt);
    deathDome.material.opacity = death.blood * 0.55; blackout.material.opacity = death.black;
    $('blood').style.opacity = death.blood; $('fade').style.opacity = death.black;
    if (done) { deathDome.visible = false; deathDome.material.opacity = 0; $('blood').style.opacity = 0; fadeT = 0; audio.respawn(); }
  }
  player.headPos(_head);
  world.update(_head);

  const host = isHost();
  if (host) monsters.setCount(CFG.baseMonsters + 1 + remotes.size);
  const nearest = monsters.update(dt, host ? playersForAI() : null, host, _head);
  items.update(dt, monsters.list);
  gore.update(dt);
  updateRemotes(dt);
  updateHeads(dt);
  if (preview) animateMonkey(preview, now, 0);
  updateLighting(dt, _head.x, _head.z);
  audio.updateListener(camera);
  audio.update(dt, Math.hypot(_head.x, _head.z) < CFG.safeRadius ? Infinity : nearest, _head);

  // Flashlight lives in the left hand in VR, on the shoulder on desktop.
  const left = player.hands.find(h => h.side === -1);
  if (player.inVR && left && left.mesh) { if (flashlight.group.parent !== left.grip) flashlight.attach(left.grip, new THREE.Vector3(0, 0.03, -0.02), new THREE.Euler(-0.6, 0, 0)); }
  else if (flashlight.group.parent !== camera) flashlight.attach(camera, new THREE.Vector3(0.22, -0.18, -0.25), new THREE.Euler(0.04, 0.06, 0));
  flashlight.update(dt);

  if (_head.length() < 24) {
    let pointing = false;
    if (player.inVR) {
      for (let i = 0; i < 2; i++) {
        const h = player.hands[i];
        const hit = h.mesh && castFrom(h.ctrl);
        lasers[i].visible = !!hit;
        if (hit && !pointing) pointing = pointAndClick(h.ctrl, false);
      }
    } else pointing = pointAndClick(camera, false);
    if (!pointing) dot.visible = false;
  } else { dot.visible = false; lasers.forEach(l => l.visible = false); }

  if (fadeT >= 0) {
    fadeT += dt;
    const o = fadeT < 0.3 ? 1 : Math.max(0, 1 - (fadeT - 0.3) / 0.8);
    blackout.material.opacity = o; $('fade').style.opacity = o;
    if (o <= 0) { fadeT = -1; blackout.visible = false; }
  }

  netAcc += dt;
  if (netAcc >= 1 / CFG.netRate) {
    netAcc = 0;
    if (net.room) {
      net.sendState(myState());
      if (net.isHost) net.broadcastWorld(monsters.serialize());
      voicePositions.clear(); for (const [id, r] of remotes) voicePositions.set(id, r.head);
      voice.update(net.peerIds(), voicePositions);
    }
  }
  uiAcc += dt;
  if (uiAcc > 0.5) { uiAcc = 0; terminal.draw(); }

  renderer.render(scene, camera);
});

function makeText(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(text, 256, 64);
  g.fillStyle = color; g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function r2(x) { return Math.round(x * 100) / 100; }
function r3(x) { return Math.round(x * 1000) / 1000; }

window.__game = { player, monsters, world, net, gore, remotes, terminal, paint, camera, renderer, groundHeight, items, flashlight, death, scene, hemi, handleKill, touchRemote, get desktopItem() { return desktopItem; } };
