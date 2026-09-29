import { Link } from "react-router-dom";
import { useUid } from "@/lib/auth";
import { useReviewEligibility, reviewViewedKey } from "@/hooks/useWeeklyReview";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { haptic } from "@/lib/haptic";

/**
 * The way into the Weekly Review from Home (Rev1): a text link on the
 * "This week" heading (DS3; it was a card of its own). It appears once the
 * reviewed week is eligible and retires the moment the review is opened
 * (viewed state, device-local per week), or when the next week's review
 * supersedes it. On a typical week it is gone within a day or two of
 * Sunday, and the heading carries no action in between.
 */
export default function WeeklyReviewEntry() {
  const uid = useUid();
  const { eligibility, weekKey } = useReviewEligibility();
  const { dismissed } = useDismissOnce(reviewViewedKey(weekKey));

  if (!uid || dismissed || eligibility !== "eligible") return null;

  return (
    <Link
      to="/review"
      onClick={() => haptic("light")}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-lifting-strong rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      Weekly review
    </Link>
  );
}
