#!/usr/bin/env node
const blessed = require('blessed');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUND_SEC = 60;
const SPAWN_MIN = 500, SPAWN_MAX = 1100;
const UP_MIN = 900, UP_MAX = 1700;
const HIT_FLASH_MS = 220;
const POP_TTL = 700;
const TICK_MS = 60;

const SCORES = { mole: 10, gold: 30, claude: -50 };
const WEIGHTS = { mole: 65, gold: 10, claude: 25 };

const C = {
  panel:  '#2d1b4e',
  dirt:   '#5a3a1f',
  dirtDk: '#2d1c0a',
  grass:  '#2d5016',
  grassDk:'#1a3008',
  gold:   '#ffd54a',
  coral:  '#d97757',
  brown:  '#8a5a35',
  white:  '#f5f0ff',
  red:    '#ff5050',
  dim:    '#888'
};

const SPRITES = {
  mole: {
    color: C.brown,
    art: [
      ' ▟▀▀▀▀▀▙ ',
      ' █ o.o █ ',
      '  ▀▀∪▀▀  '
    ]
  },
  gold: {
    color: C.gold,
    art: [
      ' ▟▀★▀★▀▙ ',
      ' █ o.o █ ',
      '  ▀▀∪▀▀  '
    ]
  },
  claude: {
    color: C.coral,
    art: [
      ' ▟█▀▀▀█▙ ',
      ' █·o.o·█ ',
      '  ▀▀∪▀▀  '
    ]
  }
};

const HIT_ART = [
  '  ▄▄▄▄▄  ',
  ' █ x.x █ ',
  '         '
];

const RISING_ART = [
  '         ',
  '         ',
  ' ▄▀o.o▀▄ '
];

const EMPTY_ART = [
  '         ',
  '         ',
  '         '
];

const DIRT_LINE = '▟▓▓▓▓▓▓▓▙';
const DIRT_RIM  = ' ▔▔▔▔▔▔▔ ';

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
  type: null,       // 'mole' | 'gold' | 'claude' | null
  spawnedAt: 0,
  expiresAt: 0,
  hitAt: 0,
}));
let score = 0;
let best = loadBest();
let endsAt = Date.now() + ROUND_SEC * 1000;
let lastSpawnAt = 0;
let nextSpawnIn = SPAWN_MIN;
let pops = [];
let gameOver = false;
let gameOverAt = 0;

function pickType() {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if ((r -= w) <= 0) return k;
  }
  return 'mole';
}

function rand(min, max) { return min + Math.random() * (max - min); }

function trySpawn(now) {
  if (gameOver) return;
  if (now - lastSpawnAt < nextSpawnIn) return;
  const empties = [];
  for (let i = 0; i < 9; i++) if (!cells[i].type) empties.push(i);
  if (empties.length === 0) return;
  const i = empties[Math.floor(Math.random() * empties.length)];
  const t = pickType();
  cells[i].type = t;
  cells[i].spawnedAt = now;
  cells[i].expiresAt = now + rand(UP_MIN, UP_MAX);
  cells[i].hitAt = 0;
  lastSpawnAt = now;
  nextSpawnIn = rand(SPAWN_MIN, SPAWN_MAX);
}

function expire(now) {
  for (let i = 0; i < 9; i++) {
    const c = cells[i];
    if (!c.type) continue;
    if (c.hitAt && now - c.hitAt > HIT_FLASH_MS) {
      c.type = null; c.hitAt = 0;
    } else if (!c.hitAt && now > c.expiresAt) {
      c.type = null;
    }
  }
  pops = pops.filter(p => now - p.bornAt < POP_TTL);
}

function whack(idx) {
  if (gameOver) return;
  const c = cells[idx];
  const now = Date.now();
  if (!c.type || c.hitAt) {
    pops.push({ cell: idx, text: 'miss', color: C.dim, bornAt: now });
    return;
  }
  const pts = SCORES[c.type];
  score += pts;
  c.hitAt = now;
  const sign = pts >= 0 ? '+' : '';
  pops.push({
    cell: idx,
    text: `${sign}${pts}`,
    color: pts >= 0 ? C.gold : C.red,
    bornAt: now,
  });
  if (score > best) best = score;
}

function spriteFor(c, now) {
  if (!c.type) return { art: EMPTY_ART, color: C.dim };
  if (c.hitAt) {
    const flashAge = now - c.hitAt;
    if (flashAge < 90) return { art: HIT_ART, color: C.white };
    return { art: HIT_ART, color: SPRITES[c.type].color };
  }
  const age = now - c.spawnedAt;
  if (age < 140) return { art: RISING_ART, color: SPRITES[c.type].color };
  return { art: SPRITES[c.type].art, color: SPRITES[c.type].color };
}

const screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'whack-a-claude' });

const root = blessed.box({
  top: 'center', left: 'center',
  width: 64, height: 26,
  border: 'line',
  style: { border: { fg: C.gold }, bg: C.panel },
  tags: true
});
screen.append(root);

const title = blessed.text({
  parent: root, top: 0, left: 'center', height: 1, width: 28,
  content: '', tags: true,
  style: { bg: C.panel }
});

const hud = blessed.box({
  parent: root, top: 2, left: 2, right: 2, height: 3,
  tags: true,
  style: { bg: C.panel }
});

const field = blessed.box({
  parent: root, top: 6, left: 2, right: 2, height: 14,
  tags: true,
  style: { bg: C.grass, fg: C.white },
});

const legend = blessed.text({
  parent: root, top: 21, left: 'center', height: 1, width: 50,
  content: '', tags: true,
  style: { bg: C.panel }
});

const hint = blessed.text({
  parent: root, top: 23, left: 'center', height: 1, width: 50,
  content: '', tags: true,
  style: { bg: C.panel, fg: C.dim }
});

const overlay = blessed.box({
  parent: root, top: 'center', left: 'center',
  width: 36, height: 9,
  border: 'line',
  hidden: true, tags: true,
  style: { border: { fg: C.gold }, bg: '#000', fg: C.white }
});

function renderTitle() {
  title.setContent(
    `${tag(C.gold, '▌')}${tag(C.coral, '▐')} ${tag(C.gold, 'WHACK-A-CLAUDE')} ${tag(C.coral, '▌')}${tag(C.gold, '▐')}`
  );
}

function renderHud() {
  const t = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const stats = [
    ['SCORE', String(score)],
    ['TIME',  `${t}s`],
    ['BEST',  String(best)],
  ];
  const w = 18;
  const tops = [], mids = [], bots = [];
  for (const [label, val] of stats) {
    const padN = Math.max(1, w - 4 - label.length - val.length);
    tops.push(tag(C.gold, '┌' + '─'.repeat(w - 2) + '┐'));
    mids.push(
      tag(C.gold, '│') + ' ' + tag(C.dim, label) + ' '.repeat(padN) +
      tag(C.gold, val) + ' ' + tag(C.gold, '│')
    );
    bots.push(tag(C.gold, '└' + '─'.repeat(w - 2) + '┘'));
  }
  hud.setContent(tops.join(' ') + '\n' + mids.join(' ') + '\n' + bots.join(' '));
}

function renderField() {
  const now = Date.now();
  // Field: 60 wide, 14 tall (inside borders ~60x14)
  // 3 cells per row, 3 rows. Each cell is 9 wide x 4 tall (3 sprite + 1 dirt + 1 label = 5? Use 4: 3 sprite + 1 dirt, label inline)
  // We'll render: row pattern repeated 3 times.
  const cellW = 9;
  const gapW = 6;
  const sideW = 9;

  // Build a 2D char grid 60w x 14t filled with grass
  const W = 60, H = 14;
  const grid = [];
  for (let r = 0; r < H; r++) {
    grid.push(Array(W).fill({ ch: '░', col: C.grassDk }));
  }
  // Sprinkle grass texture (lighter blades)
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if ((r * 31 + c * 17) % 7 === 0) grid[r][c] = { ch: '▒', col: C.grass };
    }
  }

  const ROW_H = 4;     // 3 sprite rows + 1 dirt row (with number embedded)
  const TOP_PAD = 1;   // start cells one row down so we have grass at top

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      const c = cells[i];
      const sprite = spriteFor(c, now);
      const cellLeft = sideW + col * (cellW + gapW);
      const cellTop  = TOP_PAD + row * ROW_H;

      // Sprite (3 lines)
      for (let r = 0; r < 3; r++) {
        const line = sprite.art[r];
        for (let cc = 0; cc < line.length && cc < cellW; cc++) {
          const ch = line[cc];
          if (ch !== ' ') {
            grid[cellTop + r][cellLeft + cc] = { ch, col: sprite.color };
          }
        }
      }
      // Dirt mound with number embedded: "▟▓ N ▓▓▓▙" (9 wide)
      const num = String(i + 1);
      const dirtRow = `▟▓ ${num} ▓▓▓▙`;
      for (let cc = 0; cc < dirtRow.length && cc < cellW; cc++) {
        const ch = dirtRow[cc];
        const isNum = ch === num;
        grid[cellTop + 3][cellLeft + cc] = {
          ch,
          col: isNum ? C.gold : C.dirt
        };
      }
    }
  }

  // Score pops — overlay on grid above their cell
  for (const p of pops) {
    const age = now - p.bornAt;
    const t = age / POP_TTL;
    const row = Math.floor(p.cell / 3);
    const col = p.cell % 3;
    const cellLeft = sideW + col * (cellW + gapW);
    const popRow = Math.max(0, (1 + row * 4) - Math.floor(t * 3));
    const popCol = cellLeft + 2;
    const text = p.text;
    for (let cc = 0; cc < text.length && popCol + cc < W; cc++) {
      grid[popRow][popCol + cc] = { ch: text[cc], col: p.color };
    }
  }

  // Compose into string with color tags, collapsing consecutive same-color runs
  const lines = [];
  for (let r = 0; r < H; r++) {
    let line = '';
    let curCol = null;
    for (let c = 0; c < W; c++) {
      const cell = grid[r][c];
      if (cell.col !== curCol) {
        if (curCol !== null) line += '{/}';
        line += `{${cell.col}-fg}`;
        curCol = cell.col;
      }
      line += cell.ch;
    }
    if (curCol !== null) line += '{/}';
    lines.push(line);
  }
  field.setContent(lines.join('\n'));
}

function renderLegend() {
  legend.setContent(
    `${tag(C.brown, '■')} mole +10  ${tag(C.gold, '■')} gold +30  ${tag(C.coral, '■')} claude -50`
  );
}

function renderHint() {
  hint.setContent('press 1-9 to whack · q / esc to quit');
}

function renderOverlay() {
  if (!gameOver) { overlay.hidden = true; return; }
  overlay.hidden = false;
  const newBest = score >= best && score > 0 ? `\n  ${tag(C.gold, '★ NEW BEST! ★')}` : '';
  overlay.setContent(
    '\n' +
    `  ${tag(C.gold, "TIME'S UP")}\n\n` +
    `  Final score: ${tag(C.gold, score)}\n` +
    `  Best: ${tag(C.dim, best)}` + newBest + '\n\n' +
    `  ${tag(C.dim, 'press r to replay · q to quit')}`
  );
}

function render() {
  renderTitle();
  renderHud();
  renderField();
  renderLegend();
  renderHint();
  renderOverlay();
  screen.render();
}

function tick() {
  const now = Date.now();
  if (!gameOver && now >= endsAt) {
    gameOver = true;
    gameOverAt = now;
    saveBest(best);
  }
  expire(now);
  trySpawn(now);
  render();
}

function reset() {
  for (const c of cells) { c.type = null; c.spawnedAt = 0; c.expiresAt = 0; c.hitAt = 0; }
  score = 0;
  endsAt = Date.now() + ROUND_SEC * 1000;
  lastSpawnAt = 0;
  pops = [];
  gameOver = false;
}

screen.key(['q', 'C-c', 'escape'], () => {
  saveBest(best);
  screen.destroy();
  process.exit(0);
});
screen.key(['r'], () => { if (gameOver) reset(); });
for (let i = 1; i <= 9; i++) {
  const k = String(i);
  screen.key([k], () => { whack(i - 1); render(); });
}

setInterval(tick, TICK_MS);
render();
