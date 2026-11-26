/**
 * Bodyweight CSV import (Happy Scale, Withings, Renpho, MyFitnessPal,
 * MacroFactor, and Tropos exports — competitive roadmap P1 #7).
 *
 * Parses RFC 4180 CSV (including UTF-8 BOM and European `;` delimiters) with
 * zero external dependencies, normalizes kg / lb / stone weights into kg,
 * collapses multiple readings on the same local day to the latest reading, and
 * queues idempotent date-keyed durable writes into
 * `users/{uid}/bodyweightLogs/{YYYY-MM-DD}` so Trend Weight and Adaptive TDEE
 * warm up immediately from existing history.
 */
import { Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { flushQueue, queueDurableWrite } from "@/lib/offlineQueue";
import { localDateString } from "@/lib/dateHelpers";
import { lbToKg, stonePoundsToKg } from "@/lib/weightUnits";

export const MAX_BODYWEIGHT_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORTED_WEIGH_INS = 1500;
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 350;

export type BodyweightCsvImportErrorCode =
  "CSV_TOO_LARGE" | "CSV_EMPTY" | "CSV_UNRECOGNIZED_FORMAT" | "CSV_NO_ENTRIES";

export class BodyweightCsvImportError extends Error {
  readonly code: BodyweightCsvImportErrorCode;
  constructor(code: BodyweightCsvImportErrorCode, message: string) {
    super(message);
    this.name = "BodyweightCsvImportError";
    this.code = code;
  }
}

export interface ParseBodyweightCsvOptions {
  /** Fallback unit when neither header nor value specifies kg/lb/st. */
  defaultWeightUnit?: "kg" | "lbs";
  /** Local "YYYY-MM-DD" upper bound; future dates are ignored. */
  todayKey?: string;
}

export interface ParsedBodyweightEntry {
  date: string;
  weightKg: number;
  timestampMs: number;
}

export interface ParsedBodyweightCsvResult {
  entries: ParsedBodyweightEntry[];
  earliestDate: string;
  latestDate: string;
}

export interface ImportedBodyweightSummary {
  importedCount: number;
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

function buildLocalDate(
  y: number,
  monthZero: number,
  d: number,
  hh = 12,
  mm = 0,
  ss = 0
): { date: string; ms: number } | null {
  if (y < 1970 || y > 2100) return null;
  const dt = new Date(y, monthZero, d, hh, mm, ss);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== monthZero ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return { date: localDateString(dt), ms: dt.getTime() };
}

function applyMeridiem(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const upper = meridiem.toUpperCase();
  if (upper === "AM") return hour === 12 ? 0 : hour;
  if (upper === "PM") return hour === 12 ? 12 : hour + 12;
  return hour;
}

function parseWeighInDate(raw: string): { date: string; ms: number } | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD with optional time + optional AM/PM
  const isoLocal =
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
      s
    );
  if (isoLocal) {
    const hh =
      isoLocal[4] !== undefined
        ? applyMeridiem(Number(isoLocal[4]), isoLocal[7])
        : 12;
    const mm = isoLocal[5] !== undefined ? Number(isoLocal[5]) : 0;
    const ss = isoLocal[6] !== undefined ? Number(isoLocal[6]) : 0;
    return buildLocalDate(
      Number(isoLocal[1]),
      Number(isoLocal[2]) - 1,
      Number(isoLocal[3]),
      hh,
      mm,
      ss
    );
  }

  // Renpho / US month-first: "Oct 12, 2026 7:15:00 AM" or "Oct 12, 2026"
  const monthFirst =
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
      s
    );
  if (monthFirst) {
    const mo = MONTH_INDEX[monthFirst[1].toLowerCase()];
    if (mo !== undefined) {
      const hh =
        monthFirst[4] !== undefined
          ? applyMeridiem(Number(monthFirst[4]), monthFirst[7])
          : 12;
      const mm = monthFirst[5] !== undefined ? Number(monthFirst[5]) : 0;
      const ss = monthFirst[6] !== undefined ? Number(monthFirst[6]) : 0;
      return buildLocalDate(
        Number(monthFirst[3]),
        mo,
        Number(monthFirst[2]),
        hh,
        mm,
        ss
      );
    }
    return null;
  }

  // Day-first named month: "12 Oct 2026, 07:15"
  const dayFirst =
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
      s
    );
  if (dayFirst) {
    const mo = MONTH_INDEX[dayFirst[2].toLowerCase()];
    if (mo !== undefined) {
      const hh =
        dayFirst[4] !== undefined
          ? applyMeridiem(Number(dayFirst[4]), dayFirst[7])
          : 12;
      const mm = dayFirst[5] !== undefined ? Number(dayFirst[5]) : 0;
      const ss = dayFirst[6] !== undefined ? Number(dayFirst[6]) : 0;
      return buildLocalDate(
        Number(dayFirst[3]),
        mo,
        Number(dayFirst[1]),
        hh,
        mm,
        ss
      );
    }
    return null;
  }

  // Slash date: MM/DD/YYYY (or DD/MM/YYYY when first component > 12)
  const slash =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(
      s
    );
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = Number(slash[3]);
    const hh =
      slash[4] !== undefined ? applyMeridiem(Number(slash[4]), slash[7]) : 12;
    const mm = slash[5] !== undefined ? Number(slash[5]) : 0;
    const ss = slash[6] !== undefined ? Number(slash[6]) : 0;
    if (a > 12 && b <= 12) {
      return buildLocalDate(y, b - 1, a, hh, mm, ss);
    }
    return buildLocalDate(y, a - 1, b, hh, mm, ss);
  }

  // ISO with explicit Z or timezone offset
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const ms = Date.parse(s);
    if (Number.isFinite(ms)) {
      return { date: localDateString(new Date(ms)), ms };
    }
  }
  return null;
}

type DetectedWeightUnit = "kg" | "lbs" | "stone";

function unitFromHeader(header: string): DetectedWeightUnit | null {
  const h = header.toLowerCase();
  if (/\b(lbs?|pounds?)\b|\(lbs?\)|_lbs?$/.test(h)) return "lbs";
  if (/\b(kg|kilograms?)\b|\(kg\)|_kg$/.test(h)) return "kg";
  if (/\b(st|stone)\b|\(st\)|_st$/.test(h)) return "stone";
  return null;
}

function parseWeightToKg(
  raw: string,
  fallbackUnit: DetectedWeightUnit
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Stone + pounds e.g. "11 st 10 lb" or "11st 10.5lb"
  const stoneMatch =
    /^(\d+(?:[.,]\d+)?)\s*(?:st|stone)\s*(\d+(?:[.,]\d+)?)?\s*(?:lbs?|pounds?)?$/i.exec(
      trimmed
    );
  if (stoneMatch) {
    const st = Number(stoneMatch[1].replace(",", "."));
    const lb = stoneMatch[2] ? Number(stoneMatch[2].replace(",", ".")) : 0;
    const kg = stonePoundsToKg(st, lb);
    return Number.isFinite(kg) && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG
      ? Math.round(kg * 100) / 100
      : null;
  }

  // Value with optional inline unit e.g. "75.4 kg", "166.2 lb", "75,4"
  const numMatch =
    /^(\d+(?:[.,]\d+)?)\s*(kg|kilograms?|lbs?|pounds?|st|stone)?$/i.exec(
      trimmed
    );
  if (!numMatch) return null;
  const amount = Number(numMatch[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;

  const inlineUnit = numMatch[2]?.toLowerCase();
  let unit: DetectedWeightUnit = fallbackUnit;
  if (inlineUnit) {
    if (inlineUnit.startsWith("lb") || inlineUnit.startsWith("pound")) {
      unit = "lbs";
    } else if (inlineUnit.startsWith("kg") || inlineUnit.startsWith("kilo")) {
      unit = "kg";
    } else if (inlineUnit.startsWith("st")) {
      unit = "stone";
    }
  }

  const kg =
    unit === "lbs"
      ? lbToKg(amount)
      : unit === "stone"
        ? stonePoundsToKg(amount, 0)
        : amount;

  if (!Number.isFinite(kg) || kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
    return null;
  }
  return Math.round(kg * 100) / 100;
}

interface WeightColumns {
  dateIdx: number;
  weightIdx: number;
  unit: DetectedWeightUnit;
}

function detectColumns(
  headerRow: string[],
  defaultUnit: "kg" | "lbs"
): WeightColumns | null {
  const norm = headerRow.map((h) => h.trim().toLowerCase());

  let dateIdx = -1;
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    if (
      h === "date" ||
      h === "time of measurement" ||
      h === "timestamp" ||
      h === "measured at" ||
      h === "day" ||
      h.startsWith("date ") ||
      h.startsWith("date(")
    ) {
      dateIdx = i;
      break;
    }
  }

  let weightIdx = -1;
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    // Skip derived columns like "moving_average", "trend weight", "fat mass",
    // "muscle weight", "bone weight", "water weight", "target weight".
    if (
      /trend|moving|average|avg|goal|target|fat|muscle|bone|water|lean|diff|change|delta/.test(
        h
      )
    ) {
      continue;
    }
    if (
      h === "weight" ||
      h === "body weight" ||
      h === "bodyweight" ||
      h === "scale weight" ||
      /^weight\s*\(/.test(h) ||
      /^weight[_ ]?(kg|lbs?|st)$/.test(h) ||
      /^body\s*weight\s*\(/.test(h) ||
      /^scale\s*weight\s*\(/.test(h)
    ) {
      weightIdx = i;
      break;
    }
  }

  if (dateIdx === -1 || weightIdx === -1) return null;

  const headerUnit = unitFromHeader(headerRow[weightIdx]);
  return {
    dateIdx,
    weightIdx,
    unit: headerUnit ?? defaultUnit,
  };
}

/**
 * Pure parser: extracts deduplicated, validated local-day bodyweight entries
 * sorted ascending by date.
 */
export function parseBodyweightCsv(
  csvText: string,
  options: ParseBodyweightCsvOptions = {}
): ParsedBodyweightCsvResult {
  if (csvText.length > MAX_BODYWEIGHT_CSV_BYTES) {
    throw new BodyweightCsvImportError(
      "CSV_TOO_LARGE",
      "This file is too large to import."
    );
  }

  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new BodyweightCsvImportError(
      "CSV_EMPTY",
      "This CSV file doesn’t contain any weigh-ins."
    );
  }

  const cols = detectColumns(rows[0], options.defaultWeightUnit ?? "kg");
  if (!cols) {
    throw new BodyweightCsvImportError(
      "CSV_UNRECOGNIZED_FORMAT",
      "Couldn’t recognise this CSV format. Export weigh-ins from Happy Scale, Withings, Renpho or Tropos and try again."
    );
  }

  const today = options.todayKey ?? localDateString();
  const byDate = new Map<string, ParsedBodyweightEntry>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const parsedDate = parseWeighInDate(row[cols.dateIdx] ?? "");
    if (!parsedDate || parsedDate.date > today) continue;

    const weightKg = parseWeightToKg(row[cols.weightIdx] ?? "", cols.unit);
    if (weightKg === null) continue;

    const existing = byDate.get(parsedDate.date);
    if (!existing || parsedDate.ms >= existing.timestampMs) {
      byDate.set(parsedDate.date, {
        date: parsedDate.date,
        weightKg,
        timestampMs: parsedDate.ms,
      });
    }
  }

  if (byDate.size === 0) {
    throw new BodyweightCsvImportError(
      "CSV_NO_ENTRIES",
      "No valid weigh-ins were found in this CSV file."
    );
  }

  let entries = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  if (entries.length > MAX_IMPORTED_WEIGH_INS) {
    entries = entries.slice(-MAX_IMPORTED_WEIGH_INS);
  }

  return {
    entries,
    earliestDate: entries[0].date,
    latestDate: entries[entries.length - 1].date,
  };
}

/**
 * Parses a bodyweight CSV and queues idempotent date-keyed durable writes
 * into `users/{uid}/bodyweightLogs/{YYYY-MM-DD}`.
 */
export async function importBodyweightCsv(
  uid: string,
  csvText: string,
  options: ParseBodyweightCsvOptions = {}
): Promise<ImportedBodyweightSummary> {
  const parsed = parseBodyweightCsv(csvText, options);

  for (const entry of parsed.entries) {
    const ts = Timestamp.fromMillis(entry.timestampMs);
    queueDurableWrite(uid, `users/${uid}/bodyweightLogs`, entry.date, {
      date: entry.date,
      weight: entry.weightKg,
      source: "import",
      createdAt: ts,
      updatedAt: ts,
    });
  }

  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    await flushQueue(db, uid).catch(() => {});
  }

  return {
    importedCount: parsed.entries.length,
    earliestDate: parsed.earliestDate,
    latestDate: parsed.latestDate,
  };
}
