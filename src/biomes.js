import { CFG } from './config.js';
import { fbm, hash2, mulberry32 } from './noise.js';

// The infinite map is split into 96 m regions. Each region is one biome. Interior biomes
// (backrooms, cave, factory) flatten the ground, raise walls with openings on their border,
// and get a ceiling. Everything is deterministic from the region coordinates.

export const REGION = 96;
const CS = CFG.chunkSize;

export const BIOMES = {
  forest:    { id: 'forest',    interior: false, light: { sky: 0x33424f, ground: 0x0d0b09, i: 0.85, moon: 0.55 }, fog: { color: 0x04060a, d: 0.042 }, tint: null },
  backrooms: { id: 'backrooms', interior: true,  wall: 'wallPaper', wallH: 3, ceil: 3.0, light: { sky: 0xe8d890, ground: 0x7a6a30, i: 1.35, moon: 0 }, fog: { color: 0x5a4c20, d: 0.07 }, tint: [0.66, 0.56, 0.24] },
  cave:      { id: 'cave',      interior: true,  wall: 'wallRock',  wallH: 6, ceil: 5.5, light: { sky: 0x0a0a12, ground: 0x020202, i: 0.18, moon: 0 }, fog: { color: 0x000000, d: 0.075 }, tint: [0.26, 0.25, 0.27] },
  factory:   { id: 'factory',   interior: true,  wall: 'wallMetal', wallH: 7, ceil: 8.0, light: { sky: 0x4a4238, ground: 0x18140f, i: 0.62, moon: 0 }, fog: { color: 0x0b0a08, d: 0.05 }, tint: [0.45, 0.45, 0.43] },
  swamp:     { id: 'swamp',     interior: false, light: { sky: 0x2c3a2a, ground: 0x0a0f08, i: 0.6,  moon: 0.3 }, fog: { color: 0x0a120c, d: 0.075 }, tint: [0.16, 0.2, 0.12] },
  graveyard: { id: 'graveyard', interior: false, light: { sky: 0x2a3038, ground: 0x0a0a0a, i: 0.6,  moon: 0.4 }, fog: { color: 0x080a0c, d: 0.062 }, tint: [0.17, 0.2, 0.14] },
};
const TABLE = ['forest', 'forest', 'forest', 'forest', 'backrooms', 'backrooms', 'cave', 'cave', 'factory', 'factory', 'swamp', 'graveyard'];

export function regionOf(x, z) { return { rx: Math.floor((x + REGION / 2) / REGION), rz: Math.floor((z + REGION / 2) / REGION) }; }
export function regionOrigin(r) { return r * REGION - REGION / 2; }

export function biomeOfRegion(rx, rz) {
  if (Math.abs(rx) <= 1 && Math.abs(rz) <= 1) {
    // Spawn is forest. Its eight neighbours are a guaranteed sampler of everything.
    const ring = { '1,0': 'backrooms', '-1,0': 'cave', '0,1': 'factory', '0,-1': 'graveyard', '1,1': 'swamp', '-1,-1': 'backrooms', '1,-1': 'cave', '-1,1': 'factory' };
    return BIOMES[ring[rx + ',' + rz] || 'forest'];
  }
  const h = hash2(rx * 7 + 31, rz * 13 + 17);
  return BIOMES[TABLE[Math.floor(h * TABLE.length)]];
}

export function biomeAt(x, z) { const { rx, rz } = regionOf(x, z); return biomeOfRegion(rx, rz); }

export function regionFloor(rx, rz) {
  return Math.round(naturalHeight(rx * REGION, rz * REGION) * 2) / 2;
}

export function naturalHeight(x, z) {
  const n = fbm(x * 0.028 + 100, z * 0.028 + 100, 3);
  const r = fbm(x * 0.11 + 7, z * 0.11 + 7, 2) * 0.35;
  return (n * 2 - 1) * CFG.hillHeight + (r - 0.17) * 1.2;
}

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// 1 deep inside a region, 0 at its border.
export function regionBlend(x, z, width = 10) {
  const lx = x + REGION / 2 - Math.floor((x + REGION / 2) / REGION) * REGION, lz = z + REGION / 2 - Math.floor((z + REGION / 2) / REGION) * REGION;
  const edge = Math.min(lx, REGION - lx, lz, REGION - lz);
  return smoothstep(0, width, edge);
}

// Terrain height with biome shaping applied (interiors flat, swamps sunken).
export function shapedHeight(x, z) {
  const { rx, rz } = regionOf(x, z);
  const b = biomeOfRegion(rx, rz);
  const nat = naturalHeight(x, z);
  if (b.interior) return regionFloor(rx, rz);
  // Near an interior neighbour, ramp toward its floor so its walls sit on level ground.
  let h = nat;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dz) continue;
    const nb = biomeOfRegion(rx + dx, rz + dz);
    if (!nb.interior) continue;
    const ox = regionOrigin(rx + dx), oz = regionOrigin(rz + dz);
    const ddx = Math.max(ox - x, 0, x - (ox + REGION)), ddz = Math.max(oz - z, 0, z - (oz + REGION));
    const dist = Math.hypot(ddx, ddz);
    if (dist < 16) { const k = 1 - smoothstep(0, 16, dist); const f = regionFloor(rx + dx, rz + dz); h = h + (f - h) * k; }
  }
  const natB = h;
  if (b.id === 'swamp') { const k = regionBlend(x, z, 14); const f = regionFloor(rx, rz) - 1.3 + fbm(x * 0.1, z * 0.1, 2) * 0.6; return natB + (f - natB) * k; }
  if (b.id === 'graveyard') { const k = regionBlend(x, z, 12); const f = regionFloor(rx, rz) + fbm(x * 0.05, z * 0.05, 2) * 1.2; return natB + (f - natB) * k; }
  return natB;
}

export function waterLevel(rx, rz) { return regionFloor(rx, rz) - 0.55; }

// ---------- Chunk content ----------
// Returns { inst: [{pool,x,y,z,yaw,sx,sy,sz,tilt}], colliders: [...], items: [{type,x,y,z}], ceiling, water }
export function generateChunk(cx, cz, groundHeight) {
  const rng = mulberry32(cx * 73856093 ^ cz * 19349663 ^ 0x9e3779b9);
  const x0 = cx * CS, z0 = cz * CS;
  const { rx, rz } = regionOf(x0 + 1, z0 + 1);
  const b = biomeOfRegion(rx, rz);
  const lx = (((cx + 2) % 4) + 4) % 4, lz = (((cz + 2) % 4) + 4) % 4;      // chunk index inside the region
  const out = { inst: [], colliders: [], items: [], ceiling: null, water: null, biome: b };
  const near = (x, z) => Math.hypot(x, z) < CFG.safeRadius + 4;
  const floor = regionFloor(rx, rz);

  const add = (pool, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, tilt = 0) => out.inst.push({ pool, x, y, z, yaw, sx, sy, sz, tilt });
  const cyl = (x, z, r, y0, h) => out.colliders.push({ kind: 'cyl', x, z, r, y0, h });
  const box = (x, z, hx, hz, y0, h) => out.colliders.push({ kind: 'box', x, z, hx, hz, y0, h });
  const sphere = (x, y, z, r) => out.colliders.push({ kind: 'sphere', x, y, z, r });
  const item = (type, x, z, dy = 0) => out.items.push({ type, x, y: groundHeight(x, z) + dy, z });

  const tree = (x, z, dead) => {
    const y = groundHeight(x, z);
    if (dead) {
      const h = 5 + rng() * 5, r = 0.3 + rng() * 0.15, yaw = rng() * 6.28, tilt = (rng() - 0.5) * 0.15;
      add('dead', x, y - 0.3, z, yaw, r * 1.4, h, r * 1.4, tilt);
      for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) add('branch', x, y + h * (0.5 + rng() * 0.4), z, rng() * 6.28, 1.2 + rng() * 1.5, 1, 1, -0.5 - rng() * 0.6);
      cyl(x, z, r * 0.9, y, h);
    } else {
      const h = 6 + rng() * 7, r = 0.45 + rng() * 0.25, yaw = rng() * 6.28;
      add('trunk', x, y - 0.3, z, yaw, r * 1.3, h * 0.45, r * 1.3);
      add('canopy', x, y + h * 0.25, z, yaw, r * 5.2, h * 0.5, r * 5.2);
      add('canopy', x, y + h * 0.5, z, yaw + 0.4, r * 3.8, h * 0.5, r * 3.8);
      add('canopy', x, y + h * 0.72, z, yaw + 0.8, r * 2.4, h * 0.38, r * 2.4);
      cyl(x, z, r * 0.75, y, h);
    }
  };
  const rock = (x, z, r) => { const y = groundHeight(x, z) - r * 0.35; add('rock', x, y, z, rng() * 6.28, r, r * 0.75, r * 1.2); sphere(x, y + r * 0.3, z, r * 0.85); };
  const scatter = (n, fn) => { for (let i = 0; i < n; i++) { const x = x0 + rng() * CS, z = z0 + rng() * CS; if (!near(x, z)) fn(x, z); } };

  // ---------- Interior shell: border walls with openings, and the ceiling ----------
  if (b.interior) {
    const segs = 3;
    const wall = (x, z, yaw, idx, side) => {
      // Openings: a few random gaps plus a guaranteed one in the middle of each side.
      const open = hash2(rx * 31 + rz * 17 + side * 101, idx) < 0.16 || idx === 16 || idx === 15;
      if (open) return;
      const yb = Math.min(floor, groundHeight(x, z)) - 0.5;
      add(b.wall, x, yb, z, yaw, 1, (floor + b.wallH - yb) / b.wallH, 1);
      if (yaw === 0) box(x, z, segs / 2, 0.15, yb, floor + b.wallH - yb); else box(x, z, 0.15, segs / 2, yb, floor + b.wallH - yb);
    };
    for (let i = 0; i < CS / segs; i++) {
      const idx = (lz * CS) / segs + i, idx2 = (lx * CS) / segs + i;
      if (lx === 0) wall(x0 + 0.2, z0 + i * segs + segs / 2, Math.PI / 2, idx, 0);
      if (lx === 3) wall(x0 + CS - 0.2, z0 + i * segs + segs / 2, Math.PI / 2, idx, 1);
      if (lz === 0) wall(x0 + i * segs + segs / 2, z0 + 0.2, 0, idx2, 2);
      if (lz === 3) wall(x0 + i * segs + segs / 2, z0 + CS - 0.2, 0, idx2, 3);
    }
    out.ceiling = { h: floor + b.ceil, kind: b.id };
  }

  if (b.id === 'forest') {
    scatter(5 + Math.floor(rng() * 6), (x, z) => tree(x, z, rng() < 0.2));
    scatter(Math.floor(rng() * 3), (x, z) => rock(x, z, 0.6 + rng() * 1.3));
    scatter(3 + Math.floor(rng() * 5), (x, z) => add('bush', x, groundHeight(x, z) - 0.2, z, rng() * 6.28, 0.6 + rng() * 0.6, 0.5 + rng() * 0.5, 0.6 + rng() * 0.6));
    scatter(18 + Math.floor(rng() * 14), (x, z) => add('grass', x, groundHeight(x, z) - 0.05, z, rng() * 6.28, 1 + rng(), 0.6 + rng() * 0.8, 1 + rng()));
    scatter(Math.floor(rng() * 5), (x, z) => add('mushroom', x, groundHeight(x, z), z, rng() * 6.28, 0.6 + rng() * 0.8, 0.6 + rng() * 0.8, 0.6 + rng() * 0.8));
    if (rng() < 0.4) scatter(1, (x, z) => { const yaw = rng() * 6.28; add('log', x, groundHeight(x, z) + 0.25, z, yaw, 1, 1, 1); cyl(x, z, 0.35, groundHeight(x, z), 0.6); });
    scatter(Math.floor(rng() * 3), (x, z) => item(rng() < 0.6 ? 'rock' : 'bottle', x, z));
  } else if (b.id === 'swamp') {
    out.water = waterLevel(rx, rz);
    scatter(3 + Math.floor(rng() * 4), (x, z) => tree(x, z, rng() < 0.7));
    scatter(10 + Math.floor(rng() * 10), (x, z) => { for (let k = 0; k < 5; k++) add('reed', x + (rng() - 0.5) * 1.2, groundHeight(x, z) - 0.1, z + (rng() - 0.5) * 1.2, rng() * 6.28, 1, 0.8 + rng() * 0.8, 1, (rng() - 0.5) * 0.2); });
    scatter(Math.floor(rng() * 2), (x, z) => rock(x, z, 0.5 + rng()));
    if (rng() < 0.5) scatter(1, (x, z) => { add('log', x, groundHeight(x, z) + 0.25, z, rng() * 6.28, 1, 1, 1); cyl(x, z, 0.35, groundHeight(x, z), 0.6); });
    scatter(Math.floor(rng() * 2), (x, z) => item(rng() < 0.5 ? 'rock' : 'bottle', x, z));
  } else if (b.id === 'graveyard') {
    // Rows of graves, dead trees, bits of fence, and the odd crypt.
    for (let gx = 2; gx < CS; gx += 4) for (let gz = 3; gz < CS; gz += 5) {
      if (rng() < 0.55) continue;
      const x = x0 + gx + (rng() - 0.5), z = z0 + gz + (rng() - 0.5);
      if (near(x, z)) continue;
      add('tomb', x, groundHeight(x, z), z, (rng() - 0.5) * 0.4, 0.8 + rng() * 0.5, 0.8 + rng() * 0.6, 1, (rng() - 0.5) * 0.25);
      box(x, z, 0.35, 0.12, groundHeight(x, z), 1);
    }
    scatter(1 + Math.floor(rng() * 3), (x, z) => tree(x, z, true));
    if (rng() < 0.5) { const z = z0 + 1 + rng() * (CS - 2), y = groundHeight(x0 + CS / 2, z); for (let i = 0; i < 8; i++) { if (rng() < 0.2) continue; const x = x0 + 1.5 + i * 3; if (!near(x, z)) { add('fence', x, groundHeight(x, z), z, 0, 1, 1, 1); box(x, z, 1.5, 0.08, groundHeight(x, z), 1.2); } } }
    if (rng() < 0.3) {
      const x = x0 + CS / 2, z = z0 + CS / 2, y = groundHeight(x, z);
      if (!near(x, z)) {
        for (const [dx, dz, yaw] of [[-2, 0, Math.PI / 2], [2, 0, Math.PI / 2], [0, -2, 0]]) { add('wallRock', x + dx, y, z + dz, yaw, 1.4, 0.6, 1); box(x + dx, z + dz, yaw ? 0.3 : 2.1, yaw ? 2.1 : 0.3, y, 3.6); }
        add('wallRock', x, y + 3.4, z, 0, 1.6, 0.12, 8);  // roof slab
        item('skull', x, z + 0.5); item('bone', x - 0.8, z - 0.5);
      }
    }
    scatter(6 + Math.floor(rng() * 8), (x, z) => add('grass', x, groundHeight(x, z) - 0.05, z, rng() * 6.28, 1, 0.5 + rng() * 0.6, 1));
    scatter(Math.floor(rng() * 2), (x, z) => item(rng() < 0.5 ? 'skull' : 'bone', x, z));
  } else if (b.id === 'backrooms') {
    // Maze walls on a 6 m grid, support pillars, humming light panels.
    for (let gx = 0; gx < CS; gx += 6) for (let gz = 0; gz < CS; gz += 6) {
      const x = x0 + gx, z = z0 + gz;
      const inner = lx > 0 || gx > 0, innerZ = lz > 0 || gz > 0;
      if (inner && hash2(x * 3 + 1, z * 3) < 0.34) { add('wallPaper', x, floor, z + 1.5, Math.PI / 2); add('wallPaper', x, floor, z + 4.5, Math.PI / 2); box(x, z + 3, 0.15, 3, floor, 3); }
      else if (innerZ && hash2(x * 3, z * 3 + 1) < 0.34) { add('wallPaper', x + 1.5, floor, z, 0); add('wallPaper', x + 4.5, floor, z, 0); box(x + 3, z, 3, 0.15, floor, 3); }
      if (hash2(x, z + 9) < 0.12) { add('wallPaper', x + 3, floor, z + 3, 0, 0.2, 1, 2); box(x + 3, z + 3, 0.3, 0.3, floor, 3); }
      if (hash2(x + 5, z) < 0.8) add('panel', x + 3, floor + 2.94, z + 3, 0);
    }
    scatter(Math.floor(rng() * 3), (x, z) => item(rng() < 0.5 ? 'can' : 'bottle', x, z));
  } else if (b.id === 'cave') {
    // Rock pillars, stalagmites, hanging stalactites, glowing fungus, bones.
    const ceil = floor + 5.5;
    scatter(1 + Math.floor(rng() * 2), (x, z) => { const r = 0.8 + rng() * 1.2; add('pillar', x, floor - 0.2, z, rng() * 6.28, r, 6, r); cyl(x, z, r, floor, 6); });
    scatter(4 + Math.floor(rng() * 5), (x, z) => { const r = 0.25 + rng() * 0.5, h = 0.6 + rng() * 1.6; add('stalag', x, floor - 0.1, z, rng() * 6.28, r, h, r); cyl(x, z, r * 0.7, floor, h); });
    scatter(6 + Math.floor(rng() * 8), (x, z) => { const r = 0.15 + rng() * 0.4; add('stalac', x, ceil + 0.3 - fbm(x * 0.07, z * 0.07, 2) * 2.5, z, rng() * 6.28, r, 0.8 + rng() * 2.2, r); });
    scatter(2 + Math.floor(rng() * 4), (x, z) => { for (let k = 0; k < 3; k++) add('glowshroom', x + (rng() - 0.5), floor, z + (rng() - 0.5), rng() * 6.28, 0.4 + rng() * 0.5, 0.4 + rng() * 0.6, 0.4 + rng() * 0.5); });
    scatter(Math.floor(rng() * 3), (x, z) => rock(x, z, 0.4 + rng() * 0.8));
    scatter(Math.floor(rng() * 3), (x, z) => item(['rock', 'skull', 'bone'][Math.floor(rng() * 3)], x, z));
  } else if (b.id === 'factory') {
    // Machines on a grid, overhead pipes, catwalks, barrels, hanging lamps.
    for (let gx = 3; gx < CS; gx += 12) for (let gz = 3; gz < CS; gz += 12) {
      const x = x0 + gx + rng() * 4, z = z0 + gz + rng() * 4;
      const r = rng();
      if (r < 0.45) { const yaw = Math.round(rng() * 3) * Math.PI / 2; add('machine', x, floor, z, yaw); const a = yaw % Math.PI > 0.1; box(x, z, a ? 1 : 1.5, a ? 1.5 : 1, floor, 2.6); }
      else if (r < 0.7) { add('catwalk', x, floor + 2.8, z, 0); box(x, z, 3, 1, floor + 2.6, 0.4); add('barrel', x - 2, floor, z + 1.8, 0); cyl(x - 2, z + 1.8, 0.45, floor, 1); add('barrel', x - 2.9, floor, z + 1.8, 0); cyl(x - 2.9, z + 1.8, 0.45, floor, 1); add('barrel', x - 2.45, floor + 1, z + 1.8, 0); cyl(x - 2.45, z + 1.8, 0.45, floor + 1, 1); }
      else if (r < 0.85) { for (let k = 0; k < 3; k++) { const bx = x + (rng() - 0.5) * 2, bz = z + (rng() - 0.5) * 2; add('barrel', bx, floor, bz, rng()); cyl(bx, bz, 0.45, floor, 1); } }
    }
    if (hash2(cx, cz + 3) < 0.6) for (let i = 0; i < CS; i += 6) add('pipe', x0 + i + 3, floor + 3.4, z0 + 4 + (lz % 2) * 10, 0);
    if (hash2(cx + 3, cz) < 0.5) for (let i = 0; i < CS; i += 6) add('pipe', x0 + 7 + (lx % 2) * 10, floor + 4.2, z0 + i + 3, Math.PI / 2);
    for (let gx = 6; gx < CS; gx += 12) for (let gz = 6; gz < CS; gz += 12) if (hash2(x0 + gx, z0 + gz) < 0.6) add('lamp', x0 + gx, floor + 5.5, z0 + gz, 0);
    scatter(Math.floor(rng() * 3), (x, z) => item(['wrench', 'brick', 'can'][Math.floor(rng() * 3)], x, z));
  }
  return out;
}
