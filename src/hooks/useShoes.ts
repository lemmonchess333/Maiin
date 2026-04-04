import { useState, useEffect } from "react";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export interface Shoe {
  id: string;
  name: string;
  brand: string;
  totalKm: number;
  maxKm: number;
  isDefault: boolean;
  retired: boolean;
  addedAt: Date;
  alert85Shown: boolean;
  alert100Shown: boolean;
}

export function useShoes() {
  const { user } = useAuth();
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      const reset = () => { setShoes([]); setLoading(false); };
      reset();
      return;
    }

    const ref = collection(db, "users", user.uid, "shoes");
    const unsub = onSnapshot(ref, (snap) => {
      setError(null);
      const list: Shoe[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? "",
          brand: data.brand ?? "",
          totalKm: data.totalKm ?? 0,
          maxKm: data.maxKm ?? 600,
          isDefault: data.isDefault ?? false,
          retired: data.retired ?? false,
          addedAt: data.addedAt?.toDate?.() ?? new Date(),
          alert85Shown: data.alert85Shown ?? false,
          alert100Shown: data.alert100Shown ?? false,
        };
      });
      setShoes(list.sort((a, b) => (a.retired ? 1 : 0) - (b.retired ? 1 : 0)));
      setLoading(false);
    }, (err) => {
      console.error("useShoes snapshot error:", err);
      setError(err);
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const addShoe = async (name: string, brand: string, maxKm: number = 600) => {
    if (!user) return;
    const ref = collection(db, "users", user.uid, "shoes");
    await addDoc(ref, {
      name,
      brand,
      totalKm: 0,
      maxKm,
      isDefault: shoes.filter((s) => !s.retired).length === 0,
      retired: false,
      addedAt: Timestamp.now(),
      alert85Shown: false,
      alert100Shown: false,
    });
  };

  const retireShoe = async (shoeId: string) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "shoes", shoeId);
    await updateDoc(ref, { retired: true, isDefault: false });
  };

  const setDefault = async (shoeId: string) => {
    if (!user) return;
    // Unset all others
    for (const s of shoes) {
      if (s.isDefault && s.id !== shoeId) {
        await updateDoc(doc(db, "users", user.uid, "shoes", s.id), { isDefault: false });
      }
    }
    await updateDoc(doc(db, "users", user.uid, "shoes", shoeId), { isDefault: true });
  };

  const updateMileage = async (shoeId: string, addKm: number) => {
    if (!user) return;
    const shoe = shoes.find((s) => s.id === shoeId);
    if (!shoe) return;
    const newTotal = shoe.totalKm + addKm;
    const updates: Record<string, number | boolean> = { totalKm: Math.round(newTotal * 10) / 10 };

    // Alert flags
    const pct = newTotal / shoe.maxKm;
    if (pct >= 0.85 && !shoe.alert85Shown) updates.alert85Shown = true;
    if (pct >= 1.0 && !shoe.alert100Shown) updates.alert100Shown = true;

    await updateDoc(doc(db, "users", user.uid, "shoes", shoeId), updates);

    // Return alert status
    if (pct >= 1.0 && !shoe.alert100Shown) return "replace";
    if (pct >= 0.85 && !shoe.alert85Shown) return "warning";
    return null;
  };

  const activeShoes = shoes.filter((s) => !s.retired);
  const defaultShoe = activeShoes.find((s) => s.isDefault) ?? activeShoes[0] ?? null;

  return { shoes, activeShoes, defaultShoe, loading, error, addShoe, retireShoe, setDefault, updateMileage };
}
