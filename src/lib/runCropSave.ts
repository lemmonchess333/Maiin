/**
 * Saving a cropped run: the run's figures and its shoe's distance in one
 * transaction, so a shoe never keeps kilometres a run no longer has (the
 * 28 November audit, #3593: a crop left the shoe's mileage as it was).
 *
 * Read in the transaction, not from the page's copy: the run's distance
 * before the crop, its shoe and that shoe's total, so two phones cropping
 * or tagging at once cannot add or take the same kilometres twice. The
 * shoe moves by the difference the crop made, by the rule the shoe picker
 * (`runShoe.ts`) and the mileage recount (`useShoes`) share: only a run
 * that counts toward distance, and only an active shoe.
 *
 * What the server derives from a run's track, its credits to challenges,
 * the community goal and lifetime distance, its segment efforts and its
 * post's figures, follows from onRunUpdated (`functions/lib/runCorrections.js`).
 *
 * A transaction needs the server: a crop made offline fails and says so,
 * where the queue would have replayed it against a total read before it.
 */
import { deleteField, doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { stripUndefined } from "@/lib/firestoreGuards";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import type { CroppedRunStats } from "@/lib/runCrop";

function roundTenth(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}

const finite = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/** The run as it counts toward distance, from a stored document. */
function countedMetres(run: Record<string, unknown>): number {
  const counted = isVolumeEligible({
    distance: finite(run.distance),
    duration: finite(run.duration),
    isInvalid: run.isInvalid === true,
    savedAnyway: run.savedAnyway === true,
  });
  return counted ? finite(run.distance) : 0;
}

/** What `saveCroppedRun` wrote, for the toast and the tests. */
export interface CroppedRunSaved {
  /** Kilometres the run's shoe moved by: negative when it lost some. */
  shoeKm: number;
  /** The run's heart-rate summary was removed with the crop. */
  heartRateRemoved: boolean;
}

export async function saveCroppedRun(
  uid: string,
  runId: string,
  cropped: CroppedRunStats
): Promise<CroppedRunSaved> {
  const runRef = doc(db, "users", uid, "runs", runId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(runRef);
    if (!snap.exists()) throw new Error("The run to crop is not saved.");
    const before = snap.data() as Record<string, unknown>;

    const shoeId =
      typeof before.shoeId === "string" && before.shoeId ? before.shoeId : null;
    const shoeRef = shoeId ? doc(db, "users", uid, "shoes", shoeId) : null;
    const shoe = shoeRef ? await tx.get(shoeRef) : null;

    const deltaKm =
      (countedMetres({
        ...before,
        distance: cropped.distance,
        duration: cropped.duration,
      }) -
        countedMetres(before)) /
      1000;
    const heartRateRemoved = before.heartRate != null;

    // Stripped as the guarded writes strip: Firestore refuses undefined.
    tx.update(
      runRef,
      stripUndefined({
        points: cropped.points,
        distance: cropped.distance,
        duration: cropped.duration,
        avgPace: cropped.avgPace,
        splits: cropped.splits,
        elevationGain: cropped.elevationGain,
        calories: cropped.calories,
        bestEfforts: cropped.bestEfforts,
        routePreview: cropped.routePreview,
        lapSplits:
          cropped.lapSplits.length > 0 ? cropped.lapSplits : deleteField(),
        ...(heartRateRemoved ? { heartRate: deleteField() } : {}),
        ...(cropped.workPortion !== undefined
          ? { workPortion: cropped.workPortion }
          : {}),
      })
    );

    let shoeKm = 0;
    const shoeData = shoe?.exists()
      ? (shoe.data() as Record<string, unknown>)
      : null;
    if (shoeRef && shoeData && shoeData.retired !== true && deltaKm !== 0) {
      const total = roundTenth(finite(shoeData.totalKm) + deltaKm);
      const maxKm = finite(shoeData.maxKm);
      const pct = maxKm > 0 ? total / maxKm : 0;
      tx.update(
        shoeRef,
        deltaKm < 0
          ? // Below a line again, the warning may come back when it is
            // crossed, as when the picker takes a run off a shoe.
            {
              totalKm: total,
              alert85Shown: pct >= 0.85,
              alert100Shown: pct >= 1,
            }
          : { totalKm: total }
      );
      shoeKm = total - finite(shoeData.totalKm);
    }
    return { shoeKm, heartRateRemoved };
  });
}
