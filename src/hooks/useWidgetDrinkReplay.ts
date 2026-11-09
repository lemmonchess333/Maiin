import { useEffect, useEffectEvent } from "react";
import { isNativePlatform } from "@/lib/platform";
import { resolveTargetMl } from "@/lib/waterUnits";
import { logger } from "@/lib/logger";

/**
 * Saves the drinks the food widget's "+" queued, on sign-in and on every
 * return to the app (`widgetDrinks.ts`). `uid` is null until the profile
 * has loaded, so a drink is saved against the person's own water target,
 * as a tap on Home's card is. The replay module loads on the phone only.
 */
export function useWidgetDrinkReplay(
  uid: string | null,
  targetWaterGlasses: number | undefined
): void {
  const replay = useEffectEvent(() => {
    if (!uid || !isNativePlatform()) return;
    const targetMl = resolveTargetMl({ targetWaterGlasses });
    void import("@/lib/widgetDrinks")
      .then(({ replayWidgetDrinks }) => replayWidgetDrinks(uid, targetMl))
      .catch((error) =>
        logger.warn("[widgets] queued drinks not saved yet", error)
      );
  });
  useEffect(() => {
    if (!uid) return;
    replay();
    const onVisible = () => {
      if (document.visibilityState === "visible") replay();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [uid]);
}
