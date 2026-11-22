import { isProRaceDistance } from "@/lib/racePlanAccess";

/**
 * Said where a race's distance is chosen (setup, Settings → Run plan): a
 * plan for a half marathon or longer, the ultras since Run27 (18), is Pro
 * after its first week (whole-app grill Q85), so a free account knows
 * before week 2 rather than finding out there. The free week is once per
 * account, so an account that has had it is told a new plan is Pro from
 * its start. Nothing for Pro, a trial, or a 5K or 10K.
 */
export default function RacePlanProNote({
  distance,
  isPro,
  freeWeekUsed = false,
}: {
  distance: string | null | undefined;
  /** Pro or in a trial: nothing to say. The caller reads the tier, so the
   *  note loads nothing of the account's. */
  isPro: boolean;
  /** `profile.racePlanFreeWeekUsed`: the account's free week of a half,
   *  marathon or ultra plan is behind it. */
  freeWeekUsed?: boolean;
}) {
  if (isPro || !isProRaceDistance(distance)) return null;
  return (
    <p className="text-xs text-muted-foreground text-pretty">
      {freeWeekUsed
        ? "Plans for a half marathon or longer are part of Pro, and you’ve had your free week."
        : "Plans for a half marathon or longer are part of Pro after their first week."}{" "}
      5K and 10K plans stay free.
    </p>
  );
}
