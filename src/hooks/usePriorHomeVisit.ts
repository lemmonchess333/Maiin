import { useCallback, useState } from "react";
import { readString, writeString } from "@/lib/localStore";

function hasVisitedHome(uid: string | null): boolean {
  return uid !== null && readString(`tropos-home-visited:${uid}`) === "1";
}

/** Snapshot the visit marker at entry, then write it after Home settles.
 * The current visit never becomes a prior visit just because it settled. */
export function usePriorHomeVisit(uid: string | null): {
  hadPriorVisit: boolean;
  markVisited: () => void;
} {
  const [snapshot, setSnapshot] = useState(() => ({
    uid,
    seen: hasVisitedHome(uid),
  }));
  if (snapshot.uid !== uid) {
    setSnapshot({ uid, seen: hasVisitedHome(uid) });
  }
  const markVisited = useCallback(() => {
    if (uid !== null) writeString(`tropos-home-visited:${uid}`, "1");
  }, [uid]);
  return {
    hadPriorVisit: snapshot.uid === uid && snapshot.seen,
    markVisited,
  };
}
