#!/bin/sh
# Restart the dev server on port 8181 (optionally with a fresh copy of the starter data).
cd /home/claude/axnext
PIDS=$(pgrep -f 'src/server/main\.ts')
[ -n "$PIDS" ] && kill $PIDS
sleep 1
[ "$1" = "fresh" ] && rm -rf /tmp/claude-0/axd
AX_DATA_DIR=/tmp/claude-0/axd AX_PORT=8181 nohup npx tsx src/server/main.ts > /tmp/claude-0/ax.log 2>&1 &
sleep 4
