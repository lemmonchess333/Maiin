import { useEffect, useEffectEvent } from "react";
import type { FoodFigures, WaterFigures } from "@/lib/homeWidgetSections";
import type { HomeWidgetSections } from "@/lib/homeWidgetContract";
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";

type Sections = typeof import("@/lib/homeWidgetSections");

/** The sections' builders and writer, loaded once and on a phone only:
 *  the web has no widgets, and Food's own chunk carries neither. */
let writer: Promise<
  [
    Sections,
    typeof import("@/lib/homeWidgetContract"),
    typeof import("@/lib/homeWidgets"),
  ]
> | null = null;
function write(
  build: (sections: Sections, account: string) => HomeWidgetSections,
  uid: string
): void {
  writer ??= Promise.all([
    import("@/lib/homeWidgetSections"),
    import("@/lib/homeWidgetContract"),
    import("@/lib/homeWidgets"),
  ]);
  void writer
    .then(([sections, { widgetAccount }, { writeHomeWidgetSections }]) =>
      writeHomeWidgetSections(build(sections, widgetAccount(uid)))
    )
    .catch((err) => logger.warn("[widgets] section not written", err));
}

/**
 * Keeps one of the widgets' sections on the figures a screen holds, away
 * from Home (Wid1): written when they change, and again when the app comes
 * back to the front, so the section's time is the last time it was seen.
 * `figures` is null while they load or could not be read, and then nothing
 * is written. Off the phone nothing is loaded or written.
 */
function useWidgetSection<F>(
  uid: string | null,
  dateKey: string,
  figures: F | null,
  build: (
    sections: Sections,
    account: string,
    dateKey: string,
    figures: F,
    nowMs: number
  ) => HomeWidgetSections
): void {
  // By value: a screen's figures are often a new object on every render.
  const key = figures === null ? "" : JSON.stringify(figures);
  const send = useEffectEvent(() => {
    if (!uid || figures === null || !isNativePlatform()) return;
    const nowMs = Date.now();
    write(
      (sections, account) => build(sections, account, dateKey, figures, nowMs),
      uid
    );
  });
  useEffect(() => {
    send();
  }, [uid, dateKey, key]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}

/** The food widget's calories and protein, from a screen that holds the
 *  day's totals and targets (Food). */
export function useWidgetFoodSection(
  uid: string | null,
  dateKey: string,
  figures: FoodFigures | null
): void {
  useWidgetSection(
    uid,
    dateKey,
    figures,
    ({ widgetFoodSection }, account, day, food, nowMs) => ({
      account,
      food: widgetFoodSection(day, food, nowMs),
    })
  );
}

/** The food widget's water, from today's water log. */
export function useWidgetWaterSection(
  uid: string | null,
  dateKey: string,
  figures: WaterFigures | null
): void {
  useWidgetSection(
    uid,
    dateKey,
    figures,
    ({ widgetWaterSection }, account, day, water, nowMs) => ({
      account,
      water: widgetWaterSection(day, water, nowMs),
    })
  );
}
