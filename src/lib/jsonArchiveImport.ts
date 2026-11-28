/**
 * Tropos full-account JSON backup restore (round-trip partner to
 * `exportAllDataJSON` in `src/lib/export.ts`).
 *
 * Parses and validates `schemaVersion: 1` archives and restores workouts,
 * runs, meals, and bodyweight logs idempotently via deterministic document
 * IDs (`json-<hash>` for workouts/runs/meals, date-keyed `YYYY-MM-DD` for
 * bodyweight) queued through Tropos's durable offline write queue.
 */
import { Timestamp } from "firebase/firestore";
import {
  commitBulkImportWrites,
  type BulkImportEntry,
  type BulkImportProgress,
} from "@/lib/bulkImportWrite";
import { localDateString } from "@/lib/dateHelpers";
import { matchCatalogExercise } from "@/lib/workoutCsvImport";
import { estimateLiftBurn, estimateRunBurn } from "@/lib/workoutBurn";
import {
  workoutTonnageKg,
  type WorkoutExercise,
  type WorkoutSet,
} from "@/lib/savedWorkouts";
import { runDocument, type FinishedRun } from "@/lib/runCompletion";

export const MAX_ARCHIVE_JSON_BYTES = 25 * 1024 * 1024;
const MAX_ITEMS_PER_DOMAIN = 2000;
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 350;
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type JsonArchiveImportErrorCode =
  | "ARCHIVE_TOO_LARGE"
  | "ARCHIVE_INVALID_JSON"
  | "ARCHIVE_UNSUPPORTED_SCHEMA"
  | "ARCHIVE_EMPTY";

export class JsonArchiveImportError extends Error {
  readonly code: JsonArchiveImportErrorCode;
  constructor(code: JsonArchiveImportErrorCode, message: string) {
    super(message);
    this.name = "JsonArchiveImportError";
    this.code = code;
  }
}

export interface ParseJsonArchiveOptions {
  /** Body weight in kg for calorie burn estimation; defaults to 75 kg. */
  weightKg?: number;
  /** Local "YYYY-MM-DD" upper bound for bodyweight entries. */
  todayKey?: string;
  /** Optional progress callback as write batches commit. */
  onProgress?: (progress: BulkImportProgress) => void;
}

export interface RestoredWorkoutRecord {
  docId: string;
  date: string;
  data: Record<string, unknown>;
}

export interface RestoredRunRecord {
  docId: string;
  date: string;
  data: Record<string, unknown>;
}

export interface RestoredMealRecord {
  docId: string;
  date: string;
  data: Record<string, unknown>;
}

export interface RestoredBodyweightRecord {
  docId: string;
  date: string;
  weightKg: number;
  timestampMs: number;
}

export interface ParsedJsonArchive {
  workouts: RestoredWorkoutRecord[];
  runs: RestoredRunRecord[];
  meals: RestoredMealRecord[];
  bodyweight: RestoredBodyweightRecord[];
  totalItems: number;
}

export interface ImportedJsonArchiveSummary {
  workouts: number;
  runs: number;
  meals: number;
  bodyweight: number;
  totalItems: number;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseValidDayKey(
  value: unknown
): { date: string; noonMs: number } | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const m = DAY_KEY_RE.exec(trimmed);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 12, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return { date: localDateString(dt), noonMs: dt.getTime() };
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function normalizeSetType(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "warmup" || s === "dropset" || s === "failure") return s;
  return "working";
}

function parseWorkouts(
  rawList: unknown,
  bodyweightKg: number,
  explicitWeight: boolean
): RestoredWorkoutRecord[] {
  if (!Array.isArray(rawList)) return [];
  const out: RestoredWorkoutRecord[] = [];

  for (const item of rawList) {
    if (out.length >= MAX_ITEMS_PER_DOMAIN) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const day = parseValidDayKey(rec.date);
    if (!day || !Array.isArray(rec.exercises) || rec.exercises.length === 0) {
      continue;
    }

    const preliminary: WorkoutExercise[] = [];
    let totalSets = 0;

    for (const rawEx of rec.exercises) {
      if (!rawEx || typeof rawEx !== "object") continue;
      const exRec = rawEx as Record<string, unknown>;
      const rawName = typeof exRec.name === "string" ? exRec.name.trim() : "";
      if (!rawName || !Array.isArray(exRec.sets)) continue;

      const matched = matchCatalogExercise(rawName);
      const sets: WorkoutSet[] = [];
      for (const rawSet of exRec.sets) {
        if (!rawSet || typeof rawSet !== "object") continue;
        const sRec = rawSet as Record<string, unknown>;
        const reps = Math.round(finiteNonNegative(sRec.reps));
        if (reps <= 0) continue;
        const weightKg =
          Math.round(finiteNonNegative(sRec.weightKg) * 100) / 100;
        const rawRpe =
          typeof sRec.rpe === "number" &&
          Number.isFinite(sRec.rpe) &&
          sRec.rpe >= 1 &&
          sRec.rpe <= 10
            ? Math.round(sRec.rpe * 2) / 2
            : undefined;
        sets.push({
          setNumber: sets.length + 1,
          reps,
          weightKg,
          type: normalizeSetType(sRec.type),
          ...(rawRpe !== undefined ? { rpe: rawRpe } : {}),
        });
      }

      if (sets.length === 0) continue;
      totalSets += sets.length;
      preliminary.push({
        exerciseId: matched.exerciseId,
        exerciseName: matched.exerciseName,
        category: matched.category,
        sets,
        caloriesBurned: 0,
      });
    }

    if (preliminary.length === 0) continue;

    const durationMinutes = Math.max(10, Math.round(totalSets * 2.5));
    const totalVolume = workoutTonnageKg({ exercises: preliminary });
    const totalCalories = estimateLiftBurn({
      durationMinutes,
      tonnageKg: totalVolume,
      bodyweightKg,
      completedSetCount: totalSets,
    });
    const exercises: WorkoutExercise[] = preliminary.map((ex) => ({
      ...ex,
      caloriesBurned: Math.round(
        (totalCalories * ex.sets.length) / Math.max(1, totalSets)
      ),
    }));

    const fingerprint = [
      "workout",
      day.date,
      exercises
        .map(
          (e) =>
            `${e.exerciseId}:${e.sets.map((s) => `${s.weightKg}x${s.reps}`).join(",")}`
        )
        .join(";"),
    ].join("|");

    out.push({
      docId: `json-${fnv1a32(fingerprint)}`,
      date: day.date,
      data: {
        date: day.date,
        exercises,
        totalCalories,
        totalVolume,
        durationMinutes,
        notes: "Restored from Tropos backup",
        burnContext: { bodyweightKg, inferred: !explicitWeight },
        createdAt: Timestamp.fromMillis(day.noonMs),
      },
    });
  }

  return out;
}

function parseRuns(
  rawList: unknown,
  bodyweightKg: number
): RestoredRunRecord[] {
  if (!Array.isArray(rawList)) return [];
  const out: RestoredRunRecord[] = [];

  for (const item of rawList) {
    if (out.length >= MAX_ITEMS_PER_DOMAIN) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const day = parseValidDayKey(rec.date);
    if (!day) continue;

    const distanceKm = finiteNonNegative(rec.distanceKm);
    const distance = Math.round(distanceKm * 1000);
    const durationSec = Math.round(finiteNonNegative(rec.durationSec));
    if (distance <= 0 || durationSec <= 0) continue;

    const rawPace = finiteNonNegative(rec.avgPaceSecPerKm);
    const avgPaceSeconds =
      rawPace > 0 ? Math.round(rawPace) : Math.round(durationSec / distanceKm);
    const elevationGain = Math.round(finiteNonNegative(rec.elevationGainM));
    const activityType =
      typeof rec.activityType === "string" && rec.activityType.trim()
        ? rec.activityType.trim()
        : "freerun";
    const place =
      rec.place === "treadmill" ? ("treadmill" as const) : undefined;
    const calories = estimateRunBurn({ distanceKm, bodyweightKg });

    const finishedRun: FinishedRun = {
      points: [],
      startedAt: day.noonMs,
      recordingStartedAt: day.noonMs,
      finishedAt: day.noonMs + durationSec * 1000,
      distance,
      elapsed: durationSec,
      avgPaceSeconds,
      calories,
      elevationGain,
      splits: [],
      runConfig: null,
      notes: "Restored from Tropos backup",
      relativeEffort: null,
      paceVerdictTone: null,
      isInvalid: false,
      invalidReason: null,
      routeQuality: null,
      shoeId: null,
      bestEfforts: [],
    };

    const docData = {
      ...runDocument(finishedRun, new Date(day.noonMs + durationSec * 1000)),
      activityType,
      place: place ?? null,
    };
    const fingerprint = [
      "run",
      day.date,
      distance,
      durationSec,
      elevationGain,
      activityType,
      place ?? "",
    ].join("|");

    out.push({
      docId: `json-${fnv1a32(fingerprint)}`,
      date: day.date,
      data: docData,
    });
  }

  return out;
}

function parseMeals(rawList: unknown): RestoredMealRecord[] {
  if (!Array.isArray(rawList)) return [];
  const out: RestoredMealRecord[] = [];
  const seenCounts = new Map<string, number>();

  for (const item of rawList) {
    if (out.length >= MAX_ITEMS_PER_DOMAIN) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const day = parseValidDayKey(rec.date);
    if (!day) continue;

    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const calories = Math.round(finiteNonNegative(rec.calories));
    const protein = Math.round(finiteNonNegative(rec.proteinG) * 10) / 10;
    const carbs = Math.round(finiteNonNegative(rec.carbsG) * 10) / 10;
    const fat = Math.round(finiteNonNegative(rec.fatG) * 10) / 10;
    if (!name && calories <= 0) continue;

    const label = name || "Restored meal";
    const baseKey = `meal|${day.date}|${label}|${calories}|${protein}|${carbs}|${fat}`;
    const occ = seenCounts.get(baseKey) ?? 0;
    seenCounts.set(baseKey, occ + 1);

    out.push({
      docId: `json-${fnv1a32(`${baseKey}|${occ}`)}`,
      date: day.date,
      data: {
        date: day.date,
        foodName: label,
        items: [
          {
            name: label,
            portionSize: "1 serving",
            calories,
            protein,
            carbs,
            fat,
          },
        ],
        totalCalories: calories,
        totalProtein: protein,
        totalCarbs: carbs,
        totalFat: fat,
        source: "import",
        createdAt: Timestamp.fromMillis(day.noonMs + occ * 1000),
      },
    });
  }

  return out;
}

function parseBodyweight(
  rawList: unknown,
  todayKey: string
): RestoredBodyweightRecord[] {
  if (!Array.isArray(rawList)) return [];
  const byDate = new Map<string, RestoredBodyweightRecord>();

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const day = parseValidDayKey(rec.date);
    if (!day || day.date > todayKey) continue;

    const weightKg = finiteNonNegative(rec.weightKg);
    if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) continue;

    byDate.set(day.date, {
      docId: day.date,
      date: day.date,
      weightKg: Math.round(weightKg * 100) / 100,
      timestampMs: day.noonMs,
    });
  }

  const entries = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  return entries.length > MAX_ITEMS_PER_DOMAIN
    ? entries.slice(-MAX_ITEMS_PER_DOMAIN)
    : entries;
}

/**
 * Pure parser: validates and converts a Tropos `FullDataExport` JSON string
 * into deterministic, idempotent Firestore records for all four domains.
 */
export function parseFullBackupJson(
  jsonText: string,
  options: ParseJsonArchiveOptions = {}
): ParsedJsonArchive {
  if (jsonText.length > MAX_ARCHIVE_JSON_BYTES) {
    throw new JsonArchiveImportError(
      "ARCHIVE_TOO_LARGE",
      "This backup file is too large to import."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText.replace(/^\uFEFF/, ""));
  } catch {
    throw new JsonArchiveImportError(
      "ARCHIVE_INVALID_JSON",
      "This file isn’t a valid JSON backup."
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new JsonArchiveImportError(
      "ARCHIVE_UNSUPPORTED_SCHEMA",
      "This file isn’t a Tropos backup archive."
    );
  }

  const root = parsed as Record<string, unknown>;
  if (root.schemaVersion !== 1) {
    throw new JsonArchiveImportError(
      "ARCHIVE_UNSUPPORTED_SCHEMA",
      "This backup version isn’t supported. Export a fresh Tropos JSON backup and try again."
    );
  }

  const explicitWeight = !!(options.weightKg && options.weightKg > 0);
  const bodyweightKg = explicitWeight ? options.weightKg! : 75;
  const todayKey = options.todayKey ?? localDateString();

  const workouts = parseWorkouts(root.workouts, bodyweightKg, explicitWeight);
  const runs = parseRuns(root.runs, bodyweightKg);
  const meals = parseMeals(root.meals);
  const bodyweight = parseBodyweight(root.bodyweight, todayKey);
  const totalItems =
    workouts.length + runs.length + meals.length + bodyweight.length;

  if (totalItems === 0) {
    throw new JsonArchiveImportError(
      "ARCHIVE_EMPTY",
      "No restorable records were found in this backup."
    );
  }

  return { workouts, runs, meals, bodyweight, totalItems };
}

/**
 * Restores a Tropos `FullDataExport` JSON backup into the user's workouts,
 * runs, meals, and bodyweight collections using deterministic idempotent IDs.
 */
export async function importFullBackupJson(
  uid: string,
  jsonText: string,
  options: ParseJsonArchiveOptions = {}
): Promise<ImportedJsonArchiveSummary> {
  const archive = parseFullBackupJson(jsonText, options);

  const writes: BulkImportEntry[] = [];
  for (const w of archive.workouts) {
    writes.push({
      collectionPath: `users/${uid}/workouts`,
      docId: w.docId,
      data: w.data,
    });
  }
  for (const r of archive.runs) {
    writes.push({
      collectionPath: `users/${uid}/runs`,
      docId: r.docId,
      data: r.data,
    });
  }
  for (const m of archive.meals) {
    writes.push({
      collectionPath: `users/${uid}/meals`,
      docId: m.docId,
      data: m.data,
    });
  }
  for (const bw of archive.bodyweight) {
    const ts = Timestamp.fromMillis(bw.timestampMs);
    writes.push({
      collectionPath: `users/${uid}/bodyweightLogs`,
      docId: bw.docId,
      merge: true,
      data: {
        date: bw.date,
        weight: bw.weightKg,
        source: "import",
        createdAt: ts,
        updatedAt: ts,
      },
    });
  }

  await commitBulkImportWrites(uid, writes, options.onProgress);

  return {
    workouts: archive.workouts.length,
    runs: archive.runs.length,
    meals: archive.meals.length,
    bodyweight: archive.bodyweight.length,
    totalItems: archive.totalItems,
  };
}
