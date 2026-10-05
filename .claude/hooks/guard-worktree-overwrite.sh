#!/bin/bash
# Ask before a git command that overwrites the whole working tree.
#
# Adapted from the git-guardrails-claude-code skill, narrowed to the one
# shape that bit a session on 2026-10-04: `git checkout origin/main -- .`,
# written to READ main, replaced 19 files on the branch with main's copies.
# Pushes, branch work and single-file checkouts stay unprompted; whole-tree
# overwrites (checkout or restore of ".", reset --hard, clean -f) ask first.
# To read another branch's file without touching the tree, use
# `git show <ref>:<path>`.
command -v jq >/dev/null 2>&1 || exit 0
cmd=$(jq -r '.tool_input.command // empty')
[ -n "$cmd" ] || exit 0

whole_tree='(\s|^)(\.|\./|:/|:/\.|\*)(\s|;|&|\||\)|$)'
reason=""
if printf '%s' "$cmd" | grep -qE "git\s+(checkout|restore)\b[^;&|]*${whole_tree}"; then
  reason="This git command overwrites every file in the working tree with another version."
elif printf '%s' "$cmd" | grep -qE 'git\s+reset\s+[^;&|]*--hard'; then
  reason="git reset --hard discards every uncommitted change."
elif printf '%s' "$cmd" | grep -qE 'git\s+clean\s+[^;&|]*-[a-zA-Z]*f'; then
  reason="git clean -f deletes untracked files."
fi
[ -n "$reason" ] || exit 0

jq -nc --arg r "$reason To read another branch's files without changing the tree, use git show <ref>:<path>." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
exit 0
