import * as THREE from 'three';

// Procedural, spatial horror audio. Every world sound goes through an HRTF panner at its
// source position, so a growl on your right comes out of the right speaker. No audio files.
export class Audio {
  constructor() { this.ctx = null; this.heartTimer = 0; this.heartRate = 0; this.ambience = {}; this.biome = 'forest'; this.dripT = 0; this.clankT = 0; this.frogT = 0; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    const L = this.ctx.listener;
    if (L.forwardX) { L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1; L.upY.value = 1; }
    this.buildAmbience();
  }

  // ---------- Listener follows the camera ----------
  updateListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = camera.getWorldPosition(_p);
    const f = _f.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_q));
    const u = _u.set(0, 1, 0).applyQuaternion(_q);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }

  panner(pos, ref = 1.5, max = 70) {
    const pn = this.ctx.createPanner();
    pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse';
    pn.refDistance = ref; pn.maxDistance = max; pn.rolloffFactor = 1.4;
    this.setPannerPos(pn, pos);
    pn.connect(this.master);
    return pn;
  }
  setPannerPos(pn, pos) {
    if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; }
    else pn.setPosition(pos.x, pos.y, pos.z);
  }

  noiseBuffer(seconds = 2) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ---------- Generic synth voices ----------
  tone(freq, dur, { type = 'sine', gain = 0.3, slide = 0, attack = 0.01, filter = 0, dest = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (filter) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  noise(dur, { gain = 0.3, type = 'bandpass', freq = 800, q = 1, dest = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(Math.min(3, dur + 0.1));
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.master); src.start(t); src.stop(t + dur + 0.1);
  }

  // ---------- Positional world sounds ----------
  roar(pos) {
    if (!this.ctx) return;
    const d = this.panner(pos, 3, 90);
    this.tone(100, 1.2, { type: 'sawtooth', gain: 0.8, slide: -55, attack: 0.08, filter: 650, dest: d });
    this.tone(151, 1.0, { type: 'square', gain: 0.35, slide: -80, attack: 0.1, filter: 420, dest: d });
    this.noise(1.1, { gain: 0.5, freq: 480, q: 1.2, dest: d });
    setTimeout(() => d.disconnect(), 1600);
  }
  growl(pos) {
    if (!this.ctx) return;
    const d = this.panner(pos, 2, 50);
    this.tone(62, 0.9, { type: 'sawtooth', gain: 0.5, slide: -10, attack: 0.15, filter: 260, dest: d });
    this.noise(0.9, { gain: 0.2, freq: 200, q: 0.8, type: 'lowpass', dest: d });
    setTimeout(() => d.disconnect(), 1300);
  }
  thump(pos) {
    if (!this.ctx) return;
    const d = this.panner(pos, 2, 45);
    this.tone(55, 0.14, { gain: 0.6, slide: -35, filter: 140, dest: d });
    this.noise(0.08, { gain: 0.15, freq: 300, type: 'lowpass', dest: d });
    setTimeout(() => d.disconnect(), 400);
  }
  impact(pos, k = 0.5) {
    if (!this.ctx) return;
    const d = this.panner(pos, 1.5, 50);
    this.tone(180 + k * 200, 0.08, { type: 'triangle', gain: 0.4 * k + 0.1, slide: -120, filter: 2000, dest: d });
    this.noise(0.1, { gain: 0.3 * k, freq: 1800, q: 0.7, dest: d });
    setTimeout(() => d.disconnect(), 400);
  }
  stunHit(pos) {
    if (!this.ctx) return;
    const d = this.panner(pos, 2, 50);
    this.tone(90, 0.3, { type: 'square', gain: 0.5, slide: -40, filter: 400, dest: d });
    this.tone(400, 0.5, { type: 'sawtooth', gain: 0.3, slide: -300, filter: 900, dest: d });
    setTimeout(() => d.disconnect(), 900);
  }
  ripAt(pos) {
    // Crunch, tear, and a wet scream from the kill site.
    if (!this.ctx) return;
    const d = this.panner(pos, 2, 60);
    this.noise(0.5, { gain: 0.8, freq: 700, q: 0.5, dest: d });
    this.tone(70, 0.7, { gain: 0.7, slide: -50, filter: 220, dest: d });
    this.tone(880, 0.6, { type: 'sawtooth', gain: 0.45, slide: -700, attack: 0.02, filter: 2600, dest: d });
    setTimeout(() => this.noise(0.35, { gain: 0.5, freq: 400, q: 0.6, type: 'lowpass', dest: d }), 350);
    setTimeout(() => d.disconnect(), 1800);
  }
  grabbed() { this.noise(0.25, { gain: 0.5, freq: 900, q: 0.6 }); this.tone(150, 0.3, { type: 'square', gain: 0.3, slide: -60, filter: 500 }); }
  click() { this.tone(1200, 0.04, { gain: 0.12, type: 'square' }); }
  buzz() { this.noise(0.12, { gain: 0.08, freq: 3000, q: 2 }); }
  respawn() { this.tone(440, 0.4, { gain: 0.12, slide: 220 }); }
  heartbeatTick(danger) {
    this.tone(55, 0.18, { gain: 0.35 * danger + 0.1, slide: -20, filter: 160 });
    setTimeout(() => this.tone(48, 0.14, { gain: 0.25 * danger + 0.05, slide: -15, filter: 140 }), 160);
  }

  // ---------- Ambience beds, crossfaded by biome ----------
  buildAmbience() {
    const bed = (build) => { const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master); build(g); return g; };
    this.ambience.wind = bed((g) => {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(3); src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.7;
      src.connect(f); f.connect(g); src.start();
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = this.ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
      const of = this.ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 90; const og = this.ctx.createGain(); og.gain.value = 0.4;
      o.connect(of); of.connect(og); og.connect(g); o.start();
    });
    this.ambience.hum = bed((g) => {   // fluorescent buzz
      for (const [f, a] of [[60, 0.5], [120, 0.35], [180, 0.15], [240, 0.1], [3600, 0.03]]) { const o = this.ctx.createOscillator(); o.type = f > 1000 ? 'sine' : 'square'; o.frequency.value = f; const og = this.ctx.createGain(); og.gain.value = a * 0.08; o.connect(og); og.connect(g); o.start(); }
    });
    this.ambience.machine = bed((g) => {   // factory rumble
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 45; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120;
      const og = this.ctx.createGain(); og.gain.value = 0.35; o.connect(f); f.connect(og); og.connect(g); o.start();
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(2); src.loop = true; const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 3;
      const ng = this.ctx.createGain(); ng.gain.value = 0.05; src.connect(nf); nf.connect(ng); ng.connect(g); src.start();
    });
    this.ambience.cave = bed((g) => {   // deep hollow tone
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 52; const og = this.ctx.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(g); o.start();
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(3); src.loop = true; const nf = this.ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 160;
      const ng = this.ctx.createGain(); ng.gain.value = 0.3; src.connect(nf); nf.connect(ng); ng.connect(g); src.start();
    });
    this.ambience.swamp = bed((g) => {   // insects
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(2); src.loop = true; const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 4200; nf.Q.value = 8;
      const ng = this.ctx.createGain(); ng.gain.value = 0.12; src.connect(nf); nf.connect(ng); ng.connect(g); src.start();
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 9; const lg = this.ctx.createGain(); lg.gain.value = 0.1; lfo.connect(lg); lg.connect(ng.gain); lfo.start();
    });
  }

  setBiome(id) { this.biome = id; }

  // Called every frame with the distance to the nearest monster.
  update(dt, nearestDist, listenerPos) {
    if (!this.ctx) return;
    const want = { wind: 0, hum: 0, machine: 0, cave: 0, swamp: 0 };
    ({ forest: () => { want.wind = 0.35; }, graveyard: () => { want.wind = 0.5; }, swamp: () => { want.wind = 0.2; want.swamp = 0.6; },
       backrooms: () => { want.hum = 0.6; }, factory: () => { want.machine = 0.5; }, cave: () => { want.cave = 0.5; } })[this.biome]();
    for (const k in this.ambience) { const g = this.ambience[k].gain; g.value += (want[k] - g.value) * Math.min(1, dt * 1.5); }
    // One-shot biome details.
    if (this.biome === 'cave') { this.dripT -= dt; if (this.dripT <= 0) { this.dripT = 0.8 + Math.random() * 3; const p = _p.copy(listenerPos); p.x += (Math.random() - 0.5) * 16; p.z += (Math.random() - 0.5) * 16; p.y += 2; const d = this.panner(p, 1, 30); this.tone(1800 + Math.random() * 1500, 0.12, { gain: 0.25, slide: -900, dest: d }); setTimeout(() => d.disconnect(), 400); } }
    if (this.biome === 'factory') { this.clankT -= dt; if (this.clankT <= 0) { this.clankT = 2 + Math.random() * 6; const p = _p.copy(listenerPos); p.x += (Math.random() - 0.5) * 30; p.z += (Math.random() - 0.5) * 30; const d = this.panner(p, 2, 60); this.tone(300 + Math.random() * 400, 0.25, { type: 'square', gain: 0.25, slide: -100, filter: 1500, dest: d }); this.noise(0.2, { gain: 0.2, freq: 2500, q: 1, dest: d }); setTimeout(() => d.disconnect(), 600); } }
    if (this.biome === 'swamp' || this.biome === 'graveyard') { this.frogT -= dt; if (this.frogT <= 0) { this.frogT = 3 + Math.random() * 8; const p = _p.copy(listenerPos); p.x += (Math.random() - 0.5) * 40; p.z += (Math.random() - 0.5) * 40; const d = this.panner(p, 2, 60); if (this.biome === 'swamp') this.tone(180, 0.3, { type: 'sawtooth', gain: 0.15, slide: 40, filter: 600, dest: d }); else this.noise(0.4, { gain: 0.25, freq: 1200, q: 3, dest: d }); setTimeout(() => d.disconnect(), 700); } }

    const danger = Math.max(0, 1 - nearestDist / 30);
    this.heartRate = danger > 0.05 ? 0.8 + danger * 2.2 : 0;
    if (this.heartRate > 0) { this.heartTimer += dt * this.heartRate; if (this.heartTimer >= 1) { this.heartTimer = 0; this.heartbeatTick(danger); } }
  }

  // Remote voice: route a MediaStream through a panner that follows the speaker.
  attachStream(stream) {
    if (!this.ctx) return null;
    // Chrome needs the stream attached to a media element before WebAudio gets samples.
    const el = document.createElement('audio'); el.srcObject = stream; el.muted = true; el.autoplay = true; el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const pn = this.panner(new THREE.Vector3(), 1.5, 40);
    src.connect(pn);
    return { pn, el, src, setPos: (p) => this.setPannerPos(pn, p), dispose: () => { try { src.disconnect(); pn.disconnect(); el.srcObject = null; } catch (e) { /* ignore */ } } };
  }
}
const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
