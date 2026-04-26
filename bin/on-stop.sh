#!/usr/bin/env bash
# Fires on Stop. Marks status as "done" so the open game can show its
# "Claude finished" overlay, and kills any pending delayed-open so the game
# does NOT pop up if Claude responded fast enough.
set -u

DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/whack-a-claude}"
STATUS_FILE="$DATA_DIR/status.json"
LAUNCH_PID_FILE="$DATA_DIR/launch.pid"

if [ -d "$DATA_DIR" ]; then
  printf '{"state":"done","since":%s}\n' "$(date +%s)" > "$STATUS_FILE"
fi

if [ -f "$LAUNCH_PID_FILE" ]; then
  PID=$(cat "$LAUNCH_PID_FILE" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    pkill -P "$PID" 2>/dev/null || true
    kill "$PID" 2>/dev/null || true
  fi
  rm -f "$LAUNCH_PID_FILE"
fi

exit 0
