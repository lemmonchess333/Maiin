import { readSessionString, writeSessionString } from "@/lib/sessionStore";

/** Train's two tabs. */
export type TrainTab = "lift" | "run";

const KEY = "tropos.train.tab";

function keyFor(uid: string): string {
  return `${KEY}:${uid}`;
}

/** Remember the tab the person chose, for the rest of this visit. */
export function rememberTrainTab(
  uid: string | null | undefined,
  tab: TrainTab
) {
  if (uid) writeSessionString(keyFor(uid), tab);
}

export function rememberedTrainTab(
  uid: string | null | undefined
): TrainTab | null {
  if (!uid) return null;
  const tab = readSessionString(keyFor(uid));
  return tab === "lift" || tab === "run" ? tab : null;
}

/**
 * The tab Train opens on. The address names one when a link means it
 * (`?tab=run`, and a return from a day's detail); otherwise the tab the
 * person last chose in this visit, so the Train tab in the bar does not
 * put them back on Lift every time. With neither, an account with no
 * lifting days (a runner's plan) opens on Run, and every other on Lift.
 */
export function trainTabFor({
  urlTab,
  remembered,
  liftDays,
}: {
  urlTab: string | null;
  remembered: TrainTab | null;
  /** The plan's lifting days, or null while it loads. */
  liftDays: number | null;
}): TrainTab {
  if (urlTab === "run" || urlTab === "lift") return urlTab;
  if (remembered) return remembered;
  return liftDays === 0 ? "run" : "lift";
}
