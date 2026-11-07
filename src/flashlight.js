import * as THREE from 'three';
import { tex } from './textures.js';

// A cheap hand torch: narrow warm cone, limited range, and it flickers now and then.
export class Flashlight {
  constructor(audio) {
    this.audio = audio;
    this.group = new THREE.Group();
    this.light = new THREE.SpotLight(0xfff0d2, 48, 32, 0.5, 0.55, 1.25);
    this.light.position.set(0, 0, 0);
    this.light.target.position.set(0, 0, -1);
    this.light.add(this.light.target);
    this.group.add(this.light);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.16, 8).rotateX(Math.PI / 2),
      new THREE.MeshPhongMaterial({ map: tex('metal'), color: 0x55585c, shininess: 50 }));
    body.position.z = 0.05;
    const headRing = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.04, 8).rotateX(Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x33353a, shininess: 50 }));
    headRing.position.z = -0.04;
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 10), new THREE.MeshBasicMaterial({ color: 0xfff6dc }));
    this.lens.position.z = -0.061; this.lens.rotation.y = Math.PI;
    this.group.add(body, headRing, this.lens);
    this.on = true;
    this.base = 48;
    this.nextEvent = 6 + Math.random() * 10;
    this.eventT = 0; this.eventKind = null; this.eventLen = 0;
    this.t = 0;
  }

  attach(parent, pos, rot) {
    if (this.group.parent) this.group.parent.remove(this.group);
    parent.add(this.group);
    this.group.position.copy(pos); if (rot) this.group.rotation.copy(rot);
  }

  toggle() { this.on = !this.on; this.audio.click(); }

  update(dt) {
    this.t += dt;
    let k = this.on ? 1 : 0;
    if (this.on) {
      this.nextEvent -= dt;
      if (this.eventKind) {
        this.eventT += dt;
        if (this.eventKind === 'stutter') k = Math.random() < 0.55 ? 0.15 + Math.random() * 0.5 : 1;
        else k = this.eventT < this.eventLen - 0.35 ? 0.02 : (Math.random() < 0.5 ? 0.3 : 1);   // dropout then sputter back
        if (this.eventT >= this.eventLen) { this.eventKind = null; this.nextEvent = 5 + Math.random() * 14; }
      } else if (this.nextEvent <= 0) {
        this.eventKind = Math.random() < 0.7 ? 'stutter' : 'dropout';
        this.eventLen = this.eventKind === 'stutter' ? 0.3 + Math.random() * 0.9 : 0.8 + Math.random() * 1.6;
        this.eventT = 0;
        this.audio.buzz();
      }
      // Slight constant wobble so it never feels like a perfect studio light.
      k *= 0.92 + 0.08 * Math.sin(this.t * 37) * Math.sin(this.t * 11);
    }
    this.light.intensity = this.base * k;
    this.lens.material.color.setScalar(0.25 + 0.75 * k);
  }
}
