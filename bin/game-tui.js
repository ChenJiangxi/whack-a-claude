#!/usr/bin/env node
const blessed = require('blessed');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUND_SEC = 60;
// Difficulty ramps from "easy" → "hard" linearly across the round.
const SPAWN_EASY_MIN = 1100, SPAWN_EASY_MAX = 1900;
const SPAWN_HARD_MIN = 280,  SPAWN_HARD_MAX = 700;
const UP_EASY_MIN = 1700,    UP_EASY_MAX = 2400;
const UP_HARD_MIN = 700,     UP_HARD_MAX = 1300;
const HIT_FLASH_MS = 220;
const POP_TTL = 700;
const TICK_MS = 60;

const SCORES = { mole: 10, gold: 30, claude: -50 };
const WEIGHTS = { mole: 65, gold: 10, claude: 25 };

const C = {
  grass:   '#2d5016',
  grassDk: '#1a3008',
  panel:   '#2d1b4e',
  gold:    '#ffd54a',
  coral:   '#d97757',
  brown:   '#8a5a35',
  white:   '#f5f0ff',
  red:     '#ff5050',
  dim:     '#888',
  dirt:    '#7a5230',
  dirtDk:  '#3d2810'
};

const KEYS = [
  ['q', 'w', 'e'],
  ['a', 's', 'd'],
  ['z', 'x', 'c']
];

// All sprites are 11 chars wide × 4 rows tall so cells stay perfectly aligned.
const SPRITES = {
  mole: {
    color: C.brown,
    art: [
      '  ▄▀▀▀▀▀▄  ',
      '  █ o o █  ',
      '  █  ▽  █  ',
      '   ▀▀▀▀▀   '
    ]
  },
  gold: {
    color: C.gold,
    art: [
      '  ▄★▀▀▀★▄  ',
      '  █ ◉ ◉ █  ',
      '  █  ▽  █  ',
      '   ▀▀▀▀▀   '
    ]
  },
  claude: {
    color: C.coral,
    art: [
      '  ▟▀▀▀▀▀▙  ',
      '  █ c c █  ',
      '  ╲  ω  ╱  ',
      '   ▀▀▀▀▀   '
    ]
  }
};

// Just-emerging frame — eyes peek out at the bottom row above the dirt.
const RISING_ART = [
  '           ',
  '           ',
  '           ',
  '   ▄o o▄   '
];

// Squish frame after a successful hit.
const HIT_ART = [
  '           ',
  '   ▄▄▄▄▄   ',
  '  █ x x █  ',
  '   ▀▀▀▀▀   '
];

// Always-rendered dirt mound at the bottom of every cell.
const HOLE_ART = ' ▓▓▓▓▓▓▓▓▓ ';

const tag = (col, txt) => `{${col}-fg}${txt}{/}`;

const BEST_PATH = path.join(os.homedir(), '.local/share/whack-a-claude/best');
function loadBest() {
  try { return parseInt(fs.readFileSync(BEST_PATH, 'utf8'), 10) || 0; }
  catch { return 0; }
}
function saveBest(v) {
  try {
    fs.mkdirSync(path.dirname(BEST_PATH), { recursive: true });
    fs.writeFileSync(BEST_PATH, String(v));
  } catch {}
}

const cells = Array(9).fill(null).map(() => ({
  type: null,
  spawnedAt: 0,
  expiresAt: 0,
  hitAt: 0,
  poppedAt: 0,
  popText: '',
  popColor: ''
}));
let score = 0;
let best = loadBest();
let endsAt = Date.now() + ROUND_SEC * 1000;
let lastSpawnAt = 0;
let nextSpawnIn = SPAWN_EASY_MAX;
let gameOver = false;

function pickType() {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if ((r -= w) <= 0) return k;
  }
  return 'mole';
}

const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;

// 0 at start of round, 1 at end. Used to interpolate spawn / up-time ranges.
function progress(now) {
  const elapsed = ROUND_SEC - Math.max(0, (endsAt - now) / 1000);
  return Math.max(0, Math.min(1, elapsed / ROUND_SEC));
}

function difficulty(now) {
  const p = progress(now);
  return {
    spawnMin: lerp(SPAWN_EASY_MIN, SPAWN_HARD_MIN, p),
    spawnMax: lerp(SPAWN_EASY_MAX, SPAWN_HARD_MAX, p),
    upMin:    lerp(UP_EASY_MIN,    UP_HARD_MIN,    p),
    upMax:    lerp(UP_EASY_MAX,    UP_HARD_MAX,    p),
  };
}

function trySpawn(now) {
  if (gameOver) return;
  if (now - lastSpawnAt < nextSpawnIn) return;
  const empties = [];
  for (let i = 0; i < 9; i++) if (!cells[i].type) empties.push(i);
  if (empties.length === 0) return;
  const i = empties[Math.floor(Math.random() * empties.length)];
  const t = pickType();
  const d = difficulty(now);
  cells[i].type = t;
  cells[i].spawnedAt = now;
  cells[i].expiresAt = now + rand(d.upMin, d.upMax);
  cells[i].hitAt = 0;
  lastSpawnAt = now;
  nextSpawnIn = rand(d.spawnMin, d.spawnMax);
}

function expire(now) {
  for (let i = 0; i < 9; i++) {
    const c = cells[i];
    if (c.type && c.hitAt && now - c.hitAt > HIT_FLASH_MS) {
      c.type = null; c.hitAt = 0;
    } else if (c.type && !c.hitAt && now > c.expiresAt) {
      c.type = null;
    }
    if (c.poppedAt && now - c.poppedAt > POP_TTL) {
      c.poppedAt = 0; c.popText = '';
    }
  }
}

function whack(idx) {
  if (gameOver) return;
  const c = cells[idx];
  const now = Date.now();
  if (!c.type || c.hitAt) {
    c.poppedAt = now;
    c.popText = 'miss';
    c.popColor = C.dim;
    return;
  }
  const pts = SCORES[c.type];
  score += pts;
  c.hitAt = now;
  const sign = pts >= 0 ? '+' : '';
  c.poppedAt = now;
  c.popText = `${sign}${pts}`;
  c.popColor = pts >= 0 ? C.gold : C.red;
  if (score > best) best = score;
}

function spriteFor(c, now) {
  if (!c.type) return null;
  if (c.hitAt) {
    const flashAge = now - c.hitAt;
    if (flashAge < 90) return { art: HIT_ART, color: C.white };
    return { art: HIT_ART, color: SPRITES[c.type].color };
  }
  const age = now - c.spawnedAt;
  if (age < 160) return { art: RISING_ART, color: SPRITES[c.type].color };
  return { art: SPRITES[c.type].art, color: SPRITES[c.type].color };
}

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  mouse: true,
  title: 'whack-a-claude'
});

const root = blessed.box({
  parent: screen,
  top: 0, left: 0, right: 0, bottom: 0,
  tags: true,
  style: { bg: C.grassDk }
});

const title = blessed.text({
  parent: root, top: 0, left: 'center', height: 1,
  content: '', tags: true,
  style: { bg: C.grassDk }
});

const hud = blessed.text({
  parent: root, top: 1, left: 'center', height: 1,
  content: '', tags: true,
  style: { bg: C.grassDk }
});

const legend = blessed.text({
  parent: root, bottom: 1, left: 'center', height: 1,
  content: '', tags: true,
  style: { bg: C.grassDk }
});

const hint = blessed.text({
  parent: root, bottom: 0, left: 'center', height: 1,
  content: '', tags: true,
  style: { fg: C.dim, bg: C.grassDk }
});

const gameArea = blessed.box({
  parent: root, top: 3, bottom: 2, left: 1, right: 1,
  style: { bg: C.grass }
});

const cellBoxes = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const i = r * 3 + c;
    const key = KEYS[r][c].toUpperCase();
    const box = blessed.box({
      parent: gameArea,
      top:    `${Math.floor((r * 100) / 3)}%`,
      left:   `${Math.floor((c * 100) / 3)}%`,
      width:  '33%',
      height: '33%',
      border: 'line',
      tags: true,
      align: 'center',
      valign: 'middle',
      label: ` ${key} `,
      content: '',
      mouse: true,
      style: {
        bg: C.grass,
        border: { fg: C.dirt },
        label: { fg: C.gold, bold: true, bg: C.grass }
      }
    });
    box.on('click', () => { whack(i); render(); });
    cellBoxes.push(box);
  }
}

const overlay = blessed.box({
  parent: screen,
  top: 'center', left: 'center',
  width: 44, height: 11,
  border: 'line', tags: true, hidden: true,
  align: 'center', valign: 'middle',
  style: { bg: '#000', border: { fg: C.gold }, fg: C.white }
});

function renderTitle() {
  title.setContent(`${tag(C.gold, '◆')} ${tag(C.gold, 'WHACK-A-CLAUDE')} ${tag(C.gold, '◆')}`);
}

function renderHud() {
  const t = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const seg = (label, val) => `${tag(C.dim, label)} ${tag(C.gold, val)}`;
  hud.setContent(
    `${seg('SCORE', score)}    ${seg('TIME', t + 's')}    ${seg('BEST', best)}`
  );
}

function renderLegend() {
  legend.setContent(
    `${tag(C.brown, '▮')} mole +10   ${tag(C.gold, '▮')} gold +30   ${tag(C.coral, '▮')} claude -50`
  );
}

function renderHint() {
  hint.setContent('keys QWE/ASD/ZXC · click cells · R replay · Esc quit');
}

function renderCells() {
  const now = Date.now();
  for (let i = 0; i < 9; i++) {
    const c = cells[i];
    const sprite = spriteFor(c, now);
    const bodyLines = [];
    // Sprite area: always 4 lines (blank when empty so cell layout is stable).
    if (sprite) {
      for (const line of sprite.art) bodyLines.push(tag(sprite.color, line));
    } else {
      for (let k = 0; k < 4; k++) bodyLines.push(' '.repeat(11));
    }
    // Dirt mound — always present at the bottom, anchors the visual.
    bodyLines.push(tag(C.dirt, HOLE_ART));
    // Score popup floats above the sprite for POP_TTL ms.
    if (c.poppedAt && c.popText) {
      const t = (now - c.poppedAt) / POP_TTL;
      if (t < 0.85) {
        bodyLines.unshift(tag(c.popColor, c.popText));
      }
    }
    cellBoxes[i].setContent(bodyLines.join('\n'));
  }
}

function renderOverlay() {
  if (!gameOver) { overlay.hide(); return; }
  overlay.show();
  overlay.setFront();
  const newBest = score >= best && score > 0
    ? `\n${tag(C.gold, '★ NEW BEST! ★')}\n`
    : '\n';
  overlay.setContent(
    `\n${tag(C.gold, "TIME'S UP")}\n\n` +
    `Final score: ${tag(C.gold, score)}\n` +
    `Best: ${tag(C.dim, best)}` +
    newBest +
    `\n${tag(C.dim, 'press R to replay  ·  Esc to quit')}`
  );
}

function render() {
  renderTitle();
  renderHud();
  renderLegend();
  renderHint();
  renderCells();
  renderOverlay();
  screen.render();
}

function tick() {
  const now = Date.now();
  if (!gameOver && now >= endsAt) {
    gameOver = true;
    saveBest(best);
  }
  expire(now);
  trySpawn(now);
  render();
}

function reset() {
  for (const c of cells) {
    c.type = null; c.spawnedAt = 0; c.expiresAt = 0;
    c.hitAt = 0; c.poppedAt = 0; c.popText = ''; c.popColor = '';
  }
  score = 0;
  endsAt = Date.now() + ROUND_SEC * 1000;
  lastSpawnAt = 0;
  nextSpawnIn = SPAWN_EASY_MAX;
  gameOver = false;
}

screen.key(['C-c', 'escape'], () => {
  saveBest(best);
  screen.destroy();
  process.exit(0);
});
screen.key(['r'], () => { if (gameOver) reset(); });

const KEY_MAP = {
  q: 0, w: 1, e: 2,
  a: 3, s: 4, d: 5,
  z: 6, x: 7, c: 8
};
for (const [k, i] of Object.entries(KEY_MAP)) {
  screen.key([k], () => { whack(i); render(); });
}

setInterval(tick, TICK_MS);
render();
