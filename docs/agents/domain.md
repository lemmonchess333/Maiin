# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

The domain skills (`domain-modeling`, `grill-with-docs`, `improve-codebase-architecture`, and others that read the glossary) call this file `GLOSSARY.md`. Here it is `CONTEXT.md`: its "Domain glossary" section holds the terms, and the rest of the file records reference-app research. Read and update `CONTEXT.md` wherever a skill says `GLOSSARY.md`, and don't create a `GLOSSARY.md` or `GLOSSARY-MAP.md`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`, through `domain-modeling`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (this is one):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-domain-depth-in-lib-helpers.md
│   └── 0002-dual-scheduling-ontology.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (dual scheduling ontology) — but worth reopening because…_
