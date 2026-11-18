# Who judges a change

Read with REVIEW.md. The rule, from the Claude Code team's account of how
it verifies agents' work: if a change can modify the check that judges it,
the check is broken. Their code review reads REVIEW.md from the base or
default branch, never from the pull request. This page records which of
this repo's checks read from the change's own branch, measured on
2026-11-18 at `86fd30b46`, and what is done about each.

## What reads from the pull request's branch

| Check                                                                                                                                                                                           | Where it runs               | Read from                                               | A pull request can                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ci.yml` (`unit`, the five unit conditions, `audit`)                                                                                                                                            | `pull_request`              | the pull request's merge commit, workflow file included | edit the steps, the tests, the lint config and the baselines the job runs                    |
| `emulator-tests.yml` (rules, journeys, capture specs, signed-out specs)                                                                                                                         | `pull_request`              | the same                                                | the same                                                                                     |
| `ios-native-compile.yml`                                                                                                                                                                        | `pull_request`              | the same                                                | the same                                                                                     |
| Guard tests (`*Guard*.test.ts`, `*Treatment.test.ts`, `copyMechanics`, `requiredCheckComposition`, `claudeMdFreshness`, `workflow*`, `npmScripts`, `captureSeedChain`, every `*.cross.test.ts`) | inside `unit`               | the pull request                                        | add an exemption, narrow a pattern, or delete the test in the change that needs it           |
| `eslint.config.js`                                                                                                                                                                              | inside `unit`               | the pull request                                        | turn a rule off                                                                              |
| `scripts/dist-size.baseline.json`                                                                                                                                                               | `check-dist-size` in `unit` | the pull request                                        | raise the budget its own bundle needs                                                        |
| `scripts/ci/audit-allowlist.json`                                                                                                                                                               | `audit`                     | the pull request                                        | allowlist an advisory                                                                        |
| CODING_STANDARDS.md (read by `code-review-matt`), CLAUDE.md, DESIGN_GUIDE.md                                                                                                                    | an agent's session          | the working tree                                        | rewrite the rule its own diff breaks                                                         |
| `.husky/` hooks and `.claude/settings.json` hooks                                                                                                                                               | the committer's machine     | the branch                                              | change what runs before a commit                                                             |
| `dependabot-auto-merge.yml`                                                                                                                                                                     | `pull_request_target`       | the BASE                                                | nothing: it checks out no code and runs none, which `workflowSupplyChainGuard.test.ts` holds |

The required status checks are bound to the `pull_request` event
(`autoUpdateNeedsPat.test.ts`), and the ruleset that requires them is not
in the repository, so a pull request cannot remove a required check from
the ruleset. It can change what that check runs.

## What this repo does about it

- **REVIEW.md and its matcher read from the base.**
  `scripts/review-triggers.mjs` reads REVIEW.md and
  `.github/gate-files.txt` with `git show <base>:…`. It uses the working
  tree's copy only when the base has none (the change that adds the
  file), and says so. When a change edits the script itself it prints the
  command that runs the base's copy. The script has no local imports, so
  the base's copy runs from a temporary file.
- **Gate files are named on every pull request.**
  `.github/workflows/guards-from-base.yml` reads the manifest and the
  matcher from the base, puts a warning on each gate file the pull request
  edits, and lists them in the step summary. A reviewer reads those hunks
  on their own (REVIEW.md R38).
- **The base's copy of an edited rule test runs against the change.** The
  manifest's `run` lines are rule tests (scans for a banned call, a pinned
  workflow shape). If a base copy fails, the pull request either loosened
  a rule its own code relies on or extended a list the test enumerates; a
  tightened rule passes, because the change's code meets the looser base
  rule too. The job warns, naming the test, and stays green (measured
  below). Pins that move with the code (`.cross.test.ts`,
  `mirrorCrossTestGate`, `claudeMdFreshness`) are named, never run.
- **Advisory, not sound.** The workflow file is read from the pull request
  like any `pull_request` workflow, so a pull request can edit or delete
  it. The manifest lists it, so an edit is named, but by the copy being
  edited. `pull_request_target` would read the workflow from the base but
  runs with the base's token while running the pull request's code, which
  is the combination the supply-chain guard forbids.

## What only the owner can do

- **Make `guards-from-base` a required check** once it has run clean on a
  few weeks of pull requests. A required check whose job a pull request
  deletes never reports, and the merge waits, so requiring it closes the
  "delete the job" route.
- **CODEOWNERS on the manifest's files**, with code-owner review required
  in the ruleset, would make an edit to a gate wait for the owner. There
  is no CODEOWNERS file today, and since the owner merges every pull
  request, it would mostly add a review request; it matters once anyone
  else, or an agent, merges.
- **Keep gate edits in their own pull request.** A change that needs a
  looser gate is two pull requests: the gate change, reviewed on its own,
  then the code. `guards-from-base` goes red on the combined form.

## Measured noise

Measured on 2026-11-18 over main's 1,618 non-merge commits since
2026-08-01, with the manifest as it stands:

- **296 commits (18%) edited a named gate file.** Most were
  `scripts/dist-size.baseline.json` (145), `mirrorCrossTestGate` (35) and
  the two CI workflows (24 each). Those get a warning on the file and
  nothing else.
- **27 commits (1.7%) edited a rule test that exists at their parent.**
  Before the manifest split rule tests from pins, 117 did; the 90 extra
  were cross tests and enumerating gates that change with the code, whose
  base copies fail on ordinary behaviour changes.
- **Base copies run on a sample of 10 of the 27:** 4 passed; 6 failed, and
  every one was an ordinary change to a list the test enumerates
  (`workflowSupplyChainGuard`'s list of deploy workflows gaining a new
  one, four times; `prRowUnits`' list of rows, twice). None was a
  loosening. That is why a failing base copy warns instead of failing the
  job: a red that is nearly always wrong teaches people to look past red.

`scripts/review-triggers.mjs` over main's last 60 non-merge commits, with
REVIEW.md as it stands: 33 matched 0 or 1 items, 23 matched 2 to 8, and
the four largest feature merges (thousands of lines across functions,
the app and tests) matched 10 to 14.
