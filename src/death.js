import * as THREE from 'three';
import { KILL_LIFT_END } from './monsters.js';

// First-person death: the monster grabs you, lifts you to its face, and tears your head
// off. Your view *is* the head: it is flung away, tumbles, lands, and lies there while
// the thing feeds, then everything goes black and you wake up on the platform.
const _head = new THREE.Vector3(), _target = new THREE.Vector3(), _local = new THREE.Vector3(), _face = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Death {
  constructor(player, camera, world, gore, audio, monsters) {
    this.player = player; this.camera = camera; this.world = world; this.gore = gore; this.audio = audio; this.monsters = monsters;
    this.active = false;
  }

  start(monster) {
    this.active = true; this.t = 0; this.m = monster; this.ripped = false; this.landed = false; this.bounces = 0;
    this.player.dead = true;
    this.player.vel.set(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.roll = 0; this.pitchExtra = 0;
    this.startYaw = this.player.yaw; this.startPitch = this.player.pitch;
    this.blood = 0; this.black = 0;
  }

  // Put the camera (head) at a world position by moving the rig.
  placeHead(target) {
    _local.copy(this.camera.position);          // head offset inside the rig (real head in VR)
    this.player.rig.position.set(target.x - _local.x, target.y - _local.y, target.z - _local.z);
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    const m = this.m, rig = this.player.rig, cam = this.camera, vr = this.player.inVR;
    if (this.t < KILL_LIFT_END) {
      // Held in its hands, rising to its face.
      this.monsters.victimHead(m, this.t, _target);
      const shake = 0.03 * Math.min(1, this.t * 3);
      _target.x += (Math.random() - 0.5) * shake; _target.y += (Math.random() - 0.5) * shake; _target.z += (Math.random() - 0.5) * shake;
      cam.getWorldPosition(_head);
      _head.lerp(_target, Math.min(1, dt * (this.t < 0.5 ? 10 : 20)));
      this.placeHead(_head);
      if (!vr) {
        // Forced to look into its face.
        const s = m.model.scale.x;
        _fwd.set(0, 0, 1).applyQuaternion(m.model.getWorldQuaternion(_q));
        _face.copy(m.pos).addScaledVector(_fwd, 0.4 * s); _face.y += 1.55 * s;
        const dx = _face.x - _head.x, dz = _face.z - _head.z, dy = _face.y - _head.y;
        const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
        this.player.yaw += shortAngle(this.player.yaw, wantYaw) * Math.min(1, dt * 6);
        this.player.pitch += (wantPitch - this.player.pitch) * Math.min(1, dt * 6);
        cam.rotation.set(this.player.pitch + (Math.random() - 0.5) * shake * 2, this.player.yaw + (Math.random() - 0.5) * shake * 2, Math.sin(this.t * 30) * 0.02 * this.t);
      }
      this.blood = Math.min(0.3, this.t * 0.25);
    } else {
      if (!this.ripped) {
        this.ripped = true;
        cam.getWorldPosition(_head);
        this.audio.ripAt(_head);
        const neck = _head.clone(); neck.y -= 0.25;
        this.gore.burst(neck, 220, 6);
        this.gore.burst(_head, 80, 3);
        // The head is yanked up and flung to one side.
        _fwd.set(0, 0, 1).applyQuaternion(m.model.getWorldQuaternion(_q));
        const side = Math.random() < 0.5 ? -1 : 1;
        this.vel.set(_fwd.z * side * 3.2 + _fwd.x * 2.2, 4.2, -_fwd.x * side * 3.2 + _fwd.z * 2.2);
        this.spin.set(7 + Math.random() * 4, (Math.random() - 0.5) * 6, (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3));
        this.bleedT = 0;
      }
      cam.getWorldPosition(_head);
      if (!this.landed) {
        this.vel.y -= 9.81 * dt;
        _head.addScaledVector(this.vel, dt);
        const floor = this.world.floorAt(_head.x, _head.z, _head.y + 1);
        if (_head.y < floor + 0.14) {
          _head.y = floor + 0.14;
          this.bounces++;
          this.gore.splat(_head, 0.4);
          if (this.vel.y < -1.5 && this.bounces < 3) { this.vel.y = -this.vel.y * 0.35; this.vel.x *= 0.5; this.vel.z *= 0.5; this.spin.multiplyScalar(0.5); }
          else { this.landed = true; this.vel.set(0, 0, 0); }
        }
        this.placeHead(_head);
        if (!vr) {
          this.pitchExtra += this.spin.x * dt; this.roll += this.spin.z * dt;
          cam.rotation.set(this.player.pitch + this.pitchExtra, this.player.yaw + this.spin.y * dt * 10, this.roll);
        } else rig.rotation.z = Math.min(0.35, (this.t - KILL_LIFT_END) * 0.3);
      } else {
        // Lying on the ground, looking sideways at the thing eating your body.
        this.placeHead(_head);
        if (!vr) { this.roll += (1.25 - (this.roll % (Math.PI * 2))) * Math.min(1, dt * 3); cam.rotation.set(this.player.pitch + this.pitchExtra, this.player.yaw + this.spin.y * 0.3, this.roll); }
        else rig.rotation.z = 0.35;
      }
      // A trail of blood from the neck while it flies.
      this.bleedT += dt;
      if (this.bleedT > 0.05 && !this.landed) { this.bleedT = 0; this.gore.drip(_head); }
      this.blood = Math.min(0.55, 0.3 + (this.t - KILL_LIFT_END) * 0.3);
      if (this.t > 3.6) this.black = Math.min(1, (this.t - 3.6) / 1.0);
    }
    if (this.t >= 4.9) { this.active = false; this.player.respawn(); return true; }
    return false;
  }
}
function shortAngle(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
