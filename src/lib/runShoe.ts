/**
 * Assigning or changing the running shoe on a saved run.
 *
 * Updates `users/{uid}/runs/{runId}.shoeId` and reconciles the mileage on the
 * affected active shoes in one atomic Firestore batch so shoe totals stay in
 * sync when a runner tags an imported GPX/TCX run or corrects a mis-attributed
 * session. Retired shoes keep their historical mileage untouched.
 */
import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  flushQueue,
  pendingDocumentWrites,
  queueDurableWrite,
} from "@/lib/offlineQueue";
import type { Shoe } from "@/hooks/useShoes";

export type ShoeMileageAlert = "warning" | "replace" | null;

export interface AssignRunShoeOptions {
  /** Shoe currently stored on the run, or null when unassigned. */
  previousShoeId: string | null;
  /** New shoe to assign, or null to clear the assignment. */
  nextShoeId: string | null;
  /** Run distance in metres. */
  distanceMeters: number;
  /** False for invalid / saved-anyway runs that should not change mileage. */
  volumeEligible: boolean;
  /** Current shoe roster for the runner. */
  shoes: readonly Shoe[];
}

function roundTenth(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}

/**
 * Persists a run’s shoe assignment and atomically adjusts mileage on affected
 * active shoes. If the run itself is still waiting in the offline queue, the
 * shoe assignment is queued behind it without touching Firestore yet.
 */
export async function assignRunShoe(
  uid: string,
  runId: string,
  options: AssignRunShoeOptions
): Promise<ShoeMileageAlert> {
  const { previousShoeId, nextShoeId, distanceMeters, volumeEligible, shoes } =
    options;
  if (previousShoeId === nextShoeId) return null;

  const runsPath = `users/${uid}/runs`;
  if (
    pendingDocumentWrites(uid, runsPath).some((entry) => entry.id === runId)
  ) {
    queueDurableWrite(uid, runsPath, runId, { shoeId: nextShoeId }, true);
    if (navigator.onLine) void flushQueue(db, uid).catch(() => {});
    return null;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid, "runs", runId), { shoeId: nextShoeId });

  let alert: ShoeMileageAlert = null;
  const deltaKm =
    volumeEligible && Number.isFinite(distanceMeters) && distanceMeters > 0
      ? distanceMeters / 1000
      : 0;

  if (deltaKm > 0) {
    const prevShoe = previousShoeId
      ? shoes.find((s) => s.id === previousShoeId && !s.retired)
      : undefined;
    if (prevShoe) {
      const nextTotal = roundTenth(prevShoe.totalKm - deltaKm);
      const pct = prevShoe.maxKm > 0 ? nextTotal / prevShoe.maxKm : 0;
      batch.update(doc(db, "users", uid, "shoes", prevShoe.id), {
        totalKm: nextTotal,
        alert85Shown: pct >= 0.85,
        alert100Shown: pct >= 1.0,
      });
    }

    const nextShoe = nextShoeId
      ? shoes.find((s) => s.id === nextShoeId && !s.retired)
      : undefined;
    if (nextShoe) {
      const nextTotal = roundTenth(nextShoe.totalKm + deltaKm);
      const pct = nextShoe.maxKm > 0 ? nextTotal / nextShoe.maxKm : 0;
      const updates: Record<string, number | boolean> = {
        totalKm: nextTotal,
      };
      if (pct >= 0.85 && !nextShoe.alert85Shown) updates.alert85Shown = true;
      if (pct >= 1.0 && !nextShoe.alert100Shown) updates.alert100Shown = true;
      batch.update(doc(db, "users", uid, "shoes", nextShoe.id), updates);

      if (pct >= 1.0 && !nextShoe.alert100Shown) {
        alert = "replace";
      } else if (pct >= 0.85 && !nextShoe.alert85Shown) {
        alert = "warning";
      }
    }
  }

  await batch.commit();
  return alert;
}
