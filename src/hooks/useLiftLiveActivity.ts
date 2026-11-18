import { useEffect, useEffectEvent } from "react";
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";
import type { LiftCardSession } from "@/lib/liftLiveActivity";

/** The lift card's module, loaded once and on a phone only: the web never
 *  fetches the Live Activity code. */
let module: Promise<typeof import("@/lib/liftLiveActivity")> | null = null;
function liftCard() {
  module ??= import("@/lib/liftLiveActivity");
  return module;
}

/**
 * Keeps the lift's Live Activity on what the workout shows (Wid2 call 2):
 * the session and the set the cursor is on, from the first set to the
 * finish. Null, or leaving the workout, takes the card away at once (Wid2
 * call 4). A rest reaches the card from the rest band (`restOutside.ts`).
 */
export function useLiftLiveActivity(card: LiftCardSession | null): void {
  // By value: the workout builds the card afresh on every render.
  const key = card === null ? "" : JSON.stringify(card);
  const show = useEffectEvent(() => {
    if (!isNativePlatform()) return;
    void liftCard()
      .then(({ showLiftSession }) => showLiftSession(card))
      .catch((err) => logger.warn("[liftLiveActivity] not shown", err));
  });
  useEffect(() => {
    show();
  }, [key]);
  useEffect(
    () => () => {
      if (!isNativePlatform()) return;
      void liftCard()
        .then(({ showLiftSession }) => showLiftSession(null))
        .catch(() => {});
    },
    []
  );
}
