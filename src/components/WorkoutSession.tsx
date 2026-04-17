import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ProgramExercise } from "@/features/program/programTypes";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import {
  Play,
  RotateCcw,
  Check,
  X,
  Dumbbell,
  Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { buildPRMap, checkSetPR, repBucketLabel, type PRMap, type RepBucket } from "@/lib/prTracking";
import { getExerciseById } from "@/lib/exercises";
import SessionCompleteScreen from "@/components/workout/SessionCompleteScreen";
import RestTimerRing from "@/components/workout/RestTimerRing";
import StallModal from "@/components/workout/StallModal";
const lazyConfetti = () => import("canvas-confetti").then(m => m.default);

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = 523;
    osc2.frequency.value = 659;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.15);
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.8);
  } catch {
    // AudioContext may not be available
  }
}

interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

type SetType = "working" | "warmup" | "dropset" | "failure";

const SET_TYPE_CONFIG: Record<SetType, { label: string; color: string; bg: string }> = {
  working: { label: "W", color: "text-foreground", bg: "" },
  warmup: { label: "W", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  dropset: { label: "D", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
  failure: { label: "F", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
};

const SET_TYPE_ORDER: SetType[] = ["working", "warmup", "dropset", "failure"];

const TYPE_COLORS: Record<SetType, string> = {
  working: "#a3a3a3",
  warmup: "#FFA94D",
  dropset: "#B197FC",
  failure: "#FF6B6B",
};

const TYPE_LABELS: Record<SetType, string> = {
  working: "Working",
  warmup: "Warmup",
  dropset: "Drop",
  failure: "Failure",
};

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

interface SetLog {
  reps: number;
  weight: number;
  completed: boolean;
  type: SetType;
  rpe?: number;
}

interface Props {
  day: WorkoutDay;
  dayIndex: number;
  onLogExercise: (dayIndex: number, exIndex: number, reps: number, weight: number) => Promise<void>;
  onCompleteDay: (
    dayIndex: number,
    sessionData?: {
      durationMinutes: number;
      setLogs: Array<Array<{ weight: number; reps: number; completed: boolean }>>;
    },
  ) => Promise<void>;
  onClose: () => void;
}

export default function WorkoutSession({ day, dayIndex, onLogExercise, onCompleteDay, onClose }: Props) {
  const { user } = useAuth();
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [setLogs, setSetLogs] = useState<SetLog[][]>(() =>
    day.exercises.map((ex) =>
      Array.from({ length: ex.sets }, () => ({
        reps: ex.reps,
        weight: ex.weight,
        completed: false,
        type: "working" as SetType,
      }))
    )
  );
  const [showRPE, setShowRPE] = useState(false);
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>({});
  const [typePopover, setTypePopover] = useState<number | null>(null);
  const popoverPosRef = useRef<{ top: number; left: number; bottom: number }>({ top: 0, left: 0, bottom: 0 });
  const tabsRef = useRef<HTMLDivElement>(null);
  const sessionStartRef = useRef(0);
  useEffect(() => { sessionStartRef.current = Date.now(); }, []);

  // Auto-scroll exercise tabs when active exercise changes
  useEffect(() => {
    const container = tabsRef.current;
    const activeBtn = container?.children[currentExIndex] as HTMLElement | undefined;
    activeBtn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentExIndex]);

  // Multi-rep-range PR tracking
  const [prMap, setPrMap] = useState<PRMap>({});
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [firedPRs, setFiredPRs] = useState<Map<string, RepBucket[]>>(new Map());

  // Pre-fill weights/reps from most recent previous session + build PR map
  useEffect(() => {
    if (!user?.uid || !day.exercises.length) return;

    const fetchPreviousWeights = async () => {
      const workoutsRef = collection(db, "users", user.uid, "workouts");
      const snap = await getDocs(query(workoutsRef, orderBy("date", "desc"), limit(50)));

      const prevWeights: Record<string, { weight: number; reps: number }[]> = {};

      snap.docs.forEach((d) => {
        const data = d.data();
        (data.exercises || []).forEach((ex: { exerciseName: string; sets?: { weightKg?: number; reps?: number }[] }) => {
          const name = ex.exerciseName;
          if (!prevWeights[name] && ex.sets?.length && ex.sets.length > 0) {
            prevWeights[name] = ex.sets.map((s) => ({
              weight: s.weightKg || 0,
              reps: s.reps || 0,
            }));
          }
        });
      });

      setSetLogs((prev) => {
        const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
        day.exercises.forEach((ex, i) => {
          const name = ex.name;
          const prevSets = prevWeights[name];
          if (prevSets && updated[i]) {
            updated[i] = updated[i].map((set, si) => ({
              ...set,
              weight: set.weight || (prevSets[si]?.weight ?? prevSets[0]?.weight ?? 0),
              reps: set.reps || (prevSets[si]?.reps ?? prevSets[0]?.reps ?? 0),
            }));
          }
        });
        return updated;
      });

      // Load persisted PR map, or build from history if not available
      let prMapLoaded = false;
      try {
        const { doc: fbDoc, getDoc: fbGetDoc } = await import('firebase/firestore');
        const prMapDoc = await fbGetDoc(fbDoc(db, "users", user.uid, "stats", "prMap"));
        if (prMapDoc.exists()) {
          const data = prMapDoc.data();
          setPrMap(data.map as PRMap);
          if (data.sessionCounts) {
            setSessionCounts(data.sessionCounts as Record<string, number>);
            prMapLoaded = true;
          }
        }
      } catch {
        // Fall through to rebuild from history
      }

      if (!prMapLoaded) {
        // Fall back to building from last 50 workouts
        const history = snap.docs.map(d => {
          const data = d.data();
          return {
            date: data.date as string,
            exercises: (data.exercises || []).map((ex: { exerciseName: string; sets: { weightKg: number; reps: number }[] }) => ({
              exerciseName: ex.exerciseName,
              sets: (ex.sets || []).map(s => ({ weightKg: s.weightKg || 0, reps: s.reps || 0 })),
            })),
          };
        });
        setPrMap(buildPRMap(history));

        // Count sessions per exercise for 3-session minimum filter
        const counts: Record<string, number> = {};
        for (const w of history) {
          const seen = new Set<string>();
          for (const ex of w.exercises) {
            if (!seen.has(ex.exerciseName)) {
              counts[ex.exerciseName] = (counts[ex.exerciseName] || 0) + 1;
              seen.add(ex.exerciseName);
            }
          }
        }
        setSessionCounts(counts);
      }
    };

    fetchPreviousWeights();
  }, [user?.uid, day.exercises]);

  // Elapsed workout timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatElapsed = (s: number): string => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  // Rest timer
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTarget, setRestTarget] = useState(90);
  const [isResting, setIsResting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chimeFiredRef = useRef(false);

  // Session state
  const [sessionComplete, setSessionComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(0);

  // Stall detection
  const [stallExercise, setStallExercise] = useState<{name: string, weight: number} | null>(null);

  // Undo last set
  const [lastCompleted, setLastCompleted] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentExercise = day.exercises[currentExIndex];
  const currentSets = setLogs[currentExIndex] ?? [];
  const completedSetsInExercise = currentSets.filter((s) => s.completed).length;
  const totalSetsCompleted = setLogs.flat().filter((s) => s.completed).length;
  const totalSetsTotal = setLogs.flat().length;

  // Haptic feedback helper
  const haptic = useCallback((pattern: number | number[]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }, []);

  // Timer logic
  const startRest = useCallback(() => {
    setRestSeconds(0);
    setIsResting(true);
    chimeFiredRef.current = false;
    haptic(50);
  }, [haptic]);

  const stopRest = useCallback(() => {
    setIsResting(false);
    setRestSeconds(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isResting) {
      timerRef.current = setInterval(() => {
        setRestSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isResting]);

  // Auto-stop timer when it reaches target
  useEffect(() => {
    if (isResting && restSeconds >= restTarget && !chimeFiredRef.current) {
      chimeFiredRef.current = true;
      haptic([200, 100, 200]);
      playChime();
    }
  }, [isResting, restSeconds, restTarget, haptic]);

  const setSetType = (exIdx: number, setIdx: number, type: SetType) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].type = type;
      return updated;
    });
  };

  const updateSetRPE = (exIdx: number, setIdx: number, rpe: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].rpe = rpe;
      return updated;
    });
  };

  const addSet = (exIdx: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      const lastSet = updated[exIdx][updated[exIdx].length - 1];
      updated[exIdx].push({
        reps: lastSet?.reps ?? day.exercises[exIdx].reps,
        weight: lastSet?.weight ?? day.exercises[exIdx].weight,
        completed: false,
        type: "working",
      });
      return updated;
    });
  };

  const updateSetLog = (exIdx: number, setIdx: number, field: "reps" | "weight", value: number) => {
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx][field] = value;
      return updated;
    });
  };

  // Complete a specific set inline (from tapping the DONE circle)
  const completeInlineSet = (setIdx: number) => {
    if (setIdx === currentSetIndex) {
      completeSet();
    } else {
      haptic(50);
      setSetLogs(prev => {
        const updated = prev.map(sets => sets.map(s => ({ ...s })));
        updated[currentExIndex][setIdx].completed = true;
        return updated;
      });
    }
  };

  const completeSet = async () => {
    const set = currentSets[currentSetIndex];
    if (!set) return;

    // Mark set complete
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[currentExIndex][currentSetIndex].completed = true;
      return updated;
    });

    haptic(100);

    // Multi-rep-range PR detection
    const exName = currentExercise.name;
    const prBucket = checkSetPR(exName, set.weight, set.reps, prMap, sessionCounts, 3);
    const alreadyFired = firedPRs.get(exName) || [];
    if (prBucket && !alreadyFired.includes(prBucket)) {
      setFiredPRs((prev) => {
        const updated = new Map(prev);
        updated.set(exName, [...(prev.get(exName) || []), prBucket]);
        return updated;
      });
      setPrMap((prev) => {
        const updated = { ...prev };
        if (!updated[exName]) updated[exName] = { '1rm': null, '3rm': null, '5rm': null, '8rm': null, '10rm': null };
        updated[exName] = { ...updated[exName], [prBucket]: { weight: set.weight, reps: set.reps, date: new Date().toISOString().split('T')[0] } };
        return updated;
      });
      lazyConfetti().then(confetti => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setTimeout(() => confetti({ particleCount: 30, spread: 90, origin: { y: 0.65 }, startVelocity: 15 }), 200);
      });
      haptic(50);
      toast.success(`New ${repBucketLabel(prBucket)}! ${set.weight}kg × ${set.reps} on ${exName}`);
    }

    // Track for undo
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setLastCompleted({ exIdx: currentExIndex, setIdx: currentSetIndex });
    undoTimeoutRef.current = setTimeout(() => setLastCompleted(null), 4000);

    const isLastSet = currentSetIndex >= currentSets.length - 1;
    const isLastExercise = currentExIndex >= day.exercises.length - 1;

    if (isLastSet) {
      // Log exercise performance (use last set's reps/weight)
      await onLogExercise(dayIndex, currentExIndex, set.reps, set.weight);

      if (isLastExercise) {
        setSessionDurationMinutes(Math.round((Date.now() - sessionStartRef.current) / 60000));
        setSessionComplete(true);
      } else {
        // Move to next exercise
        setCurrentExIndex((prev) => prev + 1);
        setCurrentSetIndex(0);
        startRest();
      }
    } else {
      // Move to next set, start rest timer
      setCurrentSetIndex((prev) => prev + 1);
      startRest();
    }
  };

  const handleUndo = () => {
    if (!lastCompleted) return;
    const { exIdx, setIdx } = lastCompleted;
    setSetLogs((prev) => {
      const updated = prev.map((sets) => sets.map((s) => ({ ...s })));
      updated[exIdx][setIdx].completed = false;
      return updated;
    });
    setCurrentExIndex(exIdx);
    setCurrentSetIndex(setIdx);
    stopRest();
    if (sessionComplete) setSessionComplete(false);
    setLastCompleted(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  };

  // Cleanup undo timeout
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  // Stall detection on session completion
  useEffect(() => {
    if (!sessionComplete || !user?.uid) return;

    const checkStalls = async () => {
      const workoutsRef = collection(db, "users", user.uid, "workouts");
      const snap = await getDocs(query(workoutsRef, orderBy("date", "desc"), limit(20)));
      const history = snap.docs.map(d => d.data());

      for (const ex of day.exercises) {
        // Check localStorage cooldown
        const cooldownKey = `tropos_stall_${ex.name}`;
        const lastPopup = localStorage.getItem(cooldownKey);
        if (lastPopup && Date.now() - Number(lastPopup) < 3 * 7 * 86400000) continue; // 3 weeks cooldown

        const lastThree = history
          .filter(w => (w.exercises || []).some((e: { exerciseName: string }) => e.exerciseName === ex.name))
          .slice(0, 3);

        if (lastThree.length < 3) continue;

        const weights = lastThree.map(w => {
          const found = (w.exercises || []).find((e: { exerciseName: string }) => e.exerciseName === ex.name);
          return found?.sets?.map((s: { weightKg?: number }) => s.weightKg).join(',') || '';
        });

        if (weights[0] && weights[0] === weights[1] && weights[1] === weights[2]) {
          const w = lastThree[0].exercises.find((e: { exerciseName: string }) => e.exerciseName === ex.name)?.sets?.[0]?.weightKg || 0;
          setStallExercise({ name: ex.name, weight: w });
          break;
        }
      }
    };

    checkStalls();
  }, [sessionComplete, user?.uid, day.exercises]);

  const handleFinish = async () => {
    setCompleting(true);
    // Pass the wall-clock duration + per-set logs so the saved workout
    // record reflects actual execution instead of planned placeholders.
    // sessionDurationMinutes is finalised in completeSession at the moment
    // the last set is marked done (see line 404); setLogs is the source of
    // truth for which sets were completed with what weight/reps.
    await onCompleteDay(dayIndex, {
      durationMinutes: sessionDurationMinutes,
      setLogs: setLogs.map((exSets) =>
        exSets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          completed: s.completed,
        })),
      ),
    });

    // Persist PR map to Firestore for history beyond 50-session window
    if (user?.uid && Object.keys(prMap).length > 0) {
      try {
        const { doc: fbDoc, setDoc } = await import('firebase/firestore');
        const { Timestamp } = await import('firebase/firestore');
        await setDoc(fbDoc(db, "users", user.uid, "stats", "prMap"), {
          map: prMap,
          sessionCounts,
          updatedAt: Timestamp.now(),
        }, { merge: true });
      } catch {
        // Non-critical — map can be rebuilt from history
      }
    }

    setCompleting(false);
    onClose();
  };

  // Session complete screen
  if (sessionComplete) {
    return (
      <>
        <SessionCompleteScreen
          dayName={day.dayName}
          dayType={day.dayType}
          exercises={day.exercises}
          setLogs={setLogs}
          firedPRs={firedPRs}
          sessionDurationMinutes={sessionDurationMinutes}
          completing={completing}
          onFinish={handleFinish}
          onClose={onClose}
        />
        {stallExercise && (
          <StallModal exercise={stallExercise} onClose={() => setStallExercise(null)} />
        )}
      </>
    );
  }


  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col safe-area-pb">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div>
          <p className="text-sm font-semibold text-foreground">{day.dayName}</p>
          <p className="text-xs text-muted-foreground">
            {totalSetsCompleted}/{totalSetsTotal} sets · {formatElapsed(elapsedSeconds)}
          </p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Close workout">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${totalSetsTotal > 0 ? (totalSetsCompleted / totalSetsTotal) * 100 : 0}%` }}
        />
      </div>

      {/* Exercise navigation pills */}
      <div className="relative">
        <div ref={tabsRef} className="flex gap-1.5 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {day.exercises.map((ex, i) => {
            const setsForEx = setLogs[i] ?? [];
            const done = setsForEx.every((s) => s.completed);
            const active = i === currentExIndex;
            return (
              <button
                key={i}
                onClick={() => {
                  setCurrentExIndex(i);
                  const nextIncomplete = setsForEx.findIndex((s) => !s.completed);
                  setCurrentSetIndex(nextIncomplete >= 0 ? nextIncomplete : 0);
                }}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                  done
                    ? "bg-green-500 text-white font-medium"
                    : active
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <span className="flex items-center gap-1"><Check className="w-3 h-3" />{ex.name}</span> : ex.name}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-5 bg-gradient-to-l from-background to-transparent" />
      </div>

      {/* Exercise name + set counter — always visible above scroll */}
      <div className="text-center px-4 pt-2 pb-1">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
          <h2 className="text-lg font-bold text-foreground">{currentExercise?.name}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Set {currentSetIndex + 1} of {currentSets.length} · {completedSetsInExercise} done
        </p>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Notes input */}
        <div>
          <input
            type="text"
            placeholder="Notes (e.g. Level 8, 6.0 incline)"
            aria-label="Exercise notes"
            value={exerciseNotes[currentExIndex] || ""}
            onChange={(e) => setExerciseNotes(prev => ({ ...prev, [currentExIndex]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Rest Timer - circular */}
        <AnimatePresence>
          {isResting && (
            <RestTimerRing
              restSeconds={restSeconds}
              restTarget={restTarget}
              onStop={stopRest}
              onChangeTarget={setRestTarget}
            />
          )}
        </AnimatePresence>

        {/* Set logging grid */}
        <div className="bg-card rounded-2xl">
          {(() => {
            const prev = currentExercise?.lastPerformance;
            const isBWExercise = currentExercise ? getExerciseById(currentExercise.exerciseId)?.equipment === "Bodyweight" : false;
            const prevLabel = prev
              ? (prev.weight > 0 ? `${prev.weight}×${prev.reps}` : isBWExercise ? `BW×${prev.reps}` : "—")
              : "—";
            const canFillPrev = prev != null && prev.weight > 0;

            return (
              <>
                <div className="grid grid-cols-12 gap-1 px-3 py-2.5 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-1">Set</div>
                  <div className="col-span-2">Prev</div>
                  <div className="col-span-4">Weight (kg)</div>
                  <div className="col-span-3">Reps</div>
                  <div className="col-span-2 text-center">Done</div>
                </div>
                {currentSets.map((set, setIdx) => {
                  const typeConfig = SET_TYPE_CONFIG[set.type];
                  return (
                    <div key={setIdx}>
                      <div
                        className={cn(
                          "grid grid-cols-12 gap-1 items-center px-3 py-2.5 border-t border-border/30",
                          setIdx === currentSetIndex && !set.completed && "bg-primary/5",
                          set.completed && "opacity-70",
                        )}
                      >
                        <div className="col-span-1 flex justify-center relative">
                          <button
                            ref={(el) => { if (typePopover === setIdx && el) { const r = el.getBoundingClientRect(); popoverPosRef.current = { top: r.top, left: r.right + 8, bottom: r.bottom }; } }}
                            onClick={() => {
                              if (!set.completed) {
                                haptic(10);
                                setTypePopover(typePopover === setIdx ? null : setIdx);
                              }
                            }}
                            disabled={set.completed}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                            style={set.type !== "working" ? { backgroundColor: TYPE_COLORS[set.type], color: "white" } : undefined}
                            title={`Set type: ${set.type}`}
                          >
                            {set.type === "working" ? setIdx + 1 : typeConfig.label}
                          </button>
                        </div>
                        <div className="col-span-2">
                          <button
                            onClick={() => {
                              if (canFillPrev && !set.completed && prev) {
                                haptic(10);
                                updateSetLog(currentExIndex, setIdx, "weight", prev.weight);
                                updateSetLog(currentExIndex, setIdx, "reps", prev.reps);
                              }
                            }}
                            disabled={set.completed || !canFillPrev}
                            className={cn("text-[13px] text-center w-full", canFillPrev && !set.completed ? "text-primary active:opacity-70" : "text-muted-foreground")}
                          >
                            {prevLabel}
                          </button>
                        </div>
                        <div className="col-span-4">
                          <input
                            type="number"
                            value={set.weight || ""}
                            placeholder={set.weight === 0 ? (isBWExercise ? "BW" : "0") : ""}
                            aria-label={`Set ${setIdx + 1} weight`}
                            onChange={(e) => updateSetLog(currentExIndex, setIdx, "weight", Number(e.target.value) || 0)}
                            disabled={set.completed}
                            className="w-full px-2 py-1.5 rounded-lg bg-muted text-foreground text-sm text-center placeholder:text-[#C7C7CC]"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            value={set.reps || ""}
                            aria-label={`Set ${setIdx + 1} reps`}
                            onChange={(e) => updateSetLog(currentExIndex, setIdx, "reps", Number(e.target.value) || 0)}
                            disabled={set.completed}
                            className="w-full px-2 py-1.5 rounded-lg bg-muted text-foreground text-sm text-center"
                          />
                        </div>
                        <div className="col-span-2 flex justify-center">
                          {set.completed ? (
                            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }}>
                              <Check className="w-5 h-5 text-green-500" />
                            </motion.div>
                          ) : (
                            <button
                              onClick={() => completeInlineSet(setIdx)}
                              className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center hover:border-primary/50 transition-colors active:scale-90"
                            />
                          )}
                        </div>
                      </div>
                {/* RPE selector for completed sets */}
                {showRPE && set.completed && (
                  <div className="flex gap-1 px-4 py-1.5 border-t border-border/30 bg-muted/30">
                    <span className="text-xs text-muted-foreground mr-1 self-center">RPE:</span>
                    {RPE_OPTIONS.map((rpe) => (
                      <button
                        key={rpe}
                        onClick={() => updateSetRPE(currentExIndex, setIdx, rpe)}
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded transition-colors",
                          set.rpe === rpe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {rpe}
                      </button>
                    ))}
                  </div>
                )}
              </div>
                    );
                  })}
              </>
            );
          })()}

          {/* Add Set button */}
          <button
            onClick={() => addSet(currentExIndex)}
            className="w-full py-2.5 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add Set
          </button>
        </div>

        {/* Set type popover — portal to document.body to escape all parent constraints */}
        {typePopover !== null && createPortal(
          <>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className="fixed inset-0" style={{ zIndex: 9990 }} onClick={() => setTypePopover(null)} />
            <div
              className="fixed bg-card rounded-2xl shadow-lg border border-border/50"
              style={{
                zIndex: 9991,
                width: 160,
                left: popoverPosRef.current.left,
                ...(popoverPosRef.current.bottom > window.innerHeight * 0.6
                  ? { bottom: window.innerHeight - popoverPosRef.current.top + 4 }
                  : { top: popoverPosRef.current.top }),
              }}
            >
              {SET_TYPE_ORDER.map(type => (
                <button
                  key={type}
                  onClick={() => { setSetType(currentExIndex, typePopover, type); setTypePopover(null); haptic(10); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  {type === "working" ? (
                    <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: TYPE_COLORS[type] }}>
                      {TYPE_LABELS[type].charAt(0)}
                    </div>
                  )}
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}

        {/* Undo last set */}
        <AnimatePresence>
          {lastCompleted && (
            <motion.button
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={handleUndo}
              className="mx-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-amber-500/15 text-amber-400 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo last set
            </motion.button>
          )}
        </AnimatePresence>

        {/* RPE toggle */}
        <button
          onClick={() => setShowRPE(!showRPE)}
          className={cn(
            "text-xs px-3 py-1.5 rounded-lg transition-colors mx-auto block",
            showRPE ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {showRPE ? "Hide RPE" : "Show RPE"}
        </button>

        {/* Prescription hint */}
        {currentExercise && (
          <p className="text-xs text-muted-foreground text-center">
            Target: {currentExercise.sets}&times;{currentExercise.reps}
            {currentExercise.weight > 0
              ? ` @ ${currentExercise.weight}kg`
              : getExerciseById(currentExercise.exerciseId)?.equipment === "Bodyweight"
                ? " @ Bodyweight"
                : ""}
          </p>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-4 py-3 border-t border-border/50 bg-background">
        {isResting ? (
          <button
            onClick={stopRest}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Play className="w-4 h-4" /> Ready — Start Next Set
          </button>
        ) : (() => {
          const allSetsComplete = currentSets.every(s => s.completed);
          const isLastExercise = currentExIndex >= day.exercises.length - 1;

          if (allSetsComplete && isLastExercise) {
            return (
              <button
                onClick={() => setSessionComplete(true)}
                className="w-full py-3.5 rounded-xl bg-green-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <Trophy className="w-4 h-4" /> Finish Workout
              </button>
            );
          }
          if (allSetsComplete) {
            return (
              <button
                onClick={() => { setCurrentExIndex(prev => prev + 1); setCurrentSetIndex(0); }}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <Play className="w-4 h-4" /> Next Exercise →
              </button>
            );
          }
          return (
            <button
              onClick={completeSet}
              disabled={!currentSets[currentSetIndex] || currentSets[currentSetIndex]?.completed}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Check className="w-4 h-4" /> Complete Set {currentSetIndex + 1}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

