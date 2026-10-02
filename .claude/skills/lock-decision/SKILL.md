---
name: lock-decision
description: >
  Append a locked decision to .claude/plans/programme-run-followups.md on its
  own claude/lock-<id> branch cut from main, push it, and open a draft PR.
  Use when the user agrees to lock a decision (says "lock it", "lock as-is",
  "go for it" after a stress-test, or otherwise approves the locked answer).
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

1. **Decision ID** — the area prefix and the next number in that area, e.g. `Soc12`, `Set2`, `FW1`
2. **Title** — short noun phrase, e.g. `Settings pass — grouped list, Programme as a short page`
3. **Locked answer body** — the full structured answer (the owner's calls, e.g. call 1 → B, and what each changes)
4. **Commit subject** — short imperative, e.g. `lock Set2, the Settings pass`
5. **Commit body** — 3-8 short paragraphs explaining the decision and the PR that implements it

If any of these are unclear, ask the user before running.

## Steps

### 1. Branch from main

A lock goes on its own branch, cut from main, never on the branch you are
working on (CLAUDE.md, "Plan-file lock discipline"):

```bash
git fetch origin main
git checkout -b claude/lock-<id> origin/main
```

`<id>` is the decision ID in lower case (`claude/lock-set2`). Commit or stash
work in progress first. If your session is limited to a designated branch,
ask the user before creating this one.

### 2. Append the row to the plan file

The plan file is `.claude/plans/programme-run-followups.md`. Each decision is
one table row:

```
| <ID> | <Title> | <Locked answer body> |
```

The locked answer body is a single table cell — newlines must be removed or
replaced with double-spaces. Bold the call labels: `**call 1 → B**`.

Put the row after the last row of its arc's table when it continues an arc
listed under "Decision log" (`A5` sits in the Auth arc's table); otherwise
after the last row in the file, where the recent locks (`Soc12`, `Set2`,
`FW1`) are. Use the full preceding row as the Edit anchor so the Edit
doesn't collide.

### 3. Commit

Use a HEREDOC commit message in this shape:

```
plan: <commit subject>

<commit body paragraph 1>

<commit body paragraph 2>

...

Implementation: <the PR that carries the change, if there is one>

https://claude.ai/code/session_<SESSION_ID>
```

The session ID is in the system prompt at session start (look for the
`https://claude.ai/code/session_...` URL pattern). If you can't find it,
use the placeholder the user has been using in this session.

Stage only the plan file:

```bash
git add .claude/plans/programme-run-followups.md
```

### 4. Push and open a draft PR

```bash
git push -u origin claude/lock-<id>
```

If push fails due to network, retry up to 4 times with exponential backoff
(2s, 4s, 8s, 16s). Do NOT use `--force` or `--no-verify`.

Open a draft PR from `claude/lock-<id>` into `main` (`gh pr create --draft`,
or the GitHub MCP tools in a cloud session), titled with the commit subject,
its body saying what was decided and which PR implements it. Then stop: the
owner merges it. Switch back to the branch you were working on.

### 5. Report back

Once the PR is open, give the user a one-line confirmation including:

- The PR link
- The locked answer in shorthand (e.g. "Set2 locked: B on both calls")
- One sentence on the next undecided question if relevant

Example:

> Opened #2551 (draft). Set2 locked: a grouped Settings list, Programme as a
> short page, and a switch per notification type.

### After it merges

Main squash-merges, so the lock commit itself never becomes an ancestor of
`origin/main`. Check for the row instead; this prints 1 once it has landed:

```bash
git fetch origin main
git show origin/main:.claude/plans/programme-run-followups.md | grep -cE '^\| *<ID> *\|'
```

## Anti-patterns

- Do NOT lock if the user hasn't explicitly agreed
- Do NOT commit a lock on a branch named for other work
- Do NOT skip the push or the PR — a lock that isn't on main is invisible to the next agent
- Do NOT merge the PR yourself — the owner merges it
- Do NOT amend a previous commit — always create a new one
- Do NOT add files beyond the plan file to the commit
