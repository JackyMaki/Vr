import * as THREE from 'three';
import { CFG } from './config.js';
import { World, groundHeight } from './world.js';
import { Player } from './player.js';
import { Monsters } from './monsters.js';
import { Gore } from './gore.js';
import { Audio } from './audio.js';
import { Terminal, PaintStation } from './terminal.js';
import { Net } from './net.js';
import { buildMonkey, animateMonkey, poseDead } from './monkey.js';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const bg = new THREE.Color(0x04060a);
scene.background = bg;
scene.fog = new THREE.FogExp2(bg, CFG.fogDensity);
scene.add(new THREE.HemisphereLight(0x33424f, 0x0d0b09, 0.85));
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
const remotes = new Map();          // peer id -> { model, label, head, l, r, quat, state, deadT }
const $ = (id) => document.getElementById(id);

function myId() { return net.id || 'me'; }

// ---------- Networking ----------
const net = new Net({
  onStatus: (s) => { terminal.setStatus(s); $('status').textContent = s; },
  onWorld: (players, mon) => {
    for (const [id, s] of Object.entries(players)) if (id !== net.id) touchRemote(id, s);
    for (const id of [...remotes.keys()]) if (!(id in players)) removeRemote(id);
    monsters.applyNet(mon);
  },
  onKill: (id, p) => {
    const pos = new THREE.Vector3(p[0], p[1], p[2]);
    if (id === net.id) localDeath(pos); else { gore.burst(pos); const r = remotes.get(id); if (r) r.deadT = 0; }
  },
  onPeerLeft: (id) => removeRemote(id),
});

// ---------- Panels ----------
const terminal = new Terminal(world.terminalScreen, {
  onName: (n) => { player.name = n; terminal.setStatus('Name set to ' + n); },
  onJoin: (code) => net.join(code),
  onLeave: () => { net.leave(); for (const id of [...remotes.keys()]) removeRemote(id); },
});
const paint = new PaintStation(world.paintScreen, { onColor: (c) => { player.setColor(c); rebuildPreview(); } });
const panels = [terminal, paint];
const panelMeshes = panels.map(p => p.mesh);

let preview = null;
function rebuildPreview() {
  if (preview) world.previewAnchor.remove(preview);
  preview = buildMonkey({ color: player.color });
  world.previewAnchor.add(preview);
}
rebuildPreview();

// ---------- Pointing at screens (controller ray in VR, view centre on desktop) ----------
const raycaster = new THREE.Raycaster();
const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
dot.visible = false; scene.add(dot);
const lasers = [];
for (const h of player.hands) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6 }));
  line.visible = false; h.ctrl.add(line); lasers.push(line);
  h.ctrl.addEventListener('selectstart', () => { audio.unlock(); pointAndClick(h.ctrl, true); });
  h.ctrl.addEventListener('squeezestart', () => audio.unlock());
}
const _o = new THREE.Vector3(), _dir = new THREE.Vector3();
function castFrom(obj) {
  obj.getWorldPosition(_o);
  _dir.set(0, 0, -1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
  raycaster.set(_o, _dir); raycaster.far = 6;
  const hit = raycaster.intersectObjects(panelMeshes, false)[0];
  return hit || null;
}
function pointAndClick(obj, click) {
  const hit = castFrom(obj);
  if (!hit) { if (click) return false; dot.visible = false; for (const p of panels) p.setHover(null); return false; }
  const panel = panels.find(p => p.mesh === hit.object);
  dot.position.copy(hit.point); dot.visible = true;
  if (click) { if (panel.click(hit.uv)) audio.click(); return true; }
  panel.setHover(hit.uv);
  return true;
}
renderer.domElement.addEventListener('mousedown', () => {
  audio.unlock();
  if (!player.inVR && !player.dead) pointAndClick(camera, true);
});
document.addEventListener('keydown', () => audio.unlock(), { once: true });

// ---------- VR session ----------
const vrbtn = $('vrbtn');
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    vrbtn.disabled = false; vrbtn.textContent = 'ENTER VR';
    vrbtn.onclick = async () => {
      audio.unlock();
      if (renderer.xr.getSession()) { renderer.xr.getSession().end(); return; }
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);
      vrbtn.textContent = 'EXIT VR';
      session.addEventListener('end', () => { vrbtn.textContent = 'ENTER VR'; });
    };
  }).catch(() => {});
}

// ---------- Death presentation (works in VR and on desktop) ----------
const deathDome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x5a0000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
deathDome.renderOrder = 999; deathDome.visible = false; camera.add(deathDome);
const diedSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeText('YOU DIED', '#d00000'), transparent: true, depthTest: false }));
diedSprite.scale.set(0.8, 0.2, 1); diedSprite.position.set(0, 0, -1.2); diedSprite.renderOrder = 1000; diedSprite.visible = false; camera.add(diedSprite);
const blackout = new THREE.Mesh(deathDome.geometry,
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
blackout.renderOrder = 998; blackout.visible = false; camera.add(blackout);
let fadeT = -1;
const recentKills = new Map();

function localDeath(pos) {
  if (player.dead) return;
  player.die();
  audio.death();
  gore.burst(pos, 160, 5);
  $('blood').style.opacity = 1;
  deathDome.visible = true; diedSprite.visible = true;
}
function onHostKill(id, pos) {
  recentKills.set(id, now);
  net.broadcastKill(id, pos);
  if (id === myId()) localDeath(pos); else { gore.burst(pos); const r = remotes.get(id); if (r) r.deadT = 0; }
}
monsters.onKill = onHostKill;

// ---------- Remote players ----------
function touchRemote(id, s) {
  let r = remotes.get(id);
  if (!r || r.color !== s.c) {
    if (r) scene.remove(r.model);
    const model = buildMonkey({ color: s.c });
    scene.add(model);
    r = { model, color: s.c, name: null, label: null, head: new THREE.Vector3(s.p[0], s.p[1], s.p[2]),
          l: new THREE.Vector3(), r: new THREE.Vector3(), quat: new THREE.Quaternion(), state: s, deadT: -1 };
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
  if (!s.d) r.deadT = -1; else if (r.deadT < 0) r.deadT = 0;
}
function removeRemote(id) { const r = remotes.get(id); if (r) { scene.remove(r.model); remotes.delete(id); } }
const _e = new THREE.Euler();
function updateRemotes(dt) {
  for (const r of remotes.values()) {
    const s = r.state, k = Math.min(1, dt * 12);
    r.head.lerp(new THREE.Vector3(s.p[0], s.p[1], s.p[2]), k);
    r.l.lerp(new THREE.Vector3(s.l[0], s.l[1], s.l[2]), k);
    r.r.lerp(new THREE.Vector3(s.r[0], s.r[1], s.r[2]), k);
    r.quat.slerp(new THREE.Quaternion(s.q[0], s.q[1], s.q[2], s.q[3]), k);
    _e.setFromQuaternion(r.quat, 'YXZ');
    r.model.position.set(r.head.x, r.head.y - 1.55, r.head.z);
    r.model.rotation.y = _e.y + Math.PI;   // the model's face is on its local +Z
    r.model.userData.parts.head.rotation.x = -_e.x;
    const speed = Math.hypot(s.p[0] - r.head.x, s.p[2] - r.head.z) * 10;
    animateMonkey(r.model, now, speed, [r.l, r.r]);
    if (r.deadT >= 0) { r.deadT += dt; poseDead(r.model, r.deadT); }
  }
}

// ---------- Per-frame state for the network and the monsters ----------
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
  const recently = (id) => recentKills.has(id) && now - recentKills.get(id) < 4.5;
  player.headPos(_head);
  list.push({ id: myId(), pos: _head.clone(), dead: player.dead || recently(myId()), inSafe: inSafe(_head) });
  for (const [id, r] of remotes) list.push({ id, pos: r.head.clone(), dead: !!r.state.d || recently(id), inSafe: inSafe(r.head) });
  return list;
}

// ---------- Loop ----------
const timer = new THREE.Timer();
let now = 0, netAcc = 0, uiAcc = 0;
$('status').textContent = 'SOLO  -  not connected';
monsters.setCount(CFG.baseMonsters + 1);

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  now += dt;
  const wasDead = player.dead;
  player.update(dt);
  if (wasDead && !player.dead) {   // just respawned
    $('blood').style.opacity = 0; deathDome.visible = false; diedSprite.visible = false;
    fadeT = 0; blackout.visible = true; audio.respawn();
  }
  player.headPos(_head);
  world.update(_head);

  const isHost = !net.room || net.isHost;
  if (isHost) monsters.setCount(CFG.baseMonsters + 1 + remotes.size);
  const nearest = monsters.update(dt, isHost ? playersForAI() : null, isHost, _head);
  gore.update(dt);
  updateRemotes(dt);
  if (preview) animateMonkey(preview, now, 0);
  audio.update(dt, Math.hypot(_head.x, _head.z) < CFG.safeRadius ? Infinity : nearest);

  // Pointing: right controller in VR, view centre on desktop. Only bother near the spawn.
  if (_head.length() < 24) {
    let pointing = false;
    if (player.inVR) {
      for (let i = 0; i < 2; i++) {
        const h = player.hands[i];
        const hit = h.mesh && castFrom(h.ctrl);
        lasers[i].visible = !!hit;
        if (hit && !pointing) { pointing = pointAndClick(h.ctrl, false); }
      }
    } else pointing = pointAndClick(camera, false);
    if (!pointing) { dot.visible = false; }
  } else { dot.visible = false; lasers.forEach(l => l.visible = false); }

  // Overlays.
  if (player.dead) {
    const k = Math.min(1, player.deathT / 0.5);
    deathDome.material.opacity = 0.75 * k; diedSprite.material.opacity = Math.min(1, Math.max(0, (player.deathT - 0.6) / 0.5));
    $('dead').style.opacity = diedSprite.material.opacity;
  }
  if (fadeT >= 0) {
    fadeT += dt;
    const o = fadeT < 0.3 ? 1 : Math.max(0, 1 - (fadeT - 0.3) / 0.8);
    blackout.material.opacity = o; $('fade').style.opacity = o; $('dead').style.opacity = 0;
    if (o <= 0) { fadeT = -1; blackout.visible = false; }
  }
  const danger = !player.dead && nearest < 22 && Math.hypot(_head.x, _head.z) > CFG.safeRadius;
  $('warn').style.opacity = danger ? 0.5 + 0.5 * Math.abs(Math.sin(now * 6)) : 0;

  // Network tick.
  netAcc += dt;
  if (netAcc >= 1 / CFG.netRate) {
    netAcc = 0;
    if (net.room) { net.sendState(myState()); if (net.isHost) net.broadcastWorld(monsters.serialize()); }
  }
  uiAcc += dt;
  if (uiAcc > 0.5) { uiAcc = 0; terminal.draw(); }   // blinking cursor

  renderer.render(scene, camera);
});

// ---------- Helpers ----------
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

// Exposed for debugging and automated tests.
window.__game = { player, monsters, world, net, gore, remotes, localDeath, terminal, paint, camera, renderer, groundHeight };
