#!/usr/bin/env node
const blessed = require('blessed');

const ROUND_SEC = 60;
const SCORES = { mole: 10, gold: 30, claude: -50 };
const COLORS = {
  empty:  'gray',
  mole:   '#cd853f',
  gold:   '#ffd700',
  claude: '#cc6633'
};
const FACES = {
  empty:  ' ... ',
  mole:   '(o.o)',
  gold:   '(*o*)',
  claude: '(C.C)'
};
const LABELS = {
  empty:  '     ',
  mole:   ' mole',
  gold:   ' GOLD',
  claude: 'CLAUDE'
};

const cells = Array(9).fill('empty');
const cellExpire = Array(9).fill(0);
let score = 0;
let lastHit = '';
let endsAt = Date.now() + ROUND_SEC * 1000;
let lastSpawnAt = 0;
let gameOver = false;

const screen = blessed.screen({ smartCSR: true, title: 'whack-a-claude' });

const view = blessed.box({
  top: 'center',
  left: 'center',
  width: 56,
  height: 22,
  border: 'line',
  style: { border: { fg: 'cyan' } },
  tags: true
});
screen.append(view);

const tag = (type, text) => `{${COLORS[type]}-fg}${text}{/}`;

function render() {
  const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  if (remaining === 0) gameOver = true;

  const lines = [];
  lines.push(
    ` Time: ${String(remaining).padStart(2)}s   Score: ${String(score).padStart(4)}   ${lastHit}`
  );
  lines.push(' ' + '─'.repeat(52));
  for (let r = 0; r < 3; r++) {
    lines.push('');
    let l1 = '   ', l2 = '   ', l3 = '   ';
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const t = cells[i];
      l1 += `  [${i + 1}]      `;
      l2 += `  ${tag(t, FACES[t])}    `;
      l3 += `  ${tag(t, LABELS[t])}    `;
    }
    lines.push(l1, l2, l3);
  }
  lines.push('');
  lines.push(' ' + '─'.repeat(52));
  lines.push(' Press 1-9 to whack. q / Esc to quit.');
  if (gameOver) {
    lines.push('');
    lines.push(` {bold}{green-fg}GAME OVER. Final score: ${score}{/}`);
  }
  view.setContent(lines.join('\n'));
  screen.render();
}

function tick() {
  const now = Date.now();
  for (let i = 0; i < 9; i++) {
    if (cells[i] !== 'empty' && cellExpire[i] < now) cells[i] = 'empty';
  }
  if (!gameOver && now - lastSpawnAt > 400 + Math.random() * 400) {
    const empties = [];
    for (let i = 0; i < 9; i++) if (cells[i] === 'empty') empties.push(i);
    if (empties.length > 0) {
      const i = empties[Math.floor(Math.random() * empties.length)];
      const r = Math.random();
      const type = r < 0.7 ? 'mole' : r < 0.9 ? 'gold' : 'claude';
      cells[i] = type;
      cellExpire[i] = now + 1400 + Math.random() * 1200;
    }
    lastSpawnAt = now;
  }
  render();
}

function whack(idx) {
  if (gameOver) return;
  const t = cells[idx];
  if (t === 'empty') {
    lastHit = '{gray-fg}(miss){/}';
    return;
  }
  score += SCORES[t];
  const sign = SCORES[t] >= 0 ? '+' : '';
  lastHit = `${tag(t, sign + SCORES[t] + ' ' + t)}`;
  cells[idx] = 'empty';
}

screen.key(['q', 'C-c', 'escape'], () => {
  screen.destroy();
  process.exit(0);
});
for (let i = 1; i <= 9; i++) {
  const k = String(i);
  screen.key([k], () => { whack(i - 1); render(); });
}

setInterval(tick, 100);
render();
