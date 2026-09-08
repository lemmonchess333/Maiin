import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { useStreakReminder } from "@/hooks/RemindersProvider";
import { useStreaks } from "@/features/streaks/useStreaks";
import { BadgeEarnedContent } from "@/features/streaks/BadgeEarnedModal";
import { toast } from "@/lib/toast";

/** Explicit actions on a persisted session; never opens a dialog on mount. */
export default function CompletionExtras({
  onShare,
}: {
  onShare?: () => Promise<void>;
}) {
  const { prefs, loading, updatePrefs, requestPermission } =
    useStreakReminder();
  const { newBadge, dismissNewBadge } = useStreaks();
  const [pending, setPending] = useState(false);
  const [sharing, setSharing] = useState(false);
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
      {newBadge && (
        <BadgeEarnedContent
          key={newBadge.id}
          badge={newBadge}
          onDismiss={dismissNewBadge}
          inline
        />
      )}
      {onShare && (
        <Button
          variant="ghost"
          fullWidth
          loading={sharing}
          onClick={() => {
            if (sharing) return;
            setSharing(true);
            void onShare()
              .catch(() =>
                toast.error("Couldn't share this session. Try again.")
              )
              .finally(() => setSharing(false));
          }}
        >
          Share this session
        </Button>
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
