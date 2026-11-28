/**
 * SettingsRecentlyDeleted — soft-delete archive.
 *
 * Lists meals the user soft-deleted so they
 * can restore or permanently delete. The companion to the in-session
 * 3-second toast undo on the Food page — that surface handles the
 * "I just clicked wrong" case; this page handles the "I need that
 * one back from last night" case.
 * Each meal is removed for good 30 days after it was deleted (F5c), by
 * the server's hourly `purgeSoftDeletedMeals`
 * (functions/lib/mealPurge.js). The page says so, and each row says how
 * long that meal has left (`purgeCountdown`, src/lib/mealPurge.ts). It
 * lists every soft-deleted meal still stored, one whose 30 days are up
 * included, since until the job reaches it the meal can still be restored.
 */
import { useState } from "react";
import { Trash2, RotateCcw, Utensils } from "lucide-react";
import { toast } from "@/lib/toast";
import { useMeals, type Meal } from "@/hooks/useMeals";
import { useDeletedMeals } from "@/hooks/useDeletedMeals";
import { DELETED_MEAL_RETENTION_DAYS, purgeCountdown } from "@/lib/mealPurge";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { haptic } from "@/lib/haptic";
import SettingsSection from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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

/** How long the meal has left before it is removed for good. */
function TimeLeft({
  deletedAtMs,
  nowMs,
}: {
  deletedAtMs: number;
  nowMs: number;
}) {
  const left = purgeCountdown(deletedAtMs, nowMs);
  if (left.kind === "due") return <>goes soon</>;
  return (
    <>
      <span className="font-mono tabular-nums">{left.days}</span>
      {left.days === 1 ? " day left" : " days left"}
    </>
  );
}

export default function SettingsRecentlyDeleted() {
  const uid = useUid();
  /* The LIST comes from its own query, ordered by deletion time — the
     question this screen asks. `useMeals` answers a different one (the
     newest 400 by `createdAt`), so a meal logged months ago and deleted
     today was absent from it and could not be restored here at all.

     The two writers still come from `useMeals`: both take a meal id and
     write, so they are independent of which query loaded the row, and a
     second copy of them is a second place for the soft-delete contract to
     drift. */
  const { restoreMeal, hardDeleteMeal } = useMeals();
  const { deletedMeals, loading } = useDeletedMeals(uid);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // The days left are read against the time the page opened: a count in
  // whole days does not need to tick while it is open.
  const [nowMs] = useState(() => Date.now());

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
      toast.error("Couldn’t restore. Try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleHardDelete(meal: Meal) {
    if (pendingId) return;
    setPendingId(meal.id);
    haptic("error");
    try {
      await hardDeleteMeal(meal.id);
      toast.success(`${meal.foodName || "Meal"} permanently deleted.`);
    } catch (e) {
      logger.error("[SettingsRecentlyDeleted] hard-delete failed", e);
      toast.error(
        e instanceof Error && !("code" in e)
          ? e.message
          : "Couldn’t delete. Try again."
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SettingsSection
      title="Recently deleted meals"
      subtitle={`Each meal is removed for good ${DELETED_MEAL_RETENTION_DAYS} days after you delete it.`}
      backTo="/settings/account"
      backLabel="Account"
    >
      {loading && sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <Card tone="flat">
          <EmptyState
            compact
            icon={Utensils}
            headline="No recently deleted meals"
            sub={`Meals you delete stay here for ${DELETED_MEAL_RETENTION_DAYS} days so you can restore them.`}
          />
        </Card>
      ) : (
        <ul aria-label="Recently deleted meals" className="space-y-2">
          {sorted.map((meal) => {
            const isPending = pendingId === meal.id;
            const deletedMs = deletedAtMs(meal);
            const relative = formatRelative(deletedMs);
            return (
              <li key={meal.id} className="rounded-xl bg-card surface-flat p-3">
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
                      {" · "}
                      <TimeLeft deletedAtMs={deletedMs} nowMs={nowMs} />
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 mt-2 sm:grid-cols-2">
                  <Button
                    onClick={() => handleRestore(meal)}
                    disabled={pendingId !== null}
                    aria-busy={isPending || undefined}
                    aria-label={`Restore ${meal.foodName || "meal"}`}
                    className="min-w-0"
                    leftIcon={<RotateCcw className="size-4" />}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleHardDelete(meal)}
                    disabled={pendingId !== null}
                    aria-busy={isPending || undefined}
                    aria-label={`Permanently delete ${meal.foodName || "meal"}`}
                    className="min-w-0"
                    leftIcon={<Trash2 className="size-4" />}
                  >
                    <span className="min-w-0 break-words">
                      Delete permanently
                    </span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
