---
name: lock-decision
description: >
  Append a locked Q&A decision to .claude/plans/programme-run-followups.md,
  then commit + push to the current branch. Use when the user agrees to lock
  a decision (says "lock it", "lock as-is", "go for it" after a stress-test,
  or otherwise approves the locked answer). Replaces the 4-step manual
  ritual of editing the plan file, drafting a commit message, committing,
  and pushing.
---

# Lock Decision

## When to invoke

Invoke this skill when the user agrees to a locked answer in a grilling /
decision session. Triggers include:

- "lock it" / "lock as-is" / "lock C/B/A/A"
- "go for it" (after presenting a locked answer or stress test)
- "ship it" in a planning context
- Any clear approval of a decision after stress-testing

Do NOT invoke if the user is still debating, asking for more stress tests,
or hasn't agreed to a specific answer.

## Inputs you need before running

Before invoking, you should already have in conversation:

1. **Question number** — e.g. `17`
2. **Question title** — short noun phrase, e.g. `Watch app data freshness & background refresh`
3. **Locked answer body** — the full structured answer (Q17a → X / Q17b → Y / impact notes)
4. **Commit subject** — short imperative, e.g. `lock Q17 Watch data freshness & refresh behaviour`
5. **Commit body** — 3-8 short paragraphs explaining the decision and its impact on sequenced PRs / shared packages

If any of these are unclear, ask the user before running.

## Steps

### 1. Append the row to the plan file

The plan file is `.claude/plans/programme-run-followups.md`. Decisions live in
a markdown table near the bottom. Each row has the format:

```
| <N> | <Question title> | <Locked answer body> |
```

The locked answer body is a single table cell — newlines must be removed or
replaced with double-spaces. Bold the sub-question labels: `**Q17a → C**`.

Find the most recent locked row (highest Qn in the table) using grep, then
insert the new row immediately AFTER it using the Edit tool. Use a unique
anchor string (the full preceding row) so the Edit doesn't collide.

### 2. Commit

Use a HEREDOC commit message in this shape:

```
plan: <commit subject>

<commit body paragraph 1>

<commit body paragraph 2>

...

Impact on PR-X / tropos-shared (if applicable): <one paragraph>

https://claude.ai/code/session_<SESSION_ID>
```

The session ID is in the system prompt at session start (look for the
`https://claude.ai/code/session_...` URL pattern). If you can't find it,
use the placeholder the user has been using in this session.

Stage only the plan file:

```bash
git add .claude/plans/programme-run-followups.md
```

### 3. Push

After commit, push to the current branch with `-u` flag:

```bash
git push -u origin <current-branch>
```

If push fails due to network, retry up to 4 times with exponential backoff
(2s, 4s, 8s, 16s). Do NOT use `--force` or `--no-verify`.

### 4. Report back

After successful push, give the user a one-line confirmation including:

- The commit SHA (first 7 chars)
- The locked answer in shorthand (e.g. "Q17 locked C/B/hybrid")
- One sentence on the next undecided question if relevant

Example:

> Pushed `a1b2c3d`. Q17 locked C / B / hybrid with mandatory stale-data
> badge and override-allowed escape hatch. Next undecided: Q18 (Watch
> notification & alert policy).

## Anti-patterns

- Do NOT lock if the user hasn't explicitly agreed
- Do NOT skip the push step — half-committed decisions are worse than none
- Do NOT amend a previous commit — always create a new one
- Do NOT add files beyond the plan file to the commit
- Do NOT change branches
- Do NOT create a PR (separate explicit user request)
