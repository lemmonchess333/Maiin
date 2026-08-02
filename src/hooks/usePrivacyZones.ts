import { useState, useEffect, useCallback } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import type { PrivacyZone } from "@/lib/privacyZones";

export function usePrivacyZones() {
  const uid = useUid();
  const [zones, setZones] = useState<PrivacyZone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      const reset = () => {
        setZones([]);
        setLoading(false);
      };
      reset();
      return;
    }

    const ref = collection(db, "users", uid, "privacyZones");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const result: PrivacyZone[] = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "Zone",
          lat: d.data().lat,
          lon: d.data().lon,
          radiusMeters: d.data().radiusMeters || 500,
        }));
        setZones(result);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
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
      await deleteDoc(doc(db, "users", uid, "privacyZones", zoneId));
    },
    [uid]
  );

  return { zones, loading, addZone, removeZone };
}
