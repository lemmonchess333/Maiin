import { Suspense, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import RevealBoundary from "@/components/RevealBoundary";
import { useSurface } from "@/components/SurfaceCoordinatorProvider";
import { lazyRetry } from "@/lib/lazyRetry";
import { useLeagueResult } from "./useLeagueResult";

/* The reveal and its confetti load only when a result is to be revealed:
   most visits to Social have none. A chunk that fails to load is no reason
   to reload the page under the person. */
const LeagueResultReveal = lazyRetry(() => import("./LeagueResultReveal"), {
  reloadOnChunkError: false,
});

/** Where the result sits among the blocking surfaces (ADR-0004): just
 *  above a new medal, since a week's result is Monday's news and a medal
 *  keeps for a fortnight. One blocking surface an app-open, so the other
 *  waits for the next visit rather than stacking on it. */
export const LEAGUE_RESULT_PRIORITY = 21;

/**
 * The league result's place on Social (Soc15 call 3), mounted by the
 * Social page next to the medal reveal and built from the same machinery:
 * a tier-4 surface (`league-result`) in the app-wide coordinator, a chunk
 * loaded only when there is a result, a boundary that lets a failed load
 * close quietly, and a record on the device once it has drawn. Never over
 * Home (rewards wait to be opened there), never over another sheet, and
 * once per result per device. Keyed by its caller on the account.
 *
 * Drawn into the document's body, as the photo viewer is: inside the
 * page, the page's own layer kept the stage under the floating tab bar,
 * whose top showed at the foot of the screen in the emulator captures.
 */
export default function LeagueResultGate({
  uid,
  held = false,
}: {
  uid: string;
  /** One of the page's own overlays is open: wait until it closes. */
  held?: boolean;
}) {
  const { result, markRevealed, clear } = useLeagueResult(uid);
  const surface = useSurface({
    id: "league-result",
    priority: LEAGUE_RESULT_PRIORITY,
    eligible: result !== null && !held,
  });
  const showing = surface.active && result !== null;
  const { dismiss } = surface;

  const shown = useCallback(() => {
    if (result) markRevealed(result);
  }, [result, markRevealed]);

  const done = useCallback(() => {
    dismiss();
    clear();
  }, [dismiss, clear]);

  return createPortal(
    <AnimatePresence>
      {showing && result && (
        <RevealBoundary key={result.weekKey} onError={done}>
          <Suspense fallback={null}>
            <LeagueResultReveal result={result} onShown={shown} onDone={done} />
          </Suspense>
        </RevealBoundary>
      )}
    </AnimatePresence>,
    document.body
  );
}
