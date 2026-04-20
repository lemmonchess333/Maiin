import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface DayStepperProps {
  days: Array<{
    dayNumber: number;
    label: string;
    status: "completed" | "today" | "upcoming";
  }>;
  selectedIndex: number;
  todayIndex: number | null;
  onSelect: (index: number) => void;
}

const GREEN = "#4CAF50";
const PURPLE = "#7C6BF0";

export default function DayStepper({
  days,
  selectedIndex,
  todayIndex,
  onSelect,
}: DayStepperProps) {
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll today's circle to center on mount
  useEffect(() => {
    const target = todayIndex ?? 0;
    const el = columnRefs.current[target];
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (days.length === 0) return null;

  return (
    <div
      role="tablist"
      className="flex justify-center gap-[14px] px-4 pt-1 pb-3 overflow-x-auto border-b border-border/40"
      style={{ scrollbarWidth: "none" }}
    >
      {days.map((day, index) => {
        const isToday = index === todayIndex;
        const isSelected = index === selectedIndex;
        const isCompleted = day.status === "completed";

        // Circle evaluation order (first match wins)
        let diameter: number;
        let fill: string;
        let bColor: string;
        let bWidth: number;
        let labelColor: string;
        let content: React.ReactNode;

        if (isToday && isCompleted) {
          // Rule 1: Today AND completed → 44px green
          diameter = 44;
          fill = GREEN;
          bWidth = 0;
          bColor = "transparent";
          content = (
            <Check className="w-[18px] h-[18px] text-white" strokeWidth={3} />
          );
          labelColor = GREEN;
        } else if (isCompleted) {
          // Rule 2: Completed (selected or not)
          diameter = 40;
          fill = GREEN;
          bWidth = 0;
          bColor = "transparent";
          content = (
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          );
          labelColor = GREEN;
        } else if (isToday && isSelected) {
          // Rule 3: Today AND selected
          diameter = 44;
          fill = PURPLE;
          bWidth = 0;
          bColor = "transparent";
          content = (
            <span className="text-sm font-bold text-white">
              {day.dayNumber}
            </span>
          );
          labelColor = PURPLE;
        } else if (isToday) {
          // Rule 4: Today AND not selected
          diameter = 40;
          fill = "transparent";
          bWidth = 2;
          bColor = PURPLE;
          content = (
            <span className="text-sm font-bold" style={{ color: PURPLE }}>
              {day.dayNumber}
            </span>
          );
          labelColor = PURPLE;
        } else if (isSelected) {
          // Rule 5: Selected (not today/completed)
          diameter = 40;
          fill = PURPLE;
          bWidth = 0;
          bColor = "transparent";
          content = (
            <span className="text-sm font-bold text-white">
              {day.dayNumber}
            </span>
          );
          labelColor = PURPLE;
        } else {
          // Rule 6: Default (upcoming)
          diameter = 40;
          fill = "transparent";
          bWidth = 2;
          bColor = "hsl(var(--border))";
          content = (
            <span className="text-sm font-bold text-muted-foreground">
              {day.dayNumber}
            </span>
          );
          labelColor = "hsl(var(--muted-foreground))";
        }

        return (
          <div
            key={index}
            ref={(el) => {
              columnRefs.current[index] = el;
            }}
            className="flex flex-col items-center"
            style={{ minWidth: 48 }}
          >
            <button
              role="tab"
              aria-selected={isSelected}
              aria-label={`Day ${day.dayNumber}, ${day.label}${isToday ? ", Today" : ""}`}
              onClick={() => {
                haptic("light");
                onSelect(index);
              }}
              className="flex items-center justify-center"
              style={{ width: 44, height: 44 }}
            >
              <motion.div
                className="flex items-center justify-center rounded-full"
                animate={{
                  width: diameter,
                  height: diameter,
                  backgroundColor: fill,
                  borderColor: bColor,
                  borderWidth: bWidth,
                }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ borderStyle: "solid" }}
              >
                {content}
              </motion.div>
            </button>
            <span
              className="text-[10px] font-semibold text-center whitespace-nowrap mt-1"
              style={{ color: labelColor }}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
