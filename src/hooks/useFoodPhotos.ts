/**
 * Resolves the diary's on-device meal photos (Food9).
 *
 * The photo for a meal lives on THIS phone or nowhere — there is no
 * Firestore field to read it from, because a device-local file cannot
 * be described by a doc field that is true on every device. So the
 * timeline asks the store which of the meals currently on screen have a
 * photo here, and gets back displayable srcs keyed by meal id.
 *
 * A meal absent from the map is the ordinary case, not a failure: it
 * may have been logged by text, captured on another device, or aged out
 * of the 90-day window. Its row stays a compact text row with the
 * macros intact.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  resolveFoodPhotoSrcs,
  subscribeFoodPhotos,
} from "@/lib/foodPhotoStore";

export function useFoodPhotos(mealIds: string[]): Record<string, string> {
  const { user } = useAuth();
  const uid = user?.uid;
  const [srcs, setSrcs] = useState<Record<string, string>>({});

  /* A capture writes no Firestore field, so no snapshot re-render
     announces it. The store tells us instead — without this, a photo
     saved just after its meal doc would not appear until something
     unrelated changed the day's meal set. */
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeFoodPhotos(() => setRevision((r) => r + 1)), []);

  // Object URLs (the web shim's Blob branch) leak unless revoked. Held
  // in a ref so the revoke runs on the NEXT resolve as well as unmount,
  // not just when the component goes away.
  const objectUrls = useRef<string[]>([]);
  const revoke = () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current = [];
  };

  // A stable dependency: the identity of `mealIds` changes on every
  // render of the parent, but the SET of ids only changes when the day's
  // logs do — re-resolving on identity alone would re-read every file
  // on every keystroke elsewhere on the page.
  const key = mealIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    let cancelled = false;

    /* Resolution is async even in the empty cases (signed out, or a day
       with no logs). Clearing synchronously here would be a setState in
       an effect body — a cascading render the lint rule exists to stop —
       and the microtask it costs instead is invisible. */
    void (async () => {
      const next =
        uid && ids.length > 0 ? await resolveFoodPhotoSrcs(uid, ids) : {};
      if (cancelled) {
        // Lost the race to a newer resolve: revoke what we just made
        // rather than leaking it, and let the winner own the state.
        for (const url of Object.values(next)) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        }
        return;
      }
      revoke();
      objectUrls.current = Object.values(next).filter((u) =>
        u.startsWith("blob:")
      );
      setSrcs(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, key, revision]);

  useEffect(() => revoke, []);

  return srcs;
}
