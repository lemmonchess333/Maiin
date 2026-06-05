import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, UserPlus, Trophy, Bell } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { getTimeAgo } from "@/lib/timeAgo";
import type {
  NotificationItem,
  NotificationType,
} from "@/hooks/useNotifications";

/**
 * The in-app notification tray (kudos / comment / follow / milestone).
 * Presentational — the subscription + unread/last-seen logic lives in
 * `useNotifications`, owned by the Social page, so this is testable with
 * injected items. Tapping a row deep-links to the actor's profile
 * (`/user/{fromUserId}`) — there is no single-activity route, and the actor
 * is the useful next action (engage back / follow them).
 */

const TYPE_ICON: Record<
  NotificationType,
  { Icon: typeof Heart; color: string }
> = {
  kudos: { Icon: Heart, color: THEME.semantic.vitals },
  comment: { Icon: MessageCircle, color: THEME.brand },
  follow: { Icon: UserPlus, color: THEME.semantic.positive },
  challenge_milestone: { Icon: Trophy, color: THEME.semantic.nutrition },
};

/** Fallback copy when the server didn't store a pre-built `message`. */
function fallbackMessage(n: NotificationItem): string {
  const who = n.fromName || "Someone";
  switch (n.type) {
    case "kudos":
      return `${who} gave you props`;
    case "comment":
      return `${who} commented on your activity`;
    case "follow":
      return `${who} started following you`;
    case "challenge_milestone":
      return n.message || "You hit a challenge milestone";
    default:
      return who;
  }
}

export default function NotificationsSheet({
  open,
  onOpenChange,
  items,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationItem[];
  loading: boolean;
}) {
  const navigate = useNavigate();

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Notifications">
      <div className="px-4 pb-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center text-center py-10 px-6">
            <div
              className="size-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ backgroundColor: THEME.brand + "14" }}
            >
              <Bell className="size-6" style={{ color: THEME.brand }} />
            </div>
            <p className="text-sm font-semibold text-foreground">
              No notifications yet
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Kudos, comments and new followers on your activities will show up
              here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((n) => {
              const { Icon, color } = TYPE_ICON[n.type];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      onOpenChange(false);
                      if (n.fromUserId) navigate(`/user/${n.fromUserId}`);
                    }}
                    className="w-full flex items-center gap-3 py-3 text-left min-h-[44px] active:scale-[0.99] transition-transform"
                  >
                    <div
                      className="size-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: color + "1A" }}
                    >
                      <Icon className="size-5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">
                        {n.message || fallbackMessage(n)}
                      </p>
                      {n.createdAt && (
                        <p className="text-micro text-muted-foreground mt-0.5">
                          {getTimeAgo(n.createdAt)}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
