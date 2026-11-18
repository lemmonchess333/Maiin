import { useEffect, useEffectEvent } from "react";
import type { HomeWidgetInput } from "@/lib/homeWidgetSnapshot";
import { isNativePlatform } from "@/lib/platform";
import { logger } from "@/lib/logger";

/** The snapshot's builder and its writer, loaded once and on a phone only:
 *  the web has no widgets, and Home's own chunk carries neither. */
let writer: Promise<
  [
    typeof import("@/lib/homeWidgetSnapshot"),
    typeof import("@/lib/homeWidgets"),
  ]
> | null = null;
function loadWriter() {
  writer ??= Promise.all([
    import("@/lib/homeWidgetSnapshot"),
    import("@/lib/homeWidgets"),
  ]);
  return writer;
}

/**
 * Keeps the Home Screen and Lock Screen widgets on what Home shows (Wid1):
 * writes the snapshot whenever Home's figures change, and again when the
 * app comes back to the front, so a widget's time is the last time the
 * app was looked at (W8d dims a day-old one).
 *
 * `input` is null until every source Home draws from has loaded: a
 * snapshot written mid-load would put a week with nothing done on the
 * lock screen. Off the phone nothing is loaded or written.
 */
export function useHomeWidgetSnapshot(
  input: Omit<HomeWidgetInput, "nowMs"> | null
): void {
  const write = useEffectEvent(() => {
    if (!input || !isNativePlatform()) return;
    const nowMs = Date.now();
    void loadWriter()
      .then(([{ homeWidgetSnapshot }, { writeHomeWidgetSnapshot }]) =>
        writeHomeWidgetSnapshot(homeWidgetSnapshot({ ...input, nowMs }))
      )
      .catch((err) => logger.warn("[widgets] snapshot not written", err));
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
