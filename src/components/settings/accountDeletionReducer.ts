/**
 * Deletion-modal state machine for AccountSection.
 *
 * Extracted from AccountSection.tsx so the transitions are
 * testable in isolation. The component still owns the side
 * effects (Firestore writes, signOut, popups); this module is
 * pure: action in, state out.
 *
 * Phases:
 *   'confirm'           — initial state; user types DELETE.
 *   'deleting'          — first deletion call in flight.
 *   'needs-reauth'      — recent-auth gate (R1A Chunk 2) rejected
 *                         the deletion. User picks a provider.
 *                         failedAttempts: 0 | 1 | 2 — clamped at 2
 *                         so the caller can decide when to fall
 *                         back to the manual-signOut toast.
 *   'reauthenticating'  — provider tap in flight (OAuth popup
 *                         open, or password being submitted).
 *   'retrying'          — auto-retry deletion after successful
 *                         reauth. Distinct from 'deleting' so the
 *                         UI can show different copy.
 *
 * Cancel from any phase → 'confirm' with the DELETE word reset
 * (the side-effect is owned by the component). The reducer just
 * returns to the confirm phase; the caller handles input reset.
 */

import type { SupportedReauthProviderId } from "@/lib/reauth";

export type ModalPhase =
  | { phase: "confirm" }
  | { phase: "deleting" }
  | { phase: "needs-reauth"; failedAttempts: 0 | 1 | 2 }
  | {
      phase: "reauthenticating";
      provider: SupportedReauthProviderId;
      failedAttempts: 0 | 1 | 2;
    }
  | { phase: "retrying" };

export type ModalAction =
  | { type: "DELETE_START" }
  | { type: "REQUIRE_REAUTH" }
  | { type: "REAUTH_START"; provider: SupportedReauthProviderId }
  | { type: "REAUTH_FAIL" }
  | { type: "REAUTH_SUCCESS" }
  | { type: "CANCEL_REAUTH" };

export const initialModalState: ModalPhase = { phase: "confirm" };

export function modalReducer(
  state: ModalPhase,
  action: ModalAction,
): ModalPhase {
  switch (action.type) {
    case "DELETE_START":
      return { phase: "deleting" };
    case "REQUIRE_REAUTH":
      return { phase: "needs-reauth", failedAttempts: 0 };
    case "REAUTH_START":
      /* Only valid transition is from needs-reauth. Ignore stray
         starts from other phases (defensive against double-clicks
         or stale UI events). */
      if (state.phase !== "needs-reauth") return state;
      return {
        phase: "reauthenticating",
        provider: action.provider,
        failedAttempts: state.failedAttempts,
      };
    case "REAUTH_FAIL": {
      if (state.phase !== "reauthenticating") return state;
      /* Clamp at 2 — the 3rd strike is handled by the caller
         BEFORE dispatching, not by progressing the counter. */
      const next = Math.min(state.failedAttempts + 1, 2) as 0 | 1 | 2;
      return { phase: "needs-reauth", failedAttempts: next };
    }
    case "REAUTH_SUCCESS":
      if (state.phase !== "reauthenticating") return state;
      return { phase: "retrying" };
    case "CANCEL_REAUTH":
      return { phase: "confirm" };
    default:
      return state;
  }
}
