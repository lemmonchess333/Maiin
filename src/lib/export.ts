import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { isActiveMealDoc } from "@/lib/mealTotals";
import { db } from "@/lib/firebase";
import { fetchSavedWorkouts } from "@/lib/savedWorkouts";
import { fetchSavedRuns } from "@/lib/savedRuns";
import { workoutCircuit } from "@/features/circuit/savedCircuit";

/** CSV quoting protects cell boundaries; an apostrophe also keeps untrusted
 * formula prefixes as text when the export is opened in a spreadsheet. */
function csvCell(value: unknown, alwaysQuote = false): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let text = String(value ?? "");
  const formula =
    /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/u.test(text);
  if (formula) text = "'" + text;
  return alwaysQuote || formula || /[",\r\n]/u.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export async function exportWorkoutsCSV(uid: string): Promise<string> {
  // Every saved workout, including one finished on this phone and not yet
  // synced: it is the user's data from the moment they finished it.
  const workouts = await fetchSavedWorkouts(uid, { all: true });

  const rows = ["Date,Exercise,Set,Weight (kg),Reps,Type,RPE"];

  // Older workouts named an exercise `name` and a set's load `weight`.
  type ExportedExercise = {
    exerciseName?: string;
    name?: string;
    sets?: {
      weightKg?: number;
      weight?: number;
      reps?: number;
      type?: string;
      rpe?: number;
    }[];
  };
  for (const w of workouts) {
    // A circuit (Circ1) has no sets, and is one session: one row, its
    // name, the rounds done under Set and the session's seconds under
    // Reps, as a timed hold's seconds are.
    const circuit = workoutCircuit(w);
    if (circuit) {
      rows.push(
        [
          csvCell(w.date),
          csvCell(circuit.name, true),
          csvCell(circuit.roundsDone),
          csvCell(0),
          csvCell(circuit.activeSeconds),
          csvCell("circuit"),
          csvCell(""),
        ].join(",")
      );
      continue;
    }
    for (const ex of w.exercises as unknown as ExportedExercise[]) {
      if (!Array.isArray(ex.sets)) continue;
      ex.sets.forEach((set, i) => {
        const rpeCell =
          typeof set.rpe === "number" && Number.isFinite(set.rpe)
            ? set.rpe
            : "";
        rows.push(
          [
            csvCell(w.date),
            csvCell(ex.exerciseName || ex.name || "", true),
            csvCell(i + 1),
            csvCell(set.weightKg ?? set.weight ?? 0),
            csvCell(set.reps ?? 0),
            csvCell(set.type || "working"),
            csvCell(rpeCell),
          ].join(",")
        );
      });
    }
  }

  return rows.join("\n");
}

export async function exportRunsCSV(uid: string): Promise<string> {
  const runs = await fetchSavedRuns(uid, { all: true });
  const rows = [
    "Date,Type,Distance (km),Duration (s),Avg pace (s/km),Elevation gain (m),Calories,Place,Effort",
  ];

  for (const run of runs) {
    if (run.isInvalid && !run.savedAnyway) continue;
    const distanceKm = Math.round((run.distance / 1000) * 100) / 100;
    rows.push(
      [
        csvCell(run.day),
        csvCell(run.activityType || run.type || "run"),
        csvCell(distanceKm),
        csvCell(Math.round(run.duration)),
        csvCell(Math.round(run.avgPace)),
        csvCell(Math.round(run.elevationGain)),
        csvCell(Math.round(run.calories)),
        csvCell(run.place ?? ""),
        csvCell(run.relativeEffort ?? ""),
      ].join(",")
    );
  }

  return rows.join("\n");
}

export async function exportMealsCSV(uid: string): Promise<string> {
  const mealsRef = collection(db, "users", uid, "meals");
  const q = query(mealsRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const rows = ["Date,Meal,Calories,Protein (g),Carbs (g),Fat (g)"];

  snap.docs.forEach((docSnap) => {
    const m = docSnap.data();
    // Soft-deleted meals (Recently Deleted, kept 30 days) are not part of
    // the diary the totals, review and scoring show — the export must not
    // say otherwise.
    if (!isActiveMealDoc(m)) return;
    const date =
      m.date || (m.createdAt?.toDate?.()?.toISOString?.()?.split("T")[0] ?? "");
    rows.push(
      [
        csvCell(date),
        csvCell(m.foodName || m.name || "", true),
        csvCell(m.totalCalories ?? m.calories ?? 0),
        csvCell(m.totalProtein ?? m.protein ?? 0),
        csvCell(m.totalCarbs ?? m.carbs ?? 0),
        csvCell(m.totalFat ?? m.fat ?? 0),
      ].join(",")
    );
  });

  return rows.join("\n");
}

export async function exportBodyweightCSV(uid: string): Promise<string> {
  const logsRef = collection(db, "users", uid, "bodyweightLogs");
  const q = query(logsRef, orderBy("date", "desc"));
  const snap = await getDocs(q);

  const rows = ["Date,Weight (kg)"];
  snap.docs.forEach((docSnap) => {
    const d = docSnap.data();
    rows.push([csvCell(d.date), csvCell(d.weight)].join(","));
  });

  return rows.join("\n");
}

export interface FullDataExport {
  schemaVersion: 1;
  exportedAt: string;
  workouts: {
    date: string;
    exercises: {
      name: string;
      sets: {
        set: number;
        weightKg: number;
        reps: number;
        type: string;
        rpe?: number;
      }[];
    }[];
    circuit?: {
      name: string;
      roundsDone: number;
      activeSeconds: number;
    };
  }[];
  runs: {
    date: string;
    distanceKm: number;
    durationSec: number;
    avgPaceSecPerKm: number;
    elevationGainM: number;
    activityType: string;
    place?: string;
  }[];
  meals: {
    date: string;
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }[];
  bodyweight: {
    date: string;
    weightKg: number;
  }[];
}

/**
 * Full portable JSON backup combining workouts, runs, active meals, and
 * bodyweight logs. Reuses the same single-source readers (`fetchSavedWorkouts`,
 * `fetchSavedRuns`, `isActiveMealDoc`) so soft-deleted meals and discarded
 * invalid runs never leak into the archive.
 */
export async function exportAllDataJSON(uid: string): Promise<string> {
  const [rawWorkouts, rawRuns, mealsSnap, bwSnap] = await Promise.all([
    fetchSavedWorkouts(uid, { all: true }),
    fetchSavedRuns(uid, { all: true }),
    getDocs(
      query(collection(db, "users", uid, "meals"), orderBy("createdAt", "desc"))
    ),
    getDocs(
      query(
        collection(db, "users", uid, "bodyweightLogs"),
        orderBy("date", "desc")
      )
    ),
  ]);

  type LegacyExercise = {
    exerciseName?: string;
    name?: string;
    sets?: {
      weightKg?: number;
      weight?: number;
      reps?: number;
      type?: string;
      rpe?: number;
    }[];
  };

  const workouts: FullDataExport["workouts"] = rawWorkouts.map((w) => {
    const circuit = workoutCircuit(w);
    if (circuit) {
      return {
        date: w.date,
        exercises: [],
        circuit: {
          name: circuit.name,
          roundsDone: circuit.roundsDone,
          activeSeconds: circuit.activeSeconds,
        },
      };
    }
    const exercises = (w.exercises as unknown as LegacyExercise[])
      .filter((ex) => Array.isArray(ex.sets))
      .map((ex) => ({
        name: ex.exerciseName || ex.name || "",
        sets: (ex.sets ?? []).map((set, i) => ({
          set: i + 1,
          weightKg: set.weightKg ?? set.weight ?? 0,
          reps: set.reps ?? 0,
          type: set.type || "working",
          ...(typeof set.rpe === "number" && Number.isFinite(set.rpe)
            ? { rpe: set.rpe }
            : {}),
        })),
      }));
    return { date: w.date, exercises };
  });

  const runs: FullDataExport["runs"] = rawRuns
    .filter((r) => !(r.isInvalid && !r.savedAnyway))
    .map((r) => ({
      date: r.day || r.date || "",
      distanceKm: Number.isFinite(r.distance)
        ? Math.round((r.distance / 1000) * 100) / 100
        : 0,
      durationSec: Number.isFinite(r.duration) ? Math.round(r.duration) : 0,
      avgPaceSecPerKm: Number.isFinite(r.avgPace) ? Math.round(r.avgPace) : 0,
      elevationGainM: Number.isFinite(r.elevationGain)
        ? Math.round(r.elevationGain)
        : 0,
      activityType: r.activityType || r.type || "freerun",
      ...(r.place ? { place: r.place } : {}),
    }));

  const meals: FullDataExport["meals"] = [];
  mealsSnap.docs.forEach((docSnap) => {
    const m = docSnap.data();
    if (!isActiveMealDoc(m)) return;
    const date =
      m.date || (m.createdAt?.toDate?.()?.toISOString?.()?.split("T")[0] ?? "");
    meals.push({
      date,
      name: String(m.foodName || m.name || ""),
      calories: Number(m.totalCalories ?? m.calories ?? 0) || 0,
      proteinG: Number(m.totalProtein ?? m.protein ?? 0) || 0,
      carbsG: Number(m.totalCarbs ?? m.carbs ?? 0) || 0,
      fatG: Number(m.totalFat ?? m.fat ?? 0) || 0,
    });
  });

  const bodyweight: FullDataExport["bodyweight"] = bwSnap.docs.map(
    (docSnap) => {
      const d = docSnap.data();
      return {
        date: String(d.date ?? ""),
        weightKg: Number(d.weight ?? 0) || 0,
      };
    }
  );

  const payload: FullDataExport = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    workouts,
    runs,
    meals,
    bodyweight,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * An export as a CSV file, for shareFile to hand over: the share sheet on
 * the iPhone (Save to Files, Mail…), a download on the web. This was a
 * blob `<a download>` everywhere, which WKWebView drops without a word,
 * so on iPhone nothing was saved while the app said "exported".
 */
export function csvFile(content: string, filename: string): File {
  return new File([content], filename, { type: "text/csv" });
}

/** Full-account JSON archive file for shareFile to hand over. */
export function jsonFile(content: string, filename: string): File {
  return new File([content], filename, { type: "application/json" });
}
