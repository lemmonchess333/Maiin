/**
 * One account's progress photos: the days they fall on, the decrypted
 * images the page has opened, and the add, delete and move actions.
 *
 * Scoped to one uid for its whole life. The caller remounts it (a `key`)
 * when the account changes, so nothing loaded for one account can paint
 * over another's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteProgressPhoto,
  groupByDay,
  loadCheckInPoses,
  loadProgressPhotos,
  moveProgressPhotos,
  readProgressPhoto,
  resolvePhotos,
  uploadProgressPhoto,
  type Pose,
  type ProgressPhoto,
  type StoredProgressPhoto,
} from "@/lib/progressPhotos";
import { track } from "@/lib/historyAnalytics";
import { logger } from "@/lib/logger";

function toStored(photo: ProgressPhoto): StoredProgressPhoto {
  return {
    id: photo.id,
    storagePath: photo.storagePath,
    iv: photo.iv,
    ...(photo.encryptionVersion !== undefined
      ? { encryptionVersion: photo.encryptionVersion }
      : {}),
    ...(photo.encryptionKey !== undefined
      ? { encryptionKey: photo.encryptionKey }
      : {}),
    date: photo.date,
    pose: photo.pose,
    createdAt: photo.addedAt,
  };
}

export function useProgressPhotos(uid: string) {
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  /* null until the first read lands, so the page can tell "loading"
     from "no photos". */
  const [stored, setStored] = useState<StoredProgressPhoto[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [legacyPoses, setLegacyPoses] = useState<ReadonlyMap<string, Pose>>(
    () => new Map()
  );
  /** Object URLs for the decrypted images, by photo id. */
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  const [decrypting, setDecrypting] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  /** The decrypted images themselves, for sharing. */
  const imagesRef = useRef(new Map<string, Blob>());
  /** Photos decrypted or being decrypted, so none is fetched twice. */
  const startedRef = useRef(new Set<string>());

  // Revoke every object URL on unmount. The cleanup runs once, so it
  // reads the latest map through a ref.
  const urlsRef = useRef(urls);
  useEffect(() => {
    urlsRef.current = urls;
  }, [urls]);
  useEffect(
    () => () => {
      Object.values(urlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  useEffect(() => {
    void (async () => {
      try {
        const [rows, poses] = await Promise.all([
          loadProgressPhotos(uid),
          // Older photos' slots only. Without them each still shows, as
          // a front photo.
          loadCheckInPoses(uid).catch((err) => {
            logger.error("[ProgressPhotos] check-in read failed:", err);
            return new Map<string, Pose>();
          }),
        ]);
        if (!activeRef.current) return;
        setLegacyPoses(poses);
        setStored(rows);
      } catch (err) {
        logger.error("[ProgressPhotos] photo read failed:", err);
        if (!activeRef.current) return;
        setStored((prev) => prev ?? []);
        setLoadFailed(true);
      }
    })();
  }, [uid]);

  const days = useMemo(
    () => groupByDay(resolvePhotos(stored ?? [], legacyPoses)),
    [stored, legacyPoses]
  );

  const showImage = useCallback((id: string, image: Blob) => {
    imagesRef.current.set(id, image);
    const url = URL.createObjectURL(image);
    setUrls((prev) => ({ ...prev, [id]: url }));
  }, []);

  /** Decrypt these photos, one at a time, skipping any already done. */
  const ensureDecrypted = useCallback(
    (photos: readonly ProgressPhoto[]) => {
      const todo = photos.filter((p) => !startedRef.current.has(p.id));
      if (todo.length === 0) return;
      todo.forEach((p) => startedRef.current.add(p.id));
      setDecrypting((prev) => new Set([...prev, ...todo.map((p) => p.id)]));
      void (async () => {
        for (const photo of todo) {
          try {
            const image = await readProgressPhoto(uid, photo);
            if (!activeRef.current) return;
            showImage(photo.id, image);
          } catch (err) {
            logger.error("[ProgressPhotos] decrypt failed:", err);
            // Tried again the next time it is shown.
            startedRef.current.delete(photo.id);
          } finally {
            if (activeRef.current) {
              setDecrypting((prev) => {
                const next = new Set(prev);
                next.delete(photo.id);
                return next;
              });
            }
          }
        }
      })();
    },
    [uid, showImage]
  );

  const forget = useCallback((ids: readonly string[]) => {
    const gone = new Set(ids);
    setStored((prev) => (prev ?? []).filter((p) => !gone.has(p.id)));
    setUrls((prev) => {
      const next = { ...prev };
      for (const id of gone) {
        if (next[id]) URL.revokeObjectURL(next[id]);
        delete next[id];
      }
      return next;
    });
    for (const id of gone) {
      imagesRef.current.delete(id);
      startedRef.current.delete(id);
    }
  }, []);

  /** Delete a photo, file and document. Throws if either fails. */
  const remove = useCallback(
    async (photo: ProgressPhoto) => {
      await deleteProgressPhoto(uid, photo);
      if (!activeRef.current) return;
      forget([photo.id]);
      track("history_progress_photo_deleted", { pose: photo.pose });
    },
    [uid, forget]
  );

  /**
   * Upload a photo for a day and pose. Replacing one deletes the old
   * photo once the new one is saved; if that delete fails the old photo
   * stays on the day, where it can still be deleted. Throws with a
   * message fit to show when the upload fails.
   */
  const add = useCallback(
    async (
      file: File,
      where: { date: string; pose: Pose },
      replacing?: ProgressPhoto
    ) => {
      const { photo, image } = await uploadProgressPhoto(uid, file, where);
      if (!activeRef.current) return;
      startedRef.current.add(photo.id);
      showImage(photo.id, image);
      setStored((prev) => [toStored(photo), ...(prev ?? [])]);
      track("history_progress_photo_added", { pose: where.pose });
      if (replacing) {
        try {
          await deleteProgressPhoto(uid, replacing);
          if (activeRef.current) forget([replacing.id]);
        } catch (err) {
          logger.error("[ProgressPhotos] replaced photo not deleted:", err);
        }
      }
    },
    [uid, showImage, forget]
  );

  /** Move photos to another day. */
  const move = useCallback(
    async (photos: readonly ProgressPhoto[], date: string) => {
      await moveProgressPhotos(uid, photos, date);
      if (!activeRef.current) return;
      const poses = new Map(photos.map((p) => [p.id, p.pose]));
      setStored((prev) =>
        (prev ?? []).map((p) =>
          poses.has(p.id) ? { ...p, date, pose: poses.get(p.id) } : p
        )
      );
    },
    [uid]
  );

  /** The decrypted image of a photo, for sharing. */
  const imageFor = useCallback(
    async (photo: ProgressPhoto): Promise<Blob> => {
      const cached = imagesRef.current.get(photo.id);
      if (cached) return cached;
      const image = await readProgressPhoto(uid, photo);
      if (activeRef.current && !startedRef.current.has(photo.id)) {
        startedRef.current.add(photo.id);
        showImage(photo.id, image);
      }
      return image;
    },
    [uid, showImage]
  );

  return {
    loading: stored === null,
    loadFailed,
    days,
    urls,
    decrypting,
    ensureDecrypted,
    add,
    remove,
    move,
    imageFor,
  };
}
