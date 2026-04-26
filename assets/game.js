(function () {
  const COLS = 3, ROWS = 3;
  const ROUND_MS = 60_000;
  const SPAWN_MIN_MS = 650;
  const SPAWN_MAX_MS = 1300;
  const UP_MIN_MS = 800;
  const UP_MAX_MS = 1700;
  const STATUS_POLL_MS = 700;

  // ---------- sprites (12x12 pixel grid, scaled by SVG viewBox) ----------
  function moleSvg(opts) {
    const { body, dark, eye = '#000', nose, accent } = opts;
    return `
      <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"
           style="width:100%;display:block;image-rendering:pixelated;shape-rendering:crispEdges">
        <rect x="3"  y="3" width="2" height="2" fill="${dark}"/>
        <rect x="11" y="3" width="2" height="2" fill="${dark}"/>
        <rect x="3" y="5"  width="10" height="9" fill="${dark}"/>
        <rect x="2" y="6"  width="12" height="7" fill="${dark}"/>
        <rect x="4" y="4"  width="8"  height="10" fill="${dark}"/>
        <rect x="3" y="6"  width="10" height="7" fill="${body}"/>
        <rect x="4" y="5"  width="8"  height="9" fill="${body}"/>
        <rect x="2" y="7"  width="12" height="5" fill="${body}"/>
        <rect x="6" y="11" width="4" height="2" fill="${dark}" opacity="0.25"/>
        ${accent ? `
          <rect x="7" y="2" width="2" height="1" fill="${accent}"/>
          <rect x="6" y="3" width="1" height="1" fill="${accent}"/>
          <rect x="9" y="3" width="1" height="1" fill="${accent}"/>
        ` : ''}
        <rect x="5"  y="7" width="2" height="2" fill="${eye}"/>
        <rect x="9"  y="7" width="2" height="2" fill="${eye}"/>
        <rect x="6"  y="7" width="1" height="1" fill="#fff"/>
        <rect x="10" y="7" width="1" height="1" fill="#fff"/>
        <rect x="7" y="10" width="2" height="1" fill="${nose}"/>
      </svg>
    `;
  }

  const TYPES = {
    mole: {
      points: 10,
      weight: 65,
      sprite: moleSvg({ body: '#8a5a35', dark: '#3a1f0f', nose: '#ff9eb5' }),
    },
    gold: {
      points: 30,
      weight: 10,
      sprite: moleSvg({ body: '#ffd700', dark: '#7a5800', nose: '#a06a00', accent: '#ffffff' }),
    },
    claude: {
      points: -50,
      weight: 25,
      sprite: moleSvg({ body: '#d97757', dark: '#5d2818', nose: '#ffd54a', accent: '#ffd54a' }),
    },
  };

  function pickType() {
    const total = Object.values(TYPES).reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const [name, t] of Object.entries(TYPES)) {
      if ((r -= t.weight) <= 0) return name;
    }
    return 'mole';
  }

  const rand = (min, max) => min + Math.random() * (max - min);

  // ---------- DOM ----------
  const grid = document.getElementById('grid');
  const scoreEl = document.querySelector('[data-stat="score"] .value');
  const timeEl  = document.querySelector('[data-stat="time"] .value');
  const highEl  = document.querySelector('[data-stat="high"] .value');

  const overEl = document.getElementById('game-over');
  const overScoreEl = overEl.querySelector('.final-score');
  const overHiEl = overEl.querySelector('.hi');
  const replayBtn = overEl.querySelector('.replay');

  const doneEl = document.getElementById('claude-done');
  const doneScoreEl = doneEl.querySelector('.done-score');
  const countdownEl = doneEl.querySelector('.countdown');
  const closeBtn = doneEl.querySelector('.close-btn');
  const keepBtn  = doneEl.querySelector('.keep-btn');

  const holes = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const hole = document.createElement('div');
    hole.className = 'hole';
    hole.dataset.idx = i;
    grid.appendChild(hole);
    holes.push(hole);
  }

  // ---------- state ----------
  let score = 0;
  let endsAt = performance.now() + ROUND_MS;
  let nextSpawnAt = 0;
  const active = new Map();
  let running = true;
  let highScore = parseInt(localStorage.getItem('whackHighScore') || '0', 10);
  highEl.textContent = highScore;

  function setScore(v) {
    score = Math.max(0, v);
    scoreEl.textContent = score;
  }

  function spawn() {
    const free = holes.map((_, i) => i).filter(i => !active.has(i));
    if (!free.length) return;
    const idx = free[Math.floor(Math.random() * free.length)];
    const type = pickType();
    const el = document.createElement('div');
    el.className = 'mole';
    el.dataset.type = type;
    el.innerHTML = TYPES[type].sprite;
    holes[idx].appendChild(el);
    el.getBoundingClientRect(); // force reflow so the transition fires
    el.classList.add('up');
    const expiresAt = performance.now() + rand(UP_MIN_MS, UP_MAX_MS);
    active.set(idx, { type, expiresAt, el });

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      hit(idx);
    });
  }

  function popText(holeIdx, text, bad = false) {
    const span = document.createElement('span');
    span.className = 'score-pop' + (bad ? ' bad' : '');
    span.textContent = text;
    holes[holeIdx].appendChild(span);
    setTimeout(() => span.remove(), 800);
  }

  function hit(idx) {
    const m = active.get(idx);
    if (!m) return;
    const points = TYPES[m.type].points;
    setScore(score + points);
    m.el.classList.remove('up');
    m.el.classList.add(points >= 0 ? 'hit' : 'miss');
    popText(idx, (points >= 0 ? '+' : '') + points, points < 0);
    active.delete(idx);
    setTimeout(() => m.el.remove(), 400);
  }

  function despawn(idx) {
    const m = active.get(idx);
    if (!m) return;
    m.el.classList.remove('up');
    active.delete(idx);
    setTimeout(() => m.el.remove(), 400);
  }

  function loop(now) {
    if (!running) return;
    const remaining = endsAt - now;
    timeEl.textContent = Math.max(0, Math.ceil(remaining / 1000));

    if (remaining <= 0) {
      gameOver();
      return;
    }

    if (now >= nextSpawnAt) {
      spawn();
      const progress = 1 - remaining / ROUND_MS;
      const minMs = SPAWN_MIN_MS - progress * 250;
      const maxMs = SPAWN_MAX_MS - progress * 400;
      nextSpawnAt = now + rand(Math.max(300, minMs), Math.max(500, maxMs));
    }

    for (const [idx, m] of active) {
      if (now >= m.expiresAt) despawn(idx);
    }

    requestAnimationFrame(loop);
  }

  function gameOver() {
    running = false;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('whackHighScore', String(highScore));
      highEl.textContent = highScore;
    }
    overScoreEl.textContent = score;
    overHiEl.textContent = highScore;
    overEl.classList.add('show');
  }

  function startRound() {
    overEl.classList.remove('show');
    setScore(0);
    endsAt = performance.now() + ROUND_MS;
    nextSpawnAt = 0;
    for (const [idx] of active) despawn(idx);
    active.clear();
    running = true;
    requestAnimationFrame(loop);
  }

  replayBtn.addEventListener('click', startRound);

  // ---------- claude-done overlay ----------
  let doneShown = false;
  let countdownTimer = null;

  function showDoneOverlay() {
    if (doneShown) return;
    doneShown = true;
    doneScoreEl.textContent = score;
    let secs = 10;
    countdownEl.textContent = secs;
    doneEl.classList.add('show');
    countdownTimer = setInterval(() => {
      secs -= 1;
      countdownEl.textContent = secs;
      if (secs <= 0) {
        clearInterval(countdownTimer);
        tryClose();
      }
    }, 1000);
  }

  function tryClose() {
    window.close();
    setTimeout(() => {
      document.body.innerHTML =
        '<div style="display:grid;place-items:center;min-height:100vh;color:#ffd54a;' +
        'font-family:\'Press Start 2P\',monospace;text-align:center;padding:24px;background:#1a0d2e">' +
        '<div><h2 style="margin-bottom:16px;letter-spacing:2px">CLAUDE&#39;S DONE</h2>' +
        '<p style="font-size:11px;color:#aaa;line-height:1.7">You can close this tab now.</p></div></div>';
    }, 200);
  }

  closeBtn.addEventListener('click', tryClose);
  keepBtn.addEventListener('click', () => {
    clearInterval(countdownTimer);
    doneEl.classList.remove('show');
  });

  // ---------- status poller ----------
  let lastState = 'thinking';
  async function pollStatus() {
    try {
      const r = await fetch('/status', { cache: 'no-store' });
      const j = await r.json();
      if (j.state === 'thinking' && lastState === 'done') {
        doneShown = false;
        doneEl.classList.remove('show');
        clearInterval(countdownTimer);
      }
      if (j.state === 'done' && lastState !== 'done') {
        showDoneOverlay();
      }
      lastState = j.state;
    } catch (_) {}
  }
  setInterval(pollStatus, STATUS_POLL_MS);
  pollStatus();

  startRound();
})();
