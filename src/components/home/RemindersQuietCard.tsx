import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellOff } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useRemindersQuiet } from "@/hooks/RemindersProvider";
import { quietMessage } from "@/lib/reminderAttention";
import type { ReminderKind } from "@/lib/reminderChoices";

/**
 * Home says it once when a reminder went quiet (App1 Q62,
 * `lib/reminderAttention.ts`): which reminders stopped, that the last 3
 * went unopened, and the way back in Settings → Notifications. Marked said
 * as it first shows; it stays for the rest of this visit to Home and does
 * not come back. A reminder turned back on in the meantime is not named.
 */
export default function RemindersQuietCard() {
  const attention = useRemindersQuiet();
  const navigate = useNavigate();
  const [kinds, setKinds] = useState<readonly ReminderKind[]>([]);
  const [hidden, setHidden] = useState(false);
  const waiting = attention?.quiet;
  const markShown = attention?.markShown;

  // Held for this visit once seen, though marking it said takes it out of
  // `waiting` straight away.
  const fresh = (waiting ?? []).filter((kind) => !kinds.includes(kind));
  if (fresh.length > 0) setKinds([...kinds, ...fresh]);

  useEffect(() => {
    if (!waiting || waiting.length === 0 || !markShown) return;
    void markShown(waiting);
  }, [waiting, markShown]);

  const message = quietMessage(kinds);
  if (!message || hidden) return null;
  return (
    <Banner
      variant="neutral"
      icon={<BellOff className="size-4" />}
      title={message.title}
      description={message.body}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => void navigate("/settings/notifications")}
        >
          Open settings
        </Button>
      }
      onDismiss={() => setHidden(true)}
      dismissLabel="Dismiss"
    />
  );
}
