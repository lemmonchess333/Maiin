import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { addDocGuarded, deleteDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import type { PrivacyZone } from "@/lib/privacyZones";

export function usePrivacyZones() {
  const uid = useUid();
  const [snapshot, setSnapshot] = useState<{
    uid: string | null;
    zones: PrivacyZone[];
    loading: boolean;
    error: boolean;
  }>({ uid: null, zones: [], loading: true, error: false });
  // Never expose a previous account's zones while its successor is loading.
  const current = snapshot.uid === uid;
  const zones = current ? snapshot.zones : [];
  const loading = !!uid && (!current || snapshot.loading);
  const error = !uid || (current && snapshot.error);

  useEffect(() => {
    if (!uid) return;
    let active = true;

    const ref = collection(db, "users", uid, "privacyZones");
    const unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        const result: PrivacyZone[] = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "Zone",
          lat: d.data().lat,
          lon: d.data().lon,
          radiusMeters: d.data().radiusMeters || 500,
        }));
        if (active)
          setSnapshot({
            uid,
            zones: result,
            // A cold empty cache is not evidence that no zones are configured.
            // Coordinate sharing waits for a server-confirmed snapshot, also
            // when offline; cached zones remain visible in Settings.
            loading:
              !snap.metadata ||
              snap.metadata.fromCache ||
              snap.metadata.hasPendingWrites,
            error: false,
          });
      },
      () => {
        if (active)
          setSnapshot({ uid, zones: [], loading: false, error: true });
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [uid]);

  const addZone = useCallback(
    async (zone: Omit<PrivacyZone, "id">) => {
      if (!uid) return;
      await addDocGuarded(collection(db, "users", uid, "privacyZones"), {
        ...zone,
        createdAt: serverTimestamp(),
      });
    },
    [uid]
  );

  const removeZone = useCallback(
    async (zoneId: string) => {
      if (!uid) return;
      await deleteDocGuarded(doc(db, "users", uid, "privacyZones", zoneId));
    },
    [uid]
  );

  return { zones, loading, error, addZone, removeZone };
}
