/**
 * SettingsRecentlyDeleted — F5c soft-delete archive (24h window).
 *
 * Lists meals the user soft-deleted within the last 24 hours so they
 * can restore or permanently delete. The companion to the in-session
 * 3-second toast undo on the Food page — that surface handles the
 * "I just clicked wrong" case; this page handles the "I need that
 * one back from last night" case.
 *
 * Server-side auto-purge (the `purgeSoftDeletedMeals` cron CF) is
 * deferred. Until that lands, soft-deleted meals accumulate until
 * the user manually purges them or restores them; the per-meal
 * "deleted X ago" label still tells the user which ones are past
 * the spec's 24h window so they can clean up.
 */
import { useState } from "react";
import { Trash2, RotateCcw, Utensils } from "lucide-react";
import { toast } from "@/lib/toast";
import { useMeals, type Meal } from "@/hooks/useMeals";
import { logger } from "@/lib/logger";
import { haptic } from "@/lib/haptic";
import SettingsSection from "@/components/settings/SettingsSection";

function deletedAtMs(meal: Meal): number {
  const v = meal.deletedAt;
  if (!v) return 0;
  // Firestore Timestamp shape — { toDate(): Date } or seconds/nanoseconds.
  if (typeof v === "object" && v !== null) {
    const maybeToDate = (v as { toDate?: () => Date }).toDate;
    if (typeof maybeToDate === "function") return maybeToDate.call(v).getTime();
    const seconds = (v as { seconds?: number }).seconds;
    if (typeof seconds === "number") return seconds * 1000;
  }
  if (typeof v === "number") return v;
  return 0;
}

function formatRelative(ms: number): string {
  if (ms <= 0) return "just now";
  const elapsed = Date.now() - ms;
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) {
    const m = Math.floor(elapsed / 60_000);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 86_400_000) {
    const h = Math.floor(elapsed / 3_600_000);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(elapsed / 86_400_000);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function SettingsRecentlyDeleted() {
  const { deletedMeals, restoreMeal, hardDeleteMeal, loading } = useMeals();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Sort by deletedAt DESC — most recent at top per F5c spec pin (6).
  const sorted = [...deletedMeals].sort(
    (a, b) => deletedAtMs(b) - deletedAtMs(a)
  );

  async function handleRestore(meal: Meal) {
    if (pendingId) return;
    setPendingId(meal.id);
    haptic();
    try {
      await restoreMeal(meal.id);
      toast.success(`${meal.foodName || "Meal"} restored.`);
    } catch (e) {
      logger.error("[SettingsRecentlyDeleted] restore failed", e);
      toast.error("Couldn't restore. Try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleHardDelete(meal: Meal) {
    if (pendingId) return;
    // No native confirm dialog — keep the flow tight. If accidental
    // permanent deletes start being reported, a confirmation step can
    // be added without changing the call shape.
    setPendingId(meal.id);
    haptic("error");
    try {
      await hardDeleteMeal(meal.id);
      toast.success(`${meal.foodName || "Meal"} permanently deleted.`);
    } catch (e) {
      logger.error("[SettingsRecentlyDeleted] hard-delete failed", e);
      toast.error("Couldn't delete. Try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SettingsSection
      title="Recently deleted meals"
      subtitle="Restore meals you deleted in the last 24 hours."
    >
      {loading && sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl bg-card border border-border/40 p-4 text-center space-y-1">
          <Utensils
            aria-hidden="true"
            className="size-5 mx-auto text-muted-foreground"
          />
          <p className="text-sm text-foreground">No recently deleted meals</p>
          <p className="text-xs text-muted-foreground">
            Meals you delete appear here for 24 hours before being permanently
            removed.
          </p>
        </div>
      ) : (
        <ul aria-label="Recently deleted meals" className="space-y-2">
          {sorted.map((meal) => {
            const isPending = pendingId === meal.id;
            const relative = formatRelative(deletedAtMs(meal));
            return (
              <li
                key={meal.id}
                className="rounded-xl bg-card border border-border/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {meal.foodName || "Meal"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {Math.round(meal.totalCalories)}
                      </span>
                      {" kcal · deleted "}
                      {relative}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleRestore(meal)}
                    disabled={isPending}
                    aria-label={`Restore ${meal.foodName || "meal"}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-primary-strong text-primary-foreground text-xs font-semibold motion-safe:active:scale-[0.98] disabled:opacity-50"
                  >
                    <RotateCcw className="size-3.5" />
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHardDelete(meal)}
                    disabled={isPending}
                    aria-label={`Permanently delete ${meal.foodName || "meal"}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-semibold motion-safe:active:scale-[0.98] disabled:opacity-50"
                    style={{
                      backgroundColor: "hsl(var(--destructive) / 0.1)",
                      color: "hsl(var(--destructive))",
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
