# Vendored skills

Most skills in `.claude/skills/` are copied from other repositories. This
records where each came from, which version is here, and what this repo
changed in it. With that, an update check is one `diff -r` against upstream,
and the local changes are carried into the next copy instead of being lost.
`lock-decision` and `verifier-tropos-web` are this repo's own and are not
listed.

## mattpocock/skills

- **Skills:** ask-matt, code-review (here `code-review-matt`),
  codebase-design, diagnosing-bugs, domain-modeling,
  git-guardrails-claude-code, grill-me, grill-with-docs, grilling, handoff,
  implement, implement-spec, improve-codebase-architecture, pr, prototype,
  research, retro, setup-matt-pocock-skills, setup-pre-commit, tdd, teach,
  to-questionnaire, to-spec, to-tickets, triage, wait-what, wayfinder,
  wizard, writing-for-agents
- **Not copied:** migrate-to-shoehorn and scaffold-exercises, which are for
  Matt's TypeScript courses, and the `in-progress` bucket.
- **Source:** [mattpocock/skills](https://github.com/mattpocock/skills),
  `skills/<bucket>/<name>/`
- **Version here:** v1.3.1, commit `24fe0ef` (2026-10-04)
- **Local changes:**
  - `prototype` asks before creating its throwaway branch where the session
    is limited to a designated branch (`d11a8b7c`).
  - `code-review` is renamed `code-review-matt`, folder and `name:` both,
    because Claude Code has a built-in `code-review`. The two do different
    jobs: the built-in hunts correctness bugs, Matt's checks the diff
    against the repo's written standards and against the spec or ticket it
    came from. The references in `ask-matt`, `implement`, `implement-spec`
    and `tdd` say `code-review-matt` to match.
  - `pr` opens with one line saying `.github/PULL_REQUEST_TEMPLATE.md` keeps
    its sections, with the skill's template filling its Summary and Test
    plan.
  - Each skill's `agents/openai.yaml` (Codex metadata) is left out.
- **Older copies kept:** caveman and zoom-out are the May 2026 copy
  (`5d84a020`). Upstream removed both in v1.0.

## graphify

- **Source:** [`graphifyy` on PyPI](https://pypi.org/project/graphifyy/)
  (Graphify-Labs/graphify), written by
  `graphify install --project --platform claude`
- **Version here:** about 0.9.32, the release current when #1831 installed it
  on 2026-08-01. The install recorded no version.
- **Local changes:** `SKILL.md` gives the subagent step at normal volume
  (#2558). The installer's hooks in `.claude/settings.json` and its CLAUDE.md
  section were also rewritten (#1831).

## react-doctor

- **Source:** [`react-doctor` on npm](https://www.npmjs.com/package/react-doctor),
  `dist/skills/react-doctor/`
- **Version here:** skill 1.2.0, from package 0.9.14
- **Local changes:** none

## llm-council

- **Source:** not recorded. Added 2026-04-01 (`8151c9e9`).
- **Local changes:** none known

## gstack

- **Source:** git submodule, [garrytan/gstack](https://github.com/garrytan/gstack)
- **Version here:** commit `4a77cc2c` (v0.5.0, 2026-03-16). Cloud sessions
  don't check it out.
- **Local changes:** none

## Updating

- **mattpocock/skills:** clone it, copy each skill's folder over ours without
  `agents/`, and re-apply the local changes above. Then check that every skill
  the copies call is installed: `grep -rn 'Skill tool with' .claude/skills`.
  Copy upstream's `code-review` into `code-review-matt` and rename it there
  (see the local changes above). `/clear`, `/compact` and `/kill` in the
  copies are Claude Code commands, not skills.
- **Formatting:** `.prettierignore` keeps the commit hook's formatter off
  every copied skill, so the copies stay as upstream wrote them. Before it
  did, the hook reworded v1.3.1's new copies, and in `to-questionnaire` it
  merged an example's last line into its closing tag. A new repo-owned
  skill needs its own `!` line there to be formatted.
- **The glossary file:** this repo's is `GLOSSARY.md`, the name upstream's
  domain skills use (it was `CONTEXT.md` until 2026-10-04), so the copies
  need no mapping. `docs/agents/domain.md` says what is in it.
- **react-doctor:** `npm pack react-doctor@latest`, then copy
  `package/dist/skills/react-doctor/`. `npm run doctor` already runs the
  latest CLI, so only the skill text can fall behind.
- **graphify:** updating means re-running its installer, which rewrites the
  hooks in `.claude/settings.json` and the CLAUDE.md graphify section. Diff
  both before committing, and re-apply the `SKILL.md` change above.
- **gstack:** compare the pinned commit with
  `git ls-remote https://github.com/garrytan/gstack HEAD`. Its newer ship and
  deploy skills merge pull requests themselves, while merges here wait for
  the owner's go.
