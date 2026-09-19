import { motion } from "framer-motion";
import { Leaf } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cardClasses } from "@/components/ui/cardClasses";

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
      className={cardClasses({
        tone: "tinted",
        className: "flex items-center gap-4",
      })}
      style={{
        background: `linear-gradient(135deg, ${THEME.brand}14, ${THEME.brand}05 70%)`,
        boxShadow: `var(--ds-shadow-card), 0 0 0 1px ${THEME.brand}14`,
      }}
      /* No `whileTap`. This card carries no action — the docstring above
         says so, and there is no onClick or link anywhere on it — so the
         press-scale was feedback for a press that does nothing. It also
         cost a tab stop: framer-motion's press gesture sets
         `tabIndex = 0` on any non-focusable element with `whileTap`, so
         a rest day put an unnamed, inert stop in Home's tab order. */
    >
      <div
        className="size-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${THEME.brand}1F` }}
      >
        <Leaf className="size-5" style={{ color: THEME.brand }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-lifting-strong">
          Today · Rest day
        </p>
        <p className="text-base font-bold text-foreground leading-tight">
          Take it easy
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rest is part of the programme
        </p>
      </div>
    </motion.div>
  );
}
