import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { addDocGuarded, deleteDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import type { PrivacyZone } from "@/lib/privacyZones";

function zoneFromData(id: string, data: DocumentData): PrivacyZone {
  return {
    id,
    name: data.name || "Zone",
    lat: data.lat,
    lon: data.lon,
    radiusMeters: data.radiusMeters || 500,
  };
}

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
  /* The last list the server confirmed for this account while this hook
     has been listening. A later snapshot from the cache (the connection
     dropped) does not undo it: nothing newer could have reached this
     device since. */
  const confirmedRef = useRef<{ uid: string; zones: PrivacyZone[] } | null>(
    null
  );

  useEffect(() => {
    if (!uid) return;
    let active = true;

    const ref = collection(db, "users", uid, "privacyZones");
    const unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        const result: PrivacyZone[] = snap.docs.map((d) =>
          zoneFromData(d.id, d.data())
        );
        // A cold empty cache is not evidence that no zones are configured.
        // Coordinate sharing waits for a server-confirmed snapshot, also
        // when offline; cached zones remain visible in Settings.
        const unconfirmed =
          !snap.metadata ||
          snap.metadata.fromCache ||
          snap.metadata.hasPendingWrites;
        if (!active) return;
        if (!unconfirmed) confirmedRef.current = { uid, zones: result };
        setSnapshot({ uid, zones: result, loading: unconfirmed, error: false });
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

  /**
   * The zones a trace must have cut out of it before it is written, as the
   * server has them: the list this listener last had from the server, else
   * a read from the server now. Rejects when neither can be had (offline
   * before the first answer, or the read refused), so the caller writes
   * nothing rather than a trace that may still hold a zone.
   *
   * `zones` above is not enough for that: it is empty before the first
   * snapshot and after a listener error, and a run saved in that window
   * kept its whole trace.
   */
  const confirmZones = useCallback(async (): Promise<PrivacyZone[]> => {
    if (!uid) throw new Error("Not signed in");
    const confirmed = confirmedRef.current;
    if (confirmed?.uid === uid) return confirmed.zones;
    const snap = await getDocsFromServer(
      collection(db, "users", uid, "privacyZones")
    );
    return snap.docs.map((d) => zoneFromData(d.id, d.data()));
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

  return { zones, loading, error, confirmZones, addZone, removeZone };
}
