/**
 * Exhaustive transition tests for the R1A Chunk 4 deletion-modal
 * state machine. Pure reducer + types — no React, no Firebase, no
 * mocks needed.
 *
 * Each test pins one transition. Together they cover:
 *   1. Forward path: confirm → deleting → needs-reauth →
 *      reauthenticating → retrying.
 *   2. Cancel paths: cancel from any reauth phase returns to confirm.
 *   3. Failure cycle: reauthenticating → needs-reauth (with
 *      attempt counter bumped, clamped at 2).
 *   4. Defensive guards: REAUTH_START / REAUTH_SUCCESS / REAUTH_FAIL
 *      from wrong phases are no-ops.
 *   5. Counter preservation: REAUTH_START from needs-reauth carries
 *      failedAttempts into reauthenticating; REAUTH_FAIL increments.
 *
 * If anyone changes a transition, these tests are the source of
 * truth for what's allowed. Update them deliberately.
 */
import { describe, it, expect } from "vitest";
import {
  modalReducer,
  initialModalState,
  type ModalPhase,
} from "../accountDeletionReducer";

describe("modalReducer — initial state", () => {
  it("exports an initial state in the confirm phase", () => {
    expect(initialModalState).toEqual({ phase: "confirm" });
  });
});

describe("modalReducer — forward path", () => {
  it("confirm → DELETE_START → deleting", () => {
    const next = modalReducer({ phase: "confirm" }, { type: "DELETE_START" });
    expect(next).toEqual({ phase: "deleting" });
  });

  it("deleting → REQUIRE_REAUTH → needs-reauth with 0 attempts", () => {
    const next = modalReducer(
      { phase: "deleting" },
      { type: "REQUIRE_REAUTH" },
    );
    expect(next).toEqual({ phase: "needs-reauth", failedAttempts: 0 });
  });

  it("needs-reauth → REAUTH_START → reauthenticating with chosen provider", () => {
    const next = modalReducer(
      { phase: "needs-reauth", failedAttempts: 0 },
      { type: "REAUTH_START", provider: "password" },
    );
    expect(next).toEqual({
      phase: "reauthenticating",
      provider: "password",
      failedAttempts: 0,
    });
  });

  it("reauthenticating → REAUTH_SUCCESS → retrying", () => {
    const next = modalReducer(
      {
        phase: "reauthenticating",
        provider: "google.com",
        failedAttempts: 0,
      },
      { type: "REAUTH_SUCCESS" },
    );
    expect(next).toEqual({ phase: "retrying" });
  });
});

describe("modalReducer — failure cycle", () => {
  it("reauthenticating → REAUTH_FAIL → needs-reauth with attempts=1", () => {
    const next = modalReducer(
      {
        phase: "reauthenticating",
        provider: "password",
        failedAttempts: 0,
      },
      { type: "REAUTH_FAIL" },
    );
    expect(next).toEqual({ phase: "needs-reauth", failedAttempts: 1 });
  });

  it("subsequent REAUTH_FAIL increments to attempts=2", () => {
    /* Caller restarts reauth, fails again. Counter goes 0 → 1 → 2. */
    let state: ModalPhase = { phase: "needs-reauth", failedAttempts: 1 };
    state = modalReducer(state, {
      type: "REAUTH_START",
      provider: "google.com",
    });
    state = modalReducer(state, { type: "REAUTH_FAIL" });
    expect(state).toEqual({ phase: "needs-reauth", failedAttempts: 2 });
  });

  it("REAUTH_FAIL clamps at attempts=2 (3rd-strike fallback handled by caller before dispatch)", () => {
    /* The counter doesn't progress past 2 inside the reducer; the
       3rd failure is detected by the caller's strikeout handler
       BEFORE it dispatches REAUTH_FAIL. This test pins the clamp. */
    let state: ModalPhase = {
      phase: "reauthenticating",
      provider: "apple.com",
      failedAttempts: 2,
    };
    state = modalReducer(state, { type: "REAUTH_FAIL" });
    expect(state).toEqual({ phase: "needs-reauth", failedAttempts: 2 });
  });

  it("REAUTH_START preserves failedAttempts when transitioning needs-reauth → reauthenticating", () => {
    /* User picks a different provider after a failure; counter
       should carry forward so the strikeout fallback fires
       correctly. */
    const next = modalReducer(
      { phase: "needs-reauth", failedAttempts: 1 },
      { type: "REAUTH_START", provider: "apple.com" },
    );
    expect(next).toEqual({
      phase: "reauthenticating",
      provider: "apple.com",
      failedAttempts: 1,
    });
  });
});

describe("modalReducer — cancel paths", () => {
  it("CANCEL_REAUTH from needs-reauth → confirm (counter reset)", () => {
    const next = modalReducer(
      { phase: "needs-reauth", failedAttempts: 2 },
      { type: "CANCEL_REAUTH" },
    );
    expect(next).toEqual({ phase: "confirm" });
  });

  it("CANCEL_REAUTH from reauthenticating → confirm", () => {
    /* In practice the Cancel button is disabled during
       reauthenticating (open popup), but the reducer still
       accepts the transition defensively. */
    const next = modalReducer(
      {
        phase: "reauthenticating",
        provider: "password",
        failedAttempts: 1,
      },
      { type: "CANCEL_REAUTH" },
    );
    expect(next).toEqual({ phase: "confirm" });
  });

  it("CANCEL_REAUTH from confirm is a no-op identity (returns confirm)", () => {
    const next = modalReducer(
      { phase: "confirm" },
      { type: "CANCEL_REAUTH" },
    );
    expect(next).toEqual({ phase: "confirm" });
  });
});

describe("modalReducer — defensive guards", () => {
  it("REAUTH_START from confirm is ignored (wrong phase)", () => {
    /* User somehow dispatches REAUTH_START before the reauth
       flow has started. Should return identity, not transition. */
    const start: ModalPhase = { phase: "confirm" };
    const next = modalReducer(start, {
      type: "REAUTH_START",
      provider: "password",
    });
    expect(next).toBe(start);
  });

  it("REAUTH_START from deleting is ignored", () => {
    const start: ModalPhase = { phase: "deleting" };
    const next = modalReducer(start, {
      type: "REAUTH_START",
      provider: "google.com",
    });
    expect(next).toBe(start);
  });

  it("REAUTH_START from reauthenticating is ignored (double-click defence)", () => {
    /* Race scenario: user double-taps a provider button before
       the disabled state attaches. The second tap should not
       restart the reauth flow with potentially different state. */
    const start: ModalPhase = {
      phase: "reauthenticating",
      provider: "google.com",
      failedAttempts: 0,
    };
    const next = modalReducer(start, {
      type: "REAUTH_START",
      provider: "apple.com",
    });
    expect(next).toBe(start);
  });

  it("REAUTH_SUCCESS from needs-reauth is ignored (wrong phase)", () => {
    /* Caller can't accidentally jump to retrying without going
       through reauthenticating first. */
    const start: ModalPhase = { phase: "needs-reauth", failedAttempts: 0 };
    const next = modalReducer(start, { type: "REAUTH_SUCCESS" });
    expect(next).toBe(start);
  });

  it("REAUTH_FAIL from needs-reauth is ignored (wrong phase)", () => {
    /* The counter only bumps via the failure path through
       reauthenticating. Direct REAUTH_FAIL from needs-reauth
       would skip the in-flight check. */
    const start: ModalPhase = { phase: "needs-reauth", failedAttempts: 0 };
    const next = modalReducer(start, { type: "REAUTH_FAIL" });
    expect(next).toBe(start);
  });

  it("DELETE_START from any phase always transitions to deleting", () => {
    /* DELETE_START is the only action with no phase guard — the
       caller is responsible for only dispatching it from the
       confirm phase (UI ensures via the disabled Delete button). */
    expect(
      modalReducer({ phase: "retrying" }, { type: "DELETE_START" }),
    ).toEqual({ phase: "deleting" });
  });
});

describe("modalReducer — end-to-end sequence", () => {
  it("happy path: confirm → delete → reauth-required → password reauth → retry", () => {
    let state: ModalPhase = initialModalState;
    state = modalReducer(state, { type: "DELETE_START" });
    expect(state.phase).toBe("deleting");

    state = modalReducer(state, { type: "REQUIRE_REAUTH" });
    expect(state).toEqual({ phase: "needs-reauth", failedAttempts: 0 });

    state = modalReducer(state, {
      type: "REAUTH_START",
      provider: "password",
    });
    expect(state).toEqual({
      phase: "reauthenticating",
      provider: "password",
      failedAttempts: 0,
    });

    state = modalReducer(state, { type: "REAUTH_SUCCESS" });
    expect(state).toEqual({ phase: "retrying" });
  });

  it("retry-after-cancel: user gives up reauth, types DELETE again", () => {
    let state: ModalPhase = { phase: "needs-reauth", failedAttempts: 1 };
    state = modalReducer(state, { type: "CANCEL_REAUTH" });
    expect(state).toEqual({ phase: "confirm" });

    /* User types DELETE again — counter is reset (new flow). */
    state = modalReducer(state, { type: "DELETE_START" });
    expect(state).toEqual({ phase: "deleting" });
  });

  it("wrong-password loop: 2 failures, then success", () => {
    let state: ModalPhase = { phase: "needs-reauth", failedAttempts: 0 };

    // Attempt 1: fail
    state = modalReducer(state, {
      type: "REAUTH_START",
      provider: "password",
    });
    state = modalReducer(state, { type: "REAUTH_FAIL" });
    expect(state).toEqual({ phase: "needs-reauth", failedAttempts: 1 });

    // Attempt 2: fail
    state = modalReducer(state, {
      type: "REAUTH_START",
      provider: "password",
    });
    state = modalReducer(state, { type: "REAUTH_FAIL" });
    expect(state).toEqual({ phase: "needs-reauth", failedAttempts: 2 });

    // Attempt 3: success (caller would have short-circuited to
    // strikeout BEFORE this dispatch if 3rd failure)
    state = modalReducer(state, {
      type: "REAUTH_START",
      provider: "password",
    });
    state = modalReducer(state, { type: "REAUTH_SUCCESS" });
    expect(state).toEqual({ phase: "retrying" });
  });
});
