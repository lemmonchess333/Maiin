import { useEffect, useEffectEvent } from "react";
import {
  widgetFoodSection,
  widgetWaterSection,
  type FoodFigures,
  type WaterFigures,
} from "@/lib/homeWidgetSnapshot";
import { widgetAccount } from "@/lib/homeWidgetContract";
import { writeHomeWidgetSections } from "@/lib/homeWidgets";

/**
 * Keeps one of the widgets' sections on the figures a screen holds, away
 * from Home (Wid1): written when they change, and again when the app comes
 * back to the front, so the section's time is the last time it was seen.
 * `figures` is null while they load or could not be read, and then nothing
 * is written. Off the phone the write does nothing.
 */
function useWidgetSection<F>(
  uid: string | null,
  dateKey: string,
  figures: F | null,
  write: (account: string, dateKey: string, figures: F, nowMs: number) => void
): void {
  // By value: a screen's figures are often a new object on every render.
  const key = figures === null ? "" : JSON.stringify(figures);
  const send = useEffectEvent(() => {
    if (!uid || figures === null) return;
    write(widgetAccount(uid), dateKey, figures, Date.now());
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
  useWidgetSection(uid, dateKey, figures, (account, day, food, nowMs) => {
    void writeHomeWidgetSections({
      account,
      food: widgetFoodSection(day, food, nowMs),
    });
  });
}

/** The food widget's water, from today's water log. */
export function useWidgetWaterSection(
  uid: string | null,
  dateKey: string,
  figures: WaterFigures | null
): void {
  useWidgetSection(uid, dateKey, figures, (account, day, water, nowMs) => {
    void writeHomeWidgetSections({
      account,
      water: widgetWaterSection(day, water, nowMs),
    });
  });
}
