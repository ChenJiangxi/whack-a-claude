# whack-a-claude

A pixel-retro whack-a-mole that auto-opens in your browser when Claude Code is taking a while to respond. Hit regular moles for points, gold moles for bonus, and **don't hit the Claude moles** — they cost you 50.

```
+----------+----------+----------+
|   60s    |   3x3    |   3 mole |
|  round   |  grid    |   types  |
+----------+----------+----------+
```

## How it works

- `UserPromptSubmit` hook → starts a tiny local Node HTTP server (port 7654) and schedules the game to open in your browser after **8 seconds**.
- `Stop` hook (Claude finished) → cancels the pending open. Fast responses → no game. Slow responses → game pops up.
- Once open, the game polls `/status`. When Claude finishes, an overlay appears and the tab tries to auto-close after 10s.

Requires `node` (which Claude Code already needs).

## Install

### Option A — as a Claude Code plugin

```bash
git clone <this-repo> ~/.claude-plugins/whack-a-claude
claude plugin install ~/.claude-plugins/whack-a-claude
```

If your Claude Code build doesn't have `claude plugin`, fall back to Option B.

### Option B — wire up the hooks manually

Drop `whack-a-claude/` anywhere stable, then add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "type": "command", "command": "/absolute/path/to/whack-a-claude/bin/on-prompt.sh" }
    ],
    "Stop": [
      { "type": "command", "command": "/absolute/path/to/whack-a-claude/bin/on-stop.sh" }
    ]
  }
}
```

The scripts work without `${CLAUDE_PLUGIN_ROOT}` — they fall back to a path computed from their own location.

## Configure

| Env var       | Default | Meaning                                       |
| ------------- | ------- | --------------------------------------------- |
| `WHACK_DELAY` | `8`     | Seconds to wait before opening the game       |
| `WHACK_PORT`  | `7654`  | Port for the local server                     |

## Try it without Claude

```bash
WHACK_DATA_DIR=/tmp/whack node bin/server.js
open http://127.0.0.1:7654/
```

To simulate Claude finishing while the game is open:

```bash
echo '{"state":"done","since":0}' > /tmp/whack/status.json
```

## Uninstall

- Remove the hook entries from `settings.json`, or `claude plugin uninstall whack-a-claude`.
- `pkill -f 'whack-a-claude.*server.js'` to stop the server.
- `rm -rf ~/.claude/plugins/data/whack-a-claude` to clear state.

## Scoring

| Mole         | Points |
| ------------ | ------ |
| Brown (mole) | +10    |
| Gold         | +30    |
| Claude       | -50    |
