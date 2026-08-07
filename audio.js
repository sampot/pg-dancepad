/** Dance pad SFX — metronome + hit judgments via Web Audio. */

export class DancePadAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.enabled = true;
    this.master = 0.24;
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
  }

  setEnabled(on) {
    this.enabled = on;
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
    this.tone(523, 0.08, "sine", 0.07);
    this.tone(659, 0.08, "sine", 0.07, 0.08);
    this.tone(784, 0.1, "sine", 0.07, 0.16);
    this.tone(1046, 0.2, "triangle", 0.08, 0.24);
  }
  fail() {
    this.tone(330, 0.12, "triangle", 0.06);
    this.tone(220, 0.2, "sine", 0.06, 0.1);
  }
}
