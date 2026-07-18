# High-ROI Programme/Social v2 — critical evaluation + implementation plan

**Source:** operator handout (2026-07-17, evening). **Evaluated against
`main` @ `23102491`** (which already includes today's SOCIAL-FOCUS-01
and PROGRAM-ADAPT-01 merges — the handout was drafted before they
landed, so two of its slices describe work that is now on main).

**Deploy context (GATE 0):** issue #1636 (unprovisioned
`RESEND_API_KEY`) still strands every Functions deploy — latest
`deploy-functions` run is a failure. Rule for every slice below: no
new Functions-dependent behaviour until the operator fixes #1636.
Held PRs #1642 (route planning), #1646 (check-in rules tightening)
already encode this discipline.

## Slice-by-slice verdicts

| Slice                            | Verdict                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR 1 SOCIAL-HOME-01              | **BUILD** (largest slice)               | Real IA problem: `/social` leads with a follow-feed most users don't have, Circles buried; `Social.tsx` ~1,900 lines. Client-only.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PR 2 CIRCLE-INVITE-ACTIVATION-01 | **BUILD** (partially shipped)           | The weekly pulse ("N of M focusing this week") ALREADY renders in Circle detail (SOCIAL-FOCUS-01, #1643). Remaining: post-create invite hand-off + one-member "Your Circle is ready" state. Client-only.                                                                                                                                                                                                                                                                                                                                               |
| PR 3 PROGRAM-ADAPT-01            | **SHIPPED** (#1648) with deltas         | Merged via the pre-session chooser (per the earlier, fuller PROGRAM-ADAPT-01 contract) instead of this handout's SessionCommandCard overflow. Loads use the deload weight rule (parity-pinned to `applyDeload`); progression/failure/plateau fully skipped (`logExercise` never runs); variant persisted on the private doc; no reason collected. **One real gap this handout adds: the in-flight variant is not persisted in the workout DRAFT** — a mid-session app kill restores logs but the caller re-defaults to "full". Follow-up: PR 3b below. |
| PR 4 PROGRAM-CIRCLE-01           | **BUILD** with a constraint             | Train-together hand-offs are client + existing `createGoalSpace` callable (deployed long ago — allowed). The optional race event NAME touches `raceGoal` writes: client-side writes are fine, but the Functions `profileSanitizer` allow-list addition CANNOT reach production until #1636 is fixed — ship the client path + the sanitizer change together, flag that server-written regeneration paths drop the field until the next successful deploy.                                                                                               |
| PR 5 CIRCLE-SESSION-01           | **BUILD**                               | `session_completed` is client-writable under current rules (allowlisted kind); explicit post-session share with bounded note, never auto. Client-only.                                                                                                                                                                                                                                                                                                                                                                                                 |
| PR 6 PROGRAM-DELOAD-01           | **HOLD** (documented only)              | Correct per its own text: an idempotent programme command belongs in `applyProgramCommand` (Functions) — undeployable until #1636. Do not build a stale client-side whole-program overwrite in the meantime.                                                                                                                                                                                                                                                                                                                                           |
| LATER SOCIAL-FOCUS-01            | **SHIPPED** (#1643 + #1645; #1646 held) | Went further than this handout's sketch: server-owned deterministic weekly check-in + closed enum + backing loop + generic notification. "Do not smuggle focus into free-text" holds (closed enum field, fence + rules). The rules tightening is the held #1646, gated exactly on the deploy health this handout demands.                                                                                                                                                                                                                              |

## Sequencing

1. **This doc** (own PR — the evaluation is the shared reference).
2. **PR 1** SOCIAL-HOME-01 — Together-first IA + decomposition.
3. **PR 2** invite activation (small, builds on PR 1's Together view).
4. **PR 3b** Easier-today draft-variant persistence (small).
5. **PR 4** plan→Circle hand-offs (client + sanitizer flag).
6. **PR 5** post-session Circle share.
7. **PR 6 + anything Functions-new**: after #1636 is resolved and the
   held PRs (#1642, #1646) unhold.

## PR 1 design constraints (from the handout, kept verbatim where locked)

- Title stays "Social". Tabs become **Together | Feed** (Together
  default). Search + notifications move to the header; People becomes
  a lazily-opened search surface. Legacy `?tab=` params (feed /
  community / people and sub-tab values) must keep resolving.
- Together = active Circle first (detail loads for at most the
  FEATURED Circle — never one listener per Circle; list cards render
  from summaries), one useful action, then Spaces / Challenges /
  legacy Crews below. Legacy Crew banner above the nav is removed.
- True cold start asks what support would help (Strength Block /
  Race / Nutrition Consistency / Private Progress / Hybrid) — mapping
  onto the existing launch templates + private journey, not a new
  taxonomy.
- Feed source picker collapses to a compact menu; the "Tropos is
  quiet right now" dead end routes to a real action instead.
- 393px first viewport must show the active Circle (or the cold-start
  selector). Light + dark captures required.
- Decompose `Social.tsx` into focused view components; hooks move
  into the views that use them so hidden surfaces don't fetch.
  Distinguish load failure from an empty Circle list.
- Report the Firestore reads each Social view opens (before/after).

## Standing privacy fences (apply to every slice)

Circle payloads never carry exercises, loads, sets, volume, distance,
pace, routes, GPS, weight, calories, macros, photos, health/illness
reasons, or recovery state. The programmatic fence is
`checkEventPayload` + the Firestore rules field allowlist; PR 4/5
prefills are limited to type, title, target date, cadence, and the
user-entered race event name.
