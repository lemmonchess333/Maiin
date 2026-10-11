#!/usr/bin/env bash
# Installs Playwright's Chromium for a CI job, in up to three bounded attempts.
#
#   scripts/ci/install-playwright-chromium.sh install SECONDS
#     npx playwright install --with-deps chromium (no browser in the cache)
#   scripts/ci/install-playwright-chromium.sh install-deps SECONDS
#     npx playwright install-deps chromium (browser restored from the cache)
#
# SECONDS bounds one attempt: a stalled apt mirror hangs apt-get with no
# error, and unbounded that cost whole jobs before a test ran.
#
# Between attempts it clears what a timed-out attempt left behind. Playwright
# runs apt-get through sudo, and that apt-get can outlive the attempt's
# `timeout`, still downloading and still holding dpkg's lock, so every retry
# failed on the lock within a second. Before retrying, it stops that apt-get,
# waits for dpkg's locks to be free, and repairs whatever dpkg left half-done.
#
# Worst case, three stalled attempts: 3 x (SECONDS + 10), plus two clear-ups
# of ASK_WAIT + KILL_WAIT + RETRY_PAUSE and a dpkg repair, about 50 s each.
# Each step's timeout-minutes covers that, which the test checks.
set -u

# dpkg's two locks: apt-get holds the first for its whole run, dpkg the
# second while it installs.
LOCKS=(/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock)
# What a timed-out attempt leaves running. Never dpkg itself: left alone it
# finishes and lets go, and stopping it mid-install is what breaks a system.
STRAY=apt-get
# Seconds to wait for the locks after asking the stray to stop, then after
# making it.
ASK_WAIT=5
KILL_WAIT=20
RETRY_PAUSE=10

# Whether any process holds one of dpkg's locks. /proc/locks lists every
# lock with its file's inode, and needs no package and no root to read.
dpkg_locked() {
  local lock inode
  for lock in "${LOCKS[@]}"; do
    inode=$(stat -c %i "$lock" 2>/dev/null) || continue
    grep -q ":$inode " /proc/locks && return 0
  done
  return 1
}

# Waits up to $1 seconds for dpkg's locks to be free.
wait_for_dpkg() {
  local deadline=$((SECONDS + $1))
  while dpkg_locked; do
    ((SECONDS < deadline)) || return 1
    sleep 1
  done
}

release_dpkg() {
  sudo pkill -x "$STRAY" || true
  if ! wait_for_dpkg "$ASK_WAIT"; then
    sudo pkill -KILL -x "$STRAY" || true
    wait_for_dpkg "$KILL_WAIT" ||
      echo "::warning::dpkg's lock is still held; retrying anyway"
  fi
  sudo dpkg --configure -a || true
}

main() {
  local cmd
  case "${1:-}" in
    install) cmd=(npx playwright install --with-deps chromium) ;;
    install-deps) cmd=(npx playwright install-deps chromium) ;;
    *)
      echo "usage: $0 install|install-deps SECONDS" >&2
      return 2
      ;;
  esac
  local seconds=${2:-}
  if ! [[ $seconds =~ ^[1-9][0-9]*$ ]]; then
    echo "usage: $0 install|install-deps SECONDS" >&2
    return 2
  fi
  local i
  for i in 1 2 3; do
    timeout --kill-after=10 "$seconds" "${cmd[@]}" && return 0
    if ((i == 3)); then
      echo "::error::'${cmd[*]}' failed or stalled three times"
      return 1
    fi
    echo "::warning::'${cmd[*]}' attempt $i failed or stalled; retrying"
    release_dpkg
    sleep "$RETRY_PAUSE"
  done
}

# Sourced, it only defines the above (its test drives it with stand-ins).
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
