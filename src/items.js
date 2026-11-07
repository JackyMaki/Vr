import * as THREE from 'three';
import { tex } from './textures.js';

// Things you can pick up and throw. Spawned per chunk, simulated only while moving.
const mats = {
  rock: new THREE.MeshPhongMaterial({ map: tex('rock'), color: 0x9a9a9a, flatShading: true }),
  glass: new THREE.MeshPhongMaterial({ color: 0x5a8a6a, transparent: true, opacity: 0.6, shininess: 90, specular: 0xffffff }),
  can: new THREE.MeshPhongMaterial({ map: tex('metal'), color: 0xc03030, shininess: 60 }),
  brick: new THREE.MeshPhongMaterial({ map: tex('concrete'), color: 0x9a4a3a, flatShading: true }),
  bone: new THREE.MeshPhongMaterial({ map: tex('bone'), color: 0xe0d8c0, flatShading: true }),
  dark: new THREE.MeshBasicMaterial({ color: 0x0a0a0a }),
  steel: new THREE.MeshPhongMaterial({ map: tex('metal'), color: 0xb0b4b8, shininess: 80 }),
};

const DEFS = {
  rock:   { r: 0.13, mass: 1.5, build: () => mesh(new THREE.SphereGeometry(0.13, 6, 4), mats.rock, [1, 0.8, 1.2]) },
  bottle: { r: 0.13, mass: 0.7, build: () => group([mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 8), mats.glass, null, [0, 0.11, 0]), mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.08, 8), mats.glass, null, [0, 0.26, 0])]) },
  can:    { r: 0.08, mass: 0.3, build: () => mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 9), mats.can, null, [0, 0.06, 0]) },
  brick:  { r: 0.12, mass: 2.2, build: () => mesh(new THREE.BoxGeometry(0.21, 0.065, 0.1), mats.brick, null, [0, 0.033, 0]) },
  skull:  { r: 0.12, mass: 1.0, build: () => group([mesh(new THREE.SphereGeometry(0.1, 8, 6), mats.bone, [1, 0.9, 1.1], [0, 0.1, 0]), mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), mats.bone, null, [0, 0.03, 0.05]),
                       mesh(new THREE.SphereGeometry(0.025, 5, 4), mats.dark, null, [-0.035, 0.1, 0.095]), mesh(new THREE.SphereGeometry(0.025, 5, 4), mats.dark, null, [0.035, 0.1, 0.095])]) },
  bone:   { r: 0.14, mass: 0.6, build: () => group([mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 6).rotateZ(Math.PI / 2), mats.bone, null, [0, 0.03, 0]), mesh(new THREE.SphereGeometry(0.035, 5, 4), mats.bone, null, [-0.13, 0.03, 0]), mesh(new THREE.SphereGeometry(0.035, 5, 4), mats.bone, null, [0.13, 0.03, 0])]) },
  wrench: { r: 0.15, mass: 1.8, build: () => group([mesh(new THREE.BoxGeometry(0.03, 0.025, 0.26), mats.steel, null, [0, 0.02, 0]), mesh(new THREE.TorusGeometry(0.04, 0.015, 5, 8), mats.steel, null, [0, 0.02, 0.14]), mesh(new THREE.TorusGeometry(0.03, 0.012, 5, 8), mats.steel, null, [0, 0.02, -0.13])]) },
};
function mesh(g, m, scale, pos) { const o = new THREE.Mesh(g, m); if (scale) o.scale.set(...scale); if (pos) o.position.set(...pos); return o; }
function group(list) { const g = new THREE.Group(); list.forEach(o => g.add(o)); return g; }

const _out = new THREE.Vector3(), _n = new THREE.Vector3();

export class Items {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.byChunk = new Map();
    this.all = new Set();
    this.loose = [];              // touched items that outlive their chunk
    this.onHitMonster = null;     // (monster, item, speed)
    this.onNoise = null;          // (pos, loudness)
  }

  spawn(type, x, y, z, chunkKey) {
    const def = DEFS[type]; if (!def) return null;
    const o = def.build();
    o.position.set(x, y, z);
    o.rotation.y = Math.random() * 6.28;
    o.userData = { item: true, type, r: def.r, mass: def.mass, vel: new THREE.Vector3(), ang: new THREE.Vector3(), held: null, asleep: true, chunk: chunkKey, touched: false };
    this.scene.add(o);
    this.all.add(o);
    if (chunkKey) { if (!this.byChunk.has(chunkKey)) this.byChunk.set(chunkKey, []); this.byChunk.get(chunkKey).push(o); }
    return o;
  }

  onChunk(key, specs) {
    if (specs) { for (const s of specs) this.spawn(s.type, s.x, s.y + 0.02, s.z, key); return; }
    const list = this.byChunk.get(key) || [];
    for (const o of list) {
      if (o.userData.held || o.userData.touched) { o.userData.chunk = null; this.loose.push(o); if (this.loose.length > 30) this.remove(this.loose.shift()); }
      else this.remove(o);
    }
    this.byChunk.delete(key);
  }

  remove(o) { if (!o || o.userData.held) return; this.scene.remove(o); this.all.delete(o); }

  nearest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const o of this.all) { if (o.userData.held) continue; const d = o.position.distanceTo(pos); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  // Nearest to a ray (desktop): within `maxDist` along the ray, and `width` of it.
  nearestOnRay(origin, dir, maxDist, width = 0.5) {
    let best = null, bs = Infinity;
    for (const o of this.all) {
      if (o.userData.held) continue;
      _n.subVectors(o.position, origin); const t = _n.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const off = Math.hypot(_n.x - dir.x * t, _n.y - dir.y * t, _n.z - dir.z * t);
      if (off < width + o.userData.r && t < bs) { bs = t; best = o; }
    }
    return best;
  }

  grab(o, parent, local) {
    o.userData.held = parent; o.userData.asleep = true; o.userData.touched = true;
    parent.add(o); o.position.copy(local); o.rotation.set(0, 0, 0);
    o.userData.vel.set(0, 0, 0);
  }

  release(o, vel) {
    const p = o.userData.held; if (!p) return;
    o.getWorldPosition(_out); const q = o.getWorldQuaternion(new THREE.Quaternion());
    p.remove(o); this.scene.add(o);
    o.position.copy(_out); o.quaternion.copy(q);
    o.userData.held = null; o.userData.asleep = false;
    o.userData.vel.copy(vel);
    o.userData.ang.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
  }

  update(dt, monsters) {
    for (const o of this.all) {
      const u = o.userData;
      if (u.held || u.asleep) continue;
      u.vel.y -= 9.81 * dt;
      const water = this.world.waterAt(o.position.x, o.position.z);
      if (o.position.y < water) { u.vel.multiplyScalar(Math.exp(-3 * dt)); u.vel.y += 7 * dt; }
      o.position.addScaledVector(u.vel, dt);
      o.rotation.x += u.ang.x * dt; o.rotation.y += u.ang.y * dt; o.rotation.z += u.ang.z * dt;
      if (this.world.contact(o.position, u.r, _out)) {
        const speed = u.vel.length();
        o.position.add(_out);
        _n.copy(_out).normalize();
        const vn = u.vel.dot(_n);
        if (vn < 0) u.vel.addScaledVector(_n, -vn);             // remove the into-surface part
        u.vel.multiplyScalar(0.78); u.ang.multiplyScalar(0.6);   // tangential friction
        if (vn < -1.2) u.vel.addScaledVector(_n, -vn * 0.35);    // bounce
        if (speed > 2.5) { this.audio.impact(o.position, Math.min(1, speed / 12)); if (this.onNoise) this.onNoise(o.position, speed); }
        if (u.vel.length() < 0.35 && _n.y > 0.5) { u.asleep = true; u.vel.set(0, 0, 0); u.ang.set(0, 0, 0); }
      }
      if (monsters && u.vel.length() > 4) {
        for (const m of monsters) {
          const dx = o.position.x - m.pos.x, dy = o.position.y - (m.pos.y + 1.4 * m.model.scale.x), dz = o.position.z - m.pos.z;
          if (dx * dx + dy * dy + dz * dz < 1.0) {
            const sp = u.vel.length();
            if (this.onHitMonster) this.onHitMonster(m, o, sp * u.mass);
            u.vel.multiplyScalar(-0.3); u.vel.y = Math.max(u.vel.y, 1.5);
            break;
          }
        }
      }
      if (o.position.y < -80) { o.position.y = this.world.floorAt(o.position.x, o.position.z, 1000) + 0.2; u.vel.set(0, 0, 0); }
    }
  }
}
