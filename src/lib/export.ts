import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function exportWorkoutsCSV(uid: string): Promise<string> {
  const workoutsRef = collection(db, "users", uid, "workouts");
  const q = query(workoutsRef, orderBy("date", "desc"));
  const snap = await getDocs(q);

  const rows = ["Date,Exercise,Set,Weight (kg),Reps,Type"];

  snap.docs.forEach((docSnap) => {
    const w = docSnap.data();
    const date = w.date || "";
    if (Array.isArray(w.exercises)) {
      w.exercises.forEach((ex: any) => {
        if (Array.isArray(ex.sets)) {
          ex.sets.forEach((set: any, i: number) => {
            rows.push(
              `${date},"${(ex.exerciseName || ex.name || "").replace(/"/g, '""')}",${i + 1},${set.weightKg ?? set.weight ?? 0},${set.reps ?? 0},${set.type || "working"}`
            );
          });
        }
      });
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
    const date = m.date || (m.createdAt?.toDate?.()?.toISOString?.()?.split("T")[0] ?? "");
    rows.push(
      `${date},"${(m.foodName || m.name || "").replace(/"/g, '""')}",${m.totalCalories ?? m.calories ?? 0},${m.totalProtein ?? m.protein ?? 0},${m.totalCarbs ?? m.carbs ?? 0},${m.totalFat ?? m.fat ?? 0}`
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
    rows.push(`${d.date},${d.weight}`);
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
