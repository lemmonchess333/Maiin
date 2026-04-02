import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { WorkoutDay } from "@/features/program/programTypes";

interface DayStepIndicatorProps {
  workouts: WorkoutDay[];
  expandedDay: number | null;
  onDayClick: (index: number) => void;
  firstIncompleteIndex: number;
}

const GREEN = "#4DB872";

export default function DayStepIndicator({
  workouts,
  expandedDay,
  onDayClick,
  firstIncompleteIndex,
}: DayStepIndicatorProps) {
  if (workouts.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between px-1">
        {workouts.map((day, i) => {
          const isCompleted = day.completed;
          const isCurrent = i === firstIncompleteIndex;
          const isSelected = expandedDay === i;

          return (
            <div key={i} className="flex items-center" style={{ flex: i < workouts.length - 1 ? 1 : undefined }}>
              {/* Circle */}
              <button
                onClick={() => onDayClick(i)}
                className="relative flex flex-col items-center"
                style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
                aria-label={`Day ${i + 1}: ${day.dayName}${isCompleted ? " (completed)" : isCurrent ? " (current)" : ""}`}
              >
                {/* Selection ring */}
                {isSelected && (
                  <motion.div
                    layoutId="step-ring"
                    className="absolute rounded-full"
                    style={{
                      width: isCurrent ? 36 : 32,
                      height: isCurrent ? 36 : 32,
                      border: `2px solid ${THEME.lifting}`,
                      opacity: 0.3,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}

                {/* The dot */}
                {isCompleted ? (
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{ width: 24, height: 24, background: GREEN }}
                  >
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  </div>
                ) : isCurrent ? (
                  <motion.div
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 28,
                      height: 28,
                      border: `2.5px solid ${THEME.lifting}`,
                      background: `${THEME.lifting}10`,
                    }}
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div
                      className="rounded-full"
                      style={{ width: 10, height: 10, background: THEME.lifting }}
                    />
                  </motion.div>
                ) : (
                  <div
                    className="rounded-full border-2 border-muted-foreground/25"
                    style={{ width: 24, height: 24 }}
                  />
                )}

                {/* Day label */}
                <span className="text-[10px] text-muted-foreground mt-1 leading-none font-medium">
                  {i + 1}
                </span>
              </button>

              {/* Connecting track */}
              {i < workouts.length - 1 && (
                <div className="flex-1 mx-0.5">
                  <div
                    className="h-[2px] rounded-full"
                    style={{
                      background: isCompleted ? GREEN : "var(--border)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
