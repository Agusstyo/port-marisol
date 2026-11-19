// Sound: everything is synthesized with WebAudio — no audio files. A two-oscillator engine
// whose pitch follows the player's speed, a two-tone siren that fades with the nearest
// police car, noise-burst gunshots and impacts, little arpeggio chimes for cash and mission
// stingers, and a slow tropical pad loop for music. The context only starts on the first
// user gesture, the way browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur, { gain = 0.3, freq = 1200, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  click() { this.tone(660, 0.06, { type: 'triangle', gain: 0.12 }); }
  shot() {
    this.noise(0.14, { gain: 0.5, freq: 2600 });
    this.tone(150, 0.1, { type: 'square', gain: 0.16, slide: -90 });
  }
  dryFire() { this.tone(1200, 0.03, { type: 'square', gain: 0.06 }); }
  thud(strength = 1) {
    this.noise(0.18, { gain: 0.25 * strength, freq: 500 });
    this.tone(70, 0.16, { type: 'sine', gain: 0.3 * strength, slide: -30 });
  }
  chime() {
    this.tone(880, 0.12, { type: 'triangle', gain: 0.16 });
    this.tone(1318, 0.18, { type: 'triangle', gain: 0.14, delay: 0.07 });
  }
  success() {
    for (const [i, f] of [523, 659, 784, 1046].entries()) this.tone(f, 0.22, { type: 'triangle', gain: 0.16, delay: i * 0.09 });
  }
  fail() {
    this.tone(392, 0.2, { type: 'triangle', gain: 0.16 });
    this.tone(311, 0.3, { type: 'triangle', gain: 0.16, delay: 0.14 });
  }
  bustedSting() {
    this.tone(233, 0.35, { type: 'sawtooth', gain: 0.12 });
    this.tone(220, 0.45, { type: 'sawtooth', gain: 0.12, delay: 0.18 });
  }

  startEngine() {
    if (!this.ctx || this.engineNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 28;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    osc.start();
    osc2.start();
    this.engineNodes = { osc, osc2, filter, g };
  }

  setEngine(speedRatio, running) {
    if (!this.engineNodes) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + speedRatio * 130;
    this.engineNodes.osc.frequency.setTargetAtTime(rpm, t, 0.06);
    this.engineNodes.osc2.frequency.setTargetAtTime(rpm / 2, t, 0.06);
    this.engineNodes.filter.frequency.setTargetAtTime(300 + speedRatio * 900, t, 0.08);
    this.engineNodes.g.gain.setTargetAtTime(running ? 0.05 + speedRatio * 0.075 : 0.0, t, 0.1);
  }

  stopEngine() {
    if (!this.engineNodes) return;
    try {
      this.engineNodes.osc.stop();
      this.engineNodes.osc2.stop();
    } catch { /* already stopped */ }
    this.engineNodes = null;
  }

  startSiren() {
    if (!this.ctx || this.sirenNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 720;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    this.sirenNodes = { osc, g };
  }

  setSiren(intensity, time) {
    if (!this.sirenNodes) return;
    const t = this.ctx.currentTime;
    const wail = Math.floor(time * 1.6) % 2 === 0 ? 720 : 990;
    this.sirenNodes.osc.frequency.setTargetAtTime(wail, t, 0.09);
    this.sirenNodes.g.gain.setTargetAtTime(0.055 * intensity, t, 0.15);
  }

  stopSiren() {
    if (!this.sirenNodes) return;
    try { this.sirenNodes.osc.stop(); } catch { /* already stopped */ }
    this.sirenNodes = null;
  }

  // A slow sun-soaked loop: I–V–vi–IV pads in C with a soft bass, one chord every 2.4 s.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [261.6, 329.6, 392.0], [196.0, 246.9, 293.7], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6],
    ];
    const bass = [65.4, 49.0, 55.0, 43.7];
    const playStep = () => {
      const i = this.musicStep % 4;
      for (const f of chords[i]) this.tone(f, 2.3, { type: 'sine', gain: 0.028 });
      this.tone(bass[i] * 2, 2.0, { type: 'triangle', gain: 0.05 });
      this.musicStep++;
    };
    playStep();
    this.musicTimer = setInterval(playStep, 2400);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
