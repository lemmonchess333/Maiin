import { useCallback, useState, useSyncExternalStore } from "react";
import { readString, writeString } from "@/lib/localStore";

function hasVisitedHome(uid: string | null): boolean {
  return uid !== null && readString(`tropos-home-visited:${uid}`) === "1";
}

/* The accounts whose first Home visit was in this open of the app. That
   visit leads to the first session and its finish screen's questions, so
   Home's own later asks wait for the next time the app is opened: brought
   back from the background, or launched again. */
const firstVisitThisOpen = new Set<string>();
const listeners = new Set<() => void>();
let leftTheApp = false;
function notify() {
  for (const listener of listeners) listener();
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      leftTheApp = true;
      return;
    }
    if (!leftTheApp) return;
    leftTheApp = false;
    if (firstVisitThisOpen.size === 0) return;
    firstVisitThisOpen.clear();
    notify();
  });
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot the visit marker at entry, then write it after Home settles.
 * The current visit never becomes a prior visit just because it settled.
 * `firstVisitThisOpen` stays true, across Home's later mounts, until the
 * app is next opened after the account's first visit. */
export function usePriorHomeVisit(uid: string | null): {
  hadPriorVisit: boolean;
  markVisited: () => void;
  firstVisitThisOpen: boolean;
} {
  const [snapshot, setSnapshot] = useState(() => ({
    uid,
    seen: hasVisitedHome(uid),
  }));
  if (snapshot.uid !== uid) {
    setSnapshot({ uid, seen: hasVisitedHome(uid) });
  }
  const heldThisOpen = useSyncExternalStore(
    subscribe,
    () => uid !== null && firstVisitThisOpen.has(uid),
    () => false
  );
  const markVisited = useCallback(() => {
    if (uid === null) return;
    if (!hasVisitedHome(uid) && !firstVisitThisOpen.has(uid)) {
      firstVisitThisOpen.add(uid);
      notify();
    }
    writeString(`tropos-home-visited:${uid}`, "1");
  }, [uid]);
  return {
    hadPriorVisit: snapshot.uid === uid && snapshot.seen,
    markVisited,
    firstVisitThisOpen: heldThisOpen,
  };
}
