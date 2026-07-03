import { useNavigate } from "react-router-dom";
import { ChevronRight, CalendarCheck } from "lucide-react";
import { useReviewEligibility } from "@/hooks/useWeeklyReview";
import { haptic } from "@/lib/haptic";

/**
 * Analytics entry for the Weekly Review (Rev1). Permanent home of the
 * review while one exists — same eligibility gate as the Home entry
 * (F5: never a dead row leading a brand-new user to an empty review),
 * but NOT retired by the viewed state; the review stays reachable here
 * all week. Sits below the Hist6 PI-detail hero.
 */
export default function WeeklyReviewRow() {
  const navigate = useNavigate();
  const { eligibility } = useReviewEligibility();

  if (eligibility !== "eligible") return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        navigate("/review");
      }}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 text-left hover:bg-muted transition-colors active:scale-[0.98] min-h-[44px]"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <CalendarCheck className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
        Weekly Review
      </p>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
