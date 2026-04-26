#!/usr/bin/env bash
# Fires on UserPromptSubmit. Marks status as "thinking", ensures the local
# game server is running, and schedules a delayed browser-open. If Claude
# finishes before the delay elapses, on-stop.sh kills the pending opener so
# the game never appears.
set -u

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

if [ -f "$LAUNCH_PID_FILE" ]; then
  PREV=$(cat "$LAUNCH_PID_FILE" 2>/dev/null || true)
  if [ -n "$PREV" ]; then
    pkill -P "$PREV" 2>/dev/null || true
    kill "$PREV" 2>/dev/null || true
  fi
  rm -f "$LAUNCH_PID_FILE"
fi

URL="http://127.0.0.1:$PORT/"
(
  sleep "$DELAY_SECONDS"
  if [ -f "$STATUS_FILE" ] && grep -q '"state":"thinking"' "$STATUS_FILE" 2>/dev/null; then
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
