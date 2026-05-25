# Schema versioning conventions

**Status:** Pinned by RP4 lock (see `.claude/plans/programme-run-followups.md`).
This doc summarises the rules; the lock row is the source of truth.

## The four rules in one paragraph

Every Firestore document carries **at most one document-level version
field**. Sub-versions (a separate version on a subfield) are added
**only** when (a) the subfield is read independently of its container
and (b) it has its own migration helper in `migrations.ts`. A version
bump happens **only** when at least one reader cannot correctly read
old data without a migration step — forward-compat tolerance does NOT
count as a migration. Old clients keep working: parsers must be
forward-compatible (`passthrough`/`extend`, not `strict`), and the
**field-presence shape** of a payload — not the SDK version, not a
User-Agent header — is the authoritative version signal. Server
validators MUST reject payloads where the declared version disagrees
with the actual shape.

## Current artifacts

| Field                  | Lives on              | Helper                                               |
| ---------------------- | --------------------- | ---------------------------------------------------- |
| `programSchemaVersion` | `programState` doc    | `migrateProgramState()` in `migrations.ts`           |
| `weekScheduleVersion`  | `users/{uid}` profile | `backfillWeekScheduleIfMissing()` in `migrations.ts` |

Both constants live in `src/features/program/programTypes.ts`
(`CURRENT_PROGRAM_SCHEMA_VERSION`, `CURRENT_WEEKSCHEDULE_VERSION`).

### Wording clarification on RP4a pin #1

RP4a pin #1 reads "one version field per Firestore document". Read
strictly that would imply every doc needs a doc-level version field —
which would suggest adding `profileSchemaVersion` to the profile doc.
That is NOT the intent. The correct reading is **"at most one
doc-level version field; sub-versions are additive when pin #2 criteria
are met"**. The profile currently has only the `weekScheduleVersion`
sub-version (because `weekSchedule` is read independently and has its
own migration helper). That is the intended steady state — do not add
a `profileSchemaVersion` field "to comply".

## When to bump

> If any reader CANNOT correctly read old data without a migration
> step, bump the version.

- Adding a new optional field with a default value → **do not bump**.
  Existing readers default the field; new readers see the value when
  present.
- Renaming a required field, even with backward-compat read code →
  **bump**, because the read code IS the migration step. The bump
  makes the migration discoverable.
- Removing a deprecated field after a coexistence period → **bump**.
  The breaking moment is removal, not addition.
- Schema parsers running in `passthrough`/`extend` mode reading data
  written by an older client → **do not bump**. Forward-compat tolerance
  is not a migration.

## Worked example — v1 → v2 (`programSchemaVersion`)

The v1→v2 bump landed because `ScheduledRunDay` gained four
required fields (`id`, `date`, `weekKey`, `status`) that no v1
reader could synthesise without help. `migrateScheduledRunDay()` in
`migrations.ts` is the helper: it derives the missing fields from
`weekStart + dayIndex + templateId + completed`, and the bump from
`programSchemaVersion: 1` to `2` is what tells `migrateProgramState()`
that the legacy shape may be present and the helper is needed. Once
the version field hits `2`, the helper short-circuits via reference
equality and the runtime cost is zero.

## Forward compatibility — when the rule kicks in

We currently have no Zod / runtype / io-ts parsers in either client or
Cloud Functions; client-side reads are TypeScript-interface-typed and
CFs use ad-hoc validators (`functions/lib/validatePlanPayload.js`,
`functions/profileSanitizer.js`). RP4c pin #1 ("parsers MUST use
`passthrough`/`extend`") is forward-looking — it applies the moment we
adopt a schema parser library. If you are wiring one in: configure
permissive (`passthrough`/`extend`) mode by default; never `strict` for
Firestore-read paths.

## Server validator obligations

Cloud Functions that accept versioned payloads MUST cross-check the
declared version against the actual payload shape. If a client declares
`programSchemaVersion: 2` but sends a v3-only field, or declares `3`
but omits a v3-required field, reject with
`HttpsError("invalid-argument", ...)`. The client claim is a hint; the
server is the authority.

**Status (2026-05-24):** `functions/lib/validatePlanPayload.js` checks
that `programSchemaVersion` and `weekScheduleVersion` are present and
numeric, but does NOT yet cross-check declared version against payload
shape. This gap is acceptable while we are still on v2 only. It MUST
be closed as the first step of any v2→v3 work.

## Process gate

Every PR that touches a versioned doc shape should answer one
question, surfaced via `.github/PULL_REQUEST_TEMPLATE.md`:

> Does this change require a migration helper? If yes, bump the
> relevant `CURRENT_*_VERSION` constant + add an entry to
> `migrations.ts`.

The checkbox is advisory, not CI-blocking — reviewers catch the cases
where the author answers wrong. The point is to force the question
into the author's mind at PR-write time.

## Cross-cutting

- **RP1c dual-write:** during the ≥4-week v2/v3 dual-write window,
  no new field can be "required for v3 but unwritable by v2 clients".
  Wait until the off-ramp gate (≥4 weeks at <1% divergence + min-
  client-version bump) before dropping v2 support or adding such a
  field.
- **A1c re-auth:** version bumps are not destructive payment actions,
  so they do not trigger the A1c re-auth gate. Migration writes
  triggered by lazy-on-read are user-initiated reads, not destructive
  account changes.
- **R1A account deletion:** versioned docs are deleted by the executor
  by document path, not by version field. Versioning does not change
  the deletion inventory.
