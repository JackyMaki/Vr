// Procedural horror audio: no files to load. Everything is synthesized on demand.
export class Audio {
  constructor() { this.ctx = null; this.heartTimer = 0; this.heartRate = 0; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.6; this.master.connect(this.ctx.destination);
    this.ambient();
  }

  noiseBuffer(seconds = 2) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  ambient() {
    // Wind: looping filtered noise with a slowly wandering filter.
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(3); src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.7;
    const g = this.ctx.createGain(); g.gain.value = 0.10;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    // Low drone.
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 38;
    const of = this.ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 90;
    const og = this.ctx.createGain(); og.gain.value = 0.05;
    o.connect(of); of.connect(og); og.connect(this.master); o.start();
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, slide = 0, attack = 0.01, filter = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (filter) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Called every frame with distance to the nearest monster.
  update(dt, nearestDist) {
    if (!this.ctx) return;
    const danger = Math.max(0, 1 - nearestDist / 30);
    this.heartRate = danger > 0.05 ? 0.8 + danger * 2.2 : 0;
    if (this.heartRate > 0) {
      this.heartTimer += dt * this.heartRate;
      if (this.heartTimer >= 1) {
        this.heartTimer = 0;
        this.tone(55, 0.18, { gain: 0.35 * danger + 0.1, slide: -20, filter: 160 });
        setTimeout(() => this.tone(48, 0.14, { gain: 0.25 * danger + 0.05, slide: -15, filter: 140 }), 160);
      }
    }
  }

  roar(dist) {
    if (!this.ctx) return;
    const g = Math.max(0.05, 1 - dist / 60);
    this.tone(110, 1.1, { type: 'sawtooth', gain: 0.5 * g, slide: -60, attack: 0.08, filter: 600 });
    this.tone(163, 0.9, { type: 'square', gain: 0.2 * g, slide: -90, attack: 0.1, filter: 400 });
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(1);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.2;
    const gg = this.ctx.createGain(); gg.gain.setValueAtTime(0.35 * g, this.ctx.currentTime);
    gg.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1);
    src.connect(f); f.connect(gg); gg.connect(this.master); src.start();
  }

  thump(dist) {
    if (!this.ctx || dist > 40) return;
    this.tone(60, 0.12, { gain: 0.25 * (1 - dist / 40), slide: -40, filter: 120 });
  }

  death() {
    if (!this.ctx) return;
    this.tone(900, 0.5, { type: 'sawtooth', gain: 0.35, slide: -700, attack: 0.005, filter: 2500 }); // scream
    this.tone(70, 0.6, { gain: 0.5, slide: -50, filter: 200 });                                       // crunch
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(0.6);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    src.connect(g); g.connect(this.master); src.start();
  }

  click() { this.tone(1200, 0.05, { gain: 0.15, type: 'square' }); }
  respawn() { this.tone(440, 0.4, { gain: 0.15, slide: 220 }); }
}
