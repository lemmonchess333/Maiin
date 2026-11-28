/**
 * Nutrition / meal CSV import (MyFitnessPal, Cronometer, Lose It!,
 * MacroFactor, and Tropos meal CSV exports).
 *
 * Zero external dependencies: RFC 4180 CSV parser (comma / semicolon / tab,
 * BOM stripping, quoted fields, comma decimal support), deterministic
 * idempotent meal IDs (`csv-<hash>`), and durable writes through
 * `queueDurableWrite` + `flushQueue`.
 */
import { Timestamp } from "firebase/firestore";
import {
  commitBulkImportWrites,
  type BulkImportEntry,
  type BulkImportProgress,
} from "@/lib/bulkImportWrite";
import { localDateString } from "@/lib/dateHelpers";

const MAX_MEALS = 5000;

export type NutritionCsvImportErrorCode =
  "CSV_EMPTY" | "CSV_UNRECOGNIZED_FORMAT" | "CSV_NO_ENTRIES";

export class NutritionCsvImportError extends Error {
  readonly code: NutritionCsvImportErrorCode;
  constructor(code: NutritionCsvImportErrorCode, message: string) {
    super(message);
    this.name = "NutritionCsvImportError";
    this.code = code;
  }
}

export interface ParseNutritionCsvOptions {
  /** Override today's YYYY-MM-DD key for deterministic testing. */
  todayKey?: string;
  /** Optional progress callback as write batches commit. */
  onProgress?: (progress: BulkImportProgress) => void;
}

export interface ParsedMealRecord {
  docId: string;
  date: string;
  data: {
    date: string;
    foodName: string;
    items: {
      name: string;
      portionSize: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }[];
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    source: "import";
    createdAt: Timestamp;
  };
}

export interface ImportedNutritionCsvSummary {
  importedCount: number;
  earliestDate: string;
  latestDate: string;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const delim of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === delim) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }
  return best;
}

function parseCsvRows(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const firstNewline = text.search(/\r?\n/);
  const firstLine = firstNewline >= 0 ? text.slice(0, firstNewline) : text;
  const delim = detectDelimiter(firstLine);

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
    } else if (ch === delim) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function makeDayKey(
  year: number,
  month: number,
  day: number
): { date: string; noonMs: number } | null {
  if (
    year < 1990 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const dt = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    noonMs: dt.getTime(),
  };
}

function detectSlashOrder(dateValues: string[]): "dmy" | "mdy" {
  let sawFirstOver12 = false;
  let sawSecondOver12 = false;
  for (const raw of dateValues) {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(raw.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) sawFirstOver12 = true;
    if (b > 12) sawSecondOver12 = true;
  }
  if (sawFirstOver12 && !sawSecondOver12) return "dmy";
  return "mdy";
}

function parseDateCell(
  raw: string,
  slashOrder: "dmy" | "mdy"
): { date: string; noonMs: number } | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD (with optional ISO time suffix)
  const iso = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (iso) {
    return makeDayKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s.*)?$/.exec(s);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const rawYear = Number(slash[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const [month, day] =
      a > 12
        ? [b, a]
        : b > 12
          ? [a, b]
          : slashOrder === "dmy"
            ? [b, a]
            : [a, b];
    return makeDayKey(year, month, day);
  }

  // "Oct 12, 2026" or "12 Oct 2026"
  const mdyText = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (mdyText) {
    const month = MONTH_MAP[mdyText[1].toLowerCase()];
    if (month) return makeDayKey(Number(mdyText[3]), month, Number(mdyText[2]));
  }
  const dmyText = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/.exec(s);
  if (dmyText) {
    const month = MONTH_MAP[dmyText[2].toLowerCase()];
    if (month) return makeDayKey(Number(dmyText[3]), month, Number(dmyText[1]));
  }

  return null;
}

function parseMetricNumber(raw: string | undefined): number {
  if (!raw) return 0;
  let cleaned = raw
    .trim()
    .replace(/(?:kcal|cal|cals|g|grams?)$/i, "")
    .trim();
  if (!cleaned || cleaned === "-" || cleaned === "—") return 0;
  // Support European comma decimals when there is no period (e.g. "42,5").
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = `${parts[0]}.${parts[1]}`;
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

interface ColumnMap {
  dateCol: number;
  nameCol: number;
  mealTypeCol: number;
  caloriesCol: number;
  proteinCol: number;
  carbsCol: number;
  fatCol: number;
}

function resolveColumns(headers: string[]): ColumnMap | null {
  const norm = headers.map(normalizeHeader);
  const findCol = (matchers: RegExp[]): number => {
    for (const re of matchers) {
      const idx = norm.findIndex((h) => re.test(h));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const dateCol = findCol([
    /^date$/,
    /^day$/,
    /^logged?\s*date$/,
    /^entry\s*date$/,
    /^timestamp$/,
  ]);
  const caloriesCol = findCol([
    /^calories(?:\s*\(kcal\))?$/,
    /^energy(?:\s*\(kcal\))?$/,
    /^kcal$/,
    /^total\s*calories$/,
  ]);
  if (dateCol < 0 || caloriesCol < 0) return null;

  const nameCol = findCol([
    /^food\s*name$/,
    /^meal\s*name$/,
    /^meal$/,
    /^name$/,
    /^item$/,
    /^food$/,
    /^description$/,
  ]);
  const mealTypeCol = findCol([
    /^type$/,
    /^meal\s*type$/,
    /^group$/,
    /^category$/,
  ]);
  const proteinCol = findCol([/^protein(?:\s*\(g\))?$/]);
  const carbsCol = findCol([
    /^carbs?(?:\s*\(g\))?$/,
    /^carbohydrates?(?:\s*\(g\))?$/,
    /^total\s*carbs?(?:\s*\(g\))?$/,
  ]);
  const fatCol = findCol([
    /^fat(?:\s*\(g\))?$/,
    /^total\s*fat(?:\s*\(g\))?$/,
    /^fats?(?:\s*\(g\))?$/,
  ]);

  return {
    dateCol,
    nameCol,
    mealTypeCol: mealTypeCol === nameCol ? -1 : mealTypeCol,
    caloriesCol,
    proteinCol,
    carbsCol,
    fatCol,
  };
}

/**
 * Parses a nutrition CSV (Tropos, MyFitnessPal, Cronometer, Lose It!, or
 * MacroFactor) into validated, deterministically keyed meal documents.
 */
export function parseNutritionCsv(
  csvText: string,
  options: ParseNutritionCsvOptions = {}
): ParsedMealRecord[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new NutritionCsvImportError(
      "CSV_EMPTY",
      "This CSV file is empty or only contains headers."
    );
  }

  const cols = resolveColumns(rows[0]);
  if (!cols) {
    throw new NutritionCsvImportError(
      "CSV_UNRECOGNIZED_FORMAT",
      "Couldn’t recognise this nutrition CSV. Export meals from MyFitnessPal, Cronometer, Lose It!, MacroFactor or Tropos and try again."
    );
  }

  const todayKey = options.todayKey ?? localDateString(new Date());
  const dataRows = rows.slice(1);
  const slashOrder = detectSlashOrder(
    dataRows.map((r) => r[cols.dateCol] ?? "")
  );

  const meals: ParsedMealRecord[] = [];
  const seenCounts = new Map<string, number>();

  for (const row of dataRows) {
    if (meals.length >= MAX_MEALS) break;
    const day = parseDateCell(row[cols.dateCol] ?? "", slashOrder);
    if (!day || day.date > todayKey) continue;

    const calories = Math.round(parseMetricNumber(row[cols.caloriesCol]));
    const protein =
      cols.proteinCol >= 0
        ? Math.round(parseMetricNumber(row[cols.proteinCol]) * 10) / 10
        : 0;
    const carbs =
      cols.carbsCol >= 0
        ? Math.round(parseMetricNumber(row[cols.carbsCol]) * 10) / 10
        : 0;
    const fat =
      cols.fatCol >= 0
        ? Math.round(parseMetricNumber(row[cols.fatCol]) * 10) / 10
        : 0;

    // Skip zero-calorie / zero-macro rows (e.g. water or empty diary placeholders).
    if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) continue;

    const rawName = cols.nameCol >= 0 ? (row[cols.nameCol] ?? "").trim() : "";
    const rawType =
      cols.mealTypeCol >= 0 ? (row[cols.mealTypeCol] ?? "").trim() : "";
    const foodName = rawName || rawType || "Imported meal";

    const baseKey = `meal|${day.date}|${foodName}|${calories}|${protein}|${carbs}|${fat}`;
    const occ = seenCounts.get(baseKey) ?? 0;
    seenCounts.set(baseKey, occ + 1);

    meals.push({
      docId: `csv-${fnv1a32(`${baseKey}|${occ}`)}`,
      date: day.date,
      data: {
        date: day.date,
        foodName,
        items: [
          {
            name: foodName,
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

  if (meals.length === 0) {
    throw new NutritionCsvImportError(
      "CSV_NO_ENTRIES",
      "No valid meal entries were found in this CSV."
    );
  }

  return meals;
}

/**
 * Parses a nutrition CSV and durably queues all meals into `users/{uid}/meals`.
 */
export async function importNutritionCsv(
  uid: string,
  csvText: string,
  options: ParseNutritionCsvOptions = {}
): Promise<ImportedNutritionCsvSummary> {
  const meals = parseNutritionCsv(csvText, options);

  let earliestDate = meals[0].date;
  let latestDate = meals[0].date;
  const writes: BulkImportEntry[] = [];
  for (const m of meals) {
    if (m.date < earliestDate) earliestDate = m.date;
    if (m.date > latestDate) latestDate = m.date;
    writes.push({
      collectionPath: `users/${uid}/meals`,
      docId: m.docId,
      data: m.data,
    });
  }

  await commitBulkImportWrites(uid, writes, options.onProgress);

  return {
    importedCount: meals.length,
    earliestDate,
    latestDate,
  };
}
