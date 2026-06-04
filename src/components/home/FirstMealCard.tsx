import { THEME } from "@/lib/theme";
import { m as motion } from "framer-motion";
import { UtensilsCrossed, Plus } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

/**
 * Cold-start first-action card for a NEW user on a REST day (#972). On
 * training days the framed Lift/Run card is the first-action driver; on a
 * rest day there's no workout to frame, so the most useful first action is
 * logging a meal. Reuses the Lift/Run CTA rhythm (icon square · stacked
 * labels · action pill right), nutrition-orange per the sport-coding system,
 * routing to /food. Gated upstream on meals.length === 0 within the 14-day
 * activation window, so it never nags a settled user.
 */
export default function FirstMealCard({
  navigate,
}: {
  navigate: (p: string) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={function () {
        haptic();
        trackHomeEvent("home_card_tapped", { card: "first_meal" });
        navigate("/food");
      }}
      className="w-full rounded-xl bg-card text-left p-4"
      style={{ backgroundColor: THEME.semantic.nutrition + "14" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: THEME.semantic.nutrition + "18" }}
        >
          <UtensilsCrossed
            className="size-5"
            style={{ color: THEME.semantic.nutrition }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold mb-0.5"
            style={{ color: THEME.semantic.nutrition }}
          >
            Today · Rest day
          </p>
          <p className="text-sm font-bold text-foreground truncate">
            Log your first meal
          </p>
          <p className="text-micro text-muted-foreground">
            Snap a photo or search — it only takes a moment
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
          style={{
            backgroundColor: THEME.semantic.nutrition,
            color: "white",
          }}
        >
          <Plus className="size-3" />
          Log
        </div>
      </div>
    </motion.button>
  );
}
