import { useCallback, useState } from "react";

/**
 * Whether content is arriving to take a placeholder's place (Pol1): true
 * once `loading` has been true and is false now, until the arrival has
 * been shown (`onArrived`, which `ArrivalFade` calls when its fade ends).
 * Content that was ready the first time it rendered (a cache, a return to
 * the page) never arrives, and nor does content shown again later, such
 * as the Analytics overview on the way back from one of its pages: a tab
 * or view switch is the most frequent thing in the app and does not
 * animate (PageShell). A new load arms it again.
 *
 * React's adjust-state-while-rendering pattern, so the answer is right on
 * the very render that swaps the placeholder out.
 */
export function useArrivedAfterLoading(loading: boolean): {
  arrived: boolean;
  onArrived: () => void;
} {
  const [sawLoading, setSawLoading] = useState(loading);
  const [shown, setShown] = useState(false);
  if (loading && !sawLoading) setSawLoading(true);
  if (loading && shown) setShown(false);
  const onArrived = useCallback(() => setShown(true), []);
  return { arrived: sawLoading && !loading && !shown, onArrived };
}
