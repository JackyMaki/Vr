import { CFG } from './config.js';
import { fbm, hash2, mulberry32 } from './noise.js';

// The infinite map is an endless abandoned complex. Every 96 m region is one wing:
// concrete halls, an overgrown atrium, the backrooms, caves beneath, a factory floor, a
// flooded sewer or a morgue. Everything has walls, ceilings and lights. Deterministic.

export const REGION = 96;
const CS = CFG.chunkSize;

export const BIOMES = {
  halls:     { id: 'halls',     wall: 'wallHall',  wallH: 3.4, ceil: 3.4,  light: { sky: 0x4a4a52, ground: 0x15130f, i: 0.5,  moon: 0 }, fog: { color: 0x07070a, d: 0.06 },  tint: [0.42, 0.42, 0.4] },
  atrium:    { id: 'atrium',    wall: 'wallHall',  wallH: 9,   ceil: 9,    light: { sky: 0x3a5a4a, ground: 0x0d1a10, i: 0.7,  moon: 0.4 }, fog: { color: 0x06100a, d: 0.05 }, tint: [0.22, 0.32, 0.14] },
  backrooms: { id: 'backrooms', wall: 'wallPaper', wallH: 3,   ceil: 3.0,  light: { sky: 0xe8d890, ground: 0x7a6a30, i: 1.2,  moon: 0 }, fog: { color: 0x5a4c20, d: 0.07 }, tint: [0.66, 0.56, 0.24] },
  cave:      { id: 'cave',      wall: 'wallRock',  wallH: 6,   ceil: 5.5,  light: { sky: 0x0a0a12, ground: 0x020202, i: 0.18, moon: 0 }, fog: { color: 0x000000, d: 0.075 }, tint: [0.26, 0.25, 0.27] },
  factory:   { id: 'factory',   wall: 'wallMetal', wallH: 7,   ceil: 8.0,  light: { sky: 0x4a4238, ground: 0x18140f, i: 0.55, moon: 0 }, fog: { color: 0x0b0a08, d: 0.05 }, tint: [0.45, 0.45, 0.43] },
  sewer:     { id: 'sewer',     wall: 'wallBrick', wallH: 4,   ceil: 4.0,  light: { sky: 0x2c3a2a, ground: 0x0a0f08, i: 0.45, moon: 0 }, fog: { color: 0x0a120c, d: 0.08 }, tint: [0.2, 0.24, 0.16] },
  morgue:    { id: 'morgue',    wall: 'wallTile',  wallH: 3.2, ceil: 3.2,  light: { sky: 0x6a7a80, ground: 0x1a1c1e, i: 0.6,  moon: 0 }, fog: { color: 0x0a0c0e, d: 0.055 }, tint: [0.6, 0.6, 0.58] },
};
const TABLE = ['halls', 'halls', 'halls', 'halls', 'atrium', 'atrium', 'backrooms', 'backrooms', 'cave', 'cave', 'factory', 'factory', 'sewer', 'morgue'];

export function regionOf(x, z) { return { rx: Math.floor((x + REGION / 2) / REGION), rz: Math.floor((z + REGION / 2) / REGION) }; }
export function regionOrigin(r) { return r * REGION - REGION / 2; }

export function biomeOfRegion(rx, rz) {
  if (Math.abs(rx) <= 1 && Math.abs(rz) <= 1) {
    const ring = { '0,0': 'halls', '1,0': 'backrooms', '-1,0': 'cave', '0,1': 'factory', '0,-1': 'morgue', '1,1': 'sewer', '-1,-1': 'atrium', '1,-1': 'halls', '-1,1': 'halls' };
    return BIOMES[ring[rx + ',' + rz]];
  }
  const h = hash2(rx * 7 + 31, rz * 13 + 17);
  return BIOMES[TABLE[Math.floor(h * TABLE.length)]];
}
export function biomeAt(x, z) { const { rx, rz } = regionOf(x, z); return biomeOfRegion(rx, rz); }

// Floor level of a region. Everything is a building at 0, caves dig down, sewers sit lower.
export function regionFloor(rx, rz) {
  const b = biomeOfRegion(rx, rz);
  return b.id === 'cave' ? -4 : b.id === 'sewer' ? -1.4 : 0;
}

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export function regionBlend(x, z, width = 10) {
  const lx = x + REGION / 2 - Math.floor((x + REGION / 2) / REGION) * REGION, lz = z + REGION / 2 - Math.floor((z + REGION / 2) / REGION) * REGION;
  const edge = Math.min(lx, REGION - lx, lz, REGION - lz);
  return smoothstep(0, width, edge);
}

export function shapedHeight(x, z) {
  const { rx, rz } = regionOf(x, z);
  const b = biomeOfRegion(rx, rz);
  const f = regionFloor(rx, rz);
  if (b.id === 'cave') { const k = regionBlend(x, z, 14); return (f + (fbm(x * 0.09, z * 0.09, 2) - 0.5) * 1.2) * k; }
  if (b.id === 'sewer') { const k = regionBlend(x, z, 8); return f * k; }
  if (b.id === 'atrium') return (fbm(x * 0.06, z * 0.06, 2) - 0.5) * 0.8 * regionBlend(x, z, 6);
  return 0;
}
export function waterLevel(rx, rz) { return regionFloor(rx, rz) + 0.7; }

// ---------- Chunk content ----------
export function generateChunk(cx, cz, groundHeight) {
  const rng = mulberry32(cx * 73856093 ^ cz * 19349663 ^ 0x9e3779b9);
  const x0 = cx * CS, z0 = cz * CS;
  const { rx, rz } = regionOf(x0 + 1, z0 + 1);
  const b = biomeOfRegion(rx, rz);
  const lx = (((cx + 2) % 4) + 4) % 4, lz = (((cz + 2) % 4) + 4) % 4;
  const out = { inst: [], colliders: [], items: [], lights: [], ceiling: null, water: null, biome: b };
  const near = (x, z) => Math.hypot(x, z) < CFG.safeRadius + 3;
  const floor = regionFloor(rx, rz);
  const ceilH = floor + b.ceil;

  const add = (pool, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, tilt = 0) => out.inst.push({ pool, x, y, z, yaw, sx, sy, sz, tilt });
  const cyl = (x, z, r, y0, h) => out.colliders.push({ kind: 'cyl', x, z, r, y0, h });
  const box = (x, z, hx, hz, y0, h) => out.colliders.push({ kind: 'box', x, z, hx, hz, y0, h });
  const sphere = (x, y, z, r) => out.colliders.push({ kind: 'sphere', x, y, z, r });
  const item = (type, x, z, dy = 0) => out.items.push({ type, x, y: groundHeight(x, z) + dy, z });
  const light = (x, y, z, r, i, c) => out.lights.push({ x, y, z, r, i, c: c || [1, 0.95, 0.85] });
  // A lamp fixture that may be dead (no light, dark fixture). Decided by position so it is stable.
  const lamp = (pool, x, y, z, r, i, c, yaw = 0, sx = 1, sy = 1, sz = 1) => {
    const dead = hash2(Math.round(x * 3) + 11, Math.round(z * 3) + 77) < 0.18;
    add(pool, x, y, z, yaw, sx, sy, sz); out.inst[out.inst.length - 1].dead = dead;
    if (!dead) light(x, y - 0.1, z, r, i, c);
  };
  // Lamps of the safe room light the surrounding chunks too.
  if (Math.abs(x0 + CS / 2) < 40 && Math.abs(z0 + CS / 2) < 40) { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; light(Math.cos(a) * 11.5, 3, Math.sin(a) * 11.5, 9, 0.8, [1, 0.8, 0.5]); } }
  const scatter = (n, fn) => { for (let i = 0; i < n; i++) { const x = x0 + 1 + rng() * (CS - 2), z = z0 + 1 + rng() * (CS - 2); if (!near(x, z)) fn(x, z); } };
  const gy = (x, z) => groundHeight(x, z);

  // Wall piece helper: anchored to the ground, stretched up to the biome's wall height.
  const wallAt = (pool, x, z, yaw, len = 3) => {
    const yb = Math.min(floor, gy(x, z)) - 0.5, top = floor + b.wallH;
    add(pool, x, yb, z, yaw, len / 3, (top - yb) / b.wallH, 1);
    if (Math.abs(Math.sin(yaw)) < 0.5) box(x, z, len / 2, 0.16, yb, top - yb); else box(x, z, 0.16, len / 2, yb, top - yb);
  };

  // ---------- Shell: border walls with doorways, ceiling ----------
  const segs = 3;
  const border = (x, z, yaw, idx, side) => {
    const open = hash2(rx * 31 + rz * 17 + side * 101, idx) < 0.14 || idx === 16 || idx === 15 || idx === 4 || idx === 27;
    if (!open) wallAt(b.wall, x, z, yaw);
    else if (b.id !== 'cave') { add('doorFrame', x, Math.min(floor, gy(x, z)), z, yaw, 1, 1, 1); }
  };
  for (let i = 0; i < CS / segs; i++) {
    const idx = (lz * CS) / segs + i, idx2 = (lx * CS) / segs + i;
    if (lx === 0) border(x0 + 0.2, z0 + i * segs + segs / 2, Math.PI / 2, idx, 0);
    if (lx === 3) border(x0 + CS - 0.2, z0 + i * segs + segs / 2, Math.PI / 2, idx, 1);
    if (lz === 0) border(x0 + i * segs + segs / 2, z0 + 0.2, 0, idx2, 2);
    if (lz === 3) border(x0 + i * segs + segs / 2, z0 + CS - 0.2, 0, idx2, 3);
  }
  out.ceiling = { h: ceilH, kind: b.id };

  // Shared clutter helpers.
  const corpse = (x, z) => { const y = gy(x, z); const yaw = rng() * 6.28; add('corpse', x, y, z, yaw); add('corpseHead', x + Math.cos(yaw) * (0.6 + rng() * 0.8), y, z - Math.sin(yaw) * (0.6 + rng() * 0.8), rng() * 6.28, 1, 1, 1, rng() * 2); add('smear', x, y + 0.015, z, rng() * 6.28, 1.6 + rng(), 1, 1.6 + rng()); item(rng() < 0.5 ? 'skull' : 'bone', x + 0.7, z + 0.5); };
  const crates = (x, z) => { const y = gy(x, z); const n = 1 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) { const s = 0.7 + rng() * 0.5; const cx2 = x + (rng() - 0.5) * 1.2, cz2 = z + (rng() - 0.5) * 1.2; add('crate', cx2, y, cz2, rng() * 0.6, s, s, s); box(cx2, cz2, s / 2, s / 2, y, s); } if (rng() < 0.5) { add('crate', x, y + 0.8, z, rng() * 0.6, 0.8, 0.8, 0.8); box(x, z, 0.4, 0.4, y + 0.8, 0.8); } };
  const web = (x, y, z, yaw) => add('web', x, y, z, yaw, 0.8 + rng() * 0.8, 0.8 + rng() * 0.8, 1);
  const blood = (x, z) => add('smear', x, gy(x, z) + 0.015, z, rng() * 6.28, 0.6 + rng() * 1.6, 1, 0.6 + rng() * 1.6);

  if (b.id === 'halls') {
    // Rooms and corridors on an 8 m grid: random walls with doorways, furniture in the cells.
    for (let gx = 0; gx < CS; gx += 8) for (let gz = 0; gz < CS; gz += 8) {
      const x = x0 + gx, z = z0 + gz;
      if (Math.max(Math.abs(x + 4), Math.abs(z + 4)) < 22) continue;
      const inner = lx > 0 || gx > 0, innerZ = lz > 0 || gz > 0;
      if (inner && hash2(x * 3 + 1, z * 3) < 0.5) { const door = Math.floor(hash2(x, z + 5) * 3); for (let k = 0; k < 3; k++) { if (k === door) { add('doorFrame', x, floor, z + k * 3 + 1.5, Math.PI / 2); if (hash2(x + k, z) < 0.4) { add('door', x + 0.1, floor, z + k * 3 + 0.4, Math.PI / 2 + 0.6 + hash2(x, z + k) * 1.2); } continue; } wallAt('wallHall', x, z + k * 3 + 1.5, Math.PI / 2); } if (hash2(x, z + 44) < 0.6) web(x + 0.2, floor + b.wallH - 0.4, z + 0.3, 0); }
      if (innerZ && hash2(x * 3, z * 3 + 1) < 0.5) { const door = Math.floor(hash2(x + 5, z) * 3); for (let k = 0; k < 3; k++) { if (k === door) { add('doorFrame', x + k * 3 + 1.5, floor, z, 0); continue; } wallAt('wallHall', x + k * 3 + 1.5, z, 0); if (hash2(x + k * 7, z + 3) < 0.25) add('poster', x + k * 3 + 1.5 + (hash2(x, z) - 0.5), floor + 1.6, z + 0.17, 0); } }
      // Furniture for the cell.
      const cxm = x + 4, czm = z + 4;
      if (near(cxm, czm)) continue;
      const r = hash2(x + 9, z + 9), y = floor;
      if (r < 0.2) { for (let k = 0; k < 4; k++) { add('locker', x + 0.6, y, z + 1.2 + k * 0.7, Math.PI / 2); } box(x + 0.6, z + 2.25, 0.3, 1.5, y, 2); if (hash2(x, z + 1) < 0.5) { add('locker', x + 1.4, y + 0.3, z + 5.5, 1.2, 1, 1, 1, 1.3); } }
      else if (r < 0.42) { add('desk', cxm, y, czm, hash2(x, z) * 6.28); box(cxm, czm, 0.8, 0.45, y, 0.78); add('chair', cxm + 0.9, y, czm + 0.3, 2.5 + hash2(x + 2, z)); add('monitor', cxm - 0.2, y + 0.78, czm - 0.1, 0.3); if (hash2(x + 3, z) < 0.5) { add('chair', cxm - 1.5, y + 0.2, czm + 1.2, 1, 1, 1, 1, 1.5); } item('can', cxm + 1.5, czm - 1); }
      else if (r < 0.58) { crates(cxm + 1, czm - 1); if (hash2(x, z + 2) < 0.5) crates(cxm - 2, czm + 2); }
      else if (r < 0.7) { add('shelf', x + 7.3, y, czm, Math.PI / 2); box(x + 7.3, czm, 0.3, 1.0, y, 2); add('shelf', x + 7.3, y, czm + 2.2, Math.PI / 2); box(x + 7.3, czm + 2.2, 0.3, 1.0, y, 2); item('bottle', x + 6.5, czm); }
      else if (r < 0.8) { const by = Math.PI / 2 * Math.floor(hash2(x, z) * 2); add('bed', cxm, y, czm, by); add('mattress', cxm, y, czm, by); box(cxm, czm, 1.0, 0.5, y, 0.7); if (hash2(x, z + 4) < 0.5) corpse(cxm + 0.3, czm + 0.1); }
      else if (r < 0.88) { corpse(cxm, czm); blood(cxm + 1, czm); }
      if (hash2(x + 1, z + 1) < 0.3) blood(cxm + (hash2(x, z) - 0.5) * 6, czm + (hash2(z, x) - 0.5) * 6);
      if (hash2(x + 2, z + 2) < 0.4) add('debris', cxm + (hash2(x, z + 7) - 0.5) * 6, y, czm + (hash2(z + 7, x) - 0.5) * 6, hash2(x, z) * 6.28);
      // Ceiling light per cell, some dead.
      if (hash2(x + 5, z) < 0.85) lamp('panel', cxm, ceilH - 0.06, czm, 7, 1.0);
      if (hash2(x + 6, z) < 0.3) { add('vent', x + 0.18, floor + 2.6, czm, Math.PI / 2); }
    }
    // Pipes and cables along the ceiling.
    if (hash2(cx, cz + 3) < 0.7) for (let i = 0; i < CS; i += 6) add('pipe', x0 + i + 3, ceilH - 0.35, z0 + 0.8 + (lz % 2) * 7, 0, 1, 0.5, 0.5);
    if (hash2(cx + 3, cz) < 0.5) for (let i = 0; i < CS; i += 6) add('cable', x0 + 0.6, ceilH - 0.15, z0 + i + 3, Math.PI / 2);
    scatter(Math.floor(rng() * 3), (x, z) => item(['can', 'bottle', 'brick', 'wrench'][Math.floor(rng() * 4)], x, z));
  } else if (b.id === 'atrium') {
    // A glass-roofed garden gone wild: trees under a broken skylight, moss, vines.
    scatter(4 + Math.floor(rng() * 4), (x, z) => {
      const y = gy(x, z); const h = 4 + rng() * 3.5, r = 0.4 + rng() * 0.2, yaw = rng() * 6.28;
      add('trunk', x, y - 0.3, z, yaw, r * 1.3, h * 0.45, r * 1.3); add('canopy', x, y + h * 0.25, z, yaw, r * 5, h * 0.5, r * 5); add('canopy', x, y + h * 0.5, z, yaw + 0.4, r * 3.6, h * 0.5, r * 3.6); add('canopy', x, y + h * 0.72, z, yaw + 0.8, r * 2.2, h * 0.38, r * 2.2); cyl(x, z, r * 0.75, y, h);
    });
    scatter(1 + Math.floor(rng() * 2), (x, z) => { const y = gy(x, z); const h = 4 + rng() * 3, r = 0.3; add('dead', x, y - 0.3, z, rng() * 6.28, r * 1.4, h, r * 1.4, (rng() - 0.5) * 0.1); cyl(x, z, r * 0.9, y, h); });
    scatter(4 + Math.floor(rng() * 5), (x, z) => add('bush', x, gy(x, z) - 0.2, z, rng() * 6.28, 0.6 + rng() * 0.6, 0.5 + rng() * 0.5, 0.6 + rng() * 0.6));
    scatter(20 + Math.floor(rng() * 14), (x, z) => add('grass', x, gy(x, z) - 0.05, z, rng() * 6.28, 1 + rng(), 0.6 + rng() * 0.8, 1 + rng()));
    scatter(Math.floor(rng() * 5), (x, z) => add('mushroom', x, gy(x, z), z, rng() * 6.28, 0.6 + rng() * 0.8, 0.6 + rng() * 0.8, 0.6 + rng() * 0.8));
    scatter(Math.floor(rng() * 3), (x, z) => { const r = 0.5 + rng(); const y = gy(x, z) - r * 0.35; add('rock', x, y, z, rng() * 6.28, r, r * 0.75, r * 1.2); sphere(x, y + r * 0.3, z, r * 0.85); });
    // Planter boxes and benches (climbable), vines from the roof beams.
    scatter(1 + Math.floor(rng() * 2), (x, z) => { const y = gy(x, z); add('planter', x, y, z, Math.floor(rng() * 2) * Math.PI / 2); box(x, z, 1.5, 0.6, y, 0.8); });
    scatter(Math.floor(rng() * 2), (x, z) => { const y = gy(x, z); add('bench', x, y, z, rng() * 6.28); box(x, z, 0.8, 0.3, y, 0.5); });
    for (let gx = 4; gx < CS; gx += 8) for (let gz = 4; gz < CS; gz += 8) { const x = x0 + gx, z = z0 + gz; if (hash2(x, z) < 0.55) lamp('skylight', x, ceilH - 0.1, z, 12, 0.9, [0.8, 0.9, 1]); else add('beam', x, ceilH - 0.3, z, 0); for (let k = 0; k < 3; k++) if (hash2(x + k, z + k) < 0.4) add('vine', x + (hash2(x, z + k) - 0.5) * 7, ceilH, z + (hash2(z, x + k) - 0.5) * 7, 0, 1, 1 + hash2(x + k, z) * 4, 1); }
    if (rng() < 0.4) scatter(1, (x, z) => corpse(x, z));
    scatter(Math.floor(rng() * 3), (x, z) => item(rng() < 0.6 ? 'rock' : 'bottle', x, z));
  } else if (b.id === 'backrooms') {
    for (let gx = 0; gx < CS; gx += 6) for (let gz = 0; gz < CS; gz += 6) {
      const x = x0 + gx, z = z0 + gz;
      const inner = lx > 0 || gx > 0, innerZ = lz > 0 || gz > 0;
      if (inner && hash2(x * 3 + 1, z * 3) < 0.34) { wallAt('wallPaper', x, z + 1.5, Math.PI / 2); wallAt('wallPaper', x, z + 4.5, Math.PI / 2); }
      else if (innerZ && hash2(x * 3, z * 3 + 1) < 0.34) { wallAt('wallPaper', x + 1.5, z, 0); wallAt('wallPaper', x + 4.5, z, 0); }
      if (hash2(x, z + 9) < 0.12) { add('wallPaper', x + 3, floor, z + 3, 0, 0.2, 1, 2); box(x + 3, z + 3, 0.3, 0.3, floor, 3); }
      if (hash2(x + 5, z) < 0.8) lamp('panel', x + 3, floor + 2.94, z + 3, 7, 1.0, [1, 0.95, 0.7]);
      if (hash2(x + 8, z) < 0.08) { add('chair', x + 3 + hash2(x, z) * 2, floor, z + 2, hash2(z, x) * 6.28); }
      if (hash2(x + 2, z + 8) < 0.1) add('stain', x + 1 + hash2(x, z) * 4, floor + 0.015, z + 1 + hash2(z, x) * 4, hash2(x, z) * 6.28, 1 + hash2(x + 1, z), 1, 1 + hash2(x, z + 1));
      if (hash2(x + 3, z + 3) < 0.07) web(x + 0.3, floor + 2.6, z + 0.3, hash2(x, z) * 6.28);
    }
    scatter(Math.floor(rng() * 3), (x, z) => item(rng() < 0.5 ? 'can' : 'bottle', x, z));
  } else if (b.id === 'cave') {
    scatter(1 + Math.floor(rng() * 2), (x, z) => { const r = 0.8 + rng() * 1.2; add('pillar', x, gy(x, z) - 0.4, z, rng() * 6.28, r, 7, r); cyl(x, z, r, gy(x, z), 7); });
    scatter(4 + Math.floor(rng() * 5), (x, z) => { const r = 0.25 + rng() * 0.5, h = 0.6 + rng() * 1.6; add('stalag', x, gy(x, z) - 0.1, z, rng() * 6.28, r, h, r); cyl(x, z, r * 0.7, gy(x, z), h); });
    scatter(8 + Math.floor(rng() * 8), (x, z) => { const r = 0.15 + rng() * 0.4; add('stalac', x, ceilH + 0.3 - fbm(x * 0.07, z * 0.07, 2) * 2.5, z, rng() * 6.28, r, 0.8 + rng() * 2.2, r); });
    scatter(3 + Math.floor(rng() * 4), (x, z) => { for (let k = 0; k < 4; k++) add('glowshroom', x + (rng() - 0.5) * 1.4, gy(x, z), z + (rng() - 0.5) * 1.4, rng() * 6.28, 0.4 + rng() * 0.5, 0.4 + rng() * 0.6, 0.4 + rng() * 0.5); light(x, gy(x, z) + 0.4, z, 4, 0.5, [0.3, 0.9, 0.8]); });
    scatter(Math.floor(rng() * 3), (x, z) => { const r = 0.4 + rng() * 0.8; const y = gy(x, z) - r * 0.35; add('rock', x, y, z, rng() * 6.28, r, r * 0.75, r * 1.2); sphere(x, y + r * 0.3, z, r * 0.85); });
    if (rng() < 0.5) scatter(1, (x, z) => corpse(x, z));
    scatter(2 + Math.floor(rng() * 3), (x, z) => add('bonepile', x, gy(x, z), z, rng() * 6.28, 0.8 + rng() * 0.6, 1, 0.8 + rng() * 0.6));
    scatter(Math.floor(rng() * 3), (x, z) => item(['rock', 'skull', 'bone'][Math.floor(rng() * 3)], x, z));
  } else if (b.id === 'factory') {
    for (let gx = 3; gx < CS; gx += 12) for (let gz = 3; gz < CS; gz += 12) {
      const x = x0 + gx + rng() * 4, z = z0 + gz + rng() * 4;
      if (near(x, z)) continue;
      const r = rng();
      if (r < 0.4) { const yaw = Math.round(rng() * 3) * Math.PI / 2; add('machine', x, floor, z, yaw); const a = yaw % Math.PI > 0.1; box(x, z, a ? 1 : 1.5, a ? 1.5 : 1, floor, 2.6); add('console', x + 2.2, floor, z, yaw); box(x + 2.2, z, 0.4, 0.3, floor, 1.2); }
      else if (r < 0.65) { add('catwalk', x, floor + 2.8, z, 0); box(x, z, 3, 1, floor + 2.6, 0.4); for (const [dx, dz, dy] of [[-2, 1.8, 0], [-2.9, 1.8, 0], [-2.45, 1.8, 1]]) { add('barrel', x + dx, floor + dy, z + dz, 0); cyl(x + dx, z + dz, 0.45, floor + dy, 1); } }
      else if (r < 0.8) { for (let k = 0; k < 3; k++) { const bx = x + (rng() - 0.5) * 2, bz = z + (rng() - 0.5) * 2; add('barrel', bx, floor, bz, rng()); cyl(bx, bz, 0.45, floor, 1); } }
      else crates(x, z);
      if (rng() < 0.3) add('chain', x + 3, ceilH, z - 3, 0, 1, 1 + rng() * 3, 1);
    }
    if (hash2(cx, cz + 3) < 0.6) for (let i = 0; i < CS; i += 6) add('pipe', x0 + i + 3, floor + 3.4, z0 + 4 + (lz % 2) * 10, 0);
    if (hash2(cx + 3, cz) < 0.5) for (let i = 0; i < CS; i += 6) add('pipe', x0 + 7 + (lx % 2) * 10, floor + 4.2, z0 + i + 3, Math.PI / 2);
    for (let gx = 6; gx < CS; gx += 12) for (let gz = 6; gz < CS; gz += 12) if (hash2(x0 + gx, z0 + gz) < 0.65) lamp('lamp', x0 + gx, floor + 5.5, z0 + gz, 11, 1.1, [1, 0.75, 0.45]);
    if (rng() < 0.3) scatter(1, (x, z) => corpse(x, z));
    scatter(Math.floor(rng() * 3), (x, z) => blood(x, z));
    scatter(Math.floor(rng() * 3), (x, z) => item(['wrench', 'brick', 'can'][Math.floor(rng() * 3)], x, z));
  } else if (b.id === 'sewer') {
    // Brick tunnels with a water channel down the middle of each chunk row.
    out.water = waterLevel(rx, rz);
    for (let gx = 0; gx < CS; gx += 8) for (let gz = 0; gz < CS; gz += 8) {
      const x = x0 + gx, z = z0 + gz;
      const inner = lx > 0 || gx > 0, innerZ = lz > 0 || gz > 0;
      if (inner && hash2(x * 3 + 1, z * 3) < 0.4) { for (let k = 0; k < 3; k++) if (k !== 1) wallAt('wallBrick', x, z + k * 3 + 1.5, Math.PI / 2); }
      if (innerZ && hash2(x * 3, z * 3 + 1) < 0.4) { for (let k = 0; k < 3; k++) if (k !== 1) wallAt('wallBrick', x + k * 3 + 1.5, z, 0); }
      if (hash2(x + 5, z) < 0.45) lamp('wallLamp', x + 4, floor + 2.6, z + 0.25, 6, 0.7, [0.9, 0.8, 0.5]);
      if (hash2(x + 7, z) < 0.3) add('grate', x + 4, floor + 0.02, z + 4, 0);
      if (hash2(x + 1, z + 6) < 0.25) { add('pipe', x + 4, floor + 3.3, z + 2, 0, 1, 0.7, 0.7); }
    }
    scatter(3 + Math.floor(rng() * 4), (x, z) => { const y = gy(x, z); add('barrel', x, y, z, rng(), 1, 1, 1, (rng() - 0.5) * 0.3); cyl(x, z, 0.45, y, 1); });
    scatter(2 + Math.floor(rng() * 3), (x, z) => add('stain', x, gy(x, z) + 0.015, z, rng() * 6.28, 1 + rng() * 2, 1, 1 + rng() * 2));
    if (rng() < 0.5) scatter(1, (x, z) => corpse(x, z));
    scatter(Math.floor(rng() * 3), (x, z) => item(['bone', 'bottle', 'can'][Math.floor(rng() * 3)], x, z));
  } else if (b.id === 'morgue') {
    for (let gx = 0; gx < CS; gx += 8) for (let gz = 0; gz < CS; gz += 8) {
      const x = x0 + gx, z = z0 + gz;
      const inner = lx > 0 || gx > 0, innerZ = lz > 0 || gz > 0;
      if (inner && hash2(x * 3 + 1, z * 3) < 0.45) { const door = Math.floor(hash2(x, z + 5) * 3); for (let k = 0; k < 3; k++) { if (k === door) { add('doorFrame', x, floor, z + k * 3 + 1.5, Math.PI / 2); continue; } wallAt('wallTile', x, z + k * 3 + 1.5, Math.PI / 2); } }
      if (innerZ && hash2(x * 3, z * 3 + 1) < 0.45) { const door = Math.floor(hash2(x + 5, z) * 3); for (let k = 0; k < 3; k++) { if (k === door) { add('doorFrame', x + k * 3 + 1.5, floor, z, 0); continue; } wallAt('wallTile', x + k * 3 + 1.5, z, 0); } }
      const cxm = x + 4, czm = z + 4;
      if (near(cxm, czm)) continue;
      const r = hash2(x + 9, z + 9);
      if (r < 0.35) { for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) add('drawer', x + 0.5, floor + j * 0.9, z + 1.5 + k * 1.1, Math.PI / 2, 1, 1, 1); box(x + 0.5, z + 2.6, 0.5, 1.8, floor, 1.8); if (hash2(x, z + 2) < 0.5) { add('drawerOpen', x + 1.3, floor + 0.9, z + 2.6, Math.PI / 2); corpse(x + 1.6, z + 2.6); } }
      else if (r < 0.7) { add('slab', cxm, floor, czm, Math.floor(hash2(x, z) * 2) * Math.PI / 2); box(cxm, czm, 1.0, 0.45, floor, 0.9); if (hash2(x, z + 4) < 0.7) { add('corpse', cxm, floor + 0.9, czm, Math.floor(hash2(x, z) * 2) * Math.PI / 2 + 1.57); add('smear', cxm + 0.6, floor + 0.015, czm + 0.3, 1, 1.5, 1, 1.5); } add('tray', cxm + 1.3, floor, czm + 0.5, 0.2); }
      else if (r < 0.85) { add('sink', x + 7.5, floor, czm, Math.PI / 2); box(x + 7.5, czm, 0.3, 0.5, floor, 0.9); add('shelf', x + 7.3, floor, czm + 2.5, Math.PI / 2); box(x + 7.3, czm + 2.5, 0.3, 1, floor, 2); item('bottle', x + 6.6, czm + 2.5); }
      if (hash2(x + 5, z) < 0.8) lamp('panel', cxm, ceilH - 0.06, czm, 7, 1.0, [0.85, 0.95, 1]);
      if (hash2(x + 1, z + 1) < 0.4) blood(cxm + (hash2(x, z) - 0.5) * 6, czm + (hash2(z, x) - 0.5) * 6);
    }
    scatter(Math.floor(rng() * 3), (x, z) => item(['skull', 'bone', 'bottle'][Math.floor(rng() * 3)], x, z));
  }
  return out;
}
