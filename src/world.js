import * as THREE from 'three';
import { CFG } from './config.js';
import { fbm, mulberry32, hash2 } from './noise.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Raw terrain height, infinite and analytic, so anything (monsters, the host, remote
// players) can ask for the ground anywhere without a chunk being loaded.
export function terrainHeight(x, z) {
  const n = fbm(x * 0.028 + 100, z * 0.028 + 100, 3);       // rolling hills
  const r = fbm(x * 0.11 + 7, z * 0.11 + 7, 2) * 0.35;        // small bumps
  let h = (n * 2 - 1) * CFG.hillHeight + (r - 0.17) * 1.2;
  const d = Math.hypot(x, z);
  h *= smoothstep(CFG.safeRadius + 3, CFG.safeRadius + 32, d);  // flat around spawn
  return h;
}

export function groundHeight(x, z) {
  const d = Math.hypot(x, z);
  if (d < CFG.safeRadius) return 0.5;                          // stone platform
  if (d < CFG.safeRadius + 2) return 0.5 * (1 - (d - CFG.safeRadius) / 2) + terrainHeight(x, z);
  return terrainHeight(x, z);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();            // key -> { mesh, props }
    this.loadedKeys = new Set();
    this.lastCenter = null;
    this.propsDirty = true;

    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.buildPools();
    this.buildSpawn();
  }

  // ---------- Instanced prop pools (one draw call per prop type, world wide) ----------
  buildPools() {
    const cap = 1500;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.5, 1, 6, 1);
    trunkGeo.translate(0, 0.5, 0);
    const canopyGeo = new THREE.ConeGeometry(1, 1, 7, 1);
    canopyGeo.translate(0, 0.5, 0);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const deadGeo = new THREE.CylinderGeometry(0.12, 0.42, 1, 5, 1);
    deadGeo.translate(0, 0.5, 0);

    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x1d3f2a });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x4a4e52 });
    const deadMat = new THREE.MeshLambertMaterial({ color: 0x2a2320 });

    this.pools = {
      trunk: new THREE.InstancedMesh(trunkGeo, trunkMat, cap),
      canopy: new THREE.InstancedMesh(canopyGeo, canopyMat, cap),
      canopy2: new THREE.InstancedMesh(canopyGeo, canopyMat, cap),
      rock: new THREE.InstancedMesh(rockGeo, rockMat, 600),
      dead: new THREE.InstancedMesh(deadGeo, deadMat, 600),
    };
    for (const p of Object.values(this.pools)) {
      p.count = 0;
      p.frustumCulled = false;
      p.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(p);
    }
  }

  // ---------- Safe zone ----------
  buildSpawn() {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0x6d6a66 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2b2e });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffc777 });

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(CFG.safeRadius, CFG.safeRadius + 1.2, 0.5, 40),
      new THREE.MeshPhongMaterial({ color: 0x6d6a66, shininess: 4 }));
    disc.position.y = 0.25;
    g.add(disc);

    // Ring marking the edge of safety.
    const ring = new THREE.Mesh(new THREE.RingGeometry(CFG.safeRadius - 0.6, CFG.safeRadius - 0.2, 48),
      new THREE.MeshBasicMaterial({ color: 0x5bff9e, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.505;
    g.add(ring);

    // Pillars with lanterns.
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.38, 3.2, 8);
    const lampGeo = new THREE.SphereGeometry(0.28, 8, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * (CFG.safeRadius - 1.5), z = Math.sin(a) * (CFG.safeRadius - 1.5);
      const p = new THREE.Mesh(pillarGeo, dark); p.position.set(x, 2.1, z); g.add(p);
      const l = new THREE.Mesh(lampGeo, glow); l.position.set(x, 3.95, z); g.add(l);
    }
    const light = new THREE.PointLight(0xffb86b, 60, 40, 1.6);
    light.position.set(0, 5, 0);
    g.add(light);

    // Central totem the player can climb.
    const totem = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), dark);
    totem.position.set(0, 1.6, 4); g.add(totem);

    // Terminal: desk + screen facing the centre.
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.7), dark);
    desk.position.set(0, 1.0, -8); g.add(desk);
    this.terminalScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.terminalScreen.position.set(0, 2.05, -7.62);
    this.terminalScreen.name = 'terminal';
    g.add(this.terminalScreen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.35, 0.1), dark);
    frame.position.set(0, 2.05, -7.72); g.add(frame);

    // Paint station: screen on the east side, with a preview statue beside it.
    this.paintScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.paintScreen.position.set(8.4, 1.9, 1.2);
    this.paintScreen.rotation.y = -Math.PI / 2;
    this.paintScreen.name = 'paint';
    g.add(this.paintScreen);
    const pframe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.25, 1.55), dark);
    pframe.position.set(8.5, 1.9, 1.2); g.add(pframe);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.5, 10), stone);
    pedestal.position.set(8.2, 0.75, -1.6); g.add(pedestal);
    this.previewAnchor = new THREE.Object3D();
    this.previewAnchor.position.set(8.2, 1.0, -1.6);
    this.previewAnchor.rotation.y = -Math.PI / 2;
    g.add(this.previewAnchor);

    // Signs.
    const signMat = new THREE.MeshBasicMaterial({ map: makeSign('SAFE ZONE  -  THEY CANNOT ENTER') });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.6), signMat);
    sign.position.set(0, 3.4, -7.6); g.add(sign);

    this.spawnGroup = g;
    this.scene.add(g);
    this.spawnColliders = [
      { x: 0, z: 4, r: 0.85, h: 2.7, y0: 0.5 },      // totem
      { x: 0, z: -8, r: 1.0, h: 1.5, y0: 0.5 },      // desk
      { x: 8.2, z: -1.6, r: 0.8, h: 1.0, y0: 0.5 },  // pedestal
    ];
  }

  // ---------- Chunk streaming ----------
  key(cx, cz) { return cx + ',' + cz; }

  update(centerPos) {
    const cs = CFG.chunkSize;
    const cx = Math.floor(centerPos.x / cs), cz = Math.floor(centerPos.z / cs);
    if (this.lastCenter && this.lastCenter.x === cx && this.lastCenter.z === cz) return;
    this.lastCenter = { x: cx, z: cz };
    const R = CFG.loadRadius;
    const wanted = new Set();
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      wanted.add(this.key(cx + dx, cz + dz));
    }
    for (const k of this.loadedKeys) if (!wanted.has(k)) this.unloadChunk(k);
    // Load nearest first so the ground under the player appears before the horizon.
    const toLoad = [...wanted].filter(k => !this.loadedKeys.has(k));
    toLoad.sort((a, b) => dist2(a, cx, cz) - dist2(b, cx, cz));
    for (const k of toLoad) this.loadChunk(k);
    this.rebuildPools();
  }

  loadChunk(k) {
    const [cx, cz] = k.split(',').map(Number);
    const cs = CFG.chunkSize, seg = CFG.chunkSegments;
    const geo = new THREE.PlaneGeometry(cs, cs, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const ox = cx * cs + cs / 2, oz = cz * cs + cs / 2;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + ox, wz = pos.getZ(i) + oz;
      let h = groundHeight(wx, wz);
      // Keep the terrain mesh under the stone platform so the two never z-fight.
      if (Math.hypot(wx, wz) < CFG.safeRadius + 1.3) h = Math.min(h, 0.1);
      pos.setY(i, h);
      // Ground colour: mossy green in hollows, grey-brown on ridges, darkened randomly.
      const t = Math.min(1, Math.max(0, (h + CFG.hillHeight) / (2 * CFG.hillHeight)));
      const n = 0.75 + 0.25 * hash2(Math.round(wx * 2), Math.round(wz * 2));
      colors[i * 3] = (0.10 + 0.14 * t) * n;
      colors[i * 3 + 1] = (0.16 + 0.06 * t) * n;
      colors[i * 3 + 2] = (0.07 + 0.08 * t) * n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.position.set(ox, 0, oz);
    this.scene.add(mesh);

    // Props, deterministic per chunk.
    const rng = mulberry32(cx * 73856093 ^ cz * 19349663 ^ 0x9e3779b9);
    const props = [];
    const nTrees = 5 + Math.floor(rng() * 6);
    for (let i = 0; i < nTrees; i++) {
      const x = cx * cs + rng() * cs, z = cz * cs + rng() * cs;
      if (Math.hypot(x, z) < CFG.safeRadius + 4) continue;
      const y = groundHeight(x, z);
      const dead = rng() < 0.22;
      const h = dead ? 5 + rng() * 5 : 6 + rng() * 7;
      const r = dead ? 0.35 : 0.45 + rng() * 0.25;
      props.push({ type: dead ? 'dead' : 'tree', x, y, z, h, r, rot: rng() * Math.PI * 2, lean: (rng() - 0.5) * 0.12 });
    }
    const nRocks = Math.floor(rng() * 3);
    for (let i = 0; i < nRocks; i++) {
      const x = cx * cs + rng() * cs, z = cz * cs + rng() * cs;
      if (Math.hypot(x, z) < CFG.safeRadius + 4) continue;
      const r = 0.6 + rng() * 1.3;
      props.push({ type: 'rock', x, y: groundHeight(x, z) - r * 0.35, z, r, rot: rng() * Math.PI * 2 });
    }
    this.chunks.set(k, { mesh, props });
    this.loadedKeys.add(k);
  }

  unloadChunk(k) {
    const c = this.chunks.get(k);
    if (!c) return;
    this.scene.remove(c.mesh);
    c.mesh.geometry.dispose();
    this.chunks.delete(k);
    this.loadedKeys.delete(k);
  }

  rebuildPools() {
    const P = this.pools;
    let nt = 0, nc = 0, nr = 0, nd = 0;
    for (const c of this.chunks.values()) {
      for (const p of c.props) {
        if (p.type === 'tree') {
          _q.setFromAxisAngle(_up, p.rot);
          _m.compose(_v.set(p.x, p.y - 0.3, p.z), _q, _s.set(p.r * 1.3, p.h * 0.45, p.r * 1.3));
          P.trunk.setMatrixAt(nt++, _m);
          _m.compose(_v.set(p.x, p.y + p.h * 0.25, p.z), _q, _s.set(p.r * 5.2, p.h * 0.5, p.r * 5.2));
          P.canopy.setMatrixAt(nc, _m);
          _m.compose(_v.set(p.x, p.y + p.h * 0.5, p.z), _q, _s.set(p.r * 3.8, p.h * 0.5, p.r * 3.8));
          P.canopy2.setMatrixAt(nc++, _m);
        } else if (p.type === 'dead') {
          _q.setFromAxisAngle(_up, p.rot);
          _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.lean));
          _m.compose(_v.set(p.x, p.y - 0.3, p.z), _q, _s.set(p.r * 1.4, p.h, p.r * 1.4));
          P.dead.setMatrixAt(nd++, _m);
        } else {
          _q.setFromAxisAngle(_up, p.rot);
          _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.r, p.r * 0.75, p.r * 1.2));
          P.rock.setMatrixAt(nr++, _m);
        }
      }
    }
    P.trunk.count = nt; P.canopy.count = nc; P.canopy2.count = nc; P.rock.count = nr; P.dead.count = nd;
    for (const p of Object.values(P)) p.instanceMatrix.needsUpdate = true;
  }

  // ---------- Collision queries ----------
  // Iterate props near a world position (its chunk and the 8 neighbours).
  *nearbyProps(x, z) {
    const cs = CFG.chunkSize;
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.chunks.get(this.key(cx + dx, cz + dz));
      if (c) for (const p of c.props) yield p;
    }
    if (Math.hypot(x, z) < CFG.safeRadius + 3) for (const p of this.spawnColliders) yield p;
  }

  // Does a hand of radius `rad` touch a surface at `pos`? Returns the correction that
  // lifts/pushes the hand out of the surface, or null when nothing is touched.
  handContact(pos, rad, out) {
    let hit = false;
    out.set(0, 0, 0);
    const gh = groundHeight(pos.x, pos.z);
    if (pos.y < gh + rad) { out.y = gh + rad - pos.y; hit = true; }
    for (const p of this.nearbyProps(pos.x, pos.z)) {
      const r = (p.type === 'rock') ? p.r * 0.9 : (p.type === 'dead' ? p.r * 0.9 : p.r * 0.75);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const base = p.y0 !== undefined ? p.y0 : p.y;
      const top = base + (p.h || p.r * 1.5);
      if (p.type === 'rock') {
        // Rocks are rounded: treat as a sphere.
        const dy = pos.y - (p.y + p.r * 0.4);
        const dd = Math.hypot(d, dy);
        if (dd < p.r * 0.9 + rad && dd > 1e-4) {
          const k = (p.r * 0.9 + rad - dd) / dd;
          out.x += dx * k; out.y += dy * k; out.z += dz * k; hit = true;
        }
      } else if (d < r + rad && pos.y > base - 0.5 && pos.y < top) {
        const k = d > 1e-4 ? (r + rad - d) / d : 1;
        out.x += dx * k; out.z += dz * k; hit = true;
      }
    }
    return hit;
  }

  // Keep a body (cylinder of radius `rad` at `pos`) out of trunks and rocks.
  pushOutBody(pos, rad) {
    for (const p of this.nearbyProps(pos.x, pos.z)) {
      const r = (p.type === 'rock') ? p.r * 0.8 : p.r * 0.75;
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const base = p.y0 !== undefined ? p.y0 : p.y;
      const top = base + (p.h || p.r * 1.2);
      if (d < r + rad && d > 1e-4 && pos.y < top && pos.y > base - 1) {
        const k = (r + rad - d) / d;
        pos.x += dx * k; pos.z += dz * k;
      }
    }
  }
}

function dist2(k, cx, cz) { const [x, z] = k.split(',').map(Number); return (x - cx) ** 2 + (z - cz) ** 2; }

function makeSign(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#101512'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#5bff9e'; g.lineWidth = 8; g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = '#b7ffcf'; g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
