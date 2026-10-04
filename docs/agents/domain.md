# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root. Its "Domain glossary" section holds the terms; the rest of the file records reference-app research and the deviations from it.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. CLAUDE.md's ADR table lists them in one line each.

This repo is single-context: there is no `GLOSSARY-MAP.md`, and none should be created. `GLOSSARY.md` was `CONTEXT.md` until 2026-10-04; plan-file rows and ADRs written before then cite it by that name.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (this is one):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-domain-depth-in-lib-helpers.md
│   └── 0002-dual-scheduling-ontology.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (dual scheduling ontology), but worth reopening because…_
