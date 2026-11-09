import { useAuth } from "@/lib/auth";
import { useWaterLog } from "@/hooks/useWaterLog";
import { useWidgetWaterSection } from "@/hooks/useHomeWidgetSections";

/**
 * Keeps the food widget's water on today's water log wherever the app is
 * (Wid1), so a drink logged on Home, on Food's diary, from the widget's
 * own "+" or on the Watch reaches the widget without Home being drawn.
 * It renders nothing, and is mounted on the phone only, above the routes:
 * one more listener on a document Home and Food listen to as well.
 */
export default function WidgetWaterSync() {
  const { user } = useAuth();
  const { day, ml, target, servingMl, drinks, loading } = useWaterLog();
  useWidgetWaterSection(
    user?.uid ?? null,
    day,
    loading
      ? null
      : {
          ml,
          targetMl: target,
          servingMl,
          drinkIds: drinks.map((drink) => drink.id),
        }
  );
  return null;
}
