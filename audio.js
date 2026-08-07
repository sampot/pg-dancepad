/**
 * Dance pad SFX + procedural BGM (Web Audio only; original loops, no samples).
 */

/** @param {number} midi */
function midiHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** @type {Record<string, { bass: number[], lead: number[], chord: number[][] }>} */
const THEMES = {
  warm: {
    bass: [36, 36, 43, 41, 36, 36, 43, 38],
    lead: [60, 64, 67, 64, 62, 60, 67, 72],
    chord: [
      [60, 64, 67],
      [60, 64, 67],
      [57, 60, 64],
      [55, 59, 62],
    ],
  },
  pulse: {
    bass: [38, 38, 45, 43, 38, 45, 43, 41],
    lead: [62, 65, 69, 65, 67, 69, 74, 69],
    chord: [
      [62, 65, 69],
      [62, 65, 69],
      [60, 64, 67],
      [58, 62, 65],
    ],
  },
  storm: {
    bass: [33, 33, 40, 38, 33, 40, 36, 31],
    lead: [57, 60, 64, 67, 64, 60, 69, 72],
    chord: [
      [57, 60, 64],
      [57, 60, 64],
      [55, 58, 62],
      [53, 57, 60],
    ],
  },
};

export class DancePadAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.enabled = true;
    this.master = 0.24;
    this.bgmGainLevel = 0.38;

    this.bgmPlaying = false;
    this.bpm = 120;
    this.themeId = "warm";
    this.bgmStart = 0;
    this.nextStep = 0;
    this.endStep = 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.bgmTimer = null;
    /** @type {GainNode | null} */
    this.bgmBus = null;
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && !this.bgmBus) {
      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = this.bgmGainLevel * this.master;
      this.bgmBus.connect(this.ctx.destination);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stopBgm();
    else if (this.bgmBus) this.bgmBus.gain.value = this.bgmGainLevel * this.master;
  }

  /**
   * @param {number} bpm
   * @param {string} themeId
   * @param {number} durationSec
   */
  startBgm(bpm, themeId, durationSec) {
    this.stopBgm();
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx || !this.bgmBus) return;

    this.bpm = bpm;
    this.themeId = THEMES[themeId] ? themeId : "warm";
    this.bgmPlaying = true;
    this.bgmStart = ctx.currentTime + 0.08;
    this.nextStep = 0;
    // 16th-note steps for denser groove
    const stepDur = 60 / bpm / 4;
    this.endStep = Math.ceil(durationSec / stepDur) + 8;
    this.bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    this.bgmBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bgmBus.gain.exponentialRampToValueAtTime(this.bgmGainLevel * this.master, ctx.currentTime + 0.2);
    this.scheduleBgm();
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this.bgmTimer != null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    const ctx = this.ctx;
    if (ctx && this.bgmBus) {
      const g = this.bgmBus.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime);
      g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    }
  }

  scheduleBgm() {
    if (!this.bgmPlaying || !this.enabled) return;
    const ctx = this.ctx;
    if (!ctx) return;

    const stepDur = 60 / this.bpm / 4;
    const horizon = ctx.currentTime + 0.28;
    while (this.bgmStart + this.nextStep * stepDur < horizon) {
      if (this.nextStep > this.endStep) {
        this.stopBgm();
        return;
      }
      const t = this.bgmStart + this.nextStep * stepDur;
      this.voiceStep(this.nextStep, t);
      this.nextStep += 1;
    }
    this.bgmTimer = setTimeout(() => this.scheduleBgm(), 40);
  }

  /**
   * @param {number} step
   * @param {number} t
   */
  voiceStep(step, t) {
    const theme = THEMES[this.themeId] || THEMES.warm;
    const beat = Math.floor(step / 4);
    const sub = step % 4;
    const barBeat = beat % 8;

    // kick on beats
    if (sub === 0) this.kick(t, barBeat % 4 === 0 ? 0.09 : 0.06);
    // snare / clap on 2 & 4
    if (sub === 0 && barBeat % 2 === 1) this.snare(t);
    // hat every 8th
    if (sub === 0 || sub === 2) this.hat(t, sub === 0 ? 0.03 : 0.02);

    // bass on quarters
    if (sub === 0) {
      const note = theme.bass[barBeat % theme.bass.length];
      this.bass(midiHz(note), t, 60 / this.bpm * 0.85);
    }

    // chord pad on bar starts (every 2 beats)
    if (sub === 0 && barBeat % 2 === 0) {
      const ch = theme.chord[(barBeat / 2) % theme.chord.length];
      for (const n of ch) this.pad(midiHz(n), t, (60 / this.bpm) * 1.8);
    }

    // lead arp on 8ths
    if (sub === 0 || sub === 2) {
      const idx = Math.floor(step / 2) % theme.lead.length;
      this.lead(midiHz(theme.lead[idx]), t, 60 / this.bpm / 2 * 0.7);
    }
  }

  /**
   * @param {number} t
   * @param {number} gain
   */
  kick(t, gain) {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** @param {number} t */
  snare(t) {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.08));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + 0.09);
  }

  /**
   * @param {number} t
   * @param {number} gain
   */
  hat(t, gain) {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.04));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + 0.05);
  }

  /**
   * @param {number} freq
   * @param {number} t
   * @param {number} dur
   */
  bass(freq, t, dur) {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * @param {number} freq
   * @param {number} t
   * @param {number} dur
   */
  pad(freq, t, dur) {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * @param {number} freq
   * @param {number} t
   * @param {number} dur
   */
  lead(freq, t, dur) {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * @param {number} freq
   * @param {number} dur
   * @param {OscillatorType} [type]
   * @param {number} [gain]
   * @param {number} [when]
   * @param {number} [slide]
   */
  tone(freq, dur, type = "square", gain = 0.1, when = 0, slide = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.03, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  click() {
    this.tone(500, 0.04, "triangle", 0.05);
  }
  beat() {
    // BGM already carries the pulse; keep a faint click only if BGM off
    if (this.bgmPlaying) return;
    this.tone(180, 0.04, "triangle", 0.04);
  }
  perfect() {
    this.tone(880, 0.05, "sine", 0.07);
    this.tone(1320, 0.08, "triangle", 0.05, 0.04);
  }
  good() {
    this.tone(660, 0.06, "sine", 0.06);
  }
  miss() {
    this.tone(160, 0.1, "sawtooth", 0.04, 0, -40);
  }
  empty() {
    this.tone(300, 0.03, "square", 0.03);
  }
  clear() {
    this.stopBgm();
    this.tone(523, 0.08, "sine", 0.07);
    this.tone(659, 0.08, "sine", 0.07, 0.08);
    this.tone(784, 0.1, "sine", 0.07, 0.16);
    this.tone(1046, 0.2, "triangle", 0.08, 0.24);
  }
  fail() {
    this.stopBgm();
    this.tone(330, 0.12, "triangle", 0.06);
    this.tone(220, 0.2, "sine", 0.06, 0.1);
  }
}
