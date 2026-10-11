// Tiny WebAudio synth: all sound effects and the music-box loop are generated in code.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.musicBus.connect(this.master);
    // shared noise buffer
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005, bus } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, { vol = 0.3, freq = 1200, q = 1, type = 'bandpass', slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump': this.tone(320, 0.18, { type: 'triangle', slide: 2.2, vol: 0.18 }); break;
      case 'jump2': this.tone(480, 0.2, { type: 'triangle', slide: 2.0, vol: 0.16 }); this.noiseBurst(0.15, { freq: 3000, vol: 0.05 }); break;
      case 'land': this.noiseBurst(0.12, { freq: 260, vol: 0.25, type: 'lowpass' }); break;
      case 'dash': this.noiseBurst(0.28, { freq: 900, slide: 4, vol: 0.22, q: 0.8 }); break;
      case 'pound': this.tone(110, 0.35, { type: 'sine', slide: 0.4, vol: 0.5 }); this.noiseBurst(0.3, { freq: 300, vol: 0.4, type: 'lowpass' }); break;
      case 'poundStart': this.tone(700, 0.18, { type: 'square', slide: 0.5, vol: 0.06 }); break;
      case 'hammer': this.tone(1250, 0.25, { type: 'square', slide: 0.97, vol: 0.08 }); this.tone(1870, 0.3, { type: 'sine', vol: 0.12 }); this.noiseBurst(0.08, { freq: 2500, vol: 0.25 }); break;
      case 'whoosh': this.noiseBurst(0.22, { freq: 1500, slide: 0.5, vol: 0.18 }); break;
      case 'nailThrow': this.noiseBurst(0.18, { freq: 2600, slide: 0.6, vol: 0.12 }); this.tone(900, 0.12, { type: 'triangle', slide: 1.5, vol: 0.06 }); break;
      case 'nailHit': this.tone(220, 0.15, { type: 'square', slide: 0.6, vol: 0.12 }); this.noiseBurst(0.1, { freq: 900, vol: 0.3 }); break;
      case 'nailBounce': this.tone(2400, 0.12, { type: 'triangle', vol: 0.08 }); break;
      case 'recall': this.tone(500, 0.3, { type: 'sine', slide: 2.5, vol: 0.12 }); break;
      case 'collect': [0, 0.07, 0.14].forEach((d, i) => this.tone([1046, 1318, 1568][i], 0.35, { type: 'sine', vol: 0.14, delay: d })); break;
      case 'switch': this.tone(660, 0.1, { type: 'triangle', vol: 0.14 }); this.tone(990, 0.12, { type: 'triangle', vol: 0.12, delay: 0.07 }); break;
      case 'click': this.tone(180, 0.08, { type: 'square', vol: 0.1 }); this.noiseBurst(0.05, { freq: 1800, vol: 0.2 }); break;
      case 'rumble': this.noiseBurst(0.9, { freq: 120, vol: 0.35, type: 'lowpass' }); break;
      case 'lever': this.tone(260, 0.12, { type: 'square', vol: 0.1 }); this.tone(190, 0.18, { type: 'square', vol: 0.1, delay: 0.1 }); break;
      case 'launch': this.tone(200, 0.5, { type: 'sawtooth', slide: 4, vol: 0.12 }); this.noiseBurst(0.4, { freq: 600, slide: 3, vol: 0.2 }); break;
      case 'grab': this.tone(520, 0.1, { type: 'square', vol: 0.08 }); this.noiseBurst(0.06, { freq: 3000, vol: 0.2 }); break;
      case 'hurt': this.tone(300, 0.3, { type: 'sawtooth', slide: 0.5, vol: 0.14 }); break;
      case 'poof': this.noiseBurst(0.35, { freq: 1400, slide: 0.3, vol: 0.3 }); this.tone(880, 0.2, { type: 'sine', slide: 0.5, vol: 0.1 }); break;
      case 'checkpoint': [0, 0.1, 0.2, 0.3].forEach((d, i) => this.tone([784, 988, 1175, 1568][i], 0.4, { type: 'triangle', vol: 0.1, delay: d })); break;
      case 'respawn': this.tone(300, 0.5, { type: 'sine', slide: 3, vol: 0.12 }); break;
      case 'break': this.noiseBurst(0.4, { freq: 700, vol: 0.4 }); this.tone(150, 0.25, { type: 'square', slide: 0.5, vol: 0.1 }); break;
      case 'bounce': this.tone(260, 0.25, { type: 'sine', slide: 2.5, vol: 0.2 }); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.14, delay: i * 0.13 })); break;
      default: break;
    }
  }

  // A gentle 3/4 music-box waltz, scheduled ahead of time.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, C3: 131, F3: 175, G3: 196, A3: 220, E3: 165, D3: 147 };
    const melody = [
      'E5', '-', 'G5', 'C5', '-', 'E5', 'D5', 'C5', 'D5', 'G4', '-', '-',
      'F5', '-', 'A5', 'D5', '-', 'F5', 'E5', 'D5', 'C5', 'B4', '-', 'G4',
      'E5', '-', 'G5', 'C5', '-', 'E5', 'A4', 'B4', 'C5', 'F5', 'E5', 'D5',
      'C5', 'G4', 'E4', 'D4', 'E4', 'G4', 'C5', '-', '-', '-', '-', '-',
    ];
    const bass = ['C3', 'G3', 'G3', 'A3', 'E3', 'E3', 'F3', 'C3', 'C3', 'G3', 'D3', 'D3',
      'D3', 'A3', 'A3', 'G3', 'D3', 'D3', 'C3', 'G3', 'G3', 'G3', 'D3', 'D3',
      'C3', 'G3', 'G3', 'A3', 'E3', 'E3', 'F3', 'C3', 'C3', 'G3', 'D3', 'D3',
      'C3', 'G3', 'G3', 'G3', 'D3', 'D3', 'C3', 'G3', 'G3', 'C3', '-', '-'];
    const step = 0.24;
    let i = 0;
    let next = this.ctx.currentTime + 0.3;
    const tick = () => {
      if (!this.musicOn) return;
      while (next < this.ctx.currentTime + 0.6) {
        const m = melody[i % melody.length];
        const b = bass[i % bass.length];
        const delay = next - this.ctx.currentTime;
        if (m !== '-') {
          this.tone(N[m], 0.9, { type: 'sine', vol: 0.2, delay, bus: this.musicBus });
          this.tone(N[m] * 2, 0.4, { type: 'triangle', vol: 0.04, delay, bus: this.musicBus });
        }
        if (b !== '-' && i % 3 === 0) this.tone(N[b], 0.7, { type: 'triangle', vol: 0.16, delay, bus: this.musicBus });
        else if (b !== '-') this.tone(N[b] * 2, 0.3, { type: 'sine', vol: 0.06, delay, bus: this.musicBus });
        next += step;
        i++;
      }
      setTimeout(tick, 120);
    };
    tick();
  }
}
