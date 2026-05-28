import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  onSnapshot,
  Timestamp,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { addDocGuarded, updateDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isVolumeEligible } from "@/lib/runStatsEligibility";

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
      logger.error("useShoes snapshot error:", err);
      setError(err);
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const addShoe = async (name: string, brand: string, maxKm: number = 600) => {
    if (!user) return;
    const ref = collection(db, "users", user.uid, "shoes");
    await addDocGuarded(ref, {
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
    await updateDocGuarded(ref, { retired: true, isDefault: false });
  };

  const setDefault = async (shoeId: string) => {
    if (!user) return;
    // Unset all others
    for (const s of shoes) {
      if (s.isDefault && s.id !== shoeId) {
        await updateDocGuarded(doc(db, "users", user.uid, "shoes", s.id), { isDefault: false });
      }
    }
    await updateDocGuarded(doc(db, "users", user.uid, "shoes", shoeId), { isDefault: true });
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

    await updateDocGuarded(doc(db, "users", user.uid, "shoes", shoeId), updates);

    // Return alert status
    if (pct >= 1.0 && !shoe.alert100Shown) return "replace";
    if (pct >= 0.85 && !shoe.alert85Shown) return "warning";
    return null;
  };

  const activeShoes = shoes.filter((s) => !s.retired);
  const defaultShoe = activeShoes.find((s) => s.isDefault) ?? activeShoes[0] ?? null;

  /**
   * Recompute every shoe's totalKm from the user's actual run history.
   *
   * Pre-launch beta exposed a class of drift: the mileage accumulator only
   * fired when `runConfig.shoeId` was explicitly set in RunSetupModal, so
   * any run started from the default shoe silently kept mileage at zero.
   * RunSummary now persists a top-level `shoeId` on every run doc, which
   * gives us a clean reference to rebuild totals from scratch.
   *
   * This reconciler:
   *   1. Reads every run under `users/{uid}/runs`.
   *   2. Sums `distance / 1000` keyed by the run's `shoeId` (falls back to
   *      the CURRENT default for runs saved before the field existed — an
   *      imperfect best guess, but better than leaving them unattributed).
   *   3. Writes all active shoe totals in one atomic batch, also resetting
   *      `alert85Shown` / `alert100Shown` so the next run with the shoe
   *      can re-trigger the replacement toast if it re-crosses a threshold.
   *
   * Retired shoes are left untouched — historical totals preserved.
   */
  const reconcileMileageFromRuns = useCallback(async () => {
    if (!user) return { updated: 0, totalRuns: 0 };

    const runsSnap = await getDocs(collection(db, "users", user.uid, "runs"));
    const currentDefaultId = defaultShoe?.id ?? null;

    const kmByShoe = new Map<string, number>();
    for (const d of runsSnap.docs) {
      const data = d.data() as {
        isInvalid?: boolean;
        savedAnyway?: boolean;
        distance?: number;
        duration?: number;
        shoeId?: string | null;
        runConfig?: { shoeId?: string };
      };
      // P0.5: skip saved-anyway / isInvalid runs so shoe mileage
      // doesn't include the misclick volume. Pre-fix this only
      // gated on `distance > 0`, which let a fat-fingered
      // 20km/0:08 "too-fast" save inflate the shoe by 20km and
      // trigger the replacement-prompt at 85%/100% prematurely.
      if (!isVolumeEligible(data)) continue;
      const distanceMeters = typeof data.distance === "number" ? data.distance : 0;
      if (distanceMeters <= 0) continue;

      const resolvedId =
        data.shoeId ?? data.runConfig?.shoeId ?? currentDefaultId ?? null;
      if (!resolvedId) continue;

      kmByShoe.set(
        resolvedId,
        (kmByShoe.get(resolvedId) ?? 0) + distanceMeters / 1000,
      );
    }

    const batch = writeBatch(db);
    for (const shoe of activeShoes) {
      const total = Math.round((kmByShoe.get(shoe.id) ?? 0) * 10) / 10;
      const pct = shoe.maxKm > 0 ? total / shoe.maxKm : 0;
      batch.update(doc(db, "users", user.uid, "shoes", shoe.id), {
        totalKm: total,
        alert85Shown: pct >= 0.85,
        alert100Shown: pct >= 1.0,
      });
    }
    await batch.commit();

    return { updated: activeShoes.length, totalRuns: runsSnap.size };
  }, [user, activeShoes, defaultShoe]);

  return {
    shoes,
    activeShoes,
    defaultShoe,
    loading,
    error,
    addShoe,
    retireShoe,
    setDefault,
    updateMileage,
    reconcileMileageFromRuns,
  };
}
