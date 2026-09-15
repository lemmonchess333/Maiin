import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  getNotificationPermissionState,
  requestNotificationPermission,
} from "@/lib/notifications";
import { readString, writeString } from "@/lib/localStore";
import { trialReminderAskKey } from "@/lib/proStart";
import { THEME } from "@/lib/theme";

/**
 * The one-line greeting on Food after a purchase. Pro is on; the camera
 * is right there. Transient — the Food page drops the context once the
 * user moves on, and this never renders again.
 */
export function ProStartChip() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: `${THEME.brand}14` }}
      role="status"
    >
      <Sparkles
        className="size-4 shrink-0"
        style={{ color: THEME.brand }}
        aria-hidden="true"
      />
      <p className="flex-1 text-sm text-foreground">
        Pro is on. Point the camera at your next meal.
      </p>
    </div>
  );
}

interface AskProps {
  uid: string;
  /** Called once the ask is answered, or when there is nothing to ask. */
  onDone: () => void;
}

/**
 * One ask, at the moment it is worth asking: the trial has just started,
 * the app has promised a reminder before it converts, and that reminder
 * is a local notification. Shown only while permission is undecided —
 * granted needs nothing, denied is the OS's to change — and only once
 * per account, whatever they answer.
 */
export function TrialReminderAsk({ uid, onDone }: AskProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = trialReminderAskKey(uid);
      if (readString(key)) {
        onDone();
        return;
      }
      const state = await getNotificationPermissionState();
      if (cancelled) return;
      if (state !== "default") {
        onDone();
        return;
      }
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
    // `onDone` is the page's param-stripping closure; re-running on its
    // identity would re-check permission for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const finish = () => {
    writeString(trialReminderAskKey(uid), new Date().toISOString());
    setOpen(false);
    onDone();
  };

  return (
    <ConfirmDialog
      open={open}
      title="Want a reminder before your trial ends?"
      description="One notification, two days before, so the first charge is never a surprise."
      confirmLabel="Turn on"
      cancelLabel="Not now"
      onConfirm={() => {
        void requestNotificationPermission().finally(finish);
      }}
      onCancel={finish}
    />
  );
}
