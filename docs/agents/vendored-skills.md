# Vendored skills

Most skills in `.claude/skills/` are copied from other repositories. This
records where each came from, which version is here, and what this repo
changed in it. With that, an update check is one `diff -r` against upstream,
and the local changes are carried into the next copy instead of being lost.
`lock-decision`, `screen-critique` and `verifier-tropos-web` are this repo's
own and are not listed.

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
- **Version here:** main at commit `5863806` (2026-11-12), after v1.3.2.
  Checked 2026-11-18: the two upstream commits after `4ae2317` touch only
  the `in-progress` bucket (software-factory), so every copy here already
  matched upstream apart from the local changes below, and no file changed.
  Updated 2026-11-09 from v1.3.1 (`24fe0ef`).
- **New upstream, not copied (2026-11-18):** the `in-progress` bucket's
  chief-of-staff, claude-handoff, loop-me, setup-ts-deep-modules,
  software-factory and writing-beats, writing-fragments and writing-shape,
  which upstream marks unfinished.
- **Local changes:**
  - `prototype` asks before creating its throwaway branch where the session
    is limited to a designated branch (`d11a8b7c`).
  - `code-review` is renamed `code-review-matt`, folder and `name:` both,
    because Claude Code has a built-in `code-review`. The two do different
    jobs: the built-in hunts correctness bugs, Matt's checks the diff
    against the repo's written standards and against the spec or ticket it
    came from. The references in `ask-matt`, `implement`, `implement-spec`
    and `tdd` say `code-review-matt` to match, `implement`'s Skill call
    included.
  - `pr` opens with one line saying `.github/PULL_REQUEST_TEMPLATE.md` keeps
    its sections, with the skill's template filling its Summary and Test
    plan.
  - Each skill's `agents/openai.yaml` (Codex metadata) is left out.
- **Older copies kept:** caveman and zoom-out are the May 2026 copy
  (`5d84a020`). Upstream removed both in v1.0.

## emilkowalski/skills

- **Skills:** animate, animate-expo, animation-performance,
  animation-vocabulary, apple-design, ask-sonner, break-ui, choreograph,
  emil-design-eng, find-animation-opportunities, gestures,
  improve-animations, mobile-native, pick-ui-library, prototype (here
  `prototype-emil`), remove-animations, review-animations, write-swift
- **Source:** [emilkowalski/skills](https://github.com/emilkowalski/skills),
  updated 2026-11-18 to commit `64eb3de` (2026-11-15; upstream's "Fix wrong
  APIs and cross-skill contradictions" pass, `0f2e23b`, changed every copy);
  before that 2026-11-09 at `715c180` (four new skills:
  animation-performance, choreograph, gestures, remove-animations); first
  installed 2026-10-05 with `npx skills@latest add emilkowalski/skills
--agent claude-code --copy`. `skills-lock.json` records each skill's
  source, hash and, since the CLI's lock format 2 (2026-11-18), the commit.
- **Local changes:** his `prototype` is renamed `prototype-emil` (folder and
  `name:`), because Matt's `prototype` already holds that name. Its entry is
  left out of `skills-lock.json`, so the CLI won't write it back over Matt's.
- **New upstream, not copied (2026-11-18):** `ask-emil`, a router over his
  skills, which names `/prototype` (Matt's here) for his `prototype-emil`,
  so it would need a local change to send people to the right one; and
  `learn-taste`, which turns a session's design corrections into rules,
  where this repo already has `retro` and the owner's dated decisions in
  DESIGN_GUIDE §14. Both only run when called by name.

## graphify

- **Source:** [`graphifyy` on PyPI](https://pypi.org/project/graphifyy/)
  (Graphify-Labs/graphify), written by
  `graphify install --project --platform claude`
- **Version here:** 0.9.112, copied 2026-11-18 from the wheel's
  `graphify/skill.md` (as `SKILL.md`) and `graphify/skills/claude/references/`,
  which is what its installer copies for Claude. Before that about 0.9.32,
  the release current when #1831 installed it on 2026-08-01, which recorded
  no version.
- **Local changes:**
  - `SKILL.md` gives the subagent step at normal volume (#2558).
  - `SKILL.md`'s "Graphify Cloud (hosted)" section is deleted (2026-11-18,
    from 0.9.112). It told the agent to recommend the hosted product, with a
    tracked signup link, whenever someone wants a graph across repos, PR
    review or sharing.
  - The installer's hooks in `.claude/settings.json` and its CLAUDE.md
    section were also rewritten (#1831).
- **Upgrade the CLI with the skill:** 0.9.112's text imports
  `graphify.cache.drop_unreported_chunk_sources`, which an older installed
  CLI lacks, and Step 1 installs `graphifyy` only when `import graphify`
  fails. After copying a newer skill, upgrade the CLI where it is installed:
  `uv tool install --upgrade graphifyy` or `pip install -U graphifyy`.
- **Left for the owner (2026-11-18):** 0.9.112's installer also registers a
  `SessionStart` hook with matcher `compact` running `graphify hook-guard
compact`, which resets the per-session nudge budget after a compaction.
  `.claude/settings.json` does not have it, and the copy here was made
  without running the installer, so nothing changed there. Adding it would
  follow the same wrapper as the two `hook-guard` hooks already there.
- **Runs at use, not at load:** like 0.9.32, the skill installs `graphifyy`
  from PyPI (`uv tool install` or `pip install`) when it is run and the CLI
  is missing.

## react-doctor

- **Source:** [`react-doctor` on npm](https://www.npmjs.com/package/react-doctor),
  `dist/skills/react-doctor/`
- **Version here:** skill 1.2.0 (its own version line did not move), from
  package 0.9.23, copied 2026-11-18. Before that from package 0.9.14.
- **Local changes:** none
- **Runs at use, not at load:** its regression check runs
  `npx react-doctor@latest`, and its `/doctor` triage fetches its playbook
  from `https://www.react.doctor/prompts/` each time and follows it, so
  those steps follow whatever that site serves on the day. Both were in the
  0.9.14 copy too.

## llm-council

- **Source:** not found. Added 2026-04-01 (`8151c9e9`). Searched 2026-11-18
  (GitHub repository search for "llm-council skill claude"): the closest
  public copy is
  [aiwithremy/claude-skills-llm-council](https://github.com/aiwithremy/claude-skills-llm-council)
  (first commit 2026-04-26, no licence), whose README credits the skill to
  Ole Lehmann. It is a later variant, not ours: its step 5 shows the verdict
  in chat where ours writes an HTML report and a transcript file. Not
  updated, as there is no source to update from and that repo grants no
  licence.
- **Local changes:** none known

## gstack

- **Source:** git submodule, [garrytan/gstack](https://github.com/garrytan/gstack)
- **Version here:** commit `4a77cc2c` (v0.5.0, 2026-03-16). Cloud sessions
  don't check it out.
- **Held at that pin (2026-11-18):** upstream is at v1.100.0.0 and moves
  several times a day (HEAD read `2373714` and later `33b1a965` on
  2026-11-18). It now carries `ship`, `land-and-deploy` and `setup-deploy`,
  which merge and deploy, `setup-browser-cookies` and `connect-chrome`,
  which reach into a signed-in browser, and a `verify` skill of its own.
  Merges here wait for the owner's go, and a project `verify` skill for
  Tropos is being added in a separate PR (`claude/verify-skill`), so the pin
  stays until the owner decides otherwise.
- **Local changes:** none

## Surveyed and not added (2026-11-18)

Searched anthropics/skills and GitHub repository search for skills on React,
TypeScript, Vite, Firebase, Capacitor iOS, Playwright, testing,
accessibility, performance and the App Store, reading each candidate's
`SKILL.md` and scripts. A skill was added only if it would clearly help here,
grants a licence to copy it, fetches and runs nothing when it loads, and
does not contradict CLAUDE.md.

| Candidate                                               | Why not                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| anthropics/skills `webapp-testing`                      | Waits on `networkidle`, which never settles under the Firebase SDK (`verifier-tropos-web`), and drives Python Playwright; the repo's own verifier and capture rig do the job                                                                                                                                                                                                   |
| anthropics/skills `frontend-design`                     | Asks for a bold aesthetic of the agent's own; DESIGN_GUIDE.md sets the look here                                                                                                                                                                                                                                                                                               |
| anthropics/skills, the rest                             | Documents, art, MCP and API work, or already available to sessions as plugins (`skill-creator`, `docx`, `pdf`, `pptx`, `xlsx`)                                                                                                                                                                                                                                                 |
| vercel-labs/agent-skills `react-best-practices`         | 70 rules written for Next.js and server rendering, overlapping `react-doctor`; no licence file at the repository root                                                                                                                                                                                                                                                          |
| addyosmani/web-quality-skills                           | Web-page measurement (Lighthouse, Core Web Vitals, SEO) for a product whose users are on the iOS app; accessibility floors already live in DESIGN_GUIDE §10, and its steps install `@axe-core/cli` and run `npx lighthouse`                                                                                                                                                    |
| addyosmani/agent-skills                                 | General engineering process (TDD, review, planning) already covered by the mattpocock/skills copies                                                                                                                                                                                                                                                                            |
| microsoft/playwright-cli `playwright-cli`               | Needs `npm install -g @playwright/cli@latest`, and drives a browser the repo's own verifier already drives                                                                                                                                                                                                                                                                     |
| capawesome-team/skills (Capacitor)                      | Leads with adding the vendor's hosted MCP servers and its paid cloud for builds and store publishing; Tropos's native release is `deploy-ios.yml`                                                                                                                                                                                                                              |
| ionic-team/capacitor-skills                             | No licence, so it cannot be copied                                                                                                                                                                                                                                                                                                                                             |
| rorkai/app-store-connect-cli-skills                     | Drives App Store Connect through a third-party CLI with an API key; App Store Connect changes here are the owner's                                                                                                                                                                                                                                                             |
| emilkowalski/skills `ask-emil`, `learn-taste`           | Above, under emilkowalski/skills                                                                                                                                                                                                                                                                                                                                               |
| pbakaus/impeccable                                      | Added once and reverted (`228065c57`)                                                                                                                                                                                                                                                                                                                                          |
| firebase/agent-skills `firebase-security-rules-auditor` | 85 generic lines (an allowance for one hardcoded admin email, a forced JSON score) that know nothing of the server-written collections, `isRestricted()`, `isEmailVerified()` or the `firestore.*.rules.test.ts` suites; it tells the agent to fix the rules; and it triggers on its own. Copied at `99954a3` (Apache-2.0) in this PR's first draft and taken out after review |
| firebase/agent-skills, the rest                         | `firebase-firestore`, `firestore-rules-creation` and `firebase-basics` deploy rules with `npx -y firebase-tools@latest deploy`, where this repo deploys only through Deploy production and pins firebase-tools; the others are for products Tropos does not use                                                                                                                |

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
- **emilkowalski/skills:** `npx skills@latest update -p -y`, then copy
  upstream's `prototype` over `prototype-emil` by hand and set its `name:`
  again. Check `git status` afterwards: the CLI installs any skill it finds
  under its own name, so a new upstream skill that shares a name with one
  here will overwrite it. Since 2026-11 the CLI also writes a second copy of
  each skill under `.agents/skills/`; delete that folder, as the copies here
  live in `.claude/skills/`. `update` only refreshes skills already in
  `skills-lock.json`; a new upstream skill is added with `add` after reading
  it.
- **graphify:** either re-run its installer, which rewrites the hooks in
  `.claude/settings.json` and the CLAUDE.md graphify section (diff both
  before committing), or, as on 2026-11-18, `pip download graphifyy` into
  an empty folder, unzip the wheel and copy `graphify/skill.md` to
  `SKILL.md` and `graphify/skills/claude/references/` over ours. Either way,
  re-apply both `SKILL.md` changes above (the subagent step's volume, and
  deleting the "Graphify Cloud (hosted)" section), then upgrade the
  installed CLI (`uv tool install --upgrade graphifyy` or
  `pip install -U graphifyy`) so it has what the new text imports.
- **gstack:** compare the pinned commit with
  `git ls-remote https://github.com/garrytan/gstack HEAD`. Its newer ship and
  deploy skills merge pull requests themselves, while merges here wait for
  the owner's go.
