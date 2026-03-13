import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc, addDoc, serverTimestamp, increment, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface Group {
  id: string;
  name: string;
  description: string;
  icon: string;
  memberCount: number;
  createdAt: unknown;
  createdBy: string;
}

const DEFAULT_GROUPS: Omit<Group, 'id' | 'memberCount' | 'createdAt'>[] = [
  { name: 'Running Club', description: 'For runners of all levels', icon: 'footprints', createdBy: 'system' },
  { name: 'Lifting Crew', description: 'For strength training enthusiasts', icon: 'dumbbell', createdBy: 'system' },
  { name: 'Hybrid Athletes', description: 'For people who lift and run', icon: 'zap', createdBy: 'system' },
  { name: 'Eating Well', description: 'Nutrition-focused community', icon: 'salad', createdBy: 'system' },
  { name: '5K & 10K Runners', description: 'Distance running group', icon: 'medal', createdBy: 'system' },
  { name: 'Powerlifting', description: 'Squat, bench, deadlift focus', icon: 'dumbbell', createdBy: 'system' },
  { name: 'Bodybuilding', description: 'Hypertrophy and physique', icon: 'mirror', createdBy: 'system' },
  { name: 'Marathon Training', description: 'Long distance preparation', icon: 'flag', createdBy: 'system' },
  { name: 'Weight Loss Journey', description: 'Supportive weight loss community', icon: 'target', createdBy: 'system' },
  { name: 'Morning Workout Gang', description: 'Early bird fitness', icon: 'sunrise', createdBy: 'system' },
];

export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroupIds, setMyGroupIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'groups'), orderBy('memberCount', 'desc')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Group));

      // If no groups exist, seed defaults
      if (list.length === 0) {
        for (const g of DEFAULT_GROUPS) {
          await addDoc(collection(db, 'groups'), {
            ...g,
            memberCount: 0,
            createdAt: serverTimestamp(),
          });
        }
        // Re-fetch after seeding
        const snap2 = await getDocs(query(collection(db, 'groups'), orderBy('memberCount', 'desc')));
        setGroups(snap2.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
      } else {
        setGroups(list);
      }
    } catch (e) {
      console.error('Failed to fetch groups:', e);
    }
  }, []);

  const fetchMyGroups = useCallback(async () => {
    if (!user?.uid) return;
    try {
      // Query all groups where user is a member
      const groupsSnap = await getDocs(collection(db, 'groups'));
      const ids = new Set<string>();
      for (const g of groupsSnap.docs) {
        const memberDoc = await getDocs(query(collection(db, 'groups', g.id, 'members'), where('__name__', '==', user.uid)));
        if (!memberDoc.empty) ids.add(g.id);
      }
      setMyGroupIds(ids);
    } catch (e) {
      console.error('Failed to fetch my groups:', e);
    }
  }, [user?.uid]);

  useEffect(() => {
    Promise.all([fetchGroups(), fetchMyGroups()]).then(() => setLoading(false));
  }, [fetchGroups, fetchMyGroups]);

  const joinGroup = useCallback(async (groupId: string) => {
    if (!user?.uid) return;
    await setDoc(doc(db, 'groups', groupId, 'members', user.uid), {
      joinedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(1) });
    setMyGroupIds(prev => new Set([...prev, groupId]));
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, memberCount: g.memberCount + 1 } : g));
  }, [user?.uid]);

  const leaveGroup = useCallback(async (groupId: string) => {
    if (!user?.uid) return;
    await deleteDoc(doc(db, 'groups', groupId, 'members', user.uid));
    await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(-1) });
    setMyGroupIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, memberCount: Math.max(0, g.memberCount - 1) } : g));
  }, [user?.uid]);

  const createGroup = useCallback(async (name: string, description: string, icon: string) => {
    if (!user?.uid) return;
    const ref = await addDoc(collection(db, 'groups'), {
      name,
      description,
      icon,
      memberCount: 1,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });
    await setDoc(doc(db, 'groups', ref.id, 'members', user.uid), {
      joinedAt: serverTimestamp(),
    });
    const newGroup: Group = { id: ref.id, name, description, icon, memberCount: 1, createdAt: new Date(), createdBy: user.uid };
    setGroups(prev => [newGroup, ...prev]);
    setMyGroupIds(prev => new Set([...prev, ref.id]));
  }, [user?.uid]);

  return { groups, myGroupIds, loading, joinGroup, leaveGroup, createGroup };
}
