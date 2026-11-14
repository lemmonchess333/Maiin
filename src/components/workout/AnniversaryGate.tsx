import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import RevealBoundary from "@/components/RevealBoundary";
import { lazyRetry } from "@/lib/lazyRetry";
import {
  anniversariesAfter,
  markAnniversaryShown,
  type DueAnniversary,
} from "@/lib/anniversaryStore";
import type { FinishedSession } from "@/lib/anniversaries";
import type { SavedRun } from "@/lib/savedRuns";

/* The reveal loads only when an anniversary is due: almost no finish has
   one. A chunk that fails to load is no reason to reload the page under
   the person. */
const AnniversaryReveal = lazyRetry(() => import("./AnniversaryReveal"), {
  reloadOnChunkError: false,
});

/**
 * An earned anniversary's place (App1 Q58): mounted by both finish
 * screens once the session is saved, it works out what the session
 * earned (`anniversariesAfter`) and shows each due anniversary full
 * screen, one after another, recording each as shown once it has drawn.
 *
 * Part of the finish, not an app-open surface: it is not routed through
 * the surface coordinator (ADR-0004), whose one blocking surface an
 * app-open could drop it, and a dropped anniversary would come back only
 * at the next finish. It waits while one of the finish screen's own
 * sheets is open (`held`). Drawn into the document's body, as the league
 * and medal reveals are, so no page margin cuts the stage short.
 */
export default function AnniversaryGate({
  uid,
  session,
  startDay,
  runs,
  held = false,
}: {
  uid: string;
  /** The saved session; null until it is saved. */
  session: FinishedSession | null;
  startDay: string | null;
  /** Every saved run, when the finish screen already holds them. */
  runs?: readonly SavedRun[] | null;
  held?: boolean;
}) {
  const [due, setDue] = useState<DueAnniversary[]>([]);

  /* Once a saved session, and never again for it on this screen; the
     account's marks keep it from being shown twice anywhere. Not
     cancelled when the inputs move (a run list arriving is the same
     history), only when the screen goes. */
  const checked = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!session || checked.current === session.id) return;
    checked.current = session.id;
    void anniversariesAfter(uid, session, { startDay, runs }).then((found) => {
      if (mounted.current) setDue(found);
    });
  }, [uid, session, startDay, runs]);

  const current = held ? null : (due[0] ?? null);

  const shown = useCallback(() => {
    if (current) void markAnniversaryShown(uid, current.kind, current.day);
  }, [uid, current]);

  const done = useCallback(() => {
    setDue((list) => list.slice(1));
  }, []);

  return createPortal(
    <AnimatePresence>
      {current && (
        <RevealBoundary key={current.kind} onError={done}>
          <Suspense fallback={null}>
            <AnniversaryReveal
              anniversary={current}
              onShown={shown}
              onDone={done}
            />
          </Suspense>
        </RevealBoundary>
      )}
    </AnimatePresence>,
    document.body
  );
}
