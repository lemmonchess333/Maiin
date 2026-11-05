import { Suspense, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import RevealBoundary from "@/components/RevealBoundary";
import { useSurface } from "@/components/SurfaceCoordinatorProvider";
import { lazyRetry } from "@/lib/lazyRetry";
import { useMedalReveal } from "./useMedalReveal";

/* The reveal, its share card and its confetti load only when a medal is
   to be revealed: most visits to Social have none. A chunk that fails to
   load is no reason to reload the page under the person. */
const MedalReveal = lazyRetry(() => import("./MedalReveal"), {
  reloadOnChunkError: false,
});

/** Where the reveal sits among the blocking surfaces (ADR-0004). Social
 *  registers nothing else, and Home's surfaces are not mounted here, so
 *  the number matters only against a surface added later; it takes the
 *  retired badge's place, under every decision. */
export const MEDAL_REVEAL_PRIORITY = 20;

/**
 * The medal reveal's place on Social (Soc15). Mounted by the Social page,
 * so a new medal is revealed on the next visit to Social, Together or the
 * Feed, and never over Home: Home's rule is that rewards wait to be
 * opened there (ADR-0004, 2026-10-02).
 *
 * A tier-4 surface (`medal-reveal`) in the app-wide coordinator, so it is
 * the only blocking surface of its app-open and never opens over another
 * sheet. When another surface has taken the open, the reveal waits for a
 * later one rather than being dropped: the medal stays in the trophy case
 * either way, and within its reveal window a later visit is not a late
 * one.
 *
 * The reveal is recorded on the device once it has drawn, so one closed
 * by leaving the app does not come back, and one that never loaded does.
 * Keyed by its caller on the account (`key={uid}`), so a reveal read for
 * one account is never shown to the next.
 *
 * Drawn into the document's body, as the league result is. Inside the
 * page it was a child of PageShell's `space-y-4`, whose 16 px bottom
 * margin cut the fixed stage short of the screen's foot, and the
 * floating tab bar showed in the strip below it (emulator capture,
 * 5 November 2026).
 */
export default function MedalRevealGate({
  uid,
  held = false,
}: {
  uid: string;
  /** A sheet or overlay the person opened on the page is showing: the
   *  reveal waits until it closes rather than opening over it. The
   *  coordinator never takes away a surface that is open, so this only
   *  keeps one from starting. */
  held?: boolean;
}) {
  const { medal, markRevealed, clear } = useMedalReveal(uid);
  const surface = useSurface({
    id: "medal-reveal",
    priority: MEDAL_REVEAL_PRIORITY,
    eligible: medal !== null && !held,
  });
  const showing = surface.active && medal !== null;
  const { dismiss } = surface;

  const shown = useCallback(() => {
    if (medal) markRevealed(medal);
  }, [medal, markRevealed]);

  const done = useCallback(() => {
    dismiss();
    clear();
  }, [dismiss, clear]);

  return createPortal(
    <AnimatePresence>
      {showing && medal && (
        <RevealBoundary key={medal.challengeId} onError={done}>
          <Suspense fallback={null}>
            <MedalReveal medal={medal} onShown={shown} onDone={done} />
          </Suspense>
        </RevealBoundary>
      )}
    </AnimatePresence>,
    document.body
  );
}
