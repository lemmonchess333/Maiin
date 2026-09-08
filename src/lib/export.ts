import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { isActiveMealDoc } from "@/lib/mealTotals";
import { db } from "@/lib/firebase";

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
  const workoutsRef = collection(db, "users", uid, "workouts");
  const q = query(workoutsRef, orderBy("date", "desc"));
  const snap = await getDocs(q);

  const rows = ["Date,Exercise,Set,Weight (kg),Reps,Type"];

  snap.docs.forEach((docSnap) => {
    const w = docSnap.data();
    const date = w.date || "";
    if (Array.isArray(w.exercises)) {
      w.exercises.forEach(
        (ex: {
          exerciseName?: string;
          name?: string;
          sets?: {
            weightKg?: number;
            weight?: number;
            reps?: number;
            type?: string;
          }[];
        }) => {
          if (Array.isArray(ex.sets)) {
            ex.sets.forEach((set, i: number) => {
              rows.push(
                [
                  csvCell(date),
                  csvCell(ex.exerciseName || ex.name || "", true),
                  csvCell(i + 1),
                  csvCell(set.weightKg ?? set.weight ?? 0),
                  csvCell(set.reps ?? 0),
                  csvCell(set.type || "working"),
                ].join(",")
              );
            });
          }
        }
      );
    }
  });

  return rows.join("\n");
}

export async function exportMealsCSV(uid: string): Promise<string> {
  const mealsRef = collection(db, "users", uid, "meals");
  const q = query(mealsRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const rows = ["Date,Meal,Calories,Protein (g),Carbs (g),Fat (g)"];

  snap.docs.forEach((docSnap) => {
    const m = docSnap.data();
    // Soft-deleted meals (Recently Deleted, 24 h window) are not part of
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

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
