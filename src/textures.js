import * as THREE from 'three';

// Procedural textures drawn on canvases at startup. No image files to load, and every
// surface in the game gets grain instead of flat colour. All are tileable-ish noise.

const cache = {};
function make(name, size, draw, opts = {}) {
  if (cache[name]) return cache[name];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) t.repeat.set(opts.repeat, opts.repeat);
  cache[name] = t;
  return t;
}

let seed = 1;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

function grain(g, size, base, amount, count = 4000) {
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(128 + (rnd() - 0.5) * amount);
    g.fillStyle = `rgba(${v},${v},${v},${0.18 + rnd() * 0.25})`;
    const s = 1 + rnd() * 3;
    g.fillRect(rnd() * size, rnd() * size, s, s);
  }
}

export const TEX = {
  // Fur: streaky vertical strokes. Grey so the material colour tints it.
  fur: () => make('fur', 256, (g, s) => {
    grain(g, s, '#8c8c8c', 40, 1500);
    for (let i = 0; i < 2600; i++) {
      const v = 90 + Math.floor(rnd() * 110);
      g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 1 + rnd();
      const x = rnd() * s, y = rnd() * s, l = 6 + rnd() * 14;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y + l); g.stroke();
    }
  }),
  monsterFur: () => make('monsterFur', 256, (g, s) => {
    grain(g, s, '#6a6a6a', 60, 1500);
    for (let i = 0; i < 3000; i++) {
      const v = 40 + Math.floor(rnd() * 120);
      g.strokeStyle = `rgba(${v},${v},${v},0.6)`; g.lineWidth = 1 + rnd() * 1.5;
      const x = rnd() * s, y = rnd() * s, l = 8 + rnd() * 18;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y + l); g.stroke();
    }
    // Scars and bald patches.
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = 'rgba(120,20,25,0.8)'; g.lineWidth = 2 + rnd() * 3;
      const x = rnd() * s, y = rnd() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 50); g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(70,55,60,0.7)';
      g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 8 + rnd() * 14, 5 + rnd() * 10, rnd() * 3, 0, 7); g.fill();
    }
  }),
  skin: () => make('skin', 128, (g, s) => {
    grain(g, s, '#9a9a9a', 50, 2500);
    for (let i = 0; i < 300; i++) {
      g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 1;
      const x = rnd() * s, y = rnd() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 12); g.stroke();
    }
  }),
  bark: () => make('bark', 256, (g, s) => {
    grain(g, s, '#6b4a30', 50, 2000);
    for (let i = 0; i < 400; i++) {
      const v = 30 + Math.floor(rnd() * 60);
      g.strokeStyle = `rgba(${v},${v * 0.7},${v * 0.5},0.7)`; g.lineWidth = 1 + rnd() * 3;
      const x = rnd() * s;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 20, s); g.stroke();
    }
  }, { repeat: 1 }),
  leaves: () => make('leaves', 128, (g, s) => {
    grain(g, s, '#3d6b3a', 70, 3000);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${20 + rnd() * 40},${60 + rnd() * 80},${20 + rnd() * 40},0.6)`;
      g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 3 + rnd() * 5, 2 + rnd() * 3, rnd() * 3, 0, 7); g.fill();
    }
  }),
  ground: () => make('ground', 256, (g, s) => {
    grain(g, s, '#8a8a8a', 90, 9000);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(${40 + rnd() * 60},${40 + rnd() * 60},${40 + rnd() * 50},0.35)`;
      g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 6 + rnd() * 20, 4 + rnd() * 14, rnd() * 3, 0, 7); g.fill();
    }
  }, { repeat: 8 }),
  rock: () => make('rock', 256, (g, s) => {
    grain(g, s, '#7a7a7a', 110, 6000);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(20,20,25,${0.3 + rnd() * 0.4})`; g.lineWidth = 1 + rnd() * 2;
      g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  }),
  wallpaper: () => make('wallpaper', 256, (g, s) => {
    g.fillStyle = '#c8b25a'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) { g.fillStyle = x % 32 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; g.fillRect(x, 0, 8, s); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(90,70,20,${rnd() * 0.25})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `rgba(80,60,20,${0.15 + rnd() * 0.25})`;
      g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 10 + rnd() * 30, 6 + rnd() * 20, rnd() * 3, 0, 7); g.fill();
    }
  }, { repeat: 2 }),
  carpet: () => make('carpet', 128, (g, s) => {
    grain(g, s, '#a08a3a', 50, 6000);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,50,20,${0.1 + rnd() * 0.3})`;
      g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 6 + rnd() * 18, 4 + rnd() * 10, rnd() * 3, 0, 7); g.fill();
    }
  }, { repeat: 12 }),
  ceilingTile: () => make('ceilingTile', 256, (g, s) => {
    grain(g, s, '#d9d4c2', 25, 3000);
    g.strokeStyle = 'rgba(80,80,70,0.6)'; g.lineWidth = 3;
    for (let x = 0; x <= s; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(s, x); g.stroke(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(120,100,60,${0.1 + rnd() * 0.3})`; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 10 + rnd() * 25, 8 + rnd() * 20, 0, 0, 7); g.fill(); }
  }, { repeat: 4 }),
  concrete: () => make('concrete', 256, (g, s) => {
    grain(g, s, '#7c7c78', 60, 8000);
    for (let i = 0; i < 25; i++) {
      g.strokeStyle = `rgba(30,30,30,${0.3 + rnd() * 0.4})`; g.lineWidth = 1 + rnd();
      g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(40,30,20,${0.1 + rnd() * 0.3})`; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 10 + rnd() * 30, 8 + rnd() * 20, 0, 0, 7); g.fill(); }
  }, { repeat: 6 }),
  metal: () => make('metal', 256, (g, s) => {
    grain(g, s, '#6a6e72', 40, 4000);
    g.fillStyle = 'rgba(40,42,46,0.8)';
    for (let x = 16; x < s; x += 64) for (let y = 16; y < s; y += 64) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(30,30,34,0.7)'; g.lineWidth = 4;
    g.strokeRect(2, 2, s - 4, s - 4);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,60,20,${0.15 + rnd() * 0.4})`; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 4 + rnd() * 20, 3 + rnd() * 12, rnd() * 3, 0, 7); g.fill(); } // rust
  }),
  water: () => make('water', 128, (g, s) => {
    grain(g, s, '#1a2a28', 30, 1500);
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(80,120,110,0.25)'; g.lineWidth = 1; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 5 + rnd() * 25, 2 + rnd() * 6, 0, 0, 7); g.stroke(); }
  }, { repeat: 6 }),
  stone: () => make('stone', 256, (g, s) => {
    grain(g, s, '#8a8680', 70, 7000);
    g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 3;
    for (let y = 0; y < s; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      for (let x = (y / 64) % 2 ? 32 : 0; x < s; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
  }, { repeat: 6 }),
  bone: () => make('bone', 64, (g, s) => { grain(g, s, '#d8d0b8', 40, 800); }),
};

export function tex(name) { return TEX[name](); }
