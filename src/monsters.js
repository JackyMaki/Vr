import * as THREE from 'three';
import { CFG } from './config.js';
import { groundHeight } from './world.js';
import { buildMonkey, animateMonkey } from './monkey.js';

const _d = new THREE.Vector3();
const _goal = new THREE.Vector3();

// Monster gorillas. The host runs the AI and streams positions; clients only interpolate.
export class Monsters {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.list = [];
    this.time = 0;
    this.onKill = null;      // (playerId, position) set by main
    this.thumpT = 0;
  }

  setCount(n) {
    while (this.list.length < n) this.spawnOne();
    while (this.list.length > n) { const m = this.list.pop(); this.scene.remove(m.model); }
  }

  spawnOne() {
    const model = buildMonkey({ color: 0x1c1a20, scale: CFG.monsterScale, monster: true });
    const m = { model, pos: new THREE.Vector3(), yaw: 0, state: 'roam', stateT: 0, speed: 0,
                goal: new THREE.Vector3(), target: null, feedT: 0, netPos: new THREE.Vector3(), netYaw: 0 };
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

  // players: [{ id, pos: Vector3 (head), dead, inSafe }]
  update(dt, players, isHost, localHead) {
    this.time += dt;
    if (isHost) this.think(dt, players);
    else for (const m of this.list) {
      // Smooth toward the host's state.
      m.pos.lerp(m.netPos, Math.min(1, dt * 10));
      m.yaw += shortAngle(m.yaw, m.netYaw) * Math.min(1, dt * 10);
    }
    let nearest = Infinity;
    for (const m of this.list) {
      m.model.position.copy(m.pos);
      m.model.rotation.y = m.yaw;
      animateMonkey(m.model, this.time, m.speed);
      if (m.state === 'feed') feedPose(m.model, m.feedT);
      if (localHead) nearest = Math.min(nearest, m.pos.distanceTo(localHead));
    }
    // Heavy footsteps from the closest one.
    this.thumpT += dt;
    if (nearest < 40 && this.thumpT > 0.42) { this.thumpT = 0; this.audio.thump(nearest); }
    return nearest;
  }

  think(dt, players) {
    const alive = players.filter(p => !p.dead);
    for (const m of this.list) {
      m.stateT += dt;
      // Nearest alive player (even in the safe zone, so monsters prowl its edge).
      let best = null, bestD = Infinity;
      for (const p of alive) { const d = m.pos.distanceTo(p.pos); if (d < bestD) { bestD = d; best = p; } }
      if (best && bestD > 130) { this.teleportNear(m, best.pos); continue; }

      const huntable = best && !best.inSafe && bestD < CFG.monsterSightRange && (best.pos.y - m.pos.y) < 3.5;
      if (m.state !== 'feed') {
        if (huntable) {
          if (m.state !== 'hunt') { m.state = 'hunt'; m.stateT = 0; this.audio.roar(bestD); }
          m.target = best;
        } else if (m.state === 'hunt' && (m.stateT > 6 || !best)) {
          m.state = 'roam'; m.stateT = 0; m.target = null;
        }
      }

      let speed = 0;
      if (m.state === 'hunt' && m.target) {
        _goal.copy(m.target.pos);
        speed = CFG.monsterHuntSpeed;
        if (m.target.inSafe || !huntable) {
          // Lost the prey: pace at the edge, roaring at the safe zone.
          speed = CFG.monsterRoamSpeed;
          if (m.stateT > 6) { m.state = 'roam'; m.stateT = 0; m.target = null; }
        }
        const flat = Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z);
        const reach = m.target.pos.y - m.pos.y < 2.6 * CFG.monsterScale;
        if (!m.target.dead && !m.target.inSafe && flat < CFG.monsterCatchDist && reach) {
          m.state = 'feed'; m.stateT = 0; m.feedT = 0; m.target.dead = true;
          if (this.onKill) this.onKill(m.target.id, m.target.pos.clone());
          continue;
        }
      } else if (m.state === 'feed') {
        m.feedT += dt;
        if (m.feedT > 3.2) { m.state = 'roam'; m.stateT = 0; m.target = null; }
        m.speed = 0;
        continue;
      } else {
        // Roam: wander between points near the players so they are always out there.
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

      // Steer toward the goal, turning smoothly.
      _d.set(_goal.x - m.pos.x, 0, _goal.z - m.pos.z);
      const dist = _d.length();
      if (dist > 0.3) {
        const wantYaw = Math.atan2(_d.x, _d.z);
        m.yaw += shortAngle(m.yaw, wantYaw) * Math.min(1, dt * 6);
        const step = Math.min(speed * dt, dist);
        m.pos.x += Math.sin(m.yaw) * step; m.pos.z += Math.cos(m.yaw) * step;
      } else speed = 0;
      // Never into the safe zone.
      const r = Math.hypot(m.pos.x, m.pos.z);
      if (r < CFG.monsterKeepOut) { m.pos.x *= CFG.monsterKeepOut / r; m.pos.z *= CFG.monsterKeepOut / r; }
      this.world.pushOutBody(m.pos, 0.7);
      m.pos.y = groundHeight(m.pos.x, m.pos.z);
      m.speed = speed;
    }
  }

  nearestDistTo(p) {
    let d = Infinity;
    for (const m of this.list) d = Math.min(d, m.pos.distanceTo(p));
    return d;
  }

  serialize() {
    return this.list.map(m => [r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw), m.state === 'feed' ? 1 : 0, r2(m.speed)]);
  }

  applyNet(arr) {
    this.setCount(arr.length);
    arr.forEach((a, i) => {
      const m = this.list[i];
      if (m.netPos.lengthSq() === 0 || m.pos.distanceTo(m.netPos) > 20) m.pos.set(a[0], a[1], a[2]);
      m.netPos.set(a[0], a[1], a[2]); m.netYaw = a[3];
      if (a[4] && m.state !== 'feed') { m.state = 'feed'; m.feedT = 0; }
      if (!a[4]) m.state = 'roam';
      if (m.state === 'feed') m.feedT += 1 / CFG.netRate;
      m.speed = a[5];
    });
  }
}

function feedPose(model, t) {
  // Slam both arms down into the kill, again and again.
  const p = model.userData.parts;
  const s = Math.max(0, Math.sin(t * 9));
  p.body.rotation.x = 0.5 + s * 0.3;
  p.armL.rotation.x = -1.2 + s * 1.4; p.armR.rotation.x = -1.2 + s * 1.4;
  p.head.rotation.x = 0.4;
}

function shortAngle(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function r2(x) { return Math.round(x * 100) / 100; }
