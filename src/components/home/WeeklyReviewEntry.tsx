import { useNavigate } from "react-router-dom";
import { ChevronRight, CalendarCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useReviewEligibility,
  reviewViewedKey,
} from "@/hooks/useWeeklyReview";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { haptic } from "@/lib/haptic";

/**
 * Transient Home entry for the Weekly Review (Rev1). Appears once the
 * reviewed week is eligible and retires the moment the review is opened
 * (viewed state, device-local per week) — or naturally when the next
 * week's review supersedes it. One compact row, never a hero card; on a
 * typical week it's gone within a day or two of Sunday.
 */
export default function WeeklyReviewEntry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { eligibility, weekKey } = useReviewEligibility();
  const { dismissed } = useDismissOnce(
    reviewViewedKey(user?.uid ?? "anon", weekKey)
  );

  if (!user || dismissed || eligibility !== "eligible") return null;

  return (
    <button
      type="button"
      onClick={() => {
        haptic("light");
        navigate("/review");
      }}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border card-shadow text-left hover:bg-muted transition-colors active:scale-[0.98] min-h-[44px]"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <CalendarCheck className="size-4 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Your week, reviewed
        </p>
        <p className="text-xs text-muted-foreground">
          How last week went, and what's ahead
        </p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
