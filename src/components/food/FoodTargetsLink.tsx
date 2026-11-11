import { Link } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { haptic } from "@/lib/haptic";

/**
 * The way to the nutrition targets, at the end of the Food page's header
 * row.
 *
 * It sat in the calorie card's corner. Since Food11 (call 1) Food draws
 * no large title: the date switcher is the header row and this gear
 * closes it, where a page's settings are looked for, and the wheel keeps
 * its corner for the share button alone.
 *
 * It deep-links straight to the focused Nutrition editor
 * (/settings/nutrition: goal weight, calorie targets, macros, activity),
 * so a wrong target is one tap from being fixed, as each Train tab's plan
 * edit goes to its own editor. Muted so it does not compete with the
 * day's number.
 */
export default function FoodTargetsLink() {
  return (
    <Link
      to="/settings/nutrition"
      aria-label="Adjust nutrition targets"
      onClick={() => haptic("light")}
      /* The negative margin sets the glyph on the page gutter, as the
         date switcher's does at the row's other end. Box and margin are
         px, not rem: at 2x text a rem box was 88px and the row no longer
         fitted at 320px. */
      className="-mr-[12px] size-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
    >
      <SettingsIcon className="size-5" aria-hidden="true" />
    </Link>
  );
}
