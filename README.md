# whack-a-claude

> **The arcade game that pops up when Claude is taking too long to think.**

Claude takes more than 8 seconds? Game appears. Claude finishes? Game closes itself. Hit moles for points, hit gold for bonus, **don't hit the Claudes**.

<p align="center">
  <img src="assets/screenshots/browser.png" width="48%" alt="Browser mode" />
  <img src="assets/screenshots/terminal.png" width="48%" alt="Terminal mode" />
</p>
<p align="center"><sub><b>Browser mode</b> &nbsp;·&nbsp; <b>Terminal mode</b></sub></p>

## Two ways to play

| | |
|---|---|
| 🌐 **Browser** | Auto-opens via Claude Code hooks. Pixel SVG sprites, squish animations, arcade chrome. |
| 💻 **Terminal** | Standalone TUI in `blessed`. Mouse + keyboard. Never leaves the shell. Run `npm run tui`. |

## Install — as a Claude Code plugin

```bash
git clone https://github.com/ChenJiangxi/whack-a-claude ~/.claude-plugins/whack-a-claude
claude plugin install ~/.claude-plugins/whack-a-claude
```

Next time Claude takes >8s to respond, the game opens. Auto-closes when Claude is done.

## Scoring

| target | points |
|---|---|
| 🟫 brown mole | **+10** |
| 🟨 gold mole | **+30** |
| 🟧 Claude | **−50** *(I warned you.)* |

60-second round. Difficulty ramps from chill to frantic. Best score persists.

## How it works

`UserPromptSubmit` hook → schedules a delayed game-open. `Stop` hook → cancels it.
Fast turns never see the game; slow ones do.

## Configure

```bash
WHACK_DELAY=8     # seconds before the game pops
WHACK_PORT=7654   # local server port (browser mode)
```

## Try it without Claude

```bash
npm install
npm start         # browser mode at http://127.0.0.1:7654
npm run tui       # terminal mode
```

## License

MIT
