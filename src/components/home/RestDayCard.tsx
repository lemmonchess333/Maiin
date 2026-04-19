import { motion } from "framer-motion";
import { Leaf } from "lucide-react";
import { THEME } from "@/lib/theme";

/**
 * Home CTA card for rest days. Matches the Lift and Run CTA card
 * rhythm (icon square left, stacked labels middle, nothing on the
 * right — rest days don't have an action). Calm purple tint instead
 * of the lift-purple / run-coral tint so the rest day doesn't feel
 * like a dimmed-out lift day.
 *
 * The page previously just hid the Lift + Run cards on rest days,
 * leaving a gap between the Health Score and Water cards and no
 * positive indication that today was scheduled rest. Without this,
 * users on rest days couldn't tell whether their program was
 * broken or the day was intentional.
 */
export default function RestDayCard() {
  return (
    <motion.div
      className="p-4 rounded-2xl flex items-center gap-4"
      style={{
        background: "linear-gradient(135deg, rgba(123, 114, 233, 0.08), rgba(123, 114, 233, 0.02) 70%)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05), 0 0 0 1px rgba(123, 114, 233, 0.08)",
      }}
      whileTap={{ scale: 0.99 }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: "rgba(123, 114, 233, 0.12)" }}
      >
        <Leaf className="w-5 h-5" style={{ color: THEME.brand }} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: THEME.brand }}
        >
          Today · Rest day
        </p>
        <p className="text-base font-bold text-foreground leading-tight">
          Recover &amp; refuel
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rest is part of the programme — your body is adapting
        </p>
      </div>
    </motion.div>
  );
}
