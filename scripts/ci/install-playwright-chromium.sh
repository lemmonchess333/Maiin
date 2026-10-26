#!/usr/bin/env bash
# Installs Playwright's Chromium for a CI job, in up to three bounded attempts.
#
#   scripts/ci/install-playwright-chromium.sh install SECONDS [BROWSER...]
#     npx playwright install --with-deps chromium (no browser in the cache)
#   scripts/ci/install-playwright-chromium.sh install-deps SECONDS [BROWSER...]
#     npx playwright install-deps chromium (browser restored from the cache)
#
# A job that needs other browsers names them (chromium, webkit, firefox),
# and those are installed instead.
#
# SECONDS bounds one attempt: a stalled apt mirror hangs apt-get with no
# error, and unbounded that cost whole jobs before a test ran.
#
# Between attempts it clears what a timed-out attempt left behind. Playwright
# runs apt-get through sudo, and that apt-get can outlive the attempt's
# `timeout`, still downloading and still holding dpkg's lock, so every retry
# failed on the lock within a second. Before retrying, it stops that apt-get,
# waits for dpkg's locks to be free, and repairs whatever dpkg left half-done.
# A mirror can also keep downloading too slowly to finish before the bound.
# On hosted runners, a timed-out attempt drops Azure from the runner's mirror
# list so apt uses its existing official HTTPS Ubuntu fallback on the retry.
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
APT_MIRRORS=/etc/apt/apt-mirrors.txt

# GitHub's Ubuntu image supplies Azure first, then the official HTTPS archive
# and security mirrors. A slow (but responding) Azure mirror never triggers
# apt's own failover. Remove only that entry, and only when the runner already
# supplies the official fallback; sources, suites and signature checks stay as
# configured by the image. Local installs and other apt repositories are untouched.
fallback_apt_mirror() {
  [[ ${GITHUB_ACTIONS:-} == true && -f $APT_MIRRORS ]] || return 0
  local azure='^http://azure\.archive\.ubuntu\.com/ubuntu/?([[:space:]]|$)'
  local archive='^https://archive\.ubuntu\.com/ubuntu/?([[:space:]]|$)'
  grep -Eq "$azure" "$APT_MIRRORS" || return 0
  grep -Eq "$archive" "$APT_MIRRORS" || return 0
  if sudo sed -i -E "\\~$azure~d" "$APT_MIRRORS"; then
    echo "::warning::Azure apt mirror timed out; retrying with the runner's official HTTPS Ubuntu fallback"
  else
    echo "::warning::Could not update the runner's apt mirror list; retaining bounded retries"
  fi
}

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

usage() {
  echo "usage: $0 install|install-deps SECONDS [chromium|webkit|firefox ...]" >&2
}

main() {
  local mode=${1:-} seconds=${2:-}
  if [[ $mode != install && $mode != install-deps ]] ||
    ! [[ $seconds =~ ^[1-9][0-9]*$ ]]; then
    usage
    return 2
  fi
  shift 2
  local browsers=("${@:-chromium}") browser
  for browser in "${browsers[@]}"; do
    if ! [[ $browser =~ ^(chromium|webkit|firefox)$ ]]; then
      usage
      return 2
    fi
  done
  local cmd
  if [[ $mode == install ]]; then
    cmd=(npx playwright install --with-deps "${browsers[@]}")
  else
    cmd=(npx playwright install-deps "${browsers[@]}")
  fi
  local i status
  for i in 1 2 3; do
    timeout --kill-after=10 "$seconds" "${cmd[@]}" && return 0
    status=$?
    if ((i == 3)); then
      echo "::error::'${cmd[*]}' failed or stalled three times"
      return 1
    fi
    echo "::warning::'${cmd[*]}' attempt $i failed or stalled; retrying"
    release_dpkg
    if [[ $status == 124 || $status == 137 ]]; then
      fallback_apt_mirror
    fi
    sleep "$RETRY_PAUSE"
  done
}

# Sourced, it only defines the above (its test drives it with stand-ins).
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
