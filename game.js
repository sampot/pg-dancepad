/**
 * Lightweight dance-pad rhythm — 4 lanes, approach notes, judgment.
 * Genre homage (not a commercial DDR clone); charts + tones are original.
 */

export const W = 360;
export const H = 560;
/** @type {const} */
export const LANES = ["left", "down", "up", "right"];
/** @type {const} */
export const LANE_KEYS = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
export const LANE_GLYPH = ["←", "↓", "↑", "→"];

/**
 * @typedef {{ t: number, lane: number, hit?: boolean, judged?: boolean }} Note
 * @typedef {{ id: string, name: string, bpm: number, notes: Note[] }} Chart
 */

/** Approach time before hit (seconds). */
const APPROACH = 1.35;
const PERFECT = 0.045;
const GOOD = 0.11;
const MISS_LATE = 0.14;

/**
 * @param {number} bpm
 * @param {(beat: number) => { lane: number }[]} pattern
 * @param {number} bars
 */
function buildChart(bpm, pattern, bars) {
  /** @type {Note[]} */
  const notes = [];
  const spb = 60 / bpm;
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      const absBeat = bar * 4 + beat;
      const t = 1.2 + absBeat * spb;
      for (const p of pattern(absBeat)) {
        notes.push({ t, lane: p.lane });
      }
    }
  }
  return notes;
}

/** @type {Chart[]} */
export const CHARTS = [
  {
    id: "warm",
    name: "熱身拍",
    bpm: 100,
    notes: buildChart(
      100,
      (b) => {
        if (b % 2 === 0) return [{ lane: b % 4 }];
        return [];
      },
      12,
    ),
  },
  {
    id: "pulse",
    name: "脈衝步",
    bpm: 120,
    notes: buildChart(
      120,
      (b) => {
        const out = [{ lane: b % 4 }];
        if (b % 4 === 2) out.push({ lane: (b + 2) % 4 });
        return out;
      },
      14,
    ),
  },
  {
    id: "storm",
    name: "風暴踏",
    bpm: 140,
    notes: buildChart(
      140,
      (b) => {
        if (b % 8 === 7) return [{ lane: 0 }, { lane: 3 }];
        if (b % 3 === 0) return [{ lane: (b * 2) % 4 }, { lane: (b * 2 + 1) % 4 }];
        return [{ lane: (b * 3) % 4 }];
      },
      16,
    ),
  },
];

export class DancePadGame {
  constructor() {
    /** @type {'ready'|'playing'|'clear'|'fail'} */
    this.status = "ready";
    this.chartIndex = 0;
    this.message = "選曲後開局";
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfect = 0;
    this.good = 0;
    this.miss = 0;
    this.life = 100;
    this.best = 0;
    this.time = 0;
    /** @type {Note[]} */
    this.notes = [];
    this.bpm = 100;
    this.songEnd = 0;
    /** @type {{ text: string, color: string, life: number }[]} */
    this.floats = [];
    /** @type {boolean[]} */
    this.laneFlash = [false, false, false, false];
    this.flashT = [0, 0, 0, 0];
  }

  chart() {
    return CHARTS[this.chartIndex];
  }

  /** @param {number} i */
  selectChart(i) {
    this.chartIndex = Math.max(0, Math.min(CHARTS.length - 1, i));
    if (this.status === "ready") this.message = `${this.chart().name} · ${this.chart().bpm} BPM`;
  }

  /** @param {number} [best] */
  start(best = 0) {
    const c = this.chart();
    this.best = best;
    this.status = "playing";
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.perfect = 0;
    this.good = 0;
    this.miss = 0;
    this.life = 100;
    this.time = 0;
    this.bpm = c.bpm;
    this.notes = c.notes.map((n) => ({ ...n, hit: false, judged: false }));
    this.songEnd = (this.notes.length ? this.notes[this.notes.length - 1].t : 4) + 2;
    this.floats = [];
    this.message = "跟著節拍踩鍵！";
  }

  /**
   * @param {number} lane
   * @returns {string[]}
   */
  tap(lane) {
    /** @type {string[]} */
    const events = [];
    if (this.status !== "playing") return events;
    if (lane < 0 || lane > 3) return events;
    this.laneFlash[lane] = true;
    this.flashT[lane] = 0.12;

    let best = /** @type {Note | null} */ (null);
    let bestAbs = 999;
    for (const n of this.notes) {
      if (n.judged || n.lane !== lane) continue;
      const d = n.t - this.time;
      const a = Math.abs(d);
      if (a < bestAbs && d > -MISS_LATE && d < GOOD + 0.05) {
        bestAbs = a;
        best = n;
      }
    }
    if (!best) {
      events.push("empty");
      return events;
    }
    const err = Math.abs(best.t - this.time);
    best.judged = true;
    best.hit = true;
    if (err <= PERFECT) {
      this.perfect += 1;
      this.combo += 1;
      this.score += 300 + Math.min(50, this.combo) * 2;
      this.life = Math.min(100, this.life + 1.5);
      this.pushFloat("PERFECT", "#fbbf24");
      events.push("perfect");
    } else if (err <= GOOD) {
      this.good += 1;
      this.combo += 1;
      this.score += 150 + Math.min(30, this.combo);
      this.life = Math.min(100, this.life + 0.5);
      this.pushFloat("GOOD", "#4ade80");
      events.push("good");
    } else {
      this.registerMiss();
      events.push("miss");
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.best = Math.max(this.best, this.score);
    return events;
  }

  registerMiss() {
    this.miss += 1;
    this.combo = 0;
    this.life = Math.max(0, this.life - 8);
    this.pushFloat("MISS", "#f87171");
    if (this.life <= 0) {
      this.status = "fail";
      this.message = "體力耗盡";
    }
  }

  /**
   * @param {string} text
   * @param {string} color
   */
  pushFloat(text, color) {
    this.floats.push({ text, color, life: 0.55 });
  }

  /**
   * Visible notes with screen Y.
   * @returns {{ note: Note, y: number, progress: number }[]}
   */
  visibleNotes() {
    /** @type {{ note: Note, y: number, progress: number }[]} */
    const out = [];
    const hitY = hitLineY();
    const spawnY = -40;
    for (const n of this.notes) {
      if (n.judged) continue;
      const progress = 1 - (n.t - this.time) / APPROACH;
      if (progress < -0.05 || progress > 1.2) continue;
      const y = spawnY + (hitY - spawnY) * progress;
      out.push({ note: n, y, progress });
    }
    return out;
  }

  /**
   * @param {number} dt
   * @returns {string[]}
   */
  update(dt) {
    /** @type {string[]} */
    const events = [];
    for (let i = 0; i < 4; i++) {
      if (this.flashT[i] > 0) {
        this.flashT[i] -= dt;
        if (this.flashT[i] <= 0) this.laneFlash[i] = false;
      }
    }
    for (const f of this.floats) f.life -= dt;
    this.floats = this.floats.filter((f) => f.life > 0);

    if (this.status !== "playing") return events;

    this.time += dt;

    // auto-miss late notes
    for (const n of this.notes) {
      if (n.judged) continue;
      if (this.time - n.t > MISS_LATE) {
        n.judged = true;
        n.hit = false;
        this.registerMiss();
        events.push("miss");
        if (this.status !== "playing") break;
      }
    }

    // metronome pulse event each beat
    const spb = 60 / this.bpm;
    const beat = Math.floor(this.time / spb);
    const prev = Math.floor((this.time - dt) / spb);
    if (beat !== prev && this.time > 0.2 && this.time < this.songEnd) events.push("beat");

    if (this.status === "playing" && this.time >= this.songEnd) {
      this.status = "clear";
      this.message = `過關！${this.score} 分`;
      this.best = Math.max(this.best, this.score);
      events.push("clear");
    }
    if (this.status === "fail") events.push("fail");
    return events;
  }
}

export function hitLineY() {
  return H - 168;
}

export function laneX(lane) {
  const pad = 28;
  const usable = W - pad * 2;
  return pad + (usable / 4) * (lane + 0.5);
}
