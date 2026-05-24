## Summary

<!-- 1-3 bullets describing the change and the why. -->

## Schema migration check

Does this change require a migration helper?

- [ ] **No** — the change does not modify any versioned document shape
      (`programState`, `users/{uid}`, or any sub-field with its own
      version constant).
- [ ] **Yes** — I have bumped the relevant `CURRENT_*_VERSION` constant
      in `src/features/program/programTypes.ts` AND added an entry to
      `src/features/program/migrations.ts`.

See `docs/proposals/schema-versioning.md` for the bump rules.

## Test plan

<!-- Bulleted checklist of TODOs for testing this PR. -->
