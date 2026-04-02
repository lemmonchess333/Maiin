import { motion } from "framer-motion";
import { Check, Ban, Pause } from "lucide-react";
import { haptic } from "@/lib/haptic";
import type { DisplayDay } from "./weekViewTypes";

interface DayStepIndicatorProps {
  days: DisplayDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  firstIncompleteIndex: number;
  animatingCompletion?: number | null;
}

const GREEN = "#4CAF50";
const PURPLE = "#7C6BF0";
const CIRCLE = 32;
const RING = 42;

export default function DayStepIndicator({
  days,
  selectedIndex,
  onSelect,
  firstIncompleteIndex,
  animatingCompletion = null,
}: DayStepIndicatorProps) {
  if (days.length === 0) return null;

  const passedCount = days.filter(
    d => d.type === "rest" || d.workout.completed || d.workout.skipped,
  ).length;
  const trackOpacity = passedCount === 0 ? 0.5 : 1;

  return (
    <div className="px-2 py-1">
      {/* Circles + tracks */}
      <div className="flex items-center justify-between">
        {days.map((displayDay, i) => {
          const isRest = displayDay.type === "rest";
          const isCompleted = !isRest && displayDay.workout.completed;
          const isSkipped = !isRest && !!displayDay.workout.skipped && !displayDay.workout.completed;
          const isCurrent = i === firstIncompleteIndex;
          const isSelected = i === selectedIndex;
          const isAnimating = animatingCompletion === i;

          // Track: fills purple if left node is completed, skipped, or rest (pass-through)
          const trackFilled = isRest
            ? isPrecedingFilled(days, i)
            : isCompleted || isSkipped;

          const dayLabel = isRest ? "Rest" : displayDay.workout.dayName;
          // Display index counts only workout days
          const workoutNumber = isRest ? null : displayDay.workoutIndex + 1;

          return (
            <div
              key={i}
              className="flex items-center"
              style={{ flex: i < days.length - 1 ? 1 : undefined }}
            >
              {/* Circle + label column */}
              <button
                onClick={() => { onSelect(i); haptic("light"); }}
                className="relative flex flex-col items-center"
                style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
                aria-label={`${isRest ? "Rest day" : `Day ${workoutNumber}: ${dayLabel}`}${isCompleted ? " (completed)" : isSkipped ? " (skipped)" : isCurrent ? " (current)" : ""}`}
              >
                {/* Selection ring */}
                {isSelected && (
                  <motion.div
                    layoutId="week-day-ring"
                    className="absolute rounded-full"
                    style={{
                      width: RING,
                      height: RING,
                      border: `2px solid ${PURPLE}`,
                      opacity: 0.35,
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}

                {/* Circle */}
                {isRest ? (
                  /* Rest day: dashed border, Pause icon */
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{
                      width: CIRCLE,
                      height: CIRCLE,
                      border: "1.5px dashed var(--border)",
                    }}
                  >
                    <Pause className="w-3 h-3 text-muted-foreground/60" />
                  </div>
                ) : isCompleted ? (
                  <motion.div
                    className="flex items-center justify-center rounded-full"
                    style={{ width: CIRCLE, height: CIRCLE, background: GREEN }}
                    animate={isAnimating ? { scale: [1, 1.2, 1] } : undefined}
                    transition={isAnimating ? { duration: 0.4, ease: "easeOut" } : undefined}
                  >
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </motion.div>
                ) : isSkipped ? (
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{
                      width: CIRCLE,
                      height: CIRCLE,
                      border: "1.5px solid var(--border)",
                    }}
                  >
                    <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                ) : isCurrent ? (
                  <motion.div
                    className="flex items-center justify-center rounded-full"
                    style={{ width: CIRCLE, height: CIRCLE, background: PURPLE }}
                    initial={{ scale: 1 }}
                    animate={isAnimating
                      ? { scale: [1, 1.15, 1] }
                      : { scale: [1, 1.12, 1] }
                    }
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                  >
                    <span className="text-white text-xs font-bold">{workoutNumber}</span>
                  </motion.div>
                ) : (
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{
                      width: CIRCLE,
                      height: CIRCLE,
                      border: "1.5px solid var(--border)",
                    }}
                  >
                    <span className="text-xs text-muted-foreground font-medium">{workoutNumber}</span>
                  </div>
                )}

                {/* Label */}
                <span className="text-[11px] text-muted-foreground mt-1.5 leading-none font-medium max-w-[48px] truncate text-center hidden min-[320px]:block">
                  {dayLabel}
                </span>
              </button>

              {/* Track segment */}
              {i < days.length - 1 && (
                <div className="flex-1 mx-1" style={{ opacity: trackOpacity, transition: "opacity 300ms ease" }}>
                  <div
                    className="h-[2px] rounded-full"
                    style={{
                      background: trackFilled ? PURPLE : "var(--border)",
                      transition: "background 400ms ease",
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

/** Check if the preceding workout day (skipping rest) is completed or skipped */
function isPrecedingFilled(days: DisplayDay[], restIndex: number): boolean {
  for (let j = restIndex - 1; j >= 0; j--) {
    const d = days[j];
    if (d.type === "rest") continue;
    return d.workout.completed || !!d.workout.skipped;
  }
  return false;
}
