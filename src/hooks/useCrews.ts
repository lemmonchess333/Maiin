import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, orderBy, doc, setDoc, deleteDoc,
  addDoc, serverTimestamp, increment, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface Crew {
  id: string;
  name: string;
  description: string;
  icon: string;
  memberCount: number;
  leaderboardMetric: string;
  type: 'default' | 'custom';
  createdAt: unknown;
  createdBy: string;
}

const DEFAULT_CREWS: Omit<Crew, 'id' | 'memberCount' | 'createdAt'>[] = [
  { name: 'Hybrid Athletes', description: 'Lift and run — best of both worlds', icon: 'dumbbell', leaderboardMetric: 'hybrid_score', type: 'default', createdBy: 'system' },
  { name: 'Runners', description: 'Road, trail, track — all distances welcome', icon: 'footprints', leaderboardMetric: 'total_km', type: 'default', createdBy: 'system' },
  { name: 'Lifters', description: 'Strength, power, and muscle', icon: 'dumbbell', leaderboardMetric: 'total_volume', type: 'default', createdBy: 'system' },
  { name: 'General Fitness', description: 'Stay active, stay healthy', icon: 'star', leaderboardMetric: 'workout_count', type: 'default', createdBy: 'system' },
];

export function useCrews() {
  const { user, profile, updateProfile } = useAuth();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const currentCrewId = profile?.crewId;

  const fetchCrews = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'groups'), orderBy('memberCount', 'desc')));
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Crew));

      // Seed defaults if no default crews exist
      const hasDefaults = list.some(c => c.type === 'default');
      if (!hasDefaults) {
        for (const crew of DEFAULT_CREWS) {
          await addDoc(collection(db, 'groups'), {
            ...crew,
            memberCount: 0,
            createdAt: serverTimestamp(),
          });
        }
        const snap2 = await getDocs(query(collection(db, 'groups'), orderBy('memberCount', 'desc')));
        list = snap2.docs.map(d => ({ id: d.id, ...d.data() } as Crew));
      }

      setCrews(list);
    } catch (e) {
      console.error('Failed to fetch crews:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const load = async () => { await fetchCrews(); };
    load();
  }, [fetchCrews]);

  const joinCrew = useCallback(async (crewId: string) => {
    if (!user?.uid) return;

    // Leave current crew first (one crew per user)
    if (currentCrewId && currentCrewId !== crewId) {
      await deleteDoc(doc(db, 'groups', currentCrewId, 'members', user.uid));
      await updateDoc(doc(db, 'groups', currentCrewId), { memberCount: increment(-1) });
      setCrews(prev => prev.map(c => c.id === currentCrewId ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c));
    }

    await setDoc(doc(db, 'groups', crewId, 'members', user.uid), {
      joinedAt: serverTimestamp(),
      displayName: profile?.displayName || 'Athlete',
    });
    await updateDoc(doc(db, 'groups', crewId), { memberCount: increment(1) });
    await updateProfile({ crewId });
    setCrews(prev => prev.map(c => c.id === crewId ? { ...c, memberCount: c.memberCount + 1 } : c));
  }, [user, currentCrewId, profile?.displayName, updateProfile]);

  const leaveCrew = useCallback(async () => {
    if (!user?.uid || !currentCrewId) return;
    await deleteDoc(doc(db, 'groups', currentCrewId, 'members', user.uid));
    await updateDoc(doc(db, 'groups', currentCrewId), { memberCount: increment(-1) });
    await updateProfile({ crewId: undefined });
    setCrews(prev => prev.map(c => c.id === currentCrewId ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c));
  }, [user, currentCrewId, updateProfile]);

  const createCrew = useCallback(async (name: string, description: string, icon: string) => {
    if (!user?.uid) return;

    // Leave current crew
    if (currentCrewId) {
      await deleteDoc(doc(db, 'groups', currentCrewId, 'members', user.uid));
      await updateDoc(doc(db, 'groups', currentCrewId), { memberCount: increment(-1) });
    }

    const ref = await addDoc(collection(db, 'groups'), {
      name, description, icon,
      memberCount: 1,
      leaderboardMetric: 'workout_count',
      type: 'custom',
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });
    await setDoc(doc(db, 'groups', ref.id, 'members', user.uid), {
      joinedAt: serverTimestamp(),
      displayName: profile?.displayName || 'Athlete',
    });
    await updateProfile({ crewId: ref.id });
    const newCrew: Crew = { id: ref.id, name, description, icon, memberCount: 1, leaderboardMetric: 'workout_count', type: 'custom', createdAt: new Date(), createdBy: user.uid };
    setCrews(prev => [newCrew, ...prev]);
  }, [user, currentCrewId, profile?.displayName, updateProfile]);

  const currentCrew = crews.find(c => c.id === currentCrewId) || null;
  const defaultCrews = crews.filter(c => c.type === 'default');
  const customCrews = crews.filter(c => c.type === 'custom');

  return { crews, defaultCrews, customCrews, currentCrew, currentCrewId, loading, joinCrew, leaveCrew, createCrew };
}
