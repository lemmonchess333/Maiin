import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { 
  Scale, 
  Check, 
  TrendingUp, 
  TrendingDown 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";

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
      const logsRef = collection(db, "users", user.uid, "bodyweightLogs");
      // Always store weight in kg for consistency
      const rawValue = Number(weight);
      const storeWeight = unit === "lbs" ? rawValue / 2.20462 : rawValue;

      // Check for existing entry today to avoid duplicates
      const existing = await getDocs(query(logsRef, where("date", "==", today)));

      if (!existing.empty) {
        // Update existing entry
        const existingDoc = existing.docs[0];
        await updateDoc(doc(db, "users", user.uid, "bodyweightLogs", existingDoc.id), {
          weight: storeWeight,
          createdAt: serverTimestamp(),
        });
      } else {
        await addDoc(logsRef, {
          date: today,
          weight: storeWeight,
          createdAt: serverTimestamp(),
        });
      }

      setWeight("");
      setSaved(true);

      // Light confetti on successful log
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.7 },
        colors: ["#f59e0b", "#fbbf24"],
      });

      setTimeout(() => setSaved(false), 1800);
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

  // Deduplicate by date for trend calculation (keep latest per date)
  const uniqueDateLogs = Object.values(
    recentLogs.reduce((acc, log) => {
      if (!acc[log.date] || log.id > acc[log.date].id) acc[log.date] = log;
      return acc;
    }, {} as Record<string, WeightLog>)
  ).sort((a, b) => b.date.localeCompare(a.date));

  const trend =
    uniqueDateLogs.length >= 2
      ? uniqueDateLogs[0].weight - uniqueDateLogs[1].weight
      : null;

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Scale className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Bodyweight Check-in</p>
            <p className="text-xs text-muted-foreground">Track your progress</p>
          </div>
        </div>

        {/* Trend Indicator */}
        {trend !== null && !isNaN(trend) && (
          <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-muted">
            {trend > 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            ) : trend < 0 ? (
              <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
            ) : null}
            <span className={trend > 0 ? "text-green-500" : "text-blue-500"}>
              {trend > 0 ? "+" : ""}{displayWeight(trend)} {unit}
            </span>
          </div>
        )}
      </div>

      {/* Input + Log Button */}
      <div className="flex gap-3 overflow-hidden">
        <input
          type="number"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={`${displayWeight(profile?.weightKg ?? 70)} ${unit}`}
          className="flex-1 min-w-0 px-5 py-3.5 rounded-2xl bg-white border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg font-medium"
        />
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={saving || !weight}
          className={cn(
            "px-6 py-3.5 rounded-2xl font-medium text-sm transition-all flex items-center justify-center min-w-[68px] flex-shrink-0",
            saved
              ? "bg-green-500 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.985]",
            (saving || !weight) && "opacity-50 cursor-not-allowed"
          )}
        >
          {saved ? <Check className="w-5 h-5" /> : saving ? "..." : "Log"}
        </motion.button>
      </div>

      {/* Recent Logs */}
      {recentLogs.length > 0 && (() => {
        // Deduplicate by date (keep latest entry per date)
        const dedupedLogs = Object.values(
          recentLogs.reduce((acc, log) => {
            if (!acc[log.date] || log.id > acc[log.date].id) {
              acc[log.date] = log;
            }
            return acc;
          }, {} as Record<string, WeightLog>)
        ).sort((a, b) => b.date.localeCompare(a.date));

        // Single entry: simple line display
        if (dedupedLogs.length === 1) {
          const log = dedupedLogs[0];
          const d = new Date(log.date + "T12:00:00");
          return (
            <div className="flex items-center justify-between px-1 py-2">
              <p className="text-xs text-muted-foreground">Last logged</p>
              <p className="text-sm font-semibold text-foreground">
                {displayWeight(log.weight)} {unit}
                <span className="text-xs text-muted-foreground font-normal ml-1.5">
                  on {format(d, "MMM d")}
                </span>
              </p>
            </div>
          );
        }

        // 2+ entries: chips + sparkline when 4+
        const sparklineData = dedupedLogs.length >= 4
          ? [...dedupedLogs].reverse().map((l) => l.weight)
          : null;

        return (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Last {dedupedLogs.length} days</p>
          {sparklineData && (() => {
            const vals = sparklineData.map((w) => Number(displayWeight(w)));
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const range = max - min || 1;
            const h = 32;
            const w2 = 100;
            const points = vals.map((v, i) => {
              const x = (i / (vals.length - 1)) * w2;
              const y = h - ((v - min) / range) * (h - 4) - 2;
              return `${x},${y}`;
            }).join(" ");
            return (
              <div className="mb-2 px-1">
                <svg viewBox={`0 0 ${w2} ${h}`} className="w-full h-8" preserveAspectRatio="none">
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    className="text-primary/40"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            );
          })()}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {dedupedLogs.map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="flex-shrink-0 bg-muted/70 border border-border/50 rounded-2xl px-4 py-3 text-center min-w-[68px]"
              >
                <p className="text-[10px] text-muted-foreground font-medium">
                  {format(new Date(log.date + "T12:00:00"), "dd/MM")}
                </p>
                <p className="text-lg font-semibold text-foreground tracking-tight">
                  {displayWeight(log.weight)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
        );
      })()}

      {/* Empty state hint – with overflow fix */}
      {recentLogs.length === 0 && (
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground text-center break-words whitespace-pre-wrap leading-relaxed">
            No recent logs • Your first check-in will appear here
          </p>
        </div>
      )}
    </div>
  );
}