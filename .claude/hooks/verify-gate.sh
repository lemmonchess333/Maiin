#!/bin/bash
# The commit gate's PreToolUse hook on Bash (docs/agents/verification-stamps.md).
#
# It runs on every Bash call, beside the graphify and worktree hooks, so it
# reads the input once and leaves at once unless the call mentions
# "commit"; only then does node start. It never fails a call: whatever goes
# wrong, it exits 0, and the commit goes ahead unstamped.
input=$(cat)
case "$input" in
  *commit*) ;;
  *) exit 0 ;;
esac
command -v node >/dev/null 2>&1 || exit 0
printf '%s' "$input" | node "$(dirname "$0")/verify-gate.mjs" 2>/dev/null
exit 0
