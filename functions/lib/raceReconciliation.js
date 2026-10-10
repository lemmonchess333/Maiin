/**
 * Race-day reconciliation decisions (PR-L L1–L4).
 *
 * PURE module — no Firestore, no firebase-functions. Moved verbatim
 * from index.js, which runs them from two transports:
 *   - dailyRaceReconciliationSweep (daily 04:00 UTC): the race no-show
 *     (L1), the recovery exit (L3) and the no-show return to freeform
 *     (L4), through `_runDailyRaceReconciliationForUser`;
 *   - onRunCreated: the recovery entry a saved race run triggers (L2),
 *     through `_maybeWriteRecoveryEntryForRun`.
 * index.js needs firebase-admin initialised to load, so a test outside
 * functions/ (the training simulator) requires the rules that run from
 * here. index.js keeps thin `_`-prefixed aliases + test-surface exports,
 * so every existing call site and test import is unchanged.
 */
const { utcDateString, parseUtcDate } = require("./dateUtils");
const { resolveRecoveryExit } = require("./runModeResolution");
const raceDayCompletion = require("./raceDayCompletion");

const _utcDateString = utcDateString;
const _parseUtcDate = parseUtcDate;
const _hasStrictRaceMatch = raceDayCompletion.hasStrictRaceMatch;
const PLANNED_RACE_DISTANCE_METERS_FNS =
  raceDayCompletion.PLANNED_RACE_DISTANCE_METERS;

const RACE_NO_SHOW_GRACE_DAYS = 3;
const RECOVERY_EXIT_GRACE_DAYS = 7;
// A no-show race auto-returns the user to freeform this many days after the
// race date (well after the +3d no-show flip), so they're not stranded in
// race_prep on a race that never happened (#1109).
const NO_SHOW_EXIT_GRACE_DAYS = 14;

// Recovery weeks by distance — from ./lib/raceDayCompletion.js. The server
// derives `recoveryEndDate` from this AND uses that date as the identity
// check for "which race did recovery come from", so a silent drift against
// the scheduler's `recoveryWeeksForDistance` mis-identifies the completed
// race. Pinned by golden fixtures.
const RECOVERY_WEEKS_BY_DISTANCE_FNS =
  raceDayCompletion.RECOVERY_WEEKS_BY_DISTANCE;

/** Locate the plan's race-day runDay.
 *
 *  Primary match is exact `date === raceDate` — the common case where the race
 *  falls on the user's long-run weekday (long-run slots prefer the weekend, and
 *  races are usually weekends, so the race template's date equals targetDate).
 *
 *  Fallback: the week's `type: "race"` day. Retained for plans PERSISTED before
 *  the RUN-M2 generator fix (#1115): the old generator placed the race template
 *  on the long-run slot's weekday (`runScheduler.ts`), so for a race on a
 *  NON-long-run weekday the runDay's `date` was the long-run day, not the race
 *  date — exact date-match missed it and the no-show / recovery-entry
 *  reconciliation silently never fired (#1128). There is exactly one race day
 *  per plan, so the fallback is unambiguous. Conservative by construction: the
 *  date match wins whenever it exists, so weekend-race behaviour is unchanged.
 *
 *  As of RUN-M2 (#1115) the generator places the race day ON `targetDate`, so
 *  the PRIMARY date-match is now the normal path for freshly-generated plans;
 *  the `type:"race"` fallback only catches legacy plans generated before it. */
function _findRaceDayRunDay(runDays, raceDate) {
  const days = runDays || [];
  return (
    days.find((rd) => rd && rd.date === raceDate) ||
    days.find((rd) => rd && rd.type === "race") ||
    null
  );
}

/** Whether the race-no-show pass needs to fetch the bounded
 *  saved-run query for this user. Pure; called BEFORE the read so
 *  we can skip the I/O when grace / mode / status disqualify the
 *  user. */
function _needsRaceNoShowEvaluation(profile, programState, nowMs) {
  if (!profile || profile.runMode !== "race_prep") return false;
  const runPlan = (programState && programState.runPlan) || null;
  if (!runPlan || !runPlan.raceGoal) return false;
  const raceDate = runPlan.raceGoal.targetDate;
  if (typeof raceDate !== "string") return false;
  const raceDayRunDay = _findRaceDayRunDay(
    programState && programState.runDays,
    raceDate
  );
  if (!raceDayRunDay || raceDayRunDay.status !== "planned") return false;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysPast = Math.floor(
    (nowMs - _parseUtcDate(raceDate).getTime()) / dayMs
  );
  return daysPast > RACE_NO_SHOW_GRACE_DAYS;
}

/** Pure decision function — given the user's profile, programState,
 *  the bounded saved-runs-for-race-date list, and `now`, returns
 *  the Firestore update payload to apply (or null when nothing
 *  needs to change). Idempotent — a second call with the post-write
 *  state returns null. Easy to test exhaustively without Firestore. */
function _decideReconciliationActions(
  profile,
  programState,
  savedRunsForRaceDate,
  nowMs
) {
  const updatePayload = {};
  // Run9 3b — a second payload for the user PROFILE doc (runMode + raceGoal),
  // written alongside the programState payload when recovery-exit materializes.
  let profilePayload = null;
  let noShowWritten = false;
  let recoveryCleared = false;
  let noShowCleared = false;
  let orphanedGoalCleared = false;

  // ── L1 decision ────────────────────────────────────────────────
  if (_needsRaceNoShowEvaluation(profile, programState, nowMs)) {
    const runPlan = programState.runPlan;
    const raceDate = runPlan.raceGoal.targetDate;
    const raceDayRunDay = _findRaceDayRunDay(programState.runDays, raceDate);
    const plannedDistance =
      PLANNED_RACE_DISTANCE_METERS_FNS[runPlan.raceGoal.distance] || 0;
    if (!_hasStrictRaceMatch(savedRunsForRaceDate, plannedDistance)) {
      const updatedRunDays = programState.runDays.map((rd) =>
        rd === raceDayRunDay ? { ...rd, status: "race_no_show" } : rd
      );
      updatePayload.runDays = updatedRunDays;
      noShowWritten = true;
    }
  }

  // ── L3 decision ────────────────────────────────────────────────
  const runPlan = (programState && programState.runPlan) || null;
  if (
    runPlan &&
    runPlan.phase === "recovery" &&
    typeof runPlan.recoveryEndDate === "string"
  ) {
    const exitMs = _parseUtcDate(runPlan.recoveryEndDate).getTime();
    const graceEndMs = exitMs + RECOVERY_EXIT_GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (nowMs >= graceEndMs) {
      // Firestore `set(merge: true)` does a *recursive* merge of
      // nested maps — fields omitted from `runPlan` inside the
      // payload remain untouched in storage. JS-side `delete cleared.phase`
      // is therefore a no-op at the wire level and the user stays
      // stuck in `phase: 'recovery'` forever. Writing explicit
      // `null` overwrites the stored value; downstream readers all
      // check `phase === 'recovery'` and `typeof recoveryEndDate
      // === 'string'`, both of which falsify against null.
      const clearedRunPlan = {
        ...runPlan,
        phase: null,
        recoveryEndDate: null,
      };

      // Run9 3b — recovery EXIT materialization. Mirror the client's
      // resolveRecoveryExit (the single, unit-tested source of the rule) so
      // non-React clients (Apple Watch, future native) converge to the same
      // state. The completed race is identifiable from the recovery anchor:
      // recovery-entry derived `recoveryEndDate = raceDate +
      // recoveryWeeks(distance)·7`, so a current raceGoal that reproduces the
      // stored recoveryEndDate IS the race recovery was entered for
      // (raceGoalIsCompletedRace). A current raceGoal that doesn't reproduce
      // it is a newer race set during recovery → kept (stay race_prep).
      // The user's CURRENT declared race lives on the PROFILE; the runPlan
      // still carries the race recovery was ENTERED for (its anchor reproduces
      // the stored recoveryEndDate). Reading currentRaceGoal from the runPlan
      // made a newer race set during recovery INVISIBLE — when the client's
      // in-recovery branch preserves the stale (completed) runPlan.raceGoal,
      // the sweep saw "same race" and DELETED the successor, dropping the user
      // to freeform (C-RUN). Read the current race from the profile so a
      // successor is preserved; anchor the completed race off the runPlan.
      const currentRaceGoal = (profile && profile.raceGoal) || null;
      const recoveryRaceGoal = runPlan.raceGoal || null;
      const anchorMatches =
        !!recoveryRaceGoal &&
        _recoveryEndDateForRace(recoveryRaceGoal) === runPlan.recoveryEndDate;
      const completedRaceGoal = anchorMatches ? recoveryRaceGoal : null;
      const exit = resolveRecoveryExit({ currentRaceGoal, completedRaceGoal });

      if (exit.runMode === "freeform") {
        // Completed race, no successor → freeform. Clear raceGoal on BOTH the
        // runPlan (server deciders read programState.runPlan.raceGoal) and the
        // profile (materialization invariant: a raceGoal clear co-writes
        // runMode). Mirrors skipRecoveryEarly's freeform branch — minus the
        // runPlan/runDays teardown, which is a client UI concern (the freeform
        // hero ignores stale runDays; the no-show / recovery-entry deciders
        // gate on raceGoal/runMode, both now falsified) and isn't safely
        // expressible via a recursive merge write.
        clearedRunPlan.raceGoal = null;
        profilePayload = { runMode: "freeform", raceGoal: null };
      } else {
        // Newer race set during recovery → stay race_prep with the SUCCESSOR.
        // Materialize it onto the runPlan too: the runPlan.raceGoal mirror may
        // be stale (the client's in-recovery branch preserves the completed
        // race), so without this the no-show / recovery-entry deciders would
        // keep acting on the already-completed race. The full plan is
        // regenerated client-side once phase is cleared. Defensive runMode
        // co-write so a drifted profile.runMode converges.
        clearedRunPlan.raceGoal = currentRaceGoal;
        if (profile && profile.runMode !== exit.runMode) {
          profilePayload = { runMode: exit.runMode };
        }
      }

      updatePayload.runPlan = clearedRunPlan;
      recoveryCleared = true;
    }
  }

  // ── L4 decision (no-show auto-return) ──────────────────────────
  // A no-show race left the user stranded in race_prep on a race that never
  // happened (L1 flips the slot to race_no_show but there was no exit). Once
  // the slot is race_no_show and the race is more than NO_SHOW_EXIT_GRACE_DAYS
  // past, return the user to freeform — or to a successor race they declared in
  // the meantime. Reuses resolveRecoveryExit: the no-show race plays the
  // "resolved race" role, so same-race (no successor) → freeform, a newer
  // declared race → stay race_prep with it (symmetric with L3). (#1109)
  if (
    !recoveryCleared &&
    profile &&
    profile.runMode === "race_prep" &&
    runPlan &&
    runPlan.raceGoal &&
    typeof runPlan.raceGoal.targetDate === "string" &&
    runPlan.phase !== "recovery"
  ) {
    const raceDate = runPlan.raceGoal.targetDate;
    // Use the post-L1 runDays so a slot flipped THIS sweep (function was down
    // past +14d) is seen as race_no_show, not its stale "planned".
    const effectiveRunDays =
      updatePayload.runDays || (programState && programState.runDays) || [];
    const raceDayRunDay = _findRaceDayRunDay(effectiveRunDays, raceDate);
    const dayMs = 24 * 60 * 60 * 1000;
    const daysPast = Math.floor(
      (nowMs - _parseUtcDate(raceDate).getTime()) / dayMs
    );
    if (
      raceDayRunDay &&
      raceDayRunDay.status === "race_no_show" &&
      daysPast > NO_SHOW_EXIT_GRACE_DAYS
    ) {
      const currentRaceGoal = profile.raceGoal || null;
      const exit = resolveRecoveryExit({
        currentRaceGoal,
        completedRaceGoal: runPlan.raceGoal,
      });
      const clearedRunPlan = { ...runPlan };
      if (exit.runMode === "freeform") {
        // No successor → freeform. Clear raceGoal on the runPlan (deciders read
        // it) and co-write the profile (materialization invariant).
        clearedRunPlan.raceGoal = null;
        profilePayload = { runMode: "freeform", raceGoal: null };
      } else {
        // A newer race was declared during the no-show window → keep it.
        clearedRunPlan.raceGoal = currentRaceGoal;
        if (profile.runMode !== exit.runMode) {
          profilePayload = { runMode: exit.runMode };
        }
      }
      updatePayload.runPlan = clearedRunPlan;
      noShowCleared = true;
    }
  }

  // ── Orphaned race goal ─────────────────────────────────────────
  // L1, L3 and L4 all read `runPlan`. The client's rollover keeps a race's
  // plan until they end it, but the plans it dropped before it kept them
  // are gone, and their profiles kept `race_prep` and the finished race with
  // nothing left to end them. So a race-prep profile with no plan returns
  // to free running here, once its race is past both exits above would have
  // taken: the no-show return (L4), and the end of the recovery a finished
  // race would have had plus its grace (L3). A successor race is still
  // ahead, so it is kept. No plan means L1, L3 and L4 have not fired: they
  // all need one.
  const goal = (profile && profile.raceGoal) || null;
  if (
    !runPlan &&
    profile &&
    profile.runMode === "race_prep" &&
    goal &&
    typeof goal.targetDate === "string"
  ) {
    const dayMs = 24 * 60 * 60 * 1000;
    const recoveryEnd = _recoveryEndDateForRace(goal);
    const exitMs = Math.max(
      _parseUtcDate(goal.targetDate).getTime() +
        (NO_SHOW_EXIT_GRACE_DAYS + 1) * dayMs,
      recoveryEnd
        ? _parseUtcDate(recoveryEnd).getTime() +
            RECOVERY_EXIT_GRACE_DAYS * dayMs
        : 0
    );
    if (nowMs >= exitMs) {
      profilePayload = resolveRecoveryExit({
        currentRaceGoal: goal,
        completedRaceGoal: goal,
      });
      orphanedGoalCleared = true;
    }
  }

  if (
    !noShowWritten &&
    !recoveryCleared &&
    !noShowCleared &&
    !orphanedGoalCleared
  ) {
    return {
      payload: null,
      profilePayload: null,
      noShowWritten,
      recoveryCleared,
      noShowCleared,
      orphanedGoalCleared,
    };
  }
  return {
    // The orphaned goal writes the profile alone: there is no plan to change.
    payload: Object.keys(updatePayload).length > 0 ? updatePayload : null,
    profilePayload,
    noShowWritten,
    recoveryCleared,
    noShowCleared,
    orphanedGoalCleared,
  };
}

/** Run9 3b — reconstruct the recovery-end date a given race goal would
 *  produce under the recovery-entry formula (`raceDate +
 *  recoveryWeeks(distance)·7`). Returns null for an unknown distance. Used to
 *  decide whether the current raceGoal is the race recovery was entered for
 *  (anchor match) without storing the completed-race goal separately. */
function _recoveryEndDateForRace(raceGoal) {
  if (!raceGoal || typeof raceGoal.targetDate !== "string") return null;
  const weeks = RECOVERY_WEEKS_BY_DISTANCE_FNS[raceGoal.distance];
  if (typeof weeks !== "number") return null;
  const ms =
    _parseUtcDate(raceGoal.targetDate).getTime() +
    weeks * 7 * 24 * 60 * 60 * 1000;
  return _utcDateString(new Date(ms));
}

/** Pure decision function for the recovery-entry write triggered
 *  by `onRunCreated`. Returns `{ write, payload?, raceDayRunDayId?,
 *  recoveryEndDate? }`. Easy to test exhaustively without Firestore
 *  — same pattern as L1+L3's `_decideReconciliationActions`. */
function _decideRecoveryEntry(profile, programState, savedRun) {
  // Gate 1 — user must be in race_prep mode with a race goal +
  // active runPlan.
  if (!profile || profile.runMode !== "race_prep") {
    return { write: false };
  }
  const runPlan = (programState && programState.runPlan) || null;
  if (!runPlan || !runPlan.raceGoal || !runPlan.raceGoal.targetDate) {
    return { write: false };
  }
  const raceDate = runPlan.raceGoal.targetDate;

  // Gate 2 — saved run must be on the race date. Q1 P4 is strict
  // on date for race claims (no day-late / day-early forgiveness).
  if (!savedRun || savedRun.date !== raceDate) {
    return { write: false };
  }

  // Gates 2b–4 — one predicate, shared with the reconciliation sweep:
  //   2b. reject invalid / "Save anyway" runs (a borked GPS trace the
  //       user explicitly flagged must not trip recovery entry);
  //   3.  saved run must be race-templated (`actualTemplateId` — the
  //       raw-doc field RunSummary writes);
  //   4.  saved run must clear the ≥95% planned-distance bar, with the
  //       Q1 P29 zero-planned fallback.
  // Previously re-derived inline here AND in `_hasStrictRaceMatch`,
  // which is how the two drifted apart from the (dead) lib port.
  if (
    !raceDayCompletion.isStrictRaceRun(
      savedRun,
      raceDayCompletion.plannedDistanceFor(runPlan.raceGoal.distance)
    )
  ) {
    return { write: false };
  }

  // Gate 5 — race-day runDay must exist in the plan.
  const raceDayRunDay = _findRaceDayRunDay(
    programState && programState.runDays,
    raceDate
  );
  if (!raceDayRunDay || !raceDayRunDay.id) {
    return { write: false };
  }

  // Gate 6 — per-race idempotency (Q2 P28). If this runDay's id is
  // already in completedRaces, recovery already entered for this
  // race; no-op even if the user re-logs.
  const completedRaces = Array.isArray(runPlan.completedRaces)
    ? runPlan.completedRaces
    : [];
  if (completedRaces.includes(raceDayRunDay.id)) {
    return { write: false };
  }

  // All gates passed — compute the recovery end date and build the
  // runPlan update. Recovery clock anchors on the race date so the
  // user's countdown reads correctly even if the trigger fires
  // hours after the actual run.
  const distanceKey = runPlan.raceGoal.distance;
  const recoveryWeeks = RECOVERY_WEEKS_BY_DISTANCE_FNS[distanceKey];
  if (typeof recoveryWeeks !== "number") {
    // Unknown distance string — defensive bail. Real values are
    // gated by the onboarding UI; this guard protects against
    // schema drift.
    return { write: false };
  }
  const recoveryEndMs =
    _parseUtcDate(raceDate).getTime() + recoveryWeeks * 7 * 24 * 60 * 60 * 1000;
  const recoveryEndDate = _utcDateString(new Date(recoveryEndMs));

  const updatedRunPlan = {
    ...runPlan,
    phase: "recovery",
    recoveryEndDate,
    completedRaces: [...completedRaces, raceDayRunDay.id],
  };

  return {
    write: true,
    payload: { runPlan: updatedRunPlan },
    raceDayRunDayId: raceDayRunDay.id,
    recoveryEndDate,
  };
}

module.exports = {
  RACE_NO_SHOW_GRACE_DAYS,
  RECOVERY_EXIT_GRACE_DAYS,
  NO_SHOW_EXIT_GRACE_DAYS,
  findRaceDayRunDay: _findRaceDayRunDay,
  needsRaceNoShowEvaluation: _needsRaceNoShowEvaluation,
  decideReconciliationActions: _decideReconciliationActions,
  recoveryEndDateForRace: _recoveryEndDateForRace,
  decideRecoveryEntry: _decideRecoveryEntry,
};
