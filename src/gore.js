import * as THREE from 'three';
import { groundHeight } from './world.js';

// Pooled blood: one Points draw call for droplets, a handful of ground splats.
export class Gore {
  constructor(scene) {
    this.scene = scene;
    this.N = 600;
    this.pos = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8c0010, size: 0.07, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < this.N; i++) this.pos[i * 3 + 1] = -100;

    this.splats = [];
    this.splatCursor = 0;
    const sg = new THREE.CircleGeometry(1, 9);
    const sm = new THREE.MeshBasicMaterial({ color: 0x4a0008, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(sg, sm);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.splats.push(m);
    }
    this.chunks = [];
  }

  burst(p, n = 120, power = 4) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2, u = Math.random();
      const sp = power * (0.3 + Math.random());
      this.vel[i * 3] = Math.cos(a) * sp * u;
      this.vel[i * 3 + 1] = sp * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * sp * u;
      this.life[i] = 1.2 + Math.random();
    }
    this.splat(p, 0.5 + Math.random() * 0.4);
    for (let k = 0; k < 4; k++) {
      const q = p.clone(); q.x += (Math.random() - 0.5) * 2.2; q.z += (Math.random() - 0.5) * 2.2;
      this.splat(q, 0.15 + Math.random() * 0.35);
    }
    // A few chunks of meat.
    for (let k = 0; k < 5; k++) this.chunk(p, power);
  }

  splat(p, r) {
    const m = this.splats[this.splatCursor]; this.splatCursor = (this.splatCursor + 1) % this.splats.length;
    m.position.set(p.x, groundHeight(p.x, p.z) + 0.012, p.z);
    m.scale.setScalar(r);
    m.rotation.z = Math.random() * 6;
    m.visible = true;
  }

  chunk(p, power) {
    if (!this.chunkGeo) {
      this.chunkGeo = new THREE.IcosahedronGeometry(0.07, 0);
      this.chunkMat = new THREE.MeshLambertMaterial({ color: 0x6a0010, flatShading: true });
    }
    const m = new THREE.Mesh(this.chunkGeo, this.chunkMat);
    m.position.copy(p);
    m.scale.setScalar(0.6 + Math.random() * 1.2);
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * power, power * 0.8 * Math.random() + 1, (Math.random() - 0.5) * power);
    m.userData.life = 6;
    this.scene.add(m);
    this.chunks.push(m);
    if (this.chunks.length > 40) { const old = this.chunks.shift(); this.scene.remove(old); }
  }

  update(dt) {
    const P = this.pos, V = this.vel, L = this.life;
    for (let i = 0; i < this.N; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      V[i * 3 + 1] -= 9.8 * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      const gh = groundHeight(P[i * 3], P[i * 3 + 2]);
      if (P[i * 3 + 1] < gh + 0.02) { P[i * 3 + 1] = gh + 0.02; V[i * 3] *= 0.3; V[i * 3 + 2] *= 0.3; V[i * 3 + 1] = 0; }
      if (L[i] <= 0) P[i * 3 + 1] = -100;
    }
    this.attr.needsUpdate = true;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const m = this.chunks[i];
      const v = m.userData.v;
      v.y -= 9.8 * dt;
      m.position.addScaledVector(v, dt);
      m.rotation.x += v.x * dt * 3; m.rotation.z += v.z * dt * 3;
      const gh = groundHeight(m.position.x, m.position.z) + 0.05 * m.scale.x;
      if (m.position.y < gh) { m.position.y = gh; v.set(v.x * 0.4, -v.y * 0.25, v.z * 0.4); if (Math.abs(v.y) < 0.3) v.set(0, 0, 0); }
      m.userData.life -= dt;
      if (m.userData.life <= 0) { this.scene.remove(m); this.chunks.splice(i, 1); }
    }
  }
}
