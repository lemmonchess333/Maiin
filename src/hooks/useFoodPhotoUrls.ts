/**
 * Resolve device-local meal photos for the diary.
 *
 * The Food9 swap moved captures off Firebase Storage and onto the device
 * (`src/lib/foodPhotoStore.ts`), which turns what used to be a synchronous
 * derive — `group.meals.find(m => m.photoUrl)?.photoUrl` — into an async
 * read. This hook absorbs that: give it the meal ids currently on screen,
 * get back a `mealId → data URL` map that fills in as reads land.
 *
 * Two things it deliberately does NOT do:
 *
 *  - It does not read a file per row speculatively. One `readdir` per uid
 *    tells us which meals actually have a photo (the overwhelming majority
 *    of logs — text, barcode, favourites — have none), and only those are
 *    read. Without that, every text row would pay a failed bridge call.
 *
 *  - It does not hand back object URLs. `foodPhotoStore` returns data URLs
 *    precisely so there is no revoke lifecycle to get wrong; the one
 *    revoke precedent in this repo (`ProgressPhotos.tsx`) closes over a
 *    stale map and revokes nothing, which is the bug we are not copying.
 *
 * Results are memoised per uid for the session. A photo is written once
 * and never rewritten, so a cached data URL cannot go stale — only
 * deleted, and the delete paths clear their own entries.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useUid } from "@/lib/auth";
import { listFoodPhotos, readFoodPhotoSrc } from "@/lib/foodPhotoStore";

/** `${uid}:${mealId}` → data URL. Session-lived; survives remounts so
 *  paging back and forth through the diary re-reads nothing. */
const srcCache = new Map<string, string>();
/** uid → the set of meal ids that have a stored photo, from one readdir. */
const indexCache = new Map<string, Promise<Set<string>>>();

function photoIndex(uid: string): Promise<Set<string>> {
  let existing = indexCache.get(uid);
  if (!existing) {
    existing = listFoodPhotos(uid).then(
      (photos) => new Set(photos.map((p) => p.mealId))
    );
    indexCache.set(uid, existing);
  }
  return existing;
}

/** Forget everything cached for a uid — call after deleting photos so a
 *  later render does not serve a data URL for a file that is gone. */
export function invalidateFoodPhotoCache(uid: string, mealId?: string): void {
  indexCache.delete(uid);
  if (mealId) {
    srcCache.delete(`${uid}:${mealId}`);
    return;
  }
  for (const key of [...srcCache.keys()]) {
    if (key.startsWith(`${uid}:`)) srcCache.delete(key);
  }
}

export function useFoodPhotoUrls(
  mealIds: readonly string[]
): Record<string, string> {
  const uid = useUid();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const mountedRef = useRef(true);

  // Stable dependency: the hook is called with a fresh array every
  // render, so depending on the array identity would loop forever.
  const key = useMemo(() => [...mealIds].sort().join(","), [mealIds]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!uid || !key) return;
    let cancelled = false;
    const ids = key.split(",").filter(Boolean);

    void (async () => {
      const seeded: Record<string, string> = {};
      const misses: string[] = [];
      for (const id of ids) {
        const cached = srcCache.get(`${uid}:${id}`);
        if (cached) seeded[id] = cached;
        else misses.push(id);
      }
      if (Object.keys(seeded).length && !cancelled) {
        setUrls((prev) => ({ ...prev, ...seeded }));
      }
      if (!misses.length) return;

      const index = await photoIndex(uid);
      if (cancelled) return;

      for (const id of misses) {
        if (!index.has(id)) continue;
        const src = await readFoodPhotoSrc(uid, id);
        if (cancelled || !mountedRef.current) return;
        if (!src) continue;
        srcCache.set(`${uid}:${id}`, src);
        setUrls((prev) => ({ ...prev, [id]: src }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, key]);

  return urls;
}
