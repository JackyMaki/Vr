import * as THREE from 'three';
import { CFG } from './config.js';
import { groundHeight } from './world.js';
import { buildMonkey, animateMonkey, poseKill } from './monkey.js';

const _d = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
export const KILL_LIFT_END = 1.4;     // seconds into the kill when the head comes off
export const KILL_LENGTH = 5.6;

// Monster gorillas. The host runs the AI and streams positions; clients only interpolate.
export class Monsters {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.list = [];
    this.time = 0;
    this.onKill = null;      // (playerId, monsterIndex)
    this.thumpT = 0;
  }

  setCount(n) {
    while (this.list.length < n) this.spawnOne();
    while (this.list.length > n) { const m = this.list.pop(); this.scene.remove(m.model); }
  }

  spawnOne() {
    const model = buildMonkey({ color: 0x1c1a20, scale: CFG.monsterScale, monster: true });
    const m = { model, pos: new THREE.Vector3(), yaw: 0, state: 'roam', stateT: 0, speed: 0, goal: new THREE.Vector3(), target: null,
                netPos: new THREE.Vector3(), netYaw: 0, victimId: null, stuckT: 0, detour: 0, detourT: 0, lastPos: new THREE.Vector3(), growlT: 3 + Math.random() * 6, index: this.list.length };
    this.teleportNear(m, new THREE.Vector3());
    this.scene.add(model);
    this.list.push(m);
  }

  teleportNear(m, p) {
    const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 30;
    m.pos.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
    if (m.pos.length() < CFG.monsterKeepOut + 5) m.pos.setLength(CFG.monsterKeepOut + 10);
    m.pos.y = groundHeight(m.pos.x, m.pos.z);
    m.state = 'roam'; m.stateT = 0; m.goal.copy(m.pos); m.target = null;
  }

  // Where the victim's head is during a kill: in front of the monster, lifted to its face.
  victimHead(m, t, out) {
    const s = m.model.scale.x;
    _fwd.set(0, 0, 1).applyQuaternion(m.model.getWorldQuaternion(_q));
    const lift = Math.min(1, Math.max(0, (t - 0.5) / 0.9));
    out.copy(m.pos).addScaledVector(_fwd, 0.95 * s);
    out.y = m.pos.y + (0.95 + lift * 1.2) * s;
    return out;
  }

  startKill(m, victimId) {
    m.state = 'kill'; m.stateT = 0; m.victimId = victimId; m.speed = 0;
    this.audio.grabbed();
  }

  stun(m) {
    if (m.state === 'kill') return;
    m.state = 'stunned'; m.stateT = 0; m.speed = 0;
    this.audio.stunHit(m.pos);
  }

  // Something loud happened: nearby roaming monsters go and look.
  hear(pos, loudness) {
    for (const m of this.list) {
      if (m.state !== 'roam') continue;
      if (m.pos.distanceTo(pos) < 20 + loudness * 3) { m.goal.copy(pos); m.stateT = 0; }
    }
  }

  // players: [{ id, pos: Vector3 (head), dead, inSafe }]
  update(dt, players, isHost, localHead) {
    this.time += dt;
    if (isHost) this.think(dt, players);
    else for (const m of this.list) {
      if (m.state === 'kill' || m.state === 'stunned') { m.stateT += dt; continue; }
      m.pos.lerp(m.netPos, Math.min(1, dt * 10));
      m.yaw += shortAngle(m.yaw, m.netYaw) * Math.min(1, dt * 10);
    }
    let nearest = Infinity;
    for (const m of this.list) {
      m.model.position.copy(m.pos);
      m.model.rotation.y = m.yaw;
      if (m.state === 'kill') { m.model.updateMatrixWorld(); poseKill(m.model, m.stateT, this.victimHead(m, m.stateT, _goal)); }
      else if (m.state === 'stunned') { animateMonkey(m.model, this.time, 0); m.model.userData.parts.body.rotation.z = Math.sin(this.time * 40) * 0.08; m.model.userData.parts.head.rotation.z = Math.sin(this.time * 31) * 0.2; }
      else { m.model.userData.parts.body.rotation.z = 0; m.model.userData.parts.head.rotation.z = 0; animateMonkey(m.model, this.time, m.speed); }
      if (localHead) nearest = Math.min(nearest, m.pos.distanceTo(localHead));
      m.growlT -= dt;
      if (m.growlT <= 0 && localHead && m.state !== 'kill') { m.growlT = 4 + Math.random() * 10; if (m.pos.distanceTo(localHead) < 45) this.audio.growl(m.pos); }
    }
    this.thumpT += dt;
    if (this.thumpT > 0.42) {
      this.thumpT = 0;
      for (const m of this.list) if (m.speed > 0.5 && localHead && m.pos.distanceTo(localHead) < 40) this.audio.thump(m.pos);
    }
    return nearest;
  }

  think(dt, players) {
    const alive = players.filter(p => !p.dead);
    for (const m of this.list) {
      m.stateT += dt;
      if (m.state === 'kill') { if (m.stateT > KILL_LENGTH) { m.state = 'roam'; m.stateT = 0; m.target = null; m.victimId = null; } m.speed = 0; continue; }
      if (m.state === 'stunned') { if (m.stateT > 2.4) { m.state = 'roam'; m.stateT = 0; } m.speed = 0; continue; }

      let best = null, bestD = Infinity;
      for (const p of alive) { const d = m.pos.distanceTo(p.pos); if (d < bestD) { bestD = d; best = p; } }
      if (best && bestD > 130) { this.teleportNear(m, best.pos); continue; }

      const huntable = best && !best.inSafe && bestD < CFG.monsterSightRange && (best.pos.y - m.pos.y) < 3.5;
      if (huntable) {
        if (m.state !== 'hunt') { m.state = 'hunt'; m.stateT = 0; this.audio.roar(m.pos); }
        m.target = best;
      } else if (m.state === 'hunt' && (m.stateT > 6 || !best)) {
        m.state = 'roam'; m.stateT = 0; m.target = null;
      }

      let speed = 0;
      if (m.state === 'hunt' && m.target) {
        _goal.copy(m.target.pos);
        speed = CFG.monsterHuntSpeed;
        if (m.target.inSafe || !huntable) {
          speed = CFG.monsterRoamSpeed;
          if (m.stateT > 6) { m.state = 'roam'; m.stateT = 0; m.target = null; }
        }
        const flat = Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z);
        const reach = m.target.pos.y - m.pos.y < 2.6 * CFG.monsterScale;
        if (!m.target.dead && !m.target.inSafe && flat < CFG.monsterCatchDist && reach) {
          // Face the victim, then start the kill choreography.
          m.yaw = Math.atan2(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z);
          m.target.dead = true;
          this.startKill(m, m.target.id);
          if (this.onKill) this.onKill(m.target.id, m.index);
          continue;
        }
      } else {
        if (m.pos.distanceTo(m.goal) < 2 || m.stateT > 14) {
          m.stateT = 0;
          const c = best ? best.pos : m.pos;
          const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 40;
          m.goal.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
          if (m.goal.length() < CFG.monsterKeepOut + 6) m.goal.setLength(CFG.monsterKeepOut + 12);
        }
        _goal.copy(m.goal);
        speed = CFG.monsterRoamSpeed;
      }

      _d.set(_goal.x - m.pos.x, 0, _goal.z - m.pos.z);
      const dist = _d.length();
      if (dist > 0.3) {
        let wantYaw = Math.atan2(_d.x, _d.z);
        // Walls: when blocked for a while, sidestep for a bit.
        if (m.detourT > 0) { m.detourT -= dt; wantYaw += m.detour; }
        m.yaw += shortAngle(m.yaw, wantYaw) * Math.min(1, dt * 6);
        const step = Math.min(speed * dt, dist);
        m.lastPos.copy(m.pos);
        m.pos.x += Math.sin(m.yaw) * step; m.pos.z += Math.cos(m.yaw) * step;
        this.world.pushOutBody(m.pos, 0.7);
        const moved = m.pos.distanceTo(m.lastPos);
        if (moved < step * 0.35) { m.stuckT += dt; if (m.stuckT > 0.5 && m.detourT <= 0) { m.detour = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2; m.detourT = 0.9 + Math.random(); m.stuckT = 0; } }
        else m.stuckT = 0;
      } else speed = 0;
      const r = Math.hypot(m.pos.x, m.pos.z);
      if (r < CFG.monsterKeepOut) { m.pos.x *= CFG.monsterKeepOut / r; m.pos.z *= CFG.monsterKeepOut / r; }
      m.pos.y = groundHeight(m.pos.x, m.pos.z);
      m.speed = speed;
    }
  }

  nearestDistTo(p) { let d = Infinity; for (const m of this.list) d = Math.min(d, m.pos.distanceTo(p)); return d; }

  serialize() {
    return this.list.map(m => [r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw), m.state === 'kill' ? 1 : m.state === 'stunned' ? 2 : 0, r2(m.speed), r2(m.stateT)]);
  }

  applyNet(arr) {
    this.setCount(arr.length);
    arr.forEach((a, i) => {
      const m = this.list[i];
      if (m.netPos.lengthSq() === 0 || m.pos.distanceTo(m.netPos) > 20) m.pos.set(a[0], a[1], a[2]);
      m.netPos.set(a[0], a[1], a[2]); m.netYaw = a[3];
      const st = a[4] === 1 ? 'kill' : a[4] === 2 ? 'stunned' : 'roam';
      if (st !== m.state) { m.state = st; m.stateT = a[6]; if (st === 'kill') { m.pos.set(a[0], a[1], a[2]); m.yaw = a[3]; } }
      m.speed = a[5];
    });
  }
}

function shortAngle(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function r2(x) { return Math.round(x * 100) / 100; }
