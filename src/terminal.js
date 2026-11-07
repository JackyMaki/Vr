import * as THREE from 'three';
import { PLAYER_COLORS } from './config.js';

// A panel is a canvas drawn onto a plane. Buttons are rectangles in canvas space; the game
// raycasts the plane, converts the UV hit to canvas pixels and asks the panel what was hit.
export class Panel {
  constructor(mesh, w = 1024, h = 768) {
    this.mesh = mesh; this.w = w; this.h = h;
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    mesh.material.map = this.texture; mesh.material.needsUpdate = true;
    this.buttons = [];
    this.hover = null;
  }
  button(x, y, w, h, label, fn, opts = {}) { this.buttons.push({ x, y, w, h, label, fn, ...opts }); }
  hit(uv) {
    const x = uv.x * this.w, y = (1 - uv.y) * this.h;
    return this.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }
  setHover(uv) { const b = uv ? this.hit(uv) : null; if (b !== this.hover) { this.hover = b; this.draw(); } }
  click(uv) { const b = this.hit(uv); if (b) { b.fn(); this.draw(); return true; } return false; }
  drawButton(b) {
    const g = this.ctx;
    g.fillStyle = b === this.hover ? (b.color || '#2f6d4c') : (b.bg || '#15221c');
    g.strokeStyle = b.active ? '#b7ffcf' : '#3fbf7f';
    g.lineWidth = b.active ? 5 : 2;
    roundRect(g, b.x, b.y, b.w, b.h, 10); g.fill(); g.stroke();
    g.fillStyle = b.fg || '#dfffe9'; g.font = (b.font || 'bold 34px') + ' monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 2);
  }
}

export class Terminal extends Panel {
  constructor(mesh, { onName, onJoin, onLeave }) {
    super(mesh, 1024, 768);
    this.tab = 'name'; this.name = 'MONKE'; this.room = ''; this.status = 'SOLO  -  not connected';
    this.onName = onName; this.onJoin = onJoin; this.onLeave = onLeave;
    this.build();
    this.draw();
  }
  get text() { return this.tab === 'name' ? this.name : this.room; }
  set text(v) { if (this.tab === 'name') this.name = v; else this.room = v; }
  build() {
    this.buttons = [];
    this.button(40, 30, 300, 70, 'YOUR NAME', () => { this.tab = 'name'; this.build(); }, { active: this.tab === 'name' });
    this.button(360, 30, 300, 70, 'JOIN ROOM', () => { this.tab = 'room'; this.build(); }, { active: this.tab === 'room' });
    this.button(680, 30, 300, 70, 'LEAVE ROOM', () => this.onLeave(), { bg: '#2a1515', color: '#6d2f2f' });
    const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    const kw = 86, kh = 78, gap = 8;
    rows.forEach((row, r) => {
      const x0 = (this.w - row.length * (kw + gap)) / 2;
      [...row].forEach((ch, i) => this.button(x0 + i * (kw + gap), 250 + r * (kh + gap), kw, kh, ch, () => {
        const max = this.tab === 'name' ? 12 : 8;
        if (this.text.length < max) this.text += ch;
      }));
    });
    this.button(40, 594, 180, 78, 'DEL', () => { this.text = this.text.slice(0, -1); });
    this.button(240, 594, 180, 78, 'CLEAR', () => { this.text = ''; });
    if (this.tab === 'name') {
      this.button(560, 594, 420, 78, 'SET NAME', () => { if (this.name.length) this.onName(this.name); }, { bg: '#1c3a2a' });
    } else {
      this.button(440, 594, 260, 78, 'RANDOM', () => { this.room = Math.random().toString(36).slice(2, 7).toUpperCase(); });
      this.button(720, 594, 260, 78, 'JOIN', () => { if (this.room.length) this.onJoin(this.room); }, { bg: '#1c3a2a' });
    }
  }
  setStatus(s) { this.status = s; this.draw(); }
  draw() {
    const g = this.ctx;
    g.fillStyle = '#070b09'; g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = '#0d1a13'; g.fillRect(0, 120, this.w, 110);
    g.strokeStyle = '#3fbf7f'; g.lineWidth = 3; g.strokeRect(40, 130, this.w - 80, 90);
    g.fillStyle = '#b7ffcf'; g.font = 'bold 54px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const label = this.tab === 'name' ? 'NAME' : 'ROOM';
    g.fillText(label + ' > ' + this.text + (Math.floor(Date.now() / 500) % 2 ? '_' : ' '), 60, 175);
    for (const b of this.buttons) this.drawButton(b);
    g.fillStyle = '#ffd166'; g.font = '30px monospace'; g.textAlign = 'left';
    g.fillText(this.status, 40, 720);
    this.texture.needsUpdate = true;
  }
}

export class PaintStation extends Panel {
  constructor(mesh, { onColor }) {
    super(mesh, 1024, 800);
    this.onColor = onColor; this.current = PLAYER_COLORS[0];
    const cols = 4, size = 190, gap = 22, x0 = (this.w - cols * (size + gap) + gap) / 2;
    PLAYER_COLORS.forEach((c, i) => {
      const hex = '#' + c.toString(16).padStart(6, '0');
      this.button(x0 + (i % cols) * (size + gap), 120 + Math.floor(i / cols) * (size + gap), size, size, '', () => {
        this.current = c; this.onColor(c);
      }, { bg: hex, color: hex, swatch: c });
    });
    this.draw();
  }
  draw() {
    const g = this.ctx;
    g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = '#ffd166'; g.font = 'bold 52px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PAINT STATION  -  pick your fur', this.w / 2, 60);
    for (const b of this.buttons) {
      this.drawButton(b);
      if (b.swatch === this.current || b === this.hover) {
        g.strokeStyle = b.swatch === this.current ? '#ffffff' : '#ffd166'; g.lineWidth = 8;
        roundRect(g, b.x - 6, b.y - 6, b.w + 12, b.h + 12, 14); g.stroke();
      }
    }
    this.texture.needsUpdate = true;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

// Static how-to board on the platform (the only instructions in the game).
export class Guide extends Panel {
  constructor(mesh) {
    super(mesh, 1200, 800);
    this.draw();
  }
  draw() {
    const g = this.ctx;
    g.fillStyle = '#0b0d0b'; g.fillRect(0, 0, this.w, this.h);
    g.strokeStyle = '#3fbf7f'; g.lineWidth = 6; g.strokeRect(14, 14, this.w - 28, this.h - 28);
    g.fillStyle = '#b7ffcf'; g.font = 'bold 56px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HOLLOW CANOPY', this.w / 2, 70);
    g.font = '30px monospace'; g.textAlign = 'left'; g.fillStyle = '#dfffe9';
    const lines = [
      'HEADSET   push off ground and trees with your hands to move.',
      '          grab trees and walls to climb. GRIP grabs items,',
      '          let go to throw. X / A toggles your flashlight.',
      '          point at a screen and pull TRIGGER to use it.',
      '',
      'DESKTOP   WASD move, SHIFT sprint, SPACE jump, mouse look.',
      '          E pick up, click throw, Q drop, F flashlight.',
      '',
      'The lit platform is safe. They cannot step onto it.',
      'They are bigger and faster than you. They cannot climb.',
      'A thrown rock to the head stuns one for a moment.',
      'Backrooms, caves, a factory, a swamp and graves lie out there.',
      'Join a room at the terminal to play with friends. Voice is on.',
    ];
    lines.forEach((l, i) => g.fillText(l, 50, 140 + i * 46));
    this.texture.needsUpdate = true;
  }
}
