/**
 * Lifting workout CSV import (Hevy, Strong, and Tropos CSV exports —
 * competitive roadmap P1 #7).
 *
 * Parses RFC 4180 CSV (including UTF-8 BOM and European `;`-delimited Strong
 * exports) without external dependencies, matches exercise names to Tropos's
 * catalogue with a safe custom fallback, converts lb → kg when needed, derives
 * tonnage and calorie burn via the canonical formulas, and queues idempotent
 * durable writes into `users/{uid}/workouts/csv-<hash>`.
 */
import { Timestamp } from "firebase/firestore";
import {
  commitBulkImportWrites,
  type BulkImportEntry,
  type BulkImportProgress,
} from "@/lib/bulkImportWrite";
import { localDateString } from "@/lib/dateHelpers";
import { EXERCISES, type Exercise } from "@/lib/exercises";
import { lbToKg } from "@/lib/weightUnits";
import { estimateLiftBurn } from "@/lib/workoutBurn";
import {
  workoutTonnageKg,
  type WorkoutExercise,
  type WorkoutSet,
} from "@/lib/savedWorkouts";

export const MAX_WORKOUT_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORTED_WORKOUTS = 500;

export type WorkoutCsvSource = "hevy" | "strong" | "tropos";

export type WorkoutCsvImportErrorCode =
  "CSV_TOO_LARGE" | "CSV_EMPTY" | "CSV_UNRECOGNIZED_FORMAT" | "CSV_NO_WORKOUTS";

export class WorkoutCsvImportError extends Error {
  readonly code: WorkoutCsvImportErrorCode;
  constructor(code: WorkoutCsvImportErrorCode, message: string) {
    super(message);
    this.name = "WorkoutCsvImportError";
    this.code = code;
  }
}

export interface ParseWorkoutCsvOptions {
  /** Body weight in kg for calorie burn estimation; defaults to 75 kg. */
  weightKg?: number;
  /** Default unit when a CSV header omits kg/lbs (e.g. Strong bare `Weight`). */
  defaultWeightUnit?: "kg" | "lbs";
  /** Optional progress callback as write batches commit. */
  onProgress?: (progress: BulkImportProgress) => void;
}

export interface ParsedCsvWorkout {
  /** Deterministic id (`csv-...`) so re-importing the same file is idempotent. */
  importId: string;
  date: string;
  startedAtMs: number;
  title: string;
  notes: string;
  durationMinutes: number;
  exercises: WorkoutExercise[];
  totalVolume: number;
  totalCalories: number;
  setCount: number;
}

export interface ParsedWorkoutCsvResult {
  source: WorkoutCsvSource;
  workouts: ParsedCsvWorkout[];
  totalSets: number;
}

export interface ImportedWorkoutsSummary {
  source: WorkoutCsvSource;
  importedCount: number;
  totalSets: number;
  earliestDate: string;
  latestDate: string;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function stripFormulaPrefix(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    trimmed[0] === "'" &&
    /^[=+\-@]/.test(trimmed[1])
  ) {
    return trimmed.slice(1);
  }
  return trimmed;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function detectDelimiter(headerLine: string): "," | ";" {
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ",") commas++;
      else if (ch === ";") semis++;
    }
  }
  return semis > commas ? ";" : ",";
}

/** RFC 4180 CSV parser supporting quoted fields, embedded newlines, and `,` or `;`. */
function parseCsvRows(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const firstNewline = text.search(/\r?\n/);
  const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parseFiniteNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/,/g, ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses workout timestamps across Hevy ("25 Oct 2026, 09:15"), Strong
 * ("2026-10-25 09:15:00"), and Tropos ("2026-10-25") using local calendar
 * components so day keys never drift across timezones.
 */
function parseWorkoutTimestamp(
  raw: string
): { date: string; ms: number } | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD (optional HH:mm[:ss])
  const isoLocal =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      s
    );
  if (isoLocal) {
    const y = Number(isoLocal[1]);
    const mo = Number(isoLocal[2]);
    const d = Number(isoLocal[3]);
    const hh = isoLocal[4] !== undefined ? Number(isoLocal[4]) : 12;
    const mm = isoLocal[5] !== undefined ? Number(isoLocal[5]) : 0;
    const ss = isoLocal[6] !== undefined ? Number(isoLocal[6]) : 0;
    const dt = new Date(y, mo - 1, d, hh, mm, ss);
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === mo - 1 &&
      dt.getDate() === d
    ) {
      return { date: localDateString(dt), ms: dt.getTime() };
    }
    return null;
  }

  // Hevy "25 Oct 2026, 09:15" or "25 Oct 2026 09:15"
  const dayFirst =
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      s
    );
  if (dayFirst) {
    const d = Number(dayFirst[1]);
    const mo = MONTH_INDEX[dayFirst[2].toLowerCase()];
    const y = Number(dayFirst[3]);
    if (mo !== undefined) {
      const hh = dayFirst[4] !== undefined ? Number(dayFirst[4]) : 12;
      const mm = dayFirst[5] !== undefined ? Number(dayFirst[5]) : 0;
      const ss = dayFirst[6] !== undefined ? Number(dayFirst[6]) : 0;
      const dt = new Date(y, mo, d, hh, mm, ss);
      if (
        dt.getFullYear() === y &&
        dt.getMonth() === mo &&
        dt.getDate() === d
      ) {
        return { date: localDateString(dt), ms: dt.getTime() };
      }
    }
    return null;
  }

  // Month-first "Oct 25, 2026, 09:15"
  const monthFirst =
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      s
    );
  if (monthFirst) {
    const mo = MONTH_INDEX[monthFirst[1].toLowerCase()];
    const d = Number(monthFirst[2]);
    const y = Number(monthFirst[3]);
    if (mo !== undefined) {
      const hh = monthFirst[4] !== undefined ? Number(monthFirst[4]) : 12;
      const mm = monthFirst[5] !== undefined ? Number(monthFirst[5]) : 0;
      const ss = monthFirst[6] !== undefined ? Number(monthFirst[6]) : 0;
      const dt = new Date(y, mo, d, hh, mm, ss);
      if (
        dt.getFullYear() === y &&
        dt.getMonth() === mo &&
        dt.getDate() === d
      ) {
        return { date: localDateString(dt), ms: dt.getTime() };
      }
    }
    return null;
  }

  // Fallback for full ISO with explicit timezone offset / Z
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const ms = Date.parse(s);
    if (Number.isFinite(ms)) {
      return { date: localDateString(new Date(ms)), ms };
    }
  }
  return null;
}

function parseDurationMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  let totalSec = 0;
  let matched = false;
  const hMatch = /(\d+(?:\.\d+)?)\s*h/.exec(s);
  const mMatch = /(\d+(?:\.\d+)?)\s*m(?:in)?/.exec(s);
  const sMatch = /(\d+(?:\.\d+)?)\s*s/.exec(s);
  if (hMatch) {
    totalSec += Number(hMatch[1]) * 3600;
    matched = true;
  }
  if (mMatch) {
    totalSec += Number(mMatch[1]) * 60;
    matched = true;
  }
  if (sMatch) {
    totalSec += Number(sMatch[1]);
    matched = true;
  }
  if (matched && totalSec > 0) {
    return Math.max(1, Math.round(totalSec / 60));
  }

  const plain = parseFiniteNumber(s);
  if (plain !== null && plain > 0) {
    // Strong sometimes exports duration in seconds (e.g. 2700)
    return plain > 300
      ? Math.max(1, Math.round(plain / 60))
      : Math.round(plain);
  }
  return null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugifyCustom(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `custom-${slug}` : `custom-${fnv1a32(name)}`;
}

// Common Hevy / Strong exercise titles mapped to Tropos catalogue ids.
const COMMON_ALIASES: Record<string, string> = {
  "bench press barbell": "bench-press",
  "barbell bench press": "bench-press",
  "bench press dumbbell": "db-bench",
  "incline bench press dumbbell": "incline-db-press",
  "decline bench press dumbbell": "decline-db-press",
  "squat barbell": "squat",
  "back squat": "squat",
  "barbell back squat": "squat",
  "squat smith machine": "smith-machine-squat",
  "deadlift barbell": "deadlift",
  "conventional deadlift": "deadlift",
  "romanian deadlift barbell": "romanian-deadlift",
  "romanian deadlift dumbbell": "db-rdl",
  "bent over row barbell": "barbell-row",
  "bent over row": "barbell-row",
  "bent over one arm row dumbbell": "db-row",
  "dumbbell row": "db-row",
  "overhead press barbell": "overhead-press",
  "military press": "overhead-press",
  "shoulder press dumbbell": "db-shoulder-press",
  "overhead press dumbbell": "db-shoulder-press",
  "bicep curl barbell": "barbell-curl",
  "bicep curl dumbbell": "db-curl",
  "bicep curl cable": "cable-curl",
  "triceps rope pushdown": "rope-tricep-pushdown",
  "tricep pushdown cable": "rope-tricep-pushdown",
  "triceps pushdown": "rope-tricep-pushdown",
  "tricep pushdown": "rope-tricep-pushdown",
  "lat pulldown cable": "lat-pulldown",
  "seated cable row v grip": "seated-row",
  "seated row cable": "seated-row",
  "pull up": "pull-ups",
  "chin up": "chin-ups",
  "push up": "push-ups",
  "face pull": "face-pulls",
  "face pull cable": "face-pulls",
  "skullcrusher barbell": "skull-crushers",
  "skull crusher": "skull-crushers",
  "bulgarian split squat": "bulgarian-split",
  "bulgarian split squat dumbbell": "bulgarian-split",
  "leg press machine": "leg-press",
  "leg extension machine": "leg-extension",
  "seated leg curl machine": "seated-leg-curl",
  "hip thrust barbell": "hip-thrust",
  "lateral raise dumbbell": "lateral-raise",
  "lateral raise cable": "cable-lateral-raise",
  "hammer curl dumbbell": "hammer-curl",
  "hanging leg raise": "leg-raise",
};

interface ExerciseLookup {
  byId: Map<string, Exercise>;
  byNormalizedName: Map<string, Exercise>;
}

let cachedLookup: ExerciseLookup | null = null;

function getExerciseLookup(): ExerciseLookup {
  if (cachedLookup) return cachedLookup;
  const byId = new Map<string, Exercise>();
  const byNormalizedName = new Map<string, Exercise>();
  for (const ex of EXERCISES) {
    byId.set(ex.id, ex);
    byNormalizedName.set(normalizeName(ex.name), ex);
  }
  cachedLookup = { byId, byNormalizedName };
  return cachedLookup;
}

export function matchCatalogExercise(rawName: string): {
  exerciseId: string;
  exerciseName: string;
  category: string;
} {
  const trimmed = stripFormulaPrefix(rawName);
  const { byId, byNormalizedName } = getExerciseLookup();
  const fullNorm = normalizeName(trimmed);

  // 1. Direct catalogue match (exact name or id)
  const exact =
    byNormalizedName.get(fullNorm) ?? byId.get(trimmed.toLowerCase());
  if (exact) {
    return {
      exerciseId: exact.id,
      exerciseName: exact.name,
      category: exact.category,
    };
  }

  // 2. Curated Hevy/Strong alias match on full normalized name
  const directAliasId = COMMON_ALIASES[fullNorm];
  if (directAliasId) {
    const aliasEx = byId.get(directAliasId);
    if (aliasEx) {
      return {
        exerciseId: aliasEx.id,
        exerciseName: aliasEx.name,
        category: aliasEx.category,
      };
    }
  }

  // 3. Parse parenthetical equipment suffix e.g. "Bench Press (Dumbbell)"
  const parenMatch = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(trimmed);
  if (parenMatch) {
    const baseNorm = normalizeName(parenMatch[1]);
    const equipNorm = normalizeName(parenMatch[2]);
    const candidates = [
      `${equipNorm} ${baseNorm}`,
      `${baseNorm} ${equipNorm}`,
      baseNorm,
    ];
    for (const cand of candidates) {
      const hit =
        byNormalizedName.get(cand) ??
        (COMMON_ALIASES[cand] ? byId.get(COMMON_ALIASES[cand]) : undefined);
      if (hit) {
        return {
          exerciseId: hit.id,
          exerciseName: hit.name,
          category: hit.category,
        };
      }
    }
  }

  // 4. Plural/singular fallback ("Pull Up" -> "Pull-Ups")
  const pluralHit =
    byNormalizedName.get(`${fullNorm}s`) ??
    (fullNorm.endsWith("s")
      ? byNormalizedName.get(fullNorm.slice(0, -1))
      : undefined);
  if (pluralHit) {
    return {
      exerciseId: pluralHit.id,
      exerciseName: pluralHit.name,
      category: pluralHit.category,
    };
  }

  return {
    exerciseId: slugifyCustom(trimmed),
    exerciseName: trimmed,
    category: "Full Body",
  };
}

function normalizeSetType(rawType: string | undefined): string {
  const s = stripFormulaPrefix(rawType ?? "").toLowerCase();
  if (s === "w" || s === "warmup" || s === "warm up" || s === "warm-up") {
    return "warmup";
  }
  if (s === "d" || s === "dropset" || s === "drop set" || s === "drop-set") {
    return "dropset";
  }
  if (s === "f" || s === "failure") {
    return "failure";
  }
  return "working";
}

function roundWeightKg(kg: number): number {
  return Math.round(Math.max(0, kg) * 100) / 100;
}

interface RawSetRow {
  workoutKey: string;
  date: string;
  startedAtMs: number;
  endedAtMs: number | null;
  title: string;
  workoutNotes: string;
  durationMinutes: number | null;
  exerciseName: string;
  exerciseNotes: string;
  weightKg: number;
  reps: number;
  durationSeconds: number;
  setType: string;
  rpe: number | undefined;
}

interface ColumnMap {
  source: WorkoutCsvSource;
  weightUnit: "kg" | "lbs";
  idx: Record<string, number>;
}

function detectColumns(
  headerRow: string[],
  defaultWeightUnit: "kg" | "lbs"
): ColumnMap | null {
  const norm = headerRow.map((h) => h.trim().toLowerCase());
  const indexOf = (...names: string[]): number => {
    for (const n of names) {
      const i = norm.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  // Hevy format: title, start_time, end_time, exercise_title, set_type, weight_kg|weight_lbs, reps
  const hevyExercise = indexOf("exercise_title");
  const hevyStart = indexOf("start_time");
  if (hevyExercise !== -1 && hevyStart !== -1) {
    const weightKgIdx = indexOf("weight_kg");
    const weightLbsIdx = indexOf("weight_lbs", "weight_lb");
    return {
      source: "hevy",
      weightUnit: weightLbsIdx !== -1 && weightKgIdx === -1 ? "lbs" : "kg",
      idx: {
        title: indexOf("title"),
        start: hevyStart,
        end: indexOf("end_time"),
        workoutNotes: indexOf("description"),
        exercise: hevyExercise,
        exerciseNotes: indexOf("exercise_notes"),
        setType: indexOf("set_type"),
        weight: weightKgIdx !== -1 ? weightKgIdx : weightLbsIdx,
        reps: indexOf("reps"),
        durationSeconds: indexOf("duration_seconds"),
        rpe: indexOf("rpe"),
      },
    };
  }

  // Strong format: Date, Workout Name, Duration, Exercise Name, Set Order, Weight[ (kg|lbs)], Reps
  const strongExercise = indexOf("exercise name");
  const strongDate = indexOf("date");
  if (strongExercise !== -1 && strongDate !== -1) {
    const weightKgIdx = indexOf("weight (kg)");
    const weightLbsIdx = indexOf("weight (lbs)", "weight (lb)");
    const bareWeightIdx = indexOf("weight");
    const weightIdx =
      weightKgIdx !== -1
        ? weightKgIdx
        : weightLbsIdx !== -1
          ? weightLbsIdx
          : bareWeightIdx;
    const weightUnit: "kg" | "lbs" =
      weightLbsIdx !== -1
        ? "lbs"
        : weightKgIdx !== -1
          ? "kg"
          : defaultWeightUnit;
    return {
      source: "strong",
      weightUnit,
      idx: {
        title: indexOf("workout name"),
        start: strongDate,
        duration: indexOf("duration"),
        workoutNotes: indexOf("workout notes"),
        exercise: strongExercise,
        exerciseNotes: indexOf("notes"),
        setOrder: indexOf("set order"),
        weight: weightIdx,
        reps: indexOf("reps"),
        durationSeconds: indexOf("seconds"),
        rpe: indexOf("rpe"),
      },
    };
  }

  // Tropos export format: Date, Exercise, Set, Weight (kg), Reps, Type[, RPE]
  const troposExercise = indexOf("exercise");
  const troposDate = indexOf("date");
  const troposReps = indexOf("reps");
  if (troposExercise !== -1 && troposDate !== -1 && troposReps !== -1) {
    const weightKgIdx = indexOf("weight (kg)", "weight");
    const weightLbsIdx = indexOf("weight (lbs)", "weight (lb)");
    return {
      source: "tropos",
      weightUnit: weightLbsIdx !== -1 && weightKgIdx === -1 ? "lbs" : "kg",
      idx: {
        start: troposDate,
        exercise: troposExercise,
        weight: weightKgIdx !== -1 ? weightKgIdx : weightLbsIdx,
        reps: troposReps,
        setType: indexOf("type"),
        rpe: indexOf("rpe"),
      },
    };
  }

  return null;
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined || index < 0 || index >= row.length) return "";
  return row[index] ?? "";
}

/**
 * Pure parser: converts Hevy, Strong, or Tropos workout CSV text into
 * canonical Tropos workout records ready for persistence.
 */
export function parseWorkoutsCsv(
  csvText: string,
  options: ParseWorkoutCsvOptions = {}
): ParsedWorkoutCsvResult {
  if (csvText.length > MAX_WORKOUT_CSV_BYTES) {
    throw new WorkoutCsvImportError(
      "CSV_TOO_LARGE",
      "This file is too large to import."
    );
  }

  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new WorkoutCsvImportError(
      "CSV_EMPTY",
      "This CSV file doesn’t contain any workout sets."
    );
  }

  const defaultWeightUnit = options.defaultWeightUnit ?? "kg";
  const cols = detectColumns(rows[0], defaultWeightUnit);
  if (!cols) {
    throw new WorkoutCsvImportError(
      "CSV_UNRECOGNIZED_FORMAT",
      "Couldn’t recognise this CSV format. Export workouts from Hevy, Strong or Tropos and try again."
    );
  }

  const rawSets: RawSetRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const startRaw = cell(row, cols.idx.start);
    const parsedTime = parseWorkoutTimestamp(startRaw);
    if (!parsedTime) continue;

    const rawExercise = stripFormulaPrefix(cell(row, cols.idx.exercise));
    if (!rawExercise) continue;

    // Skip Strong non-set rows ("Rest Timer", "Note") and Tropos circuit rows.
    const setOrderRaw = cell(row, cols.idx.setOrder).trim().toLowerCase();
    if (setOrderRaw === "rest timer" || setOrderRaw === "note") continue;

    const rawType = cell(row, cols.idx.setType);
    if (stripFormulaPrefix(rawType).toLowerCase() === "circuit") continue;

    const setType =
      cols.source === "strong"
        ? normalizeSetType(setOrderRaw)
        : normalizeSetType(rawType);

    const rawWeight = parseFiniteNumber(cell(row, cols.idx.weight)) ?? 0;
    const weightKg = roundWeightKg(
      cols.weightUnit === "lbs" ? lbToKg(rawWeight) : rawWeight
    );
    const reps = Math.max(
      0,
      Math.round(parseFiniteNumber(cell(row, cols.idx.reps)) ?? 0)
    );
    const durationSeconds = Math.max(
      0,
      Math.round(parseFiniteNumber(cell(row, cols.idx.durationSeconds)) ?? 0)
    );
    if (reps <= 0 && durationSeconds <= 0) continue;

    const rawRpe = parseFiniteNumber(cell(row, cols.idx.rpe));
    const rpe =
      rawRpe !== null && rawRpe >= 1 && rawRpe <= 10
        ? Math.round(rawRpe * 2) / 2
        : undefined;

    const endParsed = parseWorkoutTimestamp(cell(row, cols.idx.end));
    const title = stripFormulaPrefix(cell(row, cols.idx.title));
    const workoutKey =
      cols.source === "tropos"
        ? parsedTime.date
        : `${parsedTime.date}|${startRaw.trim()}|${title}`;

    rawSets.push({
      workoutKey,
      date: parsedTime.date,
      startedAtMs: parsedTime.ms,
      endedAtMs: endParsed?.ms ?? null,
      title,
      workoutNotes: stripFormulaPrefix(cell(row, cols.idx.workoutNotes)),
      durationMinutes: parseDurationMinutes(cell(row, cols.idx.duration)),
      exerciseName: rawExercise,
      exerciseNotes: stripFormulaPrefix(cell(row, cols.idx.exerciseNotes)),
      weightKg,
      reps,
      durationSeconds,
      setType,
      rpe,
    });
  }

  if (rawSets.length === 0) {
    throw new WorkoutCsvImportError(
      "CSV_NO_WORKOUTS",
      "No completed lifting sets were found in this CSV file."
    );
  }

  // Group rows into workouts preserving first-seen order.
  const grouped = new Map<string, RawSetRow[]>();
  for (const s of rawSets) {
    const existing = grouped.get(s.workoutKey);
    if (existing) existing.push(s);
    else grouped.set(s.workoutKey, [s]);
  }

  const bodyweightKg =
    options.weightKg && options.weightKg > 0 ? options.weightKg : 75;

  const workouts: ParsedCsvWorkout[] = [];
  let totalSets = 0;

  for (const rowsInWorkout of grouped.values()) {
    if (workouts.length >= MAX_IMPORTED_WORKOUTS) break;
    const first = rowsInWorkout[0];

    // Group exercises sequentially within the workout so repeated exercise names
    // in the same session merge into one WorkoutExercise in order of appearance.
    const exerciseMap = new Map<
      string,
      {
        matched: ReturnType<typeof matchCatalogExercise>;
        sets: WorkoutSet[];
        timedCount: number;
        notes: string;
      }
    >();

    for (const r of rowsInWorkout) {
      const matched = matchCatalogExercise(r.exerciseName);
      let entry = exerciseMap.get(matched.exerciseId);
      if (!entry) {
        entry = {
          matched,
          sets: [],
          timedCount: 0,
          notes: r.exerciseNotes,
        };
        exerciseMap.set(matched.exerciseId, entry);
      } else if (!entry.notes && r.exerciseNotes) {
        entry.notes = r.exerciseNotes;
      }

      const isTimed = r.reps === 0 && r.durationSeconds > 0;
      if (isTimed) entry.timedCount++;

      const setObj: WorkoutSet = {
        setNumber: entry.sets.length + 1,
        reps: isTimed ? r.durationSeconds : r.reps,
        weightKg: r.weightKg,
        type: r.setType,
        ...(r.rpe !== undefined ? { rpe: r.rpe } : {}),
      };
      entry.sets.push(setObj);
    }

    const workoutSetCount = rowsInWorkout.length;
    totalSets += workoutSetCount;

    let durationMinutes = first.durationMinutes;
    if (
      durationMinutes === null &&
      first.endedAtMs !== null &&
      first.endedAtMs > first.startedAtMs
    ) {
      durationMinutes = Math.max(
        1,
        Math.round((first.endedAtMs - first.startedAtMs) / 60_000)
      );
    }
    if (durationMinutes === null || durationMinutes <= 0) {
      durationMinutes = Math.max(10, Math.round(workoutSetCount * 2.5));
    }

    const preliminaryExercises: WorkoutExercise[] = [];
    for (const entry of exerciseMap.values()) {
      const allTimed = entry.timedCount === entry.sets.length;
      preliminaryExercises.push({
        exerciseId: entry.matched.exerciseId,
        exerciseName: entry.matched.exerciseName,
        category: entry.matched.category,
        ...(allTimed ? { repUnit: "seconds" as const } : {}),
        ...(entry.notes ? { notes: entry.notes } : {}),
        sets: entry.sets,
        caloriesBurned: 0,
      });
    }

    const totalVolume = workoutTonnageKg({ exercises: preliminaryExercises });
    const totalCalories = estimateLiftBurn({
      durationMinutes,
      tonnageKg: totalVolume,
      bodyweightKg,
      completedSetCount: workoutSetCount,
    });

    const exercises: WorkoutExercise[] = preliminaryExercises.map((ex) => ({
      ...ex,
      caloriesBurned: Math.round(
        (totalCalories * ex.sets.length) / Math.max(1, workoutSetCount)
      ),
    }));

    const sourceLabel =
      cols.source === "hevy"
        ? "Hevy"
        : cols.source === "strong"
          ? "Strong"
          : "CSV";
    const noteParts = [first.title, first.workoutNotes].filter(Boolean);
    const notes =
      noteParts.length > 0
        ? noteParts.join(" · ")
        : `Imported from ${sourceLabel}`;

    const fingerprint = [
      cols.source,
      first.date,
      first.title,
      exercises
        .map(
          (e) =>
            `${e.exerciseId}:${e.sets.map((s) => `${s.weightKg}x${s.reps}`).join(",")}`
        )
        .join(";"),
    ].join("|");

    workouts.push({
      importId: `csv-${fnv1a32(fingerprint)}`,
      date: first.date,
      startedAtMs: first.startedAtMs,
      title: first.title,
      notes,
      durationMinutes,
      exercises,
      totalVolume,
      totalCalories,
      setCount: workoutSetCount,
    });
  }

  return {
    source: cols.source,
    workouts,
    totalSets,
  };
}

/**
 * Parses a Hevy, Strong, or Tropos workout CSV and queues each workout
 * durably into `users/{uid}/workouts/{importId}` (idempotent on re-import).
 */
export async function importWorkoutsCsv(
  uid: string,
  csvText: string,
  options: ParseWorkoutCsvOptions = {}
): Promise<ImportedWorkoutsSummary> {
  const parsed = parseWorkoutsCsv(csvText, options);
  const explicitWeight = !!(options.weightKg && options.weightKg > 0);
  const bodyweightKg = explicitWeight ? options.weightKg! : 75;

  let earliestDate = parsed.workouts[0].date;
  let latestDate = parsed.workouts[0].date;
  const writes: BulkImportEntry[] = [];

  for (const w of parsed.workouts) {
    if (w.date < earliestDate) earliestDate = w.date;
    if (w.date > latestDate) latestDate = w.date;

    const docData: Record<string, unknown> = {
      date: w.date,
      exercises: w.exercises,
      totalCalories: w.totalCalories,
      totalVolume: w.totalVolume,
      durationMinutes: w.durationMinutes,
      notes: w.notes,
      burnContext: { bodyweightKg, inferred: !explicitWeight },
      createdAt: Timestamp.fromMillis(w.startedAtMs),
    };

    writes.push({
      collectionPath: `users/${uid}/workouts`,
      docId: w.importId,
      data: docData,
    });
  }

  await commitBulkImportWrites(uid, writes, options.onProgress);

  return {
    source: parsed.source,
    importedCount: parsed.workouts.length,
    totalSets: parsed.totalSets,
    earliestDate,
    latestDate,
  };
}
