import * as THREE from 'three';
import { CFG } from './config.js';
import { hash2, fbm } from './noise.js';
import { tex } from './textures.js';
import { shapedHeight, generateChunk, biomeAt } from './biomes.js';
export { biomeAt };
import { corpseGeometries } from './monkey.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(1, 0, 0);

export function groundHeight(x, z) {
  const d = Math.hypot(x, z);
  if (d < CFG.safeRadius) return 0.5;
  const t = shapedHeight(x, z) * smooth(CFG.safeRadius + 3, CFG.safeRadius + 20, d);
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
const rep = (name, r, r2) => { const t = tex(name).clone(); t.repeat.set(r, r2 === undefined ? r : r2); t.needsUpdate = true; return t; };
const B = (w, h, d, pos, rot) => ({ geo: new THREE.BoxGeometry(w, h, d), pos, rot });
const C = (r1, r2, h, n, pos, rot) => ({ geo: new THREE.CylinderGeometry(r1, r2, h, n), pos, rot });
const S = (r, pos, scale) => ({ geo: new THREE.SphereGeometry(r, 6, 4), pos, scale });

// The generated content is cached so neighbours' lights can be sampled for baking.
const genCache = new Map();
export function chunkContent(cx, cz) {
  const k = cx + ',' + cz;
  let c = genCache.get(k);
  if (!c) { c = generateChunk(cx, cz, groundHeight); genCache.set(k, c); if (genCache.size > 400) genCache.delete(genCache.keys().next().value); }
  return c;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.loadedKeys = new Set();
    this.lastCenter = null;
    this.onItems = null;
    this.flickerPools = [];
    this.time = 0;

    this.terrainMat = new THREE.MeshPhongMaterial({ map: tex('ground'), vertexColors: true, shininess: 4 });
    const ceil = (name, r, color, extra = {}) => new THREE.MeshPhongMaterial({ map: rep(name, r), color, vertexColors: true, side: THREE.DoubleSide, ...extra });
    this.ceilMats = {
      halls: ceil('ceilingTile', 6, 0xbdb8a8), morgue: ceil('tile', 6, 0xd0d0c8), backrooms: ceil('ceilingTile', 6, 0xbdb8a8),
      cave: ceil('rock', 5, 0x8a8a90, { flatShading: true }), factory: ceil('metal', 8, 0x555a60), sewer: ceil('brick', 6, 0x8a8078),
      atrium: ceil('metal', 10, 0x3a3e44),
    };
    this.waterMat = new THREE.MeshPhongMaterial({ map: tex('water'), color: 0x4a6a50, transparent: true, opacity: 0.75, shininess: 80, specular: 0x88aaa0 });
    this.buildPools();
    this.buildSpawn();
  }

  // ---------- Instanced prop pools ----------
  buildPools() {
    const P = (geo, mat, cap = 900, opts = {}) => ({ geo, mat, cap, ...opts });
    const base = (g) => { g.translate(0, 0.5, 0); return g; };
    const phong = (o) => new THREE.MeshPhongMaterial(o);
    const bark = phong({ map: tex('bark'), color: 0x8a6a4a, shininess: 2 });
    const darkBark = phong({ map: tex('bark'), color: 0x4a3a30, shininess: 2 });
    const leaves = phong({ map: tex('leaves'), color: 0x5a8a50, shininess: 1, flatShading: true });
    const rockM = phong({ map: tex('rock'), color: 0x9a9a9a, flatShading: true, shininess: 4 });
    const green = new THREE.MeshLambertMaterial({ color: 0x2f5a2a });
    const metal = phong({ map: rep('metal', 2), color: 0x9aa0a6, shininess: 40, specular: 0x666666 });
    const metalBig = phong({ map: rep('metal', 3), color: 0x7a8088, shininess: 40, specular: 0x666666 });
    const metalDark = phong({ map: rep('metal', 1.5), color: 0x50545a, shininess: 30 });
    const paper = phong({ map: rep('wallpaper', 1.5), color: 0xffffff, shininess: 3 });
    const plaster = phong({ map: rep('plaster', 1.5, 1), color: 0xb8b4aa, shininess: 2 });
    const brick = phong({ map: rep('brick', 2, 2.6), color: 0xa09890, shininess: 2 });
    const tile = phong({ map: rep('tile', 2, 2.2), color: 0xd8d8d0, shininess: 25 });
    const wood = phong({ map: tex('wood'), color: 0xa0876a, shininess: 6 });
    const stoneM = phong({ map: tex('stone'), color: 0x9a968e, shininess: 3 });
    const caveWall = phong({ map: rep('rock', 2), color: 0x8a8a90, flatShading: true });
    const cloth = phong({ map: tex('skin'), color: 0x8a8a7a, shininess: 1 });
    const bone = phong({ map: tex('bone'), color: 0xd8d0b8, flatShading: true });
    const corpseMat = phong({ map: tex('fur'), color: 0x5a4a44, flatShading: true, shininess: 2 });
    const decal = (name, color, opacity = 1) => phong({ map: tex(name), color, transparent: true, alphaTest: 0.15, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide, shininess: 0 });
    const emis = (color) => new THREE.MeshBasicMaterial({ color });
    const corpse = corpseGeometries();
    const defs = {
      // Nature (atrium).
      trunk: P(base(new THREE.CylinderGeometry(0.3, 0.45, 1, 7)), bark, 500),
      canopy: P(base(new THREE.ConeGeometry(1, 1, 8)), leaves, 1500),
      dead: P(base(new THREE.CylinderGeometry(0.12, 0.4, 1, 6)), darkBark, 300),
      rock: P(new THREE.SphereGeometry(1, 6, 4), rockM, 400),
      bush: P(new THREE.SphereGeometry(1, 6, 4), leaves, 600),
      grass: P(merge([{ geo: new THREE.ConeGeometry(0.06, 0.5, 3), pos: [0, 0.25, 0] }, { geo: new THREE.ConeGeometry(0.05, 0.4, 3), pos: [0.08, 0.2, 0.04], rot: [0.2, 0, -0.3] }, { geo: new THREE.ConeGeometry(0.05, 0.45, 3), pos: [-0.07, 0.22, -0.03], rot: [-0.2, 0, 0.3] }]), green, 2500),
      mushroom: P(merge([C(0.05, 0.07, 0.25, 5, [0, 0.12, 0]), S(0.16, [0, 0.26, 0], [1, 0.55, 1])]), phong({ color: 0x8a5a3a, flatShading: true }), 400),
      glowshroom: P(merge([C(0.05, 0.07, 0.25, 5, [0, 0.12, 0]), S(0.16, [0, 0.26, 0], [1, 0.55, 1])]), phong({ color: 0x3aaa9a, emissive: 0x2a8a7a, emissiveIntensity: 1.2, flatShading: true }), 600),
      planter: P(merge([B(3, 0.8, 1.2, [0, 0.4, 0]), { geo: new THREE.BoxGeometry(2.8, 0.1, 1.0), pos: [0, 0.82, 0] }]), wood, 200),
      bench: P(merge([B(1.6, 0.08, 0.5, [0, 0.46, 0]), B(0.08, 0.46, 0.5, [-0.7, 0.23, 0]), B(0.08, 0.46, 0.5, [0.7, 0.23, 0]), B(1.6, 0.4, 0.06, [0, 0.72, -0.24], [-0.15, 0, 0])]), wood, 200),
      skylight: P(new THREE.BoxGeometry(3, 0.1, 3), emis(0xbcd8ff), 300, { lightPool: true }),
      beam: P(new THREE.BoxGeometry(8, 0.4, 0.3), metalDark, 300),
      vine: P(new THREE.CylinderGeometry(0.03, 0.06, 1, 4).translate(0, -0.5, 0), green, 1200),
      // Cave.
      stalag: P(base(new THREE.ConeGeometry(1, 1, 6)), rockM, 700),
      stalac: P(new THREE.ConeGeometry(1, 1, 6).rotateX(Math.PI).translate(0, -0.5, 0), rockM, 1000),
      pillar: P(base(new THREE.CylinderGeometry(1, 1.25, 1, 7)), caveWall, 200),
      bonepile: P(merge([S(0.12, [0, 0.1, 0], [1, 0.8, 1.1]), C(0.02, 0.02, 0.4, 5, [0.2, 0.05, 0.1], [0, 0.4, 1.57]), C(0.02, 0.02, 0.35, 5, [-0.15, 0.05, -0.1], [0, 1.2, 1.57]), S(0.05, [0.3, 0.04, 0.2]), S(0.06, [-0.3, 0.05, -0.2]), C(0.03, 0.03, 0.3, 5, [0, 0.04, 0.3], [0, 0, 1.57])]), bone, 400),
      // Walls and doors.
      wallPaper: P(base(new THREE.BoxGeometry(3, 3, 0.3)), paper, 2000),
      wallMetal: P(base(new THREE.BoxGeometry(3, 7, 0.3)), metalBig, 800),
      wallRock: P(base(new THREE.BoxGeometry(3, 6, 0.6)), caveWall, 800),
      wallHall: P(base(new THREE.BoxGeometry(3, 3.4, 0.3)), plaster, 3000),
      wallBrick: P(base(new THREE.BoxGeometry(3, 4, 0.4)), brick, 1200),
      wallTile: P(base(new THREE.BoxGeometry(3, 3.2, 0.3)), tile, 1200),
      doorFrame: P(merge([B(0.2, 2.3, 0.35, [-1.3, 1.15, 0]), B(0.2, 2.3, 0.35, [1.3, 1.15, 0]), B(2.8, 0.25, 0.35, [0, 2.42, 0])]), metalDark, 1500),
      door: P(merge([B(1.1, 2.2, 0.08, [0.55, 1.1, 0]), S(0.04, [1.0, 1.05, 0.06])]), wood, 600),
      // Furniture and clutter.
      locker: P(merge([B(0.6, 2, 0.5, [0, 1, 0]), B(0.4, 0.03, 0.02, [0, 1.5, 0.26]), B(0.4, 0.03, 0.02, [0, 1.42, 0.26]), B(0.4, 0.03, 0.02, [0, 1.34, 0.26]), B(0.05, 0.12, 0.03, [0.2, 1.0, 0.26])]), metalDark, 800),
      desk: P(merge([B(1.6, 0.06, 0.8, [0, 0.75, 0]), B(0.5, 0.72, 0.75, [-0.5, 0.36, 0]), B(0.06, 0.72, 0.75, [0.75, 0.36, 0])]), wood, 400),
      chair: P(merge([B(0.45, 0.05, 0.45, [0, 0.45, 0]), B(0.45, 0.5, 0.05, [0, 0.72, -0.2]), C(0.02, 0.02, 0.45, 4, [-0.18, 0.22, -0.18]), C(0.02, 0.02, 0.45, 4, [0.18, 0.22, -0.18]), C(0.02, 0.02, 0.45, 4, [-0.18, 0.22, 0.18]), C(0.02, 0.02, 0.45, 4, [0.18, 0.22, 0.18])]), metalDark, 600),
      monitor: P(merge([B(0.5, 0.35, 0.05, [0, 0.3, 0]), B(0.15, 0.1, 0.1, [0, 0.05, 0]), B(0.3, 0.02, 0.2, [0, 0.01, 0])]), metalDark, 400),
      crate: P(merge([B(1, 1, 1, [0, 0.5, 0]), B(1.04, 0.08, 0.08, [0, 0.5, 0.5]), B(0.08, 1.04, 0.08, [0.5, 0.5, 0.5]), B(1.04, 0.08, 0.08, [0, 0.5, -0.5]), B(0.08, 1.04, 0.08, [-0.5, 0.5, 0.5])]), wood, 900),
      shelf: P(merge([B(0.06, 2, 0.5, [-0.95, 1, 0]), B(0.06, 2, 0.5, [0.95, 1, 0]), B(1.9, 0.04, 0.5, [0, 0.4, 0]), B(1.9, 0.04, 0.5, [0, 1.0, 0]), B(1.9, 0.04, 0.5, [0, 1.6, 0]), B(0.4, 0.3, 0.3, [-0.5, 1.15, 0]), B(0.3, 0.25, 0.3, [0.4, 0.53, 0])]), wood, 500),
      bed: P(merge([B(2, 0.15, 0.95, [0, 0.55, 0]), B(0.06, 0.9, 0.95, [-0.97, 0.45, 0]), B(0.06, 0.6, 0.95, [0.97, 0.3, 0]), C(0.03, 0.03, 0.45, 4, [-0.9, 0.22, 0.4]), C(0.03, 0.03, 0.45, 4, [0.9, 0.22, 0.4]), C(0.03, 0.03, 0.45, 4, [-0.9, 0.22, -0.4]), C(0.03, 0.03, 0.45, 4, [0.9, 0.22, -0.4])]), metalDark, 400),
      mattress: P(new THREE.BoxGeometry(1.9, 0.15, 0.85).translate(0, 0.7, 0), cloth, 400),
      corpse: P(corpse.body, corpseMat, 400),
      corpseHead: P(corpse.head, corpseMat, 400),
      debris: P(merge([B(0.3, 0.02, 0.4, [0, 0.01, 0], [0, 0.3, 0]), B(0.25, 0.02, 0.35, [0.3, 0.012, 0.2], [0, 1.2, 0]), B(0.4, 0.1, 0.1, [-0.3, 0.05, 0.1], [0, 0.5, 0]), S(0.06, [0.2, 0.05, -0.3])]), cloth, 800),
      vent: P(merge([B(0.08, 0.5, 0.8, [0, 0, 0]), B(0.03, 0.03, 0.7, [0.05, 0.15, 0]), B(0.03, 0.03, 0.7, [0.05, 0.05, 0]), B(0.03, 0.03, 0.7, [0.05, -0.05, 0]), B(0.03, 0.03, 0.7, [0.05, -0.15, 0])]), metalDark, 400),
      cable: P(new THREE.CylinderGeometry(0.03, 0.03, 6, 4).rotateZ(Math.PI / 2), phong({ color: 0x151515 }), 800),
      pipe: P(new THREE.CylinderGeometry(0.25, 0.25, 6, 8).rotateZ(Math.PI / 2), metal, 800),
      chain: P(new THREE.CylinderGeometry(0.03, 0.03, 1, 4).translate(0, -0.5, 0), metalDark, 300),
      wallLamp: P(merge([B(0.3, 0.12, 0.1, [0, 0, 0]), B(0.2, 0.06, 0.06, [0, 0, 0.08]), B(0.1, 0.3, 0.1, [0, -0.2, 0])]), emis(0xffe2a0), 600, { lightPool: true }),
      panel: P(new THREE.BoxGeometry(1.2, 0.08, 0.6), emis(0xf6f0cc), 1500, { lightPool: true }),
      lamp: P(merge([{ geo: new THREE.ConeGeometry(0.5, 0.35, 8, 1, true), pos: [0, 0, 0] }, S(0.12, [0, -0.1, 0]), C(0.02, 0.02, 2.5, 4, [0, 1.4, 0])]), emis(0xffb060), 300, { lightPool: true }),
      // Factory.
      machine: P(merge([B(3, 2.2, 2, [0, 1.1, 0]), B(1.2, 0.5, 1.2, [0.6, 2.45, 0]), C(0.3, 0.3, 1.2, 8, [-0.9, 2.7, 0.3]), B(0.6, 0.6, 0.1, [1.0, 1.4, 1.05]), B(0.2, 0.2, 0.1, [-0.8, 1.6, 1.05]), B(2.6, 0.1, 0.1, [0, 0.4, 1.05])]), metal, 300),
      console: P(merge([B(0.8, 1.0, 0.5, [0, 0.5, 0]), B(0.8, 0.4, 0.5, [0, 1.1, -0.1], [-0.5, 0, 0])]), metalDark, 300),
      barrel: P(merge([C(0.45, 0.45, 1, 10, [0, 0.5, 0]), { geo: new THREE.TorusGeometry(0.46, 0.03, 4, 10).rotateX(Math.PI / 2), pos: [0, 0.25, 0] }, { geo: new THREE.TorusGeometry(0.46, 0.03, 4, 10).rotateX(Math.PI / 2), pos: [0, 0.75, 0] }]), phong({ map: tex('metal'), color: 0x8a4a2a, shininess: 20 }), 600),
      catwalk: P(merge([B(6, 0.2, 2, [0, 0, 0]), B(6, 0.06, 0.06, [0, 1, 0.95]), B(6, 0.06, 0.06, [0, 1, -0.95]), B(0.06, 1, 0.06, [-2.9, 0.5, 0.95]), B(0.06, 1, 0.06, [2.9, 0.5, 0.95]), B(0.06, 1, 0.06, [-2.9, 0.5, -0.95]), B(0.06, 1, 0.06, [2.9, 0.5, -0.95]), B(0.15, 2.8, 0.15, [-2.8, -1.4, -0.8]), B(0.15, 2.8, 0.15, [2.8, -1.4, 0.8])]), metal, 300),
      grate: P(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), phong({ map: tex('grate'), color: 0x8a8a8a, shininess: 40 }), 300),
      // Morgue.
      drawer: P(merge([B(0.9, 0.85, 1.0, [0, 0.45, 0]), B(0.3, 0.05, 0.03, [0, 0.45, 0.52]), B(0.6, 0.6, 0.02, [0, 0.45, 0.51])]), tile, 600),
      drawerOpen: P(merge([B(0.8, 0.1, 1.6, [0, 0.0, 0]), B(0.8, 0.5, 0.06, [0, 0.25, 0.8])]), metalDark, 200),
      slab: P(merge([B(2.0, 0.1, 0.9, [0, 0.85, 0]), B(0.4, 0.8, 0.4, [-0.6, 0.4, 0]), B(0.4, 0.8, 0.4, [0.6, 0.4, 0])]), tile, 300),
      tray: P(merge([B(0.5, 0.05, 0.35, [0, 0.8, 0]), C(0.02, 0.02, 0.8, 4, [-0.2, 0.4, -0.15]), C(0.02, 0.02, 0.8, 4, [0.2, 0.4, 0.15]), S(0.03, [0.1, 0.84, 0]), B(0.2, 0.02, 0.03, [-0.1, 0.84, 0.05], [0, 0.5, 0])]), metal, 300),
      sink: P(merge([B(0.6, 0.9, 0.5, [0, 0.45, 0]), B(0.5, 0.15, 0.4, [0, 0.85, 0]), C(0.02, 0.02, 0.3, 4, [0, 1.05, -0.15])]), tile, 300),
      // Decals.
      smear: P(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decal('blood', 0xffffff), 900),
      stain: P(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decal('blood', 0x1a1a10, 0.7), 500),
      web: P(new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0), decal('web', 0xffffff, 0.8), 500),
      poster: P(new THREE.PlaneGeometry(0.5, 0.7), decal('poster', 0xffffff), 500),
    };
    this.pools = {};
    for (const [name, d] of Object.entries(defs)) {
      const im = new THREE.InstancedMesh(d.geo, d.mat, d.cap);
      im.count = 0; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(d.cap * 3).fill(1), 3);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.userData.lightPool = !!d.lightPool; im.userData.flicker = [];
      this.scene.add(im);
      this.pools[name] = im;
      if (d.lightPool) this.flickerPools.push(im);
    }
  }

  // ---------- Safe room ----------
  buildSpawn() {
    const g = new THREE.Group();
    const stone = new THREE.MeshPhongMaterial({ map: tex('stone'), color: 0x8a8680, shininess: 4 });
    const dark = new THREE.MeshPhongMaterial({ map: tex('metal'), color: 0x3a3a40, shininess: 30 });
    const plaster = new THREE.MeshPhongMaterial({ map: rep('plaster', 8, 1.2), color: 0xa8a49a, shininess: 2 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffc777 });
    const R = 15, H = 3.4;

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(CFG.safeRadius, CFG.safeRadius + 1.2, 0.5, 40), stone);
    disc.position.y = 0.25; g.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(CFG.safeRadius - 0.6, CFG.safeRadius - 0.2, 48), new THREE.MeshBasicMaterial({ color: 0x5bff9e, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.505; g.add(ring);

    // Four walls with a doorway in the middle of each.
    this.spawnColliders = [];
    const wallGeo = new THREE.BoxGeometry(R - 1.5, H, 0.4);
    for (const [ax, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(wallGeo, plaster);
        const off = side * (1.5 + (R - 1.5) / 2);
        if (ax === 'z') { w.position.set(off, H / 2, sign * R); this.spawnColliders.push({ kind: 'box', x: off, z: sign * R, hx: (R - 1.5) / 2, hz: 0.2, y0: 0, h: H }); }
        else { w.position.set(sign * R, H / 2, off); w.rotation.y = Math.PI / 2; this.spawnColliders.push({ kind: 'box', x: sign * R, z: off, hx: 0.2, hz: (R - 1.5) / 2, y0: 0, h: H }); }
        g.add(w);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.45), dark);
      if (ax === 'z') lintel.position.set(0, H - 0.25, sign * R); else { lintel.position.set(sign * R, H - 0.25, 0); lintel.rotation.y = Math.PI / 2; }
      g.add(lintel);
    }

    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.38, 3.0, 8);
    const lampGeo = new THREE.SphereGeometry(0.26, 8, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * (CFG.safeRadius - 1.5), z = Math.sin(a) * (CFG.safeRadius - 1.5);
      const p = new THREE.Mesh(pillarGeo, stone); p.position.set(x, 1.9, z); g.add(p);
      const l = new THREE.Mesh(lampGeo, glow); l.position.set(x, 3.0, z); g.add(l);
    }
    const light = new THREE.PointLight(0xffb86b, 60, 40, 1.6);
    light.position.set(0, 3.0, 0); g.add(light);

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

    this.guideScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.guideScreen.position.set(-8.4, 2.0, 1.2); this.guideScreen.rotation.y = Math.PI / 2; this.guideScreen.name = 'guide'; g.add(this.guideScreen);
    const gframe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.75, 2.55), dark);
    gframe.position.set(-8.5, 2.0, 1.2); g.add(gframe);

    this.spawnItems = [{ type: 'rock', x: 2, y: 0.5, z: -3 }, { type: 'rock', x: -2.5, y: 0.5, z: -2 }, { type: 'bottle', x: 3, y: 0.5, z: 2 }, { type: 'brick', x: -3, y: 0.5, z: 3 }, { type: 'wrench', x: 4, y: 0.5, z: -5 }];
    this.spawnGroup = g;
    this.scene.add(g);
    this.spawnColliders.push(
      { kind: 'box', x: 0, z: 4, hx: 0.6, hz: 0.6, y0: 0.5, h: 2.2 },
      { kind: 'box', x: 0, z: -8, hx: 0.9, hz: 0.35, y0: 0.5, h: 1.0 },
      { kind: 'cyl', x: 8.2, z: -1.6, r: 0.75, y0: 0.5, h: 1.0 },
    );
  }

  // ---------- Baked light ----------
  // Sum of lamp contributions around a point, as an RGB multiplier.
  lightAt(x, y, z, out) {
    const cs = CFG.chunkSize;
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    let r = 0.22, g = 0.22, b = 0.22;
    const d0 = Math.hypot(x, z);
    if (d0 < 24) { const k = 1.6 * Math.max(0, 1 - d0 / 24) ** 2; r += k; g += k * 0.8; b += k * 0.55; }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = genCache.get((cx + dx) + ',' + (cz + dz)) || chunkContent(cx + dx, cz + dz);
      for (const L of c.lights) {
        const d = Math.hypot(x - L.x, (y - L.y) * 0.45, z - L.z);
        if (d >= L.r) continue;
        const k = L.i * (1 - d / L.r) ** 1.6 * 1.9;
        r += k * L.c[0]; g += k * L.c[1]; b += k * L.c[2];
      }
    }
    out[0] = Math.min(1.9, r); out[1] = Math.min(1.9, g); out[2] = Math.min(1.9, b);
    return out;
  }

  // ---------- Chunk streaming ----------
  key(cx, cz) { return cx + ',' + cz; }

  update(centerPos, dt = 0) {
    this.time += dt;
    this.flicker();
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
    const gen = chunkContent(cx, cz);
    const lit = [0, 0, 0];

    const geo = new THREE.PlaneGeometry(cs, cs, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uvs = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + ox, wz = pos.getZ(i) + oz;
      let h = groundHeight(wx, wz);
      if (Math.hypot(wx, wz) < CFG.safeRadius + 1.3) h = Math.min(h, 0.1);
      pos.setY(i, h);
      uvs.setXY(i, wx / cs * 4, wz / cs * 4);
      const b = biomeAt(wx, wz);
      const n = 0.8 + 0.2 * hash2(Math.round(wx * 2), Math.round(wz * 2));
      this.lightAt(wx, h, wz, lit);
      colors[i * 3] = b.tint[0] * n * lit[0]; colors[i * 3 + 1] = b.tint[1] * n * lit[1]; colors[i * 3 + 2] = b.tint[2] * n * lit[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.position.set(ox, 0, oz);
    this.scene.add(mesh);

    const chunk = { mesh, inst: gen.inst, colliders: gen.colliders, items: gen.items, extra: [], biome: gen.biome };
    if (gen.ceiling) {
      const cg = new THREE.PlaneGeometry(cs, cs, seg, seg);
      cg.rotateX(Math.PI / 2);
      const cp = cg.attributes.position, cu = cg.attributes.uv;
      const cc = new Float32Array(cp.count * 3);
      for (let i = 0; i < cp.count; i++) {
        const wx = cp.getX(i) + ox, wz = cp.getZ(i) + oz;
        let h = gen.ceiling.h;
        if (gen.ceiling.kind === 'cave') h += 0.3 - fbm(wx * 0.07, wz * 0.07, 2) * 2.5;
        cp.setY(i, h); cu.setXY(i, wx / cs, wz / cs);
        const n = 0.75 + 0.25 * hash2(Math.round(wx), Math.round(wz));
        this.lightAt(wx, h - 0.5, wz, lit);
        cc[i * 3] = n * lit[0] * 0.8; cc[i * 3 + 1] = n * lit[1] * 0.8; cc[i * 3 + 2] = n * lit[2] * 0.8;
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
    const lit = [0, 0, 0];
    for (const name in this.pools) { counts[name] = 0; this.pools[name].userData.flicker.length = 0; }
    for (const c of this.chunks.values()) {
      for (const p of c.inst) {
        const pool = this.pools[p.pool];
        if (!pool || counts[p.pool] >= pool.instanceMatrix.count) continue;
        _q.setFromAxisAngle(_up, p.yaw);
        if (p.tilt) { _q2.setFromAxisAngle(_x, p.tilt); _q.multiply(_q2); }
        _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.sx, p.sy, p.sz));
        const i = counts[p.pool]++;
        pool.setMatrixAt(i, _m);
        if (pool.userData.lightPool) {
          if (p.dead) pool.setColorAt(i, _c.setScalar(0.12));
          else { pool.setColorAt(i, _c.setScalar(1)); if (hash2(Math.round(p.x * 3), Math.round(p.z * 3) + 5) < 0.22) pool.userData.flicker.push(i); }
        } else {
          this.lightAt(p.x, p.y + 0.6, p.z, lit);
          pool.setColorAt(i, _c.setRGB(lit[0], lit[1], lit[2]));
        }
      }
    }
    for (const name in this.pools) { const p = this.pools[name]; p.count = counts[name]; p.instanceMatrix.needsUpdate = true; p.instanceColor.needsUpdate = true; }
  }

  // Some lights stutter. A cheap per-instance colour wobble on the emissive pools.
  flicker() {
    for (const pool of this.flickerPools) {
      const f = pool.userData.flicker;
      if (!f.length) continue;
      for (const i of f) {
        const t = this.time * (3 + (i % 5)) + i;
        const k = Math.sin(t * 7) * Math.sin(t * 3.1) > 0.55 ? 0.15 + Math.random() * 0.3 : 1;
        pool.setColorAt(i, _c.setScalar(k));
      }
      pool.instanceColor.needsUpdate = true;
    }
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
    if (Math.hypot(x, z) < 18) for (const p of this.spawnColliders) yield p;
  }

  contact(pos, rad, out) {
    let hit = false;
    out.set(0, 0, 0);
    const gh = groundHeight(pos.x, pos.z);
    if (pos.y < gh + rad) { out.y = gh + rad - pos.y; hit = true; }
    for (const p of this.nearby(pos.x, pos.z)) {
      if (p.kind === 'cyl') {
        const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz);
        if (pos.y > p.y0 - 0.3 && pos.y < p.y0 + p.h + rad) {
          if (pos.y > p.y0 + p.h - rad && d < p.r) { out.y += p.y0 + p.h + rad - pos.y; hit = true; }
          else if (d < p.r + rad) { const k = d > 1e-4 ? (p.r + rad - d) / d : 1; out.x += dx * k; out.z += dz * k; hit = true; }
        }
      } else if (p.kind === 'sphere') {
        const dx = pos.x - p.x, dy = pos.y - p.y, dz = pos.z - p.z, dd = Math.hypot(dx, dy, dz);
        if (dd < p.r + rad && dd > 1e-4) { const k = (p.r + rad - dd) / dd; out.x += dx * k; out.y += dy * k; out.z += dz * k; hit = true; }
      } else {
        const cx = Math.max(p.x - p.hx, Math.min(p.x + p.hx, pos.x));
        const cy = Math.max(p.y0, Math.min(p.y0 + p.h, pos.y));
        const cz = Math.max(p.z - p.hz, Math.min(p.z + p.hz, pos.z));
        const dx = pos.x - cx, dy = pos.y - cy, dz = pos.z - cz;
        const dd = Math.hypot(dx, dy, dz);
        if (dd < rad) {
          if (dd < 1e-5) {
            const px = p.hx - Math.abs(pos.x - p.x), pz = p.hz - Math.abs(pos.z - p.z), py = p.y0 + p.h - pos.y;
            if (py <= px && py <= pz) out.y += py + rad; else if (px < pz) out.x += (pos.x > p.x ? 1 : -1) * (px + rad); else out.z += (pos.z > p.z ? 1 : -1) * (pz + rad);
          } else { const k = (rad - dd) / dd; out.x += dx * k; out.y += dy * k; out.z += dz * k; }
          hit = true;
        }
      }
    }
    return hit;
  }

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
