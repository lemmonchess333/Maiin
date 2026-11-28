# Verification stamps and the commit gate

A commit an agent makes here through `git commit` says how it was
verified, so that a commit nobody checked can be found by asking git, and
a commit gate can
one day refuse a commit that was never checked. The practice is the
Claude Code team's
([How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/)):
stamp every commit, `none` included; run a new gate in observe mode first,
read what it would have blocked, and only then enforce it.

The gate is in **observe** mode. It blocks nothing.

## The stamp

Two lines in the commit message's trailer block, beside `Co-Authored-By`
and `Claude-Session`:

```
Verified: unit, types
Verify-gate: observe(base) would-block; seen: unit, types
```

`Verified:` names how the change was checked, from this list. Only these
names count; detail in brackets is kept for the reader and ignored by the
query (`verify(home, food)` is `verify`), and any other word reads as
"unrecognised", never as a method:

| Method   | Means                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| `verify` | the verify skill drove the running app (`npm run verify:app`); `verify(home, food)` names features |
| `e2e`    | Playwright specs                                                                                   |
| `unit`   | Vitest                                                                                             |
| `types`  | `tsc -b` (never `tsc -p`, which checks nothing here; CLAUDE.md's Common Gotchas)                   |
| `lint`   | ESLint                                                                                             |
| `build`  | `vite build`, the dist-size check                                                                  |
| `review` | a code-review skill, or an advisor's review of the diff                                            |

or `Verified: none (<reason>)`, which is an honest answer: "docs only",
"vendored skill text, no runtime path". A commit with no `Verified:` line
at all is **unstamped**, which is a different thing from `none`: it was made
by a person, by a tool that skips git's hooks, or before the stamps began.

Write the `Verified:` line yourself when you know what you ran. When the
message has no `Verified:` line anywhere, the gate writes one from what it
saw.

`Verify-gate:` is the gate's own record and is always written by it: the
mode, where the mode came from (`env`, `base`, `worktree` or `default`),
its verdict, and the checks it saw pass in the transcript since the
session's last edit (`seen:`). After that, only when they apply:

- `same call:` checks chained to the commit by `&&` in the same Bash call
  (`npm run verify && git add -A && git commit …`), which have not run yet
  when the hook reads the transcript but must pass for the commit to
  happen;
- `claimed, not seen:` methods your `Verified:` line names that the gate
  saw nowhere (read from the `-m` or `-F` message it was given);
- `rules:` which copy of the rules judged the commit, when it was not the
  base branch's;
- `transcript:` why it did not read the transcript (none given,
  unreadable, or over 200 MB).

## How the gate decides

`.claude/hooks/verify-gate.sh` is a PreToolUse hook on Bash, in
`.claude/settings.json`. For a call that runs `git commit`, it reads the
session's transcript and finds the checks that **passed after the last
edit**:

- A check counts only when its tool call did not fail, and only when the
  call's exit status reflects it. `npx vitest run … | tail` without
  `set -o pipefail`, `vitest …; git push` and `vitest … || true` all
  report success whatever the tests did, so they count for nothing
  (CLAUDE.md's "Gate a push on the checks in the same command with `&&`").
  So does the `npx tsc -b; echo "exit: $?"` idiom: the gate cannot read
  the printed code. Chain checks with `&&` and they count. A call sent to
  the background (`run_in_background`) counts for nothing: its result says
  it started, not that it passed. `Exit code 0` is a pass; `Command timed
out` is a failure.
- Asking a tool about itself checks nothing: `eslint --version`,
  `tsc -b --dry`, `vitest list`, `--help`.
- An Edit or a Write inside the repository, a merge, a branch switch, a
  stash, `git rm` or `git mv`, `sed -i`, `prettier --write` or
  `eslint --fix` after a check makes it stale. Writing a commit message or
  a scratch file outside the repository does not.
- A `verify` or code-review skill's result, and an Agent call whose
  description has "review" as a word ("Fable review of the diff", not
  "Preview the build"), count as `verify` and `review`. A slash command
  the person types is a request, not a run: only the Skill result that
  follows it counts.

The verdict follows the article: **pass** when the session ran `verify` or
a `review` since its last edit, or when the commit message says
`Verified: none (<reason>)`; otherwise **would-block**. Unit tests and a
type check alone would block: they are the cheap checks every commit
should have, and the gate asks for the run or the review on top of them.

| Mode      | What a would-block commit does                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `off`     | goes ahead; still stamped                                                                                                                                                     |
| `observe` | goes ahead; stamped `would-block` and logged                                                                                                                                  |
| `enforce` | is refused, with the reason and the way out; after two refusals in a session, the next commit goes ahead (`released after 2 blocks` on its stamp) so a session is never stuck |

The rules are `scripts/verify-gate/gate.mjs`, pure functions with their
tests beside them. The hook loads the **base branch's** copy
(`git show origin/main:scripts/verify-gate/gate.mjs`) when there is one,
so a branch cannot loosen the gate that judges its own commits; a branch
that changes the rules is judged by the old ones until it merges.
`TROPOS_VERIFY_GATE_RULES=worktree` makes it use the working tree's copy
(`stamp.test.ts` sets it, to test a branch's rules), and the stamp then
says `rules: worktree(env)`; until the rules reach main, every stamp says
`rules: worktree`. The cached copy of the base rules lives in the git
directory, so `gate.mjs` imports nothing (a test holds it to that).

The pending stamp is written by husky's `commit-msg`
(`scripts/verify-gate/stamp.mjs`). It lands only on a commit that has the
same parent the hook saw, is made within 10 minutes, is not a merge, and
comes from the same Claude Code session (`CLAUDE_CODE_SESSION_ID`; where
Claude Code gives no id, from Claude Code at all, `CLAUDECODE=1`). A
person's commit at a terminal is never stamped, and the first commit that
finds a pending stamp spends it, used or not. The residual window: when a
session's commit fails after the hook ran (a pre-commit failure) and the
same session makes a different commit on the same parent within 10
minutes without going through the hook (an MCP tool, a commit the hook
did not recognise), that commit gets the failed one's stamp. It never
fails a commit.

## Switching modes

The mode comes from, in order:

1. the `TROPOS_VERIFY_GATE` env var (`off`, `observe` or `enforce`);
2. `.claude/verify-gate.json` on `origin/main`, read with `git show`;
3. the working tree's `.claude/verify-gate.json`;
4. off.

To enforce, change `.claude/verify-gate.json` to `{"mode": "enforce"}` in
its own PR, once the observe log reads clean. That is the owner's call.
The first and third sources are in reach of the session being judged,
which is why the stamp records the source: `enforce(base)` is the owner's
setting, `observe(env)` is a session that turned it down.

## Reading what it saw

- **The log.** Every decision is a line in
  `$(git rev-parse --git-common-dir)/claude-verify-gate/log.jsonl`: the
  verdict and why, the checks seen, the ones gone stale, the ones whose
  exit status was hidden, and the command. A would-block where the work
  was in fact checked is a false positive; read those before enforcing.
  The log keeps about its last megabyte, it stays on the machine, and
  cloud containers are reclaimed, so the stamps are the durable record.
- **The stamps.** `npm run stamps` lists the last 30 commits with how each
  was verified, and `npm run stamps -- origin/main~100..origin/main` or
  `-- main..HEAD --json` a range. Stamps are read from the whole message,
  not just its trailer block: main squash-merges with the branch's commit
  messages as the body, so each branch commit's `Verified:` line survives
  there. Merge commits are left out.

## What it cannot see

- **Subagents.** A subagent's tool calls are in its own transcript. A
  commit made in a subagent is judged on what that subagent ran, and a
  review the parent ran is not seen there.
- **A resumed or compacted session** may start a new transcript, and what
  ran before is not seen.
- **Commits that skip git's hooks.** `mcp__github__push_files` and
  `mcp__github__create_or_update_file` make commits on GitHub, and
  `git commit --no-verify` skips `commit-msg`; none of them is stamped.
- **Merges.** `auto-update-pr-branches` adds merge commits to every open
  branch; the query leaves them out.
- **Writes it does not recognise as edits,** such as a shell redirect into
  a source file, a code generator, or a formatter other than prettier and
  `eslint --fix`, do not make a check stale.
- **Messages it is not given.** `git commit -F -` (the message on stdin),
  `--amend --no-edit` and an editor commit hand the hook no message, so a
  `Verified: none (<reason>)` there is not seen, and `claimed, not seen:`
  cannot be worked out.
- **Checks that look like checks.** A command it classifies as a check but
  that checked little (`vitest run` on a filter that matched no file, a
  lint of one file) still counts.
- **What a check covered.** `unit` says Vitest passed, not that the
  changed code has tests. Reviewing that is still the reviewer's job.
