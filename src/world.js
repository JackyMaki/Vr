import * as THREE from 'three';
import { CFG } from './config.js';
import { hash2, fbm } from './noise.js';
import { tex } from './textures.js';
import { shapedHeight, generateChunk, biomeAt, regionOf, regionFloor } from './biomes.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(1, 0, 0);

export function groundHeight(x, z) {
  const d = Math.hypot(x, z);
  if (d < CFG.safeRadius) return 0.5;
  const t = shapedHeight(x, z) * smooth(CFG.safeRadius + 3, CFG.safeRadius + 32, d);
  if (d < CFG.safeRadius + 2) return 0.5 * (1 - (d - CFG.safeRadius) / 2) + t;
  return t;
}
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function merge(items) {
  const pos = [], nor = [], uv = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const it of items) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    e.set(...(it.rot || [0, 0, 0])); q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(it.pos || [0, 0, 0])), q, new THREE.Vector3(...(it.scale || [1, 1, 1])));
    g.applyMatrix4(m);
    pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); uv.push(g.attributes.uv.array);
  }
  const cat = (arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0); const out = new Float32Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
  out.setAttribute('uv', new THREE.BufferAttribute(cat(uv), 2));
  return out;
}
const rep = (name, r) => { const t = tex(name).clone(); t.repeat.set(r, r); t.needsUpdate = true; return t; };

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.loadedKeys = new Set();
    this.lastCenter = null;
    this.onItems = null;      // (chunkKey, items[]) when a chunk loads; (chunkKey, null) when it unloads

    this.terrainMat = new THREE.MeshPhongMaterial({ map: tex('ground'), vertexColors: true, shininess: 2 });
    this.ceilMats = {
      backrooms: new THREE.MeshPhongMaterial({ map: rep('ceilingTile', 6), color: 0xbdb8a8, side: THREE.DoubleSide }),
      cave: new THREE.MeshPhongMaterial({ map: rep('rock', 5), color: 0x8a8a90, vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
      factory: new THREE.MeshPhongMaterial({ map: rep('metal', 8), color: 0x555a60, side: THREE.DoubleSide }),
    };
    this.waterMat = new THREE.MeshPhongMaterial({ map: tex('water'), color: 0x5a7a70, transparent: true, opacity: 0.72, shininess: 80, specular: 0x88aaa0 });
    this.buildPools();
    this.buildSpawn();
  }

  // ---------- Instanced prop pools: one draw call per pool, world wide ----------
  buildPools() {
    const P = (geo, mat, cap = 900) => ({ geo, mat, cap });
    const base = (g) => { g.translate(0, 0.5, 0); return g; };
    const bark = new THREE.MeshPhongMaterial({ map: tex('bark'), color: 0x8a6a4a, shininess: 2 });
    const darkBark = new THREE.MeshPhongMaterial({ map: tex('bark'), color: 0x4a3a30, shininess: 2 });
    const leaves = new THREE.MeshPhongMaterial({ map: tex('leaves'), color: 0x5a8a50, shininess: 1, flatShading: true });
    const rockM = new THREE.MeshPhongMaterial({ map: tex('rock'), color: 0x9a9a9a, flatShading: true, shininess: 4 });
    const green = new THREE.MeshLambertMaterial({ color: 0x2f5a2a });
    const metal = new THREE.MeshPhongMaterial({ map: rep('metal', 2), color: 0x9aa0a6, shininess: 40, specular: 0x666666 });
    const metalBig = new THREE.MeshPhongMaterial({ map: rep('metal', 3), color: 0x7a8088, shininess: 40, specular: 0x666666 });
    const paper = new THREE.MeshPhongMaterial({ map: rep('wallpaper', 1.5), color: 0xffffff, shininess: 3 });
    const stoneM = new THREE.MeshPhongMaterial({ map: tex('stone'), color: 0x9a968e, shininess: 3 });
    const caveWall = new THREE.MeshPhongMaterial({ map: rep('rock', 2), color: 0x8a8a90, flatShading: true });
    const defs = {
      trunk: P(base(new THREE.CylinderGeometry(0.3, 0.45, 1, 7)), bark, 1000),
      canopy: P(base(new THREE.ConeGeometry(1, 1, 8)), leaves, 2600),
      dead: P(base(new THREE.CylinderGeometry(0.12, 0.4, 1, 6)), darkBark, 600),
      branch: P(new THREE.CylinderGeometry(0.05, 0.1, 1, 5).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), darkBark, 1200),
      rock: P(new THREE.SphereGeometry(1, 6, 4), rockM, 600),
      bush: P(new THREE.SphereGeometry(1, 6, 4), leaves, 800),
      grass: P(merge([{ geo: new THREE.ConeGeometry(0.06, 0.5, 3), pos: [0, 0.25, 0] }, { geo: new THREE.ConeGeometry(0.05, 0.4, 3), pos: [0.08, 0.2, 0.04], rot: [0.2, 0, -0.3] }, { geo: new THREE.ConeGeometry(0.05, 0.45, 3), pos: [-0.07, 0.22, -0.03], rot: [-0.2, 0, 0.3] }]), green, 3000),
      mushroom: P(merge([{ geo: new THREE.CylinderGeometry(0.05, 0.07, 0.25, 5), pos: [0, 0.12, 0] }, { geo: new THREE.SphereGeometry(0.16, 7, 4), pos: [0, 0.26, 0], scale: [1, 0.55, 1] }]), new THREE.MeshPhongMaterial({ color: 0x8a5a3a, flatShading: true }), 500),
      glowshroom: P(merge([{ geo: new THREE.CylinderGeometry(0.05, 0.07, 0.25, 5), pos: [0, 0.12, 0] }, { geo: new THREE.SphereGeometry(0.16, 7, 4), pos: [0, 0.26, 0], scale: [1, 0.55, 1] }]), new THREE.MeshPhongMaterial({ color: 0x3aaa9a, emissive: 0x2a8a7a, emissiveIntensity: 1.2, flatShading: true }), 500),
      log: P(new THREE.CylinderGeometry(0.3, 0.35, 3, 7).rotateZ(Math.PI / 2), bark, 300),
      stalag: P(base(new THREE.ConeGeometry(1, 1, 6)), rockM, 900),
      stalac: P(new THREE.ConeGeometry(1, 1, 6).rotateX(Math.PI).translate(0, -0.5, 0), rockM, 1200),
      pillar: P(base(new THREE.CylinderGeometry(1, 1.25, 1, 7)), caveWall, 300),
      wallPaper: P(base(new THREE.BoxGeometry(3, 3, 0.3)), paper, 2500),
      wallMetal: P(base(new THREE.BoxGeometry(3, 7, 0.3)), metalBig, 800),
      wallRock: P(base(new THREE.BoxGeometry(3, 6, 0.6)), caveWall, 800),
      machine: P(merge([{ geo: new THREE.BoxGeometry(3, 2.2, 2), pos: [0, 1.1, 0] }, { geo: new THREE.BoxGeometry(1.2, 0.5, 1.2), pos: [0.6, 2.45, 0] }, { geo: new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8), pos: [-0.9, 2.7, 0.3] }, { geo: new THREE.BoxGeometry(0.6, 0.6, 0.1), pos: [1.0, 1.4, 1.05] }]), metal, 300),
      pipe: P(new THREE.CylinderGeometry(0.25, 0.25, 6, 8).rotateZ(Math.PI / 2), metal, 800),
      barrel: P(merge([{ geo: new THREE.CylinderGeometry(0.45, 0.45, 1, 10), pos: [0, 0.5, 0] }, { geo: new THREE.TorusGeometry(0.46, 0.03, 4, 10).rotateX(Math.PI / 2), pos: [0, 0.25, 0] }, { geo: new THREE.TorusGeometry(0.46, 0.03, 4, 10).rotateX(Math.PI / 2), pos: [0, 0.75, 0] }]), new THREE.MeshPhongMaterial({ map: tex('metal'), color: 0x8a4a2a, shininess: 20 }), 600),
      catwalk: P(merge([{ geo: new THREE.BoxGeometry(6, 0.2, 2), pos: [0, 0, 0] }, { geo: new THREE.BoxGeometry(6, 0.06, 0.06), pos: [0, 1, 0.95] }, { geo: new THREE.BoxGeometry(6, 0.06, 0.06), pos: [0, 1, -0.95] }, { geo: new THREE.BoxGeometry(0.06, 1, 0.06), pos: [-2.9, 0.5, 0.95] }, { geo: new THREE.BoxGeometry(0.06, 1, 0.06), pos: [2.9, 0.5, 0.95] }, { geo: new THREE.BoxGeometry(0.06, 1, 0.06), pos: [-2.9, 0.5, -0.95] }, { geo: new THREE.BoxGeometry(0.06, 1, 0.06), pos: [2.9, 0.5, -0.95] }, { geo: new THREE.BoxGeometry(0.15, 2.8, 0.15), pos: [-2.8, -1.4, -0.8] }, { geo: new THREE.BoxGeometry(0.15, 2.8, 0.15), pos: [2.8, -1.4, 0.8] }]), metal, 300),
      tomb: P(merge([{ geo: new THREE.BoxGeometry(0.7, 0.9, 0.18), pos: [0, 0.45, 0] }, { geo: new THREE.CylinderGeometry(0.35, 0.35, 0.18, 8, 1, false, 0, Math.PI).rotateX(Math.PI / 2), pos: [0, 0.9, 0] }, { geo: new THREE.BoxGeometry(0.9, 0.15, 0.5), pos: [0, 0.07, 0.2] }]), stoneM, 900),
      fence: P(merge([{ geo: new THREE.BoxGeometry(3, 0.08, 0.06), pos: [0, 0.5, 0] }, { geo: new THREE.BoxGeometry(3, 0.08, 0.06), pos: [0, 1.0, 0] }, { geo: new THREE.BoxGeometry(0.1, 1.3, 0.1), pos: [-1.4, 0.65, 0] }, { geo: new THREE.BoxGeometry(0.1, 1.3, 0.1), pos: [1.4, 0.65, 0] }, { geo: new THREE.BoxGeometry(0.1, 1.3, 0.1), pos: [0, 0.65, 0] }]), darkBark, 500),
      panel: P(new THREE.BoxGeometry(1.2, 0.08, 0.6), new THREE.MeshBasicMaterial({ color: 0xf6f0cc }), 1200),
      lamp: P(merge([{ geo: new THREE.ConeGeometry(0.5, 0.35, 8, 1, true), pos: [0, 0, 0] }, { geo: new THREE.SphereGeometry(0.12, 6, 5), pos: [0, -0.1, 0] }, { geo: new THREE.CylinderGeometry(0.02, 0.02, 2.5, 4), pos: [0, 1.4, 0] }]), new THREE.MeshBasicMaterial({ color: 0xffb060 }), 300),
      reed: P(base(new THREE.ConeGeometry(0.03, 1.2, 3)), new THREE.MeshLambertMaterial({ color: 0x4a6a2a }), 3000),
    };
    this.pools = {};
    for (const [name, d] of Object.entries(defs)) {
      const im = new THREE.InstancedMesh(d.geo, d.mat, d.cap);
      im.count = 0; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im);
      this.pools[name] = im;
    }
  }

  // ---------- Safe zone ----------
  buildSpawn() {
    const g = new THREE.Group();
    const stone = new THREE.MeshPhongMaterial({ map: tex('stone'), color: 0x8a8680, shininess: 4 });
    const dark = new THREE.MeshPhongMaterial({ map: tex('metal'), color: 0x3a3a40, shininess: 30 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffc777 });

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(CFG.safeRadius, CFG.safeRadius + 1.2, 0.5, 40), stone);
    disc.position.y = 0.25; g.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(CFG.safeRadius - 0.6, CFG.safeRadius - 0.2, 48),
      new THREE.MeshBasicMaterial({ color: 0x5bff9e, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.505; g.add(ring);

    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.38, 3.2, 8);
    const lampGeo = new THREE.SphereGeometry(0.28, 8, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * (CFG.safeRadius - 1.5), z = Math.sin(a) * (CFG.safeRadius - 1.5);
      const p = new THREE.Mesh(pillarGeo, stone); p.position.set(x, 2.1, z); g.add(p);
      const l = new THREE.Mesh(lampGeo, glow); l.position.set(x, 3.95, z); g.add(l);
    }
    const light = new THREE.PointLight(0xffb86b, 70, 42, 1.6);
    light.position.set(0, 5, 0); g.add(light);

    const totem = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), stone);
    totem.position.set(0, 1.6, 4); g.add(totem);

    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.7), dark);
    desk.position.set(0, 1.0, -8); g.add(desk);
    this.terminalScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.terminalScreen.position.set(0, 2.05, -7.62); this.terminalScreen.name = 'terminal'; g.add(this.terminalScreen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.35, 0.1), dark);
    frame.position.set(0, 2.05, -7.72); g.add(frame);

    this.paintScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.paintScreen.position.set(8.4, 1.9, 1.2); this.paintScreen.rotation.y = -Math.PI / 2; this.paintScreen.name = 'paint'; g.add(this.paintScreen);
    const pframe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.25, 1.55), dark);
    pframe.position.set(8.5, 1.9, 1.2); g.add(pframe);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.5, 10), stone);
    pedestal.position.set(8.2, 0.75, -1.6); g.add(pedestal);
    this.previewAnchor = new THREE.Object3D();
    this.previewAnchor.position.set(8.2, 1.0, -1.6); this.previewAnchor.rotation.y = -Math.PI / 2; g.add(this.previewAnchor);

    // A guide board instead of HUD text: how to play, carved into the world.
    this.guideScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.guideScreen.position.set(-8.4, 2.0, 1.2); this.guideScreen.rotation.y = Math.PI / 2; this.guideScreen.name = 'guide'; g.add(this.guideScreen);
    const gframe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.75, 2.55), dark);
    gframe.position.set(-8.5, 2.0, 1.2); g.add(gframe);

    // Starter throwables on the platform.
    this.spawnItems = [{ type: 'rock', x: 2, y: 0.5, z: -3 }, { type: 'rock', x: -2.5, y: 0.5, z: -2 }, { type: 'bottle', x: 3, y: 0.5, z: 2 }, { type: 'brick', x: -3, y: 0.5, z: 3 }];

    this.spawnGroup = g;
    this.scene.add(g);
    this.spawnColliders = [
      { kind: 'box', x: 0, z: 4, hx: 0.6, hz: 0.6, y0: 0.5, h: 2.2 },
      { kind: 'box', x: 0, z: -8, hx: 0.9, hz: 0.35, y0: 0.5, h: 1.0 },
      { kind: 'cyl', x: 8.2, z: -1.6, r: 0.75, y0: 0.5, h: 1.0 },
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
    const toLoad = [...wanted].filter(k => !this.loadedKeys.has(k));
    toLoad.sort((a, b) => dist2(a, cx, cz) - dist2(b, cx, cz));
    for (const k of toLoad) this.loadChunk(k);
    this.rebuildPools();
  }

  loadChunk(k) {
    const [cx, cz] = k.split(',').map(Number);
    const cs = CFG.chunkSize, seg = CFG.chunkSegments;
    const ox = cx * cs + cs / 2, oz = cz * cs + cs / 2;
    const gen = generateChunk(cx, cz, groundHeight);

    const geo = new THREE.PlaneGeometry(cs, cs, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uvs = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + ox, wz = pos.getZ(i) + oz;
      let h = groundHeight(wx, wz);
      if (Math.hypot(wx, wz) < CFG.safeRadius + 1.3) h = Math.min(h, 0.1);
      pos.setY(i, h);
      uvs.setXY(i, wx / cs, wz / cs);       // world-space UVs so the grain tiles seamlessly
      const b = biomeAt(wx, wz);
      const n = 0.75 + 0.25 * hash2(Math.round(wx * 2), Math.round(wz * 2));
      let r, g, bl;
      if (b.tint) { [r, g, bl] = b.tint; }
      else {
        const t = Math.min(1, Math.max(0, (h + CFG.hillHeight) / (2 * CFG.hillHeight)));
        r = 0.22 + 0.2 * t; g = 0.32 + 0.08 * t; bl = 0.14 + 0.1 * t;
      }
      colors[i * 3] = r * n; colors[i * 3 + 1] = g * n; colors[i * 3 + 2] = bl * n;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.position.set(ox, 0, oz);
    this.scene.add(mesh);

    const chunk = { mesh, inst: gen.inst, colliders: gen.colliders, items: gen.items, extra: [], biome: gen.biome };
    if (gen.ceiling) {
      const cg = new THREE.PlaneGeometry(cs, cs, gen.ceiling.kind === 'cave' ? seg : 1, gen.ceiling.kind === 'cave' ? seg : 1);
      cg.rotateX(Math.PI / 2);
      const cp = cg.attributes.position, cu = cg.attributes.uv;
      const cc = new Float32Array(cp.count * 3);
      for (let i = 0; i < cp.count; i++) {
        const wx = cp.getX(i) + ox, wz = cp.getZ(i) + oz;
        let h = gen.ceiling.h;
        if (gen.ceiling.kind === 'cave') h += 0.3 - fbm(wx * 0.07, wz * 0.07, 2) * 2.5;
        cp.setY(i, h); cu.setXY(i, wx / cs, wz / cs);
        const n = 0.5 + 0.5 * hash2(Math.round(wx), Math.round(wz));
        cc[i * 3] = n; cc[i * 3 + 1] = n; cc[i * 3 + 2] = n;
      }
      cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      cg.computeVertexNormals();
      const cm = new THREE.Mesh(cg, this.ceilMats[gen.ceiling.kind]);
      cm.position.set(ox, 0, oz);
      this.scene.add(cm); chunk.extra.push(cm);
      chunk.ceiling = gen.ceiling.h;
    }
    if (gen.water !== null) {
      const wg = new THREE.PlaneGeometry(cs, cs, 1, 1); wg.rotateX(-Math.PI / 2);
      const wu = wg.attributes.uv, wp = wg.attributes.position;
      for (let i = 0; i < wp.count; i++) wu.setXY(i, (wp.getX(i) + ox) / cs, (wp.getZ(i) + oz) / cs);
      const wm = new THREE.Mesh(wg, this.waterMat);
      wm.position.set(ox, gen.water, oz);
      this.scene.add(wm); chunk.extra.push(wm);
      chunk.water = gen.water;
    }
    this.chunks.set(k, chunk);
    this.loadedKeys.add(k);
    if (this.onItems) this.onItems(k, gen.items);
  }

  unloadChunk(k) {
    const c = this.chunks.get(k);
    if (!c) return;
    this.scene.remove(c.mesh); c.mesh.geometry.dispose();
    for (const e of c.extra) { this.scene.remove(e); e.geometry.dispose(); }
    this.chunks.delete(k);
    this.loadedKeys.delete(k);
    if (this.onItems) this.onItems(k, null);
  }

  rebuildPools() {
    const counts = {};
    for (const name in this.pools) counts[name] = 0;
    for (const c of this.chunks.values()) {
      for (const p of c.inst) {
        const pool = this.pools[p.pool];
        if (!pool || counts[p.pool] >= pool.count + 0 && counts[p.pool] >= pool.instanceMatrix.count) continue;
        _q.setFromAxisAngle(_up, p.yaw);
        if (p.tilt) { _q2.setFromAxisAngle(_x, p.tilt); _q.multiply(_q2); }
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.sx, p.sy, p.sz));
        pool.setMatrixAt(counts[p.pool]++, _m);
      }
    }
    for (const name in this.pools) { this.pools[name].count = counts[name]; this.pools[name].instanceMatrix.needsUpdate = true; }
  }

  chunkAt(x, z) { const cs = CFG.chunkSize; return this.chunks.get(this.key(Math.floor(x / cs), Math.floor(z / cs))); }
  ceilingAt(x, z) { const c = this.chunkAt(x, z); return c && c.ceiling !== undefined ? c.ceiling : Infinity; }
  waterAt(x, z) { const c = this.chunkAt(x, z); return c && c.water !== undefined ? c.water : -Infinity; }

  // ---------- Collision queries ----------
  *nearby(x, z) {
    const cs = CFG.chunkSize;
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.chunks.get(this.key(cx + dx, cz + dz));
      if (c) for (const p of c.colliders) yield p;
    }
    if (Math.hypot(x, z) < CFG.safeRadius + 3) for (const p of this.spawnColliders) yield p;
  }

  // Sphere of radius rad at pos vs all colliders; `out` gets the push-out, returns hit.
  contact(pos, rad, out) {
    let hit = false;
    out.set(0, 0, 0);
    const gh = groundHeight(pos.x, pos.z);
    if (pos.y < gh + rad) { out.y = gh + rad - pos.y; hit = true; }
    for (const p of this.nearby(pos.x, pos.z)) {
      if (p.kind === 'cyl') {
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz);
        if (pos.y > p.y0 - 0.3 && pos.y < p.y0 + p.h + rad) {
          if (pos.y > p.y0 + p.h - rad && d < p.r) { out.y += p.y0 + p.h + rad - pos.y; hit = true; }   // standing on top
          else if (d < p.r + rad) { const k = d > 1e-4 ? (p.r + rad - d) / d : 1; out.x += dx * k; out.z += dz * k; hit = true; }
        }
      } else if (p.kind === 'sphere') {
        const dx = pos.x - p.x, dy = pos.y - p.y, dz = pos.z - p.z, dd = Math.hypot(dx, dy, dz);
        if (dd < p.r + rad && dd > 1e-4) { const k = (p.r + rad - dd) / dd; out.x += dx * k; out.y += dy * k; out.z += dz * k; hit = true; }
      } else {
        // Box: closest point on the AABB.
        const cx = Math.max(p.x - p.hx, Math.min(p.x + p.hx, pos.x));
        const cy = Math.max(p.y0, Math.min(p.y0 + p.h, pos.y));
        const cz = Math.max(p.z - p.hz, Math.min(p.z + p.hz, pos.z));
        let dx = pos.x - cx, dy = pos.y - cy, dz = pos.z - cz;
        const dd = Math.hypot(dx, dy, dz);
        if (dd < rad) {
          if (dd < 1e-5) {
            // Inside: push out along the thinnest axis.
            const px = p.hx - Math.abs(pos.x - p.x), pz = p.hz - Math.abs(pos.z - p.z), py = p.y0 + p.h - pos.y;
            if (py <= px && py <= pz) out.y += py + rad; else if (px < pz) out.x += (pos.x > p.x ? 1 : -1) * (px + rad); else out.z += (pos.z > p.z ? 1 : -1) * (pz + rad);
          } else { const k = (rad - dd) / dd; out.x += dx * k; out.y += dy * k; out.z += dz * k; }
          hit = true;
        }
      }
    }
    return hit;
  }

  // Keep a standing body (xz position, radius) out of walls and props.
  pushOutBody(pos, rad) {
    for (const p of this.nearby(pos.x, pos.z)) {
      if (p.kind === 'cyl') {
        if (pos.y < p.y0 - 0.2 || pos.y > p.y0 + p.h) continue;
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz);
        if (d < p.r + rad && d > 1e-4) { const k = (p.r + rad - d) / d; pos.x += dx * k; pos.z += dz * k; }
      } else if (p.kind === 'box') {
        if (pos.y < p.y0 - 0.2 || pos.y > p.y0 + p.h - 0.05) continue;
        const cx = Math.max(p.x - p.hx, Math.min(p.x + p.hx, pos.x)), cz = Math.max(p.z - p.hz, Math.min(p.z + p.hz, pos.z));
        const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
        if (d < rad) {
          if (d < 1e-5) { const px = p.hx - Math.abs(pos.x - p.x), pz = p.hz - Math.abs(pos.z - p.z); if (px < pz) pos.x += (pos.x > p.x ? 1 : -1) * (px + rad); else pos.z += (pos.z > p.z ? 1 : -1) * (pz + rad); }
          else { const k = (rad - d) / d; pos.x += dx * k; pos.z += dz * k; }
        }
      } else if (p.kind === 'sphere') {
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz);
        if (Math.abs(pos.y - p.y) < p.r && d < p.r * 0.8 + rad && d > 1e-4) { const k = (p.r * 0.8 + rad - d) / d; pos.x += dx * k; pos.z += dz * k; }
      }
    }
  }

  // Floor under a point: ground, or the top of a box/cylinder below the body.
  floorAt(x, z, yRef) {
    let f = groundHeight(x, z);
    for (const p of this.nearby(x, z)) {
      let top = -Infinity;
      if (p.kind === 'box' && Math.abs(x - p.x) <= p.hx + 0.2 && Math.abs(z - p.z) <= p.hz + 0.2) top = p.y0 + p.h;
      else if (p.kind === 'cyl' && Math.hypot(x - p.x, z - p.z) <= p.r + 0.15) top = p.y0 + p.h;
      if (top > f && top <= yRef + 0.7) f = top;
    }
    return f;
  }
}

function dist2(k, cx, cz) { const [x, z] = k.split(',').map(Number); return (x - cx) ** 2 + (z - cz) ** 2; }
