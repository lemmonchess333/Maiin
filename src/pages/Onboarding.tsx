import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calculateTDEE } from "@/lib/tdee";
import type { FitnessGoal } from "@/lib/tdee";
import { generateSchedule, DAY_LABELS } from "@/lib/scheduleUtils";
import type { DayType } from "@/lib/scheduleUtils";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, Footprints, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_TYPE_STYLES: Record<DayType, { label: string; color: string }> = {
  lift: { label: "Lift", color: THEME.lifting },
  run:  { label: "Run",  color: THEME.running },
  both: { label: "Both", color: THEME.lifting },
  rest: { label: "Rest", color: "rgba(255,255,255,0.2)" },
};

// Cycle through lift → run → both → rest on tap
function nextType(t: DayType): DayType {
  if (t === "lift") return "run";
  if (t === "run") return "both";
  if (t === "both") return "rest";
  return "lift";
}

export default function Onboarding() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 0 — Name
  const [name, setName] = useState("");

  // Step 1 — Schedule
  const [liftDays, setLiftDays] = useState(3);
  const [runDays, setRunDays] = useState(2);
  const defaultSchedule = useMemo(() => generateSchedule(liftDays, runDays), [liftDays, runDays]);
  const [schedule, setSchedule] = useState(defaultSchedule);

  // Step 2 — Targets
  const [weightKg, setWeightKg] = useState(75);
  const [heightCm, setHeightCm] = useState(175);
  const [age, setAge] = useState(28);
  const [selectedGoal, setSelectedGoal] = useState<"cut" | "lean bulk" | "recomp">("recomp");

  const tdee = useMemo(
    () => calculateTDEE(weightKg, heightCm, age, "moderate", selectedGoal as FitnessGoal),
    [weightKg, heightCm, age, selectedGoal]
  );

  const STEPS = [
    { title: "What's your name?", subtitle: "You'll see this on your home screen" },
    { title: "Build your week", subtitle: "Tap each day to set your training type" },
    { title: "Your targets", subtitle: "We'll calculate calories and macros from this" },
  ];

  const canAdvance = [
    name.trim().length >= 2,
    true,
    weightKg > 0 && heightCm > 0 && age > 0,
  ];

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        displayName: name.trim(),
        age,
        weightKg,
        heightCm,
        weeklyWorkoutsTarget: liftDays,
        weeklyRunsTarget: runDays,
        weeklyMealsTarget: 10,
        weekSchedule: schedule,
        onboardingComplete: true,
        runMode: "freeform",
        tdeeBase: tdee.targetCalories,
        aiCalorieAdjustment: 0,
        targetCalories: tdee.targetCalories,
        targetProtein: tdee.protein,
        targetCarbs: tdee.carbs,
        targetFat: tdee.fat,
        macroTargets: {
          calories: tdee.targetCalories,
          protein: tdee.protein,
          carbs: tdee.carbs,
          fat: tdee.fat,
        },
        program: {
          goal: selectedGoal,
          startWeight: weightKg,
          currentPhase: "base",
        },
      }, { merge: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col px-5 pb-10 pt-safe"
      style={{ background: THEME.bg, color: '#fff' }}>

      {/* Progress bar */}
      <div className="flex gap-1.5 pt-14 pb-10">
        {STEPS.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.1)' }}>
            <motion.div
              className="h-full rounded-full"
              animate={{ width: i <= step ? '100%' : '0%' }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              style={{ background: THEME.teal }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}
          className="flex-1">
          <p className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="text-2xl font-bold mb-1">{STEPS[step].title}</h1>
          <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {STEPS[step].subtitle}
          </p>

          {/* ── Step 0: Name ── */}
          {step === 0 && (
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canAdvance[0] && setStep(1)}
              placeholder="Enter your name"
              className="w-full px-5 py-4 rounded-2xl text-xl font-medium outline-none"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
              }}
            />
          )}

          {/* ── Step 1: Schedule ── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Lift / Run count steppers */}
              <div className="flex gap-3">
                {[
                  { label: "Lift days", value: liftDays, setter: setLiftDays, max: 7 - runDays, color: THEME.lifting, Icon: Dumbbell },
                  { label: "Run days", value: runDays, setter: setRunDays, max: 7 - liftDays, color: THEME.running, Icon: Footprints },
                ].map(({ label, value, setter, max, color, Icon }) => (
                  <div key={label} className="flex-1 rounded-2xl p-4 text-center"
                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                    <Icon className="w-5 h-5 mx-auto mb-2" style={{ color }} />
                    <p className="text-[10px] uppercase tracking-wider mb-3"
                      style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
                    <div className="flex items-center justify-center gap-4">
                      <button onClick={() => setter(v => Math.max(0, v - 1))}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold active:scale-90 transition-transform"
                        style={{ background: 'rgba(255,255,255,0.1)' }}>−</button>
                      <span className="text-2xl font-bold font-mono" style={{ color }}>{value}</span>
                      <button onClick={() => setter(v => Math.min(max, v + 1))}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold active:scale-90 transition-transform"
                        style={{ background: 'rgba(255,255,255,0.1)' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 7-day visual schedule */}
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-3"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Tap to change day type</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {schedule.map((day, i) => {
                    const style = DAY_TYPE_STYLES[day.type];
                    return (
                      <button key={i}
                        onClick={() => {
                          const next = nextType(day.type);
                          setSchedule(prev => prev.map((d, idx) =>
                            idx === i ? { ...d, type: next } : d
                          ));
                        }}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-xl active:scale-90 transition-transform"
                        style={{ background: `${style.color}18`, border: `1px solid ${style.color}35` }}>
                        <span className="text-[9px] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {DAY_LABELS[i].charAt(0)}
                        </span>
                        <div className="w-2 h-2 rounded-full" style={{ background: style.color }} />
                        <span className="text-[8px] font-medium" style={{ color: style.color }}>
                          {style.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-4 mt-3">
                  {(['lift', 'run', 'both', 'rest'] as DayType[]).map(t => (
                    <div key={t} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: DAY_TYPE_STYLES[t].color }} />
                      <span className="text-[9px] capitalize" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {t}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Targets ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Body stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Age", value: age, setter: setAge, min: 13, max: 99, unit: "yrs" },
                  { label: "Weight", value: weightKg, setter: setWeightKg, min: 30, max: 250, unit: "kg" },
                  { label: "Height", value: heightCm, setter: setHeightCm, min: 100, max: 250, unit: "cm" },
                ].map(({ label, value, setter, min, max, unit }) => (
                  <div key={label} className="rounded-2xl p-3 text-center"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <p className="text-[9px] uppercase tracking-wider mb-2"
                      style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setter(v => Math.max(min, v - 1))}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-sm active:scale-90 transition-transform"
                        style={{ background: 'rgba(255,255,255,0.1)' }}>−</button>
                      <span className="text-lg font-bold font-mono tabular-nums w-10 text-center">{value}</span>
                      <button onClick={() => setter(v => Math.min(max, v + 1))}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-sm active:scale-90 transition-transform"
                        style={{ background: 'rgba(255,255,255,0.1)' }}>+</button>
                    </div>
                    <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{unit}</p>
                  </div>
                ))}
              </div>

              {/* Goal selector */}
              <div className="space-y-2">
                {[
                  { id: "cut" as const,       label: "Lose fat",     desc: "Calorie deficit, preserve muscle", icon: "🔥" },
                  { id: "lean bulk" as const, label: "Build muscle", desc: "Slight surplus, lean gains",        icon: "💪" },
                  { id: "recomp" as const,    label: "Recomp",       desc: "Maintain weight, improve fitness", icon: "⚡" },
                ].map(g => (
                  <button key={g.id} onClick={() => setSelectedGoal(g.id)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
                    style={{
                      background: selectedGoal === g.id ? `${THEME.teal}18` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${selectedGoal === g.id ? THEME.teal + '50' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <span className="text-xl">{g.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{g.label}</p>
                      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{g.desc}</p>
                    </div>
                    {selectedGoal === g.id && (
                      <Check className="w-4 h-4 flex-shrink-0" style={{ color: THEME.teal }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Calculated target preview */}
              <div className="rounded-2xl p-4"
                style={{ background: `${THEME.teal}10`, border: `1px solid ${THEME.teal}25` }}>
                <p className="text-[9px] uppercase tracking-widest mb-3"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Your daily targets</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Calories", value: String(tdee.targetCalories), color: THEME.warning },
                    { label: "Protein", value: `${tdee.protein}g`, color: THEME.teal },
                    { label: "Carbs", value: `${tdee.carbs}g`, color: THEME.brand },
                    { label: "Fat", value: `${tdee.fat}g`, color: '#f97316' },
                  ].map(t => (
                    <div key={t.label}>
                      <p className="text-base font-bold font-mono tabular-nums" style={{ color: t.color }}>{t.value}</p>
                      <p className="text-[8px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center gap-3 pt-6">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)}
            className="px-5 py-3.5 rounded-2xl text-sm font-medium active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
            Back
          </button>
        )}
        <button
          onClick={() => {
            if (step < STEPS.length - 1) { setStep(s => s + 1); }
            else { handleFinish(); }
          }}
          disabled={!canAdvance[step] || saving}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]",
            !canAdvance[step] && "opacity-40"
          )}
          style={{ background: THEME.teal, color: '#000' }}
        >
          {step === STEPS.length - 1
            ? (saving ? "Setting up…" : `Let's go, ${name.split(' ')[0]} 🚀`)
            : (<>Continue <ChevronRight className="w-4 h-4" /></>)}
        </button>
      </div>
    </div>
  );
}
