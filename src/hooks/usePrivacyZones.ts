import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import type { PrivacyZone } from '@/lib/privacyZones';

export function usePrivacyZones() {
  const { user } = useAuth();
  const [zones, setZones] = useState<PrivacyZone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setZones([]); setLoading(false); return; }

    const ref = collection(db, 'users', user.uid, 'privacyZones');
    const unsub = onSnapshot(ref, (snap) => {
      const result: PrivacyZone[] = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || 'Zone',
        lat: d.data().lat,
        lon: d.data().lon,
        radiusMeters: d.data().radiusMeters || 500,
      }));
      setZones(result);
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [user]);

  const addZone = useCallback(async (zone: Omit<PrivacyZone, 'id'>) => {
    if (!user) return;
    await addDoc(collection(db, 'users', user.uid, 'privacyZones'), {
      ...zone,
      createdAt: serverTimestamp(),
    });
  }, [user]);

  const removeZone = useCallback(async (zoneId: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'privacyZones', zoneId));
  }, [user]);

  return { zones, loading, addZone, removeZone };
}
