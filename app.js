import { DancePadAudio } from "./audio.js";
import {
  CHARTS,
  DancePadGame,
  H,
  LANE_GLYPH,
  LANE_KEYS,
  W,
  hitLineY,
  laneX,
} from "./game.js";

const BEST_KEY = "pg-dancepad-best";
const audio = new DancePadAudio();
const game = new DancePadGame();

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const lifeEl = document.getElementById("life");
const bestEl = document.getElementById("best");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const btnStart = document.getElementById("btn-start");
const btnMute = document.getElementById("btn-mute");
const chartRow = document.getElementById("chart-row");
const padEl = document.getElementById("pad");

canvas.width = W;
canvas.height = H;

let best = loadBest();
let lastTs = 0;

function loadBest() {
  try {
    return Math.max(0, Number(localStorage.getItem(BEST_KEY) || 0));
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* */
  }
}

/** @param {string} msg @param {string} [tone] */
function setStatus(msg, tone = "") {
  statusEl.textContent = msg;
  statusEl.dataset.tone = tone;
}

function renderCharts() {
  chartRow.replaceChildren();
  CHARTS.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (i === game.chartIndex ? " is-active" : "");
    b.textContent = `${c.name} ${c.bpm}`;
    b.addEventListener("click", async () => {
      await audio.unlock();
      audio.click();
      game.selectChart(i);
      renderCharts();
      setStatus(game.message);
    });
    chartRow.appendChild(b);
  });
}

function renderPad() {
  padEl.replaceChildren();
  // layout like dance pad:  empty ↑ empty / ← ↓ →
  const order = [
    { lane: -1 },
    { lane: 2 },
    { lane: -1 },
    { lane: 0 },
    { lane: 1 },
    { lane: 3 },
  ];
  for (const o of order) {
    if (o.lane < 0) {
      const sp = document.createElement("span");
      padEl.appendChild(sp);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pad-btn";
    b.dataset.lane = String(o.lane);
    b.setAttribute("aria-label", LANE_GLYPH[o.lane]);
    b.textContent = LANE_GLYPH[o.lane];
    const fire = async () => {
      await audio.unlock();
      const ev = game.tap(o.lane);
      handleTapEvents(ev);
      syncHud();
    };
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      void fire();
    });
    padEl.appendChild(b);
  }
}

function syncHud() {
  scoreEl.textContent = String(game.score);
  comboEl.textContent = String(game.combo);
  lifeEl.textContent = String(Math.round(game.life));
  bestEl.textContent = String(Math.max(best, game.best, game.score));
  statsEl.textContent = `P ${game.perfect} · G ${game.good} · M ${game.miss} · 最大連擊 ${game.maxCombo}`;
  btnStart.textContent = game.status === "ready" ? "開局" : "重開";
  for (const b of padEl.querySelectorAll(".pad-btn")) {
    const lane = Number(/** @type {HTMLElement} */ (b).dataset.lane);
    b.classList.toggle("is-flash", game.laneFlash[lane]);
  }
}

/** @param {string[]} events */
function handleTapEvents(events) {
  for (const e of events) {
    if (e === "perfect") audio.perfect();
    else if (e === "good") audio.good();
    else if (e === "miss") audio.miss();
    else if (e === "empty") audio.empty();
  }
}

/** @param {string[]} events */
function handleEvents(events) {
  for (const e of events) {
    if (e === "beat") audio.beat();
    else if (e === "miss") audio.miss();
    else if (e === "clear") {
      audio.clear();
      best = Math.max(best, game.score);
      saveBest();
      setStatus(game.message, "ok");
    } else if (e === "fail") {
      audio.fail();
      setStatus(game.message, "bad");
    }
  }
}

btnStart.addEventListener("click", async () => {
  await audio.unlock();
  audio.click();
  game.start(best);
  setStatus(game.message);
  syncHud();
});

btnMute.addEventListener("click", async () => {
  await audio.unlock();
  const on = btnMute.getAttribute("aria-pressed") !== "true";
  btnMute.setAttribute("aria-pressed", on ? "true" : "false");
  btnMute.textContent = on ? "音效" : "靜音";
  audio.setEnabled(on);
  audio.click();
});

window.addEventListener("keydown", (ev) => {
  const lane = LANE_KEYS.indexOf(ev.key);
  if (lane < 0) return;
  ev.preventDefault();
  void (async () => {
    await audio.unlock();
    const events = game.tap(lane);
    handleTapEvents(events);
    syncHud();
  })();
});

function draw() {
  if (!ctx) return;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  ctx.fillStyle = dark ? "#0a0e18" : "#12182a";
  ctx.fillRect(0, 0, W, H);

  // lane guides
  for (let i = 0; i < 4; i++) {
    const x = laneX(i);
    ctx.fillStyle = game.laneFlash[i]
      ? "rgba(56,189,248,0.18)"
      : "rgba(255,255,255,0.04)";
    ctx.fillRect(x - 36, 0, 72, H);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, hitLineY());
    ctx.stroke();
  }

  // hit receptors
  const hy = hitLineY();
  for (let i = 0; i < 4; i++) {
    const x = laneX(i);
    ctx.beginPath();
    roundDiamond(ctx, x, hy, 26);
    ctx.fillStyle = game.laneFlash[i] ? "rgba(125,211,252,0.55)" : "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(LANE_GLYPH[i], x, hy);
  }

  // notes
  const colors = ["#60a5fa", "#f472b6", "#4ade80", "#fbbf24"];
  for (const v of game.visibleNotes()) {
    const x = laneX(v.note.lane);
    ctx.beginPath();
    roundDiamond(ctx, x, v.y, 24);
    ctx.fillStyle = colors[v.note.lane];
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(LANE_GLYPH[v.note.lane], x, v.y);
  }

  // floats
  ctx.textAlign = "center";
  for (const f of game.floats) {
    ctx.globalAlpha = Math.max(0, f.life * 2);
    ctx.fillStyle = f.color;
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(f.text, W / 2, hy - 50 - (0.55 - f.life) * 40);
  }
  ctx.globalAlpha = 1;

  // life bar
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(16, 12, W - 32, 8);
  const lifeColor = game.life > 40 ? "#4ade80" : game.life > 20 ? "#fbbf24" : "#f87171";
  ctx.fillStyle = lifeColor;
  ctx.fillRect(16, 12, ((W - 32) * game.life) / 100, 8);

  if (game.status === "ready") {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("選曲後按開局", W / 2, H / 2);
  } else if (game.status === "clear" || game.status === "fail") {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(game.status === "clear" ? "CLEAR" : "FAILED", W / 2, H / 2 - 10);
    ctx.font = "16px sans-serif";
    ctx.fillText(`${game.score} 分`, W / 2, H / 2 + 22);
  }
}

/**
 * @param {CanvasRenderingContext2D} c
 * @param {number} x
 * @param {number} y
 * @param {number} r
 */
function roundDiamond(c, x, y, r) {
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
}

function frame(ts) {
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
  lastTs = ts;
  const events = game.update(dt);
  handleEvents(events);
  draw();
  syncHud();
  requestAnimationFrame(frame);
}

renderCharts();
renderPad();
bestEl.textContent = String(best);
setStatus(game.message);
syncHud();
draw();
requestAnimationFrame(frame);
