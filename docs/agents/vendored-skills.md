# Vendored skills

Most skills in `.claude/skills/` are copied from other repositories. This
records where each came from, which version is here, and what this repo
changed in it. With that, an update check is one `diff -r` against upstream,
and the local changes are carried into the next copy instead of being lost.
`lock-decision` and `verifier-tropos-web` are this repo's own and are not
listed.

## mattpocock/skills

- **Skills:** codebase-design, diagnosing-bugs, domain-modeling,
  git-guardrails-claude-code, grill-me, grill-with-docs, grilling, handoff,
  improve-codebase-architecture, prototype, setup-matt-pocock-skills,
  setup-pre-commit, tdd, to-spec, to-tickets, triage, writing-for-agents
- **Source:** [mattpocock/skills](https://github.com/mattpocock/skills),
  `skills/<bucket>/<name>/`
- **Version here:** v1.3, commit `d81f3a1` (2026-09-29)
- **Local changes:** `prototype` asks before creating its throwaway branch
  where the session is limited to a designated branch (`d11a8b7c`). Each
  skill's `agents/openai.yaml` (Codex metadata) is left out.
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
  Leave out upstream's `code-review`, which clashes with Claude Code's
  built-in skill of that name.
- **The glossary file:** upstream's domain skills call it `GLOSSARY.md`; this
  repo's is `CONTEXT.md` (see `docs/agents/domain.md`). Leave the skills'
  wording alone. The mapping lives in this repo's config, not in the copies.
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
