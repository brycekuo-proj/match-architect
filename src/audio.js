// Procedural WebAudio: no audio files, everything synthesised.
export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.musicOn = true;
    try { this.muted = localStorage.getItem('mq_muted') === '1'; this.musicOn = localStorage.getItem('mq_music') !== '0'; } catch (e) {}
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = this.musicOn ? 0.22 : 0; this.mus.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.brownBuf = c.createBuffer(1, len, c.sampleRate);
      const b = this.brownBuf.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
      this._startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) {
    this.muted = m; try { localStorage.setItem('mq_muted', m ? '1' : '0'); } catch (e) {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  setMusic(on) {
    this.musicOn = on; try { localStorage.setItem('mq_music', on ? '1' : '0'); } catch (e) {}
    if (this.mus) this.mus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.2);
  }
  get ok() { return !!this.ctx; }
  _noise(dur, type, freq, q, gain, when = 0, dest = this.sfx) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return { f, g, t };
  }
  _tone(freq, dur, type = 'sine', gain = 0.3, when = 0, dest = this.sfx, glideTo = null) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  click() { if (!this.ok) return; this._tone(1200, 0.05, 'triangle', 0.12); }
  place() {
    if (!this.ok) return;
    this._noise(0.06, 'bandpass', 2600, 3, 0.5);
    this._tone(820 + Math.random() * 120, 0.08, 'triangle', 0.22);
    this._tone(410, 0.12, 'sine', 0.15, 0.01);
  }
  remove() { if (!this.ok) return; this._noise(0.08, 'bandpass', 1200, 2, 0.35); this._tone(300, 0.1, 'triangle', 0.15, 0, this.sfx, 180); }
  deny() { if (!this.ok) return; this._tone(220, 0.12, 'square', 0.06); this._tone(180, 0.14, 'square', 0.05, 0.08); }
  snap() {
    if (!this.ok) return;
    this._noise(0.12, 'highpass', 1500, 0.7, 0.9);
    this._noise(0.05, 'bandpass', 3500, 4, 0.7, 0.02);
    this._tone(110, 0.18, 'sine', 0.5, 0, this.sfx, 50);
    // match flaring up: fsssh
    const n = this._noise(0.9, 'bandpass', 5000, 1.2, 0.0001, 0.05);
    n.g.gain.setValueAtTime(0.0001, n.t); n.g.gain.exponentialRampToValueAtTime(0.35, n.t + 0.08); n.g.gain.exponentialRampToValueAtTime(0.001, n.t + 0.9);
  }
  creak(intensity = 0.5) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = 140 + Math.random() * 160; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.6), t + 0.25);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * intensity, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(bp); bp.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.35);
  }
  rumbleStart() {
    if (!this.ok || this.rumble) return;
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.brownBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
    const g = c.createGain(); g.gain.value = 0.0001;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
    this.rumble = { s, g, f };
  }
  rumbleLevel(v) { if (this.rumble) this.rumble.g.gain.setTargetAtTime(0.0001 + v * 1.4, this.ctx.currentTime, 0.08); }
  rumbleStop() { if (!this.rumble) return; const r = this.rumble; r.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15); r.s.stop(this.ctx.currentTime + 0.8); this.rumble = null; }
  engineStart() {
    if (!this.ok || this.engine) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const lfo = c.createOscillator(); lfo.frequency.value = 18; const lg = c.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.07, c.currentTime, 0.2);
    o.connect(f); f.connect(g); g.connect(this.sfx); o.start(); lfo.start();
    this.engine = { o, lfo, g };
  }
  engineStop() { if (!this.engine) return; const e = this.engine, t = this.ctx.currentTime; e.g.gain.setTargetAtTime(0.0001, t, 0.15); e.o.stop(t + 0.8); e.lfo.stop(t + 0.8); this.engine = null; }
  win() {
    if (!this.ok) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { this._tone(f, 0.5, 'sine', 0.22, i * 0.09); this._tone(f * 2, 0.25, 'sine', 0.05, i * 0.09); });
  }
  lose() {
    if (!this.ok) return;
    [392, 370, 349, 262].forEach((f, i) => this._tone(f, i === 3 ? 0.7 : 0.28, 'triangle', 0.16, i * 0.22, this.sfx, i === 3 ? 196 : null));
  }
  cheer() { if (!this.ok) return; this._tone(880, 0.12, 'square', 0.05); this._tone(1175, 0.18, 'square', 0.05, 0.1); }

  // gentle pentatonic marimba loop
  _startMusic() {
    const c = this.ctx;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const root = 261.63;
    const pat = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 3, 2];
    const bass = [0, 0, -5, -5, -3, -3, -5, -5];
    let step = 0, next = c.currentTime + 0.3;
    const bpm = 96, dt = 60 / bpm / 2;
    const mar = (f, t, g) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4.01;
      const ga = c.createGain(); ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(g, t + 0.005); ga.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      const gb = c.createGain(); gb.gain.setValueAtTime(g * 0.25, t); gb.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(ga); o2.connect(gb); ga.connect(this.mus); gb.connect(this.mus);
      o.start(t); o2.start(t); o.stop(t + 0.7); o2.stop(t + 0.2);
    };
    this._musTimer = setInterval(() => {
      if (!this.musicOn || this.muted) { next = c.currentTime + 0.1; return; }
      while (next < c.currentTime + 0.25) {
        const bar = Math.floor(step / 16) % 4;
        const n = pat[step % 16] + (bar === 2 ? 1 : 0);
        if (step % 16 !== 7 && step % 16 !== 15 && Math.random() > 0.12)
          mar(root * Math.pow(2, scale[n % scale.length] / 12), next, 0.35);
        if (step % 4 === 0) mar(root / 2 * Math.pow(2, bass[(step / 4) % 8] / 12), next, 0.28);
        step++; next += dt;
      }
    }, 90);
  }
}
