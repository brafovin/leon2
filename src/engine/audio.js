/** Kleine prozedurale Soundengine (WebAudio, keine externen Dateien). */
class Sfx {
  constructor() { this.ctx = null; this.master = null; }

  _ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    return true;
  }

  resume() { this._ensure(); if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  _tone({ freq = 440, dur = 0.12, type = 'square', gain = 0.5, slide = 0, delay = 0 }) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noise({ dur = 0.2, gain = 0.5, lp = 1200, delay = 0 }) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  shoot(kind = 'smg') {
    if (kind === 'shotgun') { this._noise({ dur: 0.3, gain: 0.75, lp: 2600 }); this._tone({ freq: 150, slide: -110, dur: 0.22, type: 'sawtooth', gain: 0.5 }); }
    else if (kind === 'bow') { this._tone({ freq: 900, slide: -600, dur: 0.14, type: 'triangle', gain: 0.35 }); }
    else { this._noise({ dur: 0.09, gain: 0.4, lp: 3400 }); this._tone({ freq: 320, slide: -180, dur: 0.07, type: 'square', gain: 0.3 }); }
  }
  chop(mat) {
    const f = mat === 'wood' ? 220 : mat === 'stone' ? 150 : 380;
    this._tone({ freq: f, slide: -90, dur: 0.1, type: 'triangle', gain: 0.45 });
    this._noise({ dur: 0.12, gain: 0.3, lp: mat === 'wood' ? 900 : 2200 });
  }
  hitmark() { this._tone({ freq: 1500, dur: 0.05, type: 'sine', gain: 0.4 }); }
  elim() { [880, 1180, 1580].forEach((f, i) => this._tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.4, delay: i * 0.09 })); }
  hurt() { this._tone({ freq: 190, slide: -90, dur: 0.2, type: 'sawtooth', gain: 0.4 }); }
  build() { this._tone({ freq: 620, slide: 260, dur: 0.1, type: 'square', gain: 0.28 }); }
  pickup() { this._tone({ freq: 700, slide: 500, dur: 0.13, type: 'sine', gain: 0.35 }); }
  ui() { this._tone({ freq: 520, dur: 0.05, type: 'sine', gain: 0.3 }); }
  buy() { [660, 990, 1320].forEach((f, i) => this._tone({ freq: f, dur: 0.12, type: 'sine', gain: 0.35, delay: i * 0.07 })); }
  engine(on) { /* Motorsound wird in vehicles/porsche.js kontinuierlich erzeugt */ }
  victory() { [523, 659, 784, 1046].forEach((f, i) => this._tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.4, delay: i * 0.16 })); }
  defeat() { [400, 330, 260].forEach((f, i) => this._tone({ freq: f, dur: 0.45, type: 'sawtooth', gain: 0.3, delay: i * 0.2 })); }
}

export const sfx = new Sfx();
