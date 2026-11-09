import { useEffect, useEffectEvent } from "react";
import {
  homeWidgetSnapshot,
  type HomeWidgetInput,
} from "@/lib/homeWidgetSnapshot";
import { writeHomeWidgetSnapshot } from "@/lib/homeWidgets";

/**
 * Keeps the Home Screen and Lock Screen widgets on what Home shows (Wid1):
 * writes the snapshot whenever Home's figures change, and again when the
 * app comes back to the front, so a widget's time is the last time the
 * app was looked at (W8d dims a day-old one).
 *
 * `input` is null until every source Home draws from has loaded: a
 * snapshot written mid-load would put a week with nothing done on the
 * lock screen. Off the phone the write does nothing.
 */
export function useHomeWidgetSnapshot(
  input: Omit<HomeWidgetInput, "nowMs"> | null
): void {
  const write = useEffectEvent(() => {
    if (!input) return;
    void writeHomeWidgetSnapshot(
      homeWidgetSnapshot({ ...input, nowMs: Date.now() })
    );
  });
  useEffect(() => {
    write();
  }, [input]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") write();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
