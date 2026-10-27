import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  UserPlus,
  UserCheck,
  Trophy,
  Bell,
  Users,
  HeartHandshake,
  ClipboardList,
  Flame,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { THEME } from "@/lib/theme";
import { haptic } from "@/lib/haptic";
import { getTimeAgo } from "@/lib/timeAgo";
import type {
  NotificationItem,
  NotificationType,
} from "@/hooks/useNotifications";
import { notificationTarget } from "@/lib/notificationTarget";
import { useFollowRequests } from "@/hooks/useFollowRequests";
import FollowRequestAnswer from "@/components/social/FollowRequestAnswer";

/**
 * The in-app notification tray (kudos / comment / follow / milestone).
 * Presentational — the subscription + unread/last-seen logic lives in
 * `useNotifications`, owned by the Social page, so this is testable with
 * injected items.
 *
 * Tapping a row opens what it is about (`notificationTarget`): props and
 * a comment open the post, a session's or a Space's, and the rest the
 * profile of whoever acted.
 *
 * A follow request still waiting is answered on its row, with People's
 * Accept and Decline (`useFollowRequests`, read only while the tray is open
 * with a request in it). The row itself still opens the asker's profile.
 */

const TYPE_ICON: Record<
  NotificationType,
  { Icon: typeof Heart; color: string }
> = {
  kudos: { Icon: Heart, color: THEME.semantic.vitals },
  comment: { Icon: MessageCircle, color: THEME.brand },
  follow: { Icon: UserPlus, color: THEME.semantic.positive },
  follow_request: { Icon: UserPlus, color: THEME.semantic.positive },
  follow_accepted: { Icon: UserCheck, color: THEME.semantic.positive },
  challenge_milestone: { Icon: Trophy, color: THEME.semantic.nutrition },
  circle_focus_backed: { Icon: Users, color: THEME.brand },
  circle_milestone: { Icon: Trophy, color: THEME.semantic.positive },
  circle_needs_support: { Icon: HeartHandshake, color: THEME.brand },
  circle_joined: { Icon: UserPlus, color: THEME.brand },
  circle_routine_shared: { Icon: ClipboardList, color: THEME.brand },
  // SOC-P2g — space-post engagement. Coral: the running/vitals register
  // the flame action itself uses.
  space_post_like: { Icon: Flame, color: THEME.running },
  space_post_comment: { Icon: MessageCircle, color: THEME.running },
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
    case "follow_request":
      return `${who} asked to follow you`;
    case "follow_accepted":
      return `${who} accepted your follow request`;
    case "challenge_milestone":
      return n.message || "You hit a challenge milestone";
    case "circle_focus_backed":
      // Generic by design (SOCIAL-FOCUS-01): never the backer's name,
      // never the focus.
      return "A Circle member backed your weekly focus";
    case "circle_milestone":
      return `${who} hit a milestone`;
    case "circle_needs_support":
      return `${who} could use a nudge`;
    case "circle_joined":
      return `${who} joined your circle`;
    case "circle_routine_shared":
      return `${who} shared a routine`;
    case "space_post_like":
      return `${who} gave your space post props`;
    case "space_post_comment":
      return `${who} commented on your space post`;
    default:
      return who;
  }
}

export default function NotificationsSheet({
  open,
  onOpenChange,
  items,
  loading,
  error = false,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationItem[];
  loading: boolean;
  /** NOTIFICATION-TRUST-01: a failed read renders a truthful unavailable
   *  state with a Try again action — never the "No notifications yet"
   *  empty state. */
  error?: boolean;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const followRequests = useFollowRequests(
    open && items.some((n) => n.type === "follow_request")
  );
  const waiting = new Set(followRequests.requests.map((r) => r.uid));
  /* What was said on a row here, so it reads as done. A failed answer
     says so in a toast and leaves the request waiting, buttons and all. */
  const [answered, setAnswered] = useState<
    Record<string, "Accepted" | "Declined">
  >({});
  const answer = async (uid: string, accept: boolean) => {
    const done = accept
      ? await followRequests.accept(uid)
      : await followRequests.decline(uid);
    if (done)
      setAnswered((was) => ({
        ...was,
        [uid]: accept ? "Accepted" : "Declined",
      }));
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Notifications">
      <div className="px-4 pb-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState
            compact
            icon={Bell}
            accent={THEME.warning}
            headline="Notifications unavailable"
            sub="We couldn't load your notifications. Check your connection and try again."
            action={
              onRetry
                ? { label: "Try again", onClick: onRetry, variant: "secondary" }
                : undefined
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={Bell}
            headline="No notifications yet"
            sub="Props and comments on your sessions, and news from your circles and spaces, show up here."
          />
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((n) => {
              const { Icon, color } = TYPE_ICON[n.type];
              const asker = n.type === "follow_request" ? n.fromUserId : "";
              const said = asker ? answered[asker] : undefined;
              return (
                /* The answers sit beside the row's button, never in it;
                   at large text they wrap under it. */
                <li key={n.id} className="flex flex-wrap items-center gap-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      onOpenChange(false);
                      const target = notificationTarget(n);
                      if (target?.state) {
                        navigate(target.to, { state: target.state });
                      } else if (target) {
                        navigate(target.to);
                      }
                    }}
                    className="flex min-h-[44px] min-w-[min(12em,100%)] flex-1 items-center gap-3 py-3 text-left active:scale-[0.99] transition-transform"
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
                  {said ? (
                    <p className="ml-auto py-2 text-sm text-muted-foreground">
                      {said}
                    </p>
                  ) : (
                    asker &&
                    waiting.has(asker) && (
                      <div className="ml-auto py-2">
                        <FollowRequestAnswer
                          name={n.fromName || "Someone"}
                          onAccept={() => void answer(asker, true)}
                          onDecline={() => void answer(asker, false)}
                        />
                      </div>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
