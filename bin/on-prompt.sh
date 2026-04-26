#!/usr/bin/env bash
# Fires on UserPromptSubmit. Marks status as "thinking" and schedules a
# delayed launch (browser tab or TUI pane). on-stop.sh cancels the pending
# launch if Claude finishes before the delay elapses, so fast turns never
# see the game.
set -u

# ---- switches -----------------------------------------------------------
# Sentinel: `touch ~/.whack-off` to disable, `rm ~/.whack-off` to re-enable.
[ -f "$HOME/.whack-off" ] && exit 0
# WHACK_MODE: browser | tui | off (default: browser)
MODE="${WHACK_MODE:-browser}"
[ "$MODE" = "off" ] && exit 0
[ "${WHACK_DISABLE:-0}" = "1" ] && exit 0

DELAY_SECONDS="${WHACK_DELAY:-8}"
PORT="${WHACK_PORT:-7654}"
ROOT_DIR="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/whack-a-claude}"

mkdir -p "$DATA_DIR"

STATUS_FILE="$DATA_DIR/status.json"
SERVER_PID_FILE="$DATA_DIR/server.pid"
LAUNCH_PID_FILE="$DATA_DIR/launch.pid"
LOG_FILE="$DATA_DIR/server.log"

printf '{"state":"thinking","since":%s}\n' "$(date +%s)" > "$STATUS_FILE"

# ---- browser mode needs a local server ----------------------------------
if [ "$MODE" = "browser" ]; then
  START_SERVER=1
  if [ -f "$SERVER_PID_FILE" ]; then
    EXISTING=$(cat "$SERVER_PID_FILE" 2>/dev/null || true)
    if [ -n "$EXISTING" ] && kill -0 "$EXISTING" 2>/dev/null; then
      START_SERVER=0
    fi
  fi
  if [ "$START_SERVER" -eq 1 ] && command -v node >/dev/null 2>&1; then
    WHACK_PORT="$PORT" \
    WHACK_DATA_DIR="$DATA_DIR" \
    WHACK_ASSETS_DIR="$ROOT_DIR/assets" \
      nohup node "$ROOT_DIR/bin/server.js" >> "$LOG_FILE" 2>&1 &
    echo $! > "$SERVER_PID_FILE"
    disown 2>/dev/null || true
  fi
fi

# ---- cancel any pending launch from a prior turn ------------------------
if [ -f "$LAUNCH_PID_FILE" ]; then
  PREV=$(cat "$LAUNCH_PID_FILE" 2>/dev/null || true)
  if [ -n "$PREV" ]; then
    pkill -P "$PREV" 2>/dev/null || true
    kill "$PREV" 2>/dev/null || true
  fi
  rm -f "$LAUNCH_PID_FILE"
fi

# Capture TMUX from the parent env so the delayed subshell can see it.
PARENT_TMUX="${TMUX:-}"

# ---- schedule the delayed launch ----------------------------------------
URL="http://127.0.0.1:$PORT/"
(
  sleep "$DELAY_SECONDS"
  # Re-check status — Claude may have already finished
  if [ ! -f "$STATUS_FILE" ] || ! grep -q '"state":"thinking"' "$STATUS_FILE" 2>/dev/null; then
    exit 0
  fi

  if [ "$MODE" = "tui" ]; then
    if [ -n "$PARENT_TMUX" ] && command -v tmux >/dev/null 2>&1; then
      TMUX="$PARENT_TMUX" tmux split-window -h \
        "WHACK_STATUS_FILE='$STATUS_FILE' node '$ROOT_DIR/bin/game-tui.js'"
    elif [ "$(uname -s)" = "Darwin" ]; then
      osascript -e "tell application \"Terminal\" to do script \"WHACK_STATUS_FILE='$STATUS_FILE' node '$ROOT_DIR/bin/game-tui.js'; exit\"" >/dev/null 2>&1 || true
    fi
  else
    case "$(uname -s)" in
      Darwin)              open "$URL" ;;
      Linux)               xdg-open "$URL" >/dev/null 2>&1 || true ;;
      MINGW*|MSYS*|CYGWIN*) start "" "$URL" ;;
    esac
  fi
  rm -f "$LAUNCH_PID_FILE"
) >/dev/null 2>&1 &
echo $! > "$LAUNCH_PID_FILE"
disown 2>/dev/null || true

exit 0
