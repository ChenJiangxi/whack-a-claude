<h1 align="center">whack-a-claude</h1>

<p align="center">
  <b>The arcade game that pops up when Claude is taking too long.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" />
  <img src="https://img.shields.io/badge/claude%20code-plugin-d97757.svg" alt="Claude Code plugin" />
  <img src="https://img.shields.io/badge/node-%E2%89%A518-339933.svg" alt="Node ≥18" />
</p>

<p align="center">
  <img src="assets/screenshots/browser.png" width="560" alt="whack-a-claude — browser mode" />
</p>

---

Claude taking more than 8 seconds to respond? A pixel-art whack-a-mole opens in your browser. Claude finishes? The game closes itself. Fast turns never see it. Slow turns become 60 seconds of moles, gold bonuses, and rogue Claudes you must absolutely **not** whack.

Two modes — **browser** (the default, auto-launched by a Claude Code hook) and **terminal** (a full TUI that never leaves your shell).

## Install

As a Claude Code plugin:

```bash
git clone https://github.com/ChenJiangxi/whack-a-claude ~/.claude-plugins/whack-a-claude
claude plugin install ~/.claude-plugins/whack-a-claude
```

That's it. Next slow Claude turn → game opens.

## Modes

### Browser

Auto-launches 8s after a slow turn starts and auto-closes when Claude is done. Pixel SVG sprites, squish/bonk animations, score pop-ups, persistent best score.

### Terminal

```bash
npm install && npm run tui
```

Full-screen `blessed` TUI. Mouse and keyboard both work — `Q W E / A S D / Z X C` maps your keyboard's left-hand 3×3 onto the grid, so hand position matches grid position with zero translation.

<p align="center">
  <img src="assets/screenshots/terminal.png" width="640" alt="whack-a-claude — terminal mode" />
</p>

## Scoring

| target | points |
| --- | ---: |
| brown mole | **+10** |
| gold mole  | **+30** |
| Claude     | **−50** *(don't.)* |

60-second round. Difficulty ramps from chill to frantic across the round. Best score persists at `~/.local/share/whack-a-claude/best`.

## How it works

```
UserPromptSubmit hook  →  status.json: "thinking"  +  schedule open in 8s
Stop hook              →  status.json: "done"      +  cancel pending open
```

Fast turn: cancel fires before the open does, no game. Slow turn: game opens, polls `/status`, shows a "Claude's done" overlay when Claude finishes and auto-closes after 10s.

## Configure

```bash
WHACK_DELAY=8     # seconds before the game pops
WHACK_PORT=7654   # local server port
```

## Run standalone (no Claude required)

```bash
npm install
npm start         # browser at http://127.0.0.1:7654
npm run tui       # terminal
```

## License

[MIT](LICENSE)
