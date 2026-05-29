import { motion } from "framer-motion";
import { Check, Ban } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface DayStepperProps {
  days: Array<{
    dayNumber: number;
    label: string;
    status: "completed" | "today" | "upcoming" | "skipped";
  }>;
  selectedIndex: number;
  todayIndex: number | null;
  onSelect: (index: number) => void;
}

const GREEN = "#4DB872";
const PURPLE = "#7B72E9";
// Skipped uses muted-foreground hue (resolved at rgba via THEME-friendly
// fallback) so the circle reads as "intentionally not done" rather than
// "completed" or "upcoming". Ban icon (slashed circle) reinforces this.
const SKIPPED = "#8E8E93";

export default function DayStepper({
  days,
  selectedIndex,
  todayIndex,
  onSelect,
}: DayStepperProps) {
  if (days.length === 0) return null;

  return (
    <div role="tablist" className="flex px-3 pt-1 pb-3 gap-1">
      {days.map((day, index) => {
        const isToday = index === todayIndex;
        const isSelected = index === selectedIndex;
        const isCompleted = day.status === "completed";
        const isSkipped = day.status === "skipped";

        // Circle evaluation order (first match wins). Today's circle is
        // 48px (vs 40px for peers) with a coloured glow — 20% bigger and
        // ringed with its state colour, so "you're here" reads from the
        // top of the screen without scanning labels.
        let diameter: number;
        let fill: string;
        let bColor: string;
        let bWidth: number;
        let labelColor: string;
        let glow: string | undefined;
        let content: React.ReactNode;

        if (isSkipped) {
          // Rule 0: Skipped (regardless of selection) → grey filled
          // with a slashed-circle (Ban) icon. Sized 40px so today is
          // still visually dominant if a day is both skipped and
          // (somehow) the active selection — the today badge in the
          // session header still announces "Today" separately.
          diameter = 40;
          fill = SKIPPED + "33"; // 20% alpha
          bWidth = 1;
          bColor = SKIPPED + "55";
          content = (
            <Ban
              className="size-4"
              style={{ color: SKIPPED }}
              strokeWidth={2.25}
            />
          );
          labelColor = SKIPPED;
        } else if (isToday && isCompleted) {
          // Rule 1: Today AND completed → 48px green + glow
          diameter = 48;
          fill = GREEN;
          bWidth = 0;
          bColor = "transparent";
          glow = `0 0 0 4px ${GREEN}1A, 0 4px 14px ${GREEN}33`;
          content = <Check className="size-5 text-white" strokeWidth={3} />;
          labelColor = GREEN;
        } else if (isCompleted) {
          // Rule 2: Completed (selected or not)
          diameter = 40;
          fill = GREEN;
          bWidth = 0;
          bColor = "transparent";
          content = <Check className="size-4 text-white" strokeWidth={3} />;
          labelColor = GREEN;
        } else if (isToday && isSelected) {
          // Rule 3: Today AND selected → 48px purple + glow
          diameter = 48;
          fill = PURPLE;
          bWidth = 0;
          bColor = "transparent";
          glow = `0 0 0 4px ${PURPLE}1A, 0 4px 14px ${PURPLE}40`;
          content = (
            <span className="text-base font-bold text-white">
              {day.dayNumber}
            </span>
          );
          labelColor = PURPLE;
        } else if (isToday) {
          // Rule 4: Today AND not selected → 48px purple outline + glow
          diameter = 48;
          fill = "transparent";
          bWidth = 2;
          bColor = PURPLE;
          glow = `0 0 0 4px ${PURPLE}1A`;
          content = (
            <span className="text-base font-bold" style={{ color: PURPLE }}>
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
            className="flex flex-col items-center flex-1 min-w-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={`Day ${day.dayNumber}, ${day.label}${isCompleted ? ", completed" : isSkipped ? ", skipped" : isToday ? ", today" : ""}`}
              onClick={() => {
                haptic("light");
                onSelect(index);
              }}
              className="flex items-center justify-center"
              style={{ width: 52, height: 52 }}
            >
              <motion.div
                className="flex items-center justify-center rounded-full"
                animate={{
                  width: diameter,
                  height: diameter,
                  backgroundColor: fill,
                  borderColor: bColor,
                  borderWidth: bWidth,
                  boxShadow: glow ?? "0 0 0 0 transparent",
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{ borderStyle: "solid" }}
              >
                {content}
              </motion.div>
            </button>
            <span
              className="text-[10px] font-semibold text-center truncate max-w-full mt-1.5"
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
