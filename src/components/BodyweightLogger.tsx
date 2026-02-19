import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { Scale, Check, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface WeightLog {
  id: string;
  date: string;
  weight: number;
}

export default function BodyweightLogger() {
  const { user, profile } = useAuth();
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recentLogs, setRecentLogs] = useState<WeightLog[]>([]);

  useEffect(() => {
    if (!user) return;

    try {
      const logsRef = collection(db, "users", user.uid, "bodyweightLogs");
      const q = query(logsRef, orderBy("date", "desc"), limit(7));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const logs: WeightLog[] = [];
          snapshot.docs.forEach((d) => {
            const data = d.data();
            if (typeof data.weight === "number" && data.date) {
              logs.push({
                id: d.id,
                date: data.date,
                weight: data.weight,
              });
            }
          });
          setRecentLogs(logs);
        },
        (error) => {
          console.error("BodyweightLogger snapshot error:", error);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error("BodyweightLogger setup error:", error);
    }
  }, [user]);

  async function handleSubmit() {
    if (!weight || !user) return;

    setSaving(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      await addDoc(collection(db, "users", user.uid, "bodyweightLogs"), {
        date: today,
        weight: Number(weight),
        createdAt: serverTimestamp(),
      });

      setWeight("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Error saving weight:", error);
    }
    setSaving(false);
  }

  const unit = profile?.preferredWeightUnit || "kg";
  const displayWeight = (w: number | undefined | null) => {
    const val = typeof w === "number" && !isNaN(w) ? w : 0;
    return unit === "lbs" ? (val * 2.20462).toFixed(1) : val.toFixed(1);
  };

  const trend =
    recentLogs.length >= 2
      ? recentLogs[0].weight - recentLogs[1].weight
      : null;

  return (
    <div className="bg-card rounded-xl border border-border/50 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Bodyweight Check-in</p>
        {trend !== null && !isNaN(trend) && (
          <div className="flex items-center gap-1 ml-auto text-xs">
            {trend > 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            ) : trend < 0 ? (
              <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
            ) : null}
            <span className={trend > 0 ? "text-green-500" : trend < 0 ? "text-blue-500" : "text-muted-foreground"}>
              {trend > 0 ? "+" : ""}{displayWeight(trend)} {unit}
            </span>
          </div>
        )}
      </div>

      {/* Input Row */}
      <div className="flex gap-2">
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={`${displayWeight(profile?.weightKg ?? 70)} ${unit}`}
          step="0.1"
          className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !weight}
          className={cn(
            "px-5 py-3 rounded-xl font-medium text-sm transition-all",
            saved
              ? "bg-green-500 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90",
            (saving || !weight) && "opacity-50 cursor-not-allowed"
          )}
        >
          {saved ? <Check className="w-4 h-4" /> : saving ? "..." : "Log"}
        </button>
      </div>

      {/* Recent Logs */}
      {recentLogs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {recentLogs.map((log) => (
            <div
              key={log.id}
              className="flex-shrink-0 bg-muted rounded-lg px-3 py-2 text-center min-w-[60px]"
            >
              <p className="text-xs text-muted-foreground">
                {format(new Date(log.date), "dd/MM")}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {displayWeight(log.weight)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}