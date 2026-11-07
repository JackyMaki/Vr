import * as THREE from 'three';
import { CFG } from './config.js';
import { groundHeight } from './world.js';
import { buildHand, furMaterial } from './monkey.js';

const HAND_R = 0.07;
const _hp = new THREE.Vector3();
const _corr = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _move = new THREE.Vector3();
const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class Player {
  constructor(renderer, scene, world, camera) {
    this.renderer = renderer; this.scene = scene; this.world = world; this.camera = camera;
    this.rig = new THREE.Group();
    this.rig.position.set(0, 0.5, 2);
    this.rig.add(camera);
    camera.position.set(0, 1.6, 0);
    camera.rotation.order = 'YXZ';
    scene.add(this.rig);

    this.vel = new THREE.Vector3();
    this.color = 0x9aa0a6;
    this.name = 'MONKE';
    this.dead = false;
    this.onGround = true;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0;
    this.hands = [];
    this.desktopHands = [];
    this.onSqueeze = null;      // (handIndex, down)
    this.onButton = null;       // (handIndex, 'primary'|'secondary')
    this.setupDesktop();
    this.setupVR();
  }

  get inVR() { return this.renderer.xr.isPresenting; }

  setupDesktop() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => { if (!this.inVR && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || this.inVR || this.dead) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0022));
    });
    document.addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    for (const side of [-1, 1]) {
      const h = buildHand(this.color, side);
      h.position.set(side * 0.3, -0.36, -0.7);
      h.rotation.set(0, Math.PI + side * 0.15, 0);
      h.rotateX(0.75);
      h.scale.setScalar(0.85);
      this.camera.add(h);
      this.desktopHands.push(h);
    }
  }

  setupVR() {
    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      this.rig.add(ctrl); this.rig.add(grip);
      const hand = { ctrl, grip, mesh: null, side: i === 0 ? -1 : 1, prev: new THREE.Vector3(), touching: false, local: new THREE.Vector3(),
                     hist: [], velocity: new THREE.Vector3(), gamepad: null, buttons: [false, false], held: null, index: i };
      ctrl.addEventListener('connected', (e) => {
        hand.side = e.data && e.data.handedness === 'left' ? -1 : 1;
        hand.gamepad = e.data && e.data.gamepad;
        if (hand.mesh) grip.remove(hand.mesh);
        hand.mesh = buildHand(this.color, hand.side);
        hand.mesh.rotation.set(-Math.PI / 2 + 0.6, 0, 0);
        hand.mesh.position.set(0, -0.02, 0.02);
        grip.add(hand.mesh);
      });
      ctrl.addEventListener('disconnected', () => { if (hand.mesh) { grip.remove(hand.mesh); hand.mesh = null; } hand.gamepad = null; });
      ctrl.addEventListener('squeezestart', () => { if (this.onSqueeze) this.onSqueeze(i, true); });
      ctrl.addEventListener('squeezeend', () => { if (this.onSqueeze) this.onSqueeze(i, false); });
      this.hands.push(hand);
    }
  }

  setColor(hex) {
    this.color = hex;
    const mat = furMaterial(hex);
    for (const h of [...this.desktopHands, ...this.hands.map(h => h.mesh)]) {
      if (!h) continue;
      for (const m of h.userData.bloodable) m.material = mat;
    }
  }

  headPos(out) { return this.camera.getWorldPosition(out); }
  handPos(i, out) {
    const h = this.hands[i];
    if (this.inVR && h.mesh) return h.grip.getWorldPosition(out);
    return this.desktopHands[i].getWorldPosition(out);
  }
  // Object that holds things for this hand (grip in VR, a camera anchor on desktop).
  handAnchor(i) { return this.inVR && this.hands[i].mesh ? this.hands[i].grip : this.desktopHands[i]; }

  pollButtons() {
    for (const h of this.hands) {
      const gp = h.gamepad; if (!gp || !gp.buttons) continue;
      for (const [slot, name] of [[4, 'primary'], [5, 'secondary']]) {
        const b = gp.buttons[slot]; const down = !!(b && b.pressed);
        if (down && !h.buttons[slot - 4] && this.onButton) this.onButton(h.index, name);
        h.buttons[slot - 4] = down;
      }
    }
  }

  // Track hand world velocity for throwing.
  trackHands(dt) {
    for (const h of this.hands) {
      if (!h.mesh) continue;
      h.grip.getWorldPosition(_hp);
      h.hist.push({ p: _hp.clone(), t: performance.now() });
      if (h.hist.length > 8) h.hist.shift();
      if (h.hist.length >= 3) {
        const a = h.hist[0], b = h.hist[h.hist.length - 1];
        const s = Math.max(0.016, (b.t - a.t) / 1000);
        h.velocity.subVectors(b.p, a.p).divideScalar(s);
      }
    }
  }

  update(dt) {
    this.pollButtons();
    this.trackHands(dt);
    if (this.dead) return;     // the Death controller drives the rig
    const rig = this.rig;
    this.desktopHands.forEach(h => h.visible = !this.inVR);
    if (!this.inVR) this.camera.rotation.set(this.pitch, this.yaw, 0);

    let handsTouching = 0;
    _move.set(0, 0, 0);
    if (this.inVR) {
      for (const h of this.hands) {
        if (!h.mesh || h.held) { h.touching = false; continue; }   // a hand holding something can't grip the world
        h.grip.getWorldPosition(_hp);
        let touching = this.world.contact(_hp, HAND_R, _corr);
        if (!touching && h.touching && this.world.contact(_hp, HAND_R + 0.06, _tmp)) touching = true;
        h.local.copy(h.grip.position);
        if (touching) {
          if (h.touching) {
            _move.x -= h.local.x - h.prev.x;
            _move.y -= h.local.y - h.prev.y;
            _move.z -= h.local.z - h.prev.z;
          }
          rig.position.add(_corr);
          handsTouching++;
        }
        h.touching = touching;
        h.prev.copy(h.local);
      }
    }

    if (handsTouching > 0) {
      _move.divideScalar(handsTouching);
      rig.position.add(_move);
      this.vel.copy(_move).divideScalar(Math.max(dt, 1e-3));
      const sp = this.vel.length();
      if (sp > CFG.playerMaxSpeed) this.vel.multiplyScalar(CFG.playerMaxSpeed / sp);
    } else {
      if (!this.inVR) this.desktopMove(dt);
      this.vel.y -= CFG.gravity * dt;
      rig.position.addScaledVector(this.vel, dt);
    }

    // Body vs world, measured at the head's column.
    this.camera.getWorldPosition(_head);
    const bx = _head.x, bz = _head.z;
    _tmp.set(bx, rig.position.y + 0.4, bz);
    this.world.pushOutBody(_tmp, 0.3);
    rig.position.x += _tmp.x - bx; rig.position.z += _tmp.z - bz;
    _head.x = _tmp.x; _head.z = _tmp.z;
    const floor = this.world.floorAt(_head.x, _head.z, rig.position.y);
    this.onGround = rig.position.y <= floor + 0.03;
    if (rig.position.y < floor) { rig.position.y = floor; if (this.vel.y < 0) this.vel.y = 0; }
    if (this.onGround && handsTouching === 0) {
      const f = Math.exp(-(this.inVR ? 6 : 12) * dt);
      this.vel.x *= f; this.vel.z *= f;
    }
    const ceil = this.world.ceilingAt(_head.x, _head.z);
    if (_head.y > ceil - 0.15) { rig.position.y -= _head.y - (ceil - 0.15); if (this.vel.y > 0) this.vel.y = 0; }
    const gh = groundHeight(_head.x, _head.z);
    if (_head.y < gh + 0.25) rig.position.y += gh + 0.25 - _head.y;
    if (rig.position.y < -60) this.respawn();
    // Water slows you down.
    if (rig.position.y + 0.3 < this.world.waterAt(_head.x, _head.z)) { this.vel.x *= Math.exp(-3 * dt); this.vel.z *= Math.exp(-3 * dt); }
  }

  desktopMove(dt) {
    _dir.set(0, 0, 0);
    if (this.keys.has('KeyW')) _dir.z -= 1;
    if (this.keys.has('KeyS')) _dir.z += 1;
    if (this.keys.has('KeyA')) _dir.x -= 1;
    if (this.keys.has('KeyD')) _dir.x += 1;
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? CFG.playerMaxSpeed : 4.5;
    if (_dir.lengthSq() > 0) {
      _dir.normalize();
      _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const wx = _fwd.x * -_dir.z + _right.x * _dir.x;
      const wz = _fwd.z * -_dir.z + _right.z * _dir.x;
      const accel = this.onGround ? 40 : 8;
      this.vel.x += (wx * speed - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wz * speed - this.vel.z) * Math.min(1, accel * dt);
    }
    if (this.keys.has('Space') && this.onGround) this.vel.y = 5.2;
  }

  respawn() {
    this.dead = false;
    this.rig.rotation.set(0, 0, 0);
    this.camera.position.set(0, 1.6, 0);
    const a = Math.random() * Math.PI * 2;
    this.rig.position.set(Math.cos(a) * 2, 0.5, Math.sin(a) * 2);
    this.vel.set(0, 0, 0);
    for (const h of this.hands) h.touching = false;
    this.pitch = 0;
  }
}
