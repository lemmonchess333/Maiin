/**
 * Said where a race's distance is chosen (setup, Settings → Run plan): a
 * half or full marathon plan is Pro after its first week (whole-app grill
 * Q85), so a free account knows before week 2 rather than finding out
 * there. Nothing for Pro, a trial, or a 5K or 10K.
 */
export default function RacePlanProNote({
  distance,
  isPro,
}: {
  distance: string | null | undefined;
  /** Pro or in a trial: nothing to say. The caller reads the tier, so the
   *  note loads nothing of the account's. */
  isPro: boolean;
}) {
  if (isPro || (distance !== "half" && distance !== "marathon")) return null;
  return (
    <p className="text-xs text-muted-foreground text-pretty">
      Half and full marathon plans are part of Pro after their first week. 5K
      and 10K plans stay free.
    </p>
  );
}
