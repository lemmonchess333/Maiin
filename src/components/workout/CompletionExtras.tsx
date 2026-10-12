import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { useStreakReminder } from "@/hooks/RemindersProvider";
import { toast } from "@/lib/toast";
import SessionBadge from "@/components/workout/SessionBadge";
import SessionShareRow from "@/components/workout/SessionShareRow";
import type { SessionShareAction } from "@/lib/sessionPost";

/** Actions on a persisted session. Never opens a dialog on mount: sharing
 *  asks inline, once, and after that posts without one (SessionShareRow). */
export default function CompletionExtras({
  share,
  badge = true,
}: {
  share?: SessionShareAction;
  /** Show the session's badge here, first. The workout's finish screen
   *  shows it with its new bests instead (Pol1). */
  badge?: boolean;
}) {
  const { prefs, loading, updatePrefs, requestPermission } =
    useStreakReminder();
  const [pending, setPending] = useState(false);
  const changeReminder = async () => {
    if (pending) return;
    setPending(true);
    try {
      if (!prefs.enabled && !(await requestPermission())) return;
      await updatePrefs({ enabled: !prefs.enabled, primingShown: true });
    } catch {
      toast.error("Couldn't update the reminder. Try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      {badge && <SessionBadge />}
      {share && (
        // Keyed by session: a different session starts from its own state.
        <SessionShareRow
          key={`${share.uid}:${share.source.kind}:${share.source.id}`}
          action={share}
        />
      )}
      <div className="flex items-center justify-between gap-4 min-h-11">
        <span className="text-sm text-muted-foreground">
          Evening reminder if you haven't logged
        </span>
        <Toggle
          label="Evening reminder if you haven't logged"
          checked={prefs.enabled}
          disabled={loading || pending}
          onChange={() => {
            void changeReminder();
          }}
        />
      </div>
    </div>
  );
}
