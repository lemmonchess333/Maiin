/**
 * `/activity/:activityId` — one shared session, where its props and
 * comments are.
 *
 * The notification tray opens it for props and a comment on your session:
 * the post is the thing the notice is about, and its comments are where
 * you answer. `?comments=1` opens the comments at once, for a comment
 * notice.
 *
 * The post is read as anyone reads it, so the rules decide: a post that
 * was deleted, or one the viewer can no longer see, is refused rather than
 * answered as missing. Either way the page says the post is unavailable,
 * or, when the tray sent the person who acted along (`fallbackUserId` in
 * the route state), opens that person's profile instead.
 */
import { useEffect, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ChevronLeft, MessageCircleOff } from "lucide-react";
import { useUid } from "@/lib/auth";
import { batchGetKudos, fetchActivitiesByIds } from "@/lib/socialApi";
import { activityToFeedItem } from "@/lib/activityFeedItem";
import { logger } from "@/lib/logger";
import type { ActivityPostState } from "@/lib/notificationTarget";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import type { FeedItem } from "@/hooks/useSocialFeed";
import ActivityCard from "@/components/social/ActivityCard";
import { ActivityCardSkeleton } from "@/components/LoadingSkeleton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

type PostRead =
  | { status: "loading" }
  | { status: "ready"; item: FeedItem }
  | { status: "unavailable" }
  | { status: "error" };

export default function ActivityPost() {
  const { activityId } = useParams<{ activityId: string }>();
  const uid = useUid();
  if (!activityId) return null;
  // Keyed, so a second notice opening another post starts from loading.
  return (
    <ActivityPostPage
      key={`${uid ?? ""}:${activityId}`}
      activityId={activityId}
      uid={uid}
    />
  );
}

function ActivityPostPage({
  activityId,
  uid,
}: {
  activityId: string;
  uid: string | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openComments = searchParams.get("comments") === "1";
  const fallbackUserId = (location.state as ActivityPostState | null)
    ?.fallbackUserId;
  const { blocked, blockedYou, ready: blocksReady } = useBlockedUsers();
  const [read, setRead] = useState<PostRead>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await fetchActivitiesByIds([activityId]);
        const data = found[activityId];
        if (cancelled) return;
        if (!data) {
          setRead({ status: "unavailable" });
          return;
        }
        const liked = uid
          ? ((await batchGetKudos([activityId], uid))[activityId] ?? false)
          : false;
        if (cancelled) return;
        setRead({
          status: "ready",
          item: { ...activityToFeedItem(activityId, data), liked },
        });
      } catch (err) {
        logger.warn("[activity-post] read failed", err);
        if (!cancelled) setRead({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId, uid, attempt]);

  /* Blocking hides each person from the other, here as on the feed. */
  const authorId = read.status === "ready" ? read.item.authorId : "";
  const hidden =
    !!authorId &&
    authorId !== uid &&
    (blocked.has(authorId) || blockedYou.has(authorId));
  const unavailable = read.status === "unavailable" || hidden;

  if (unavailable && fallbackUserId) {
    return <Navigate to={`/user/${fallbackUserId}`} replace />;
  }

  const back = (
    <Button
      onClick={() => navigate(-1)}
      variant="ghost"
      size="sm"
      leftIcon={<ChevronLeft className="size-4" />}
      className="-ml-2 text-muted-foreground hover:text-foreground"
    >
      Back
    </Button>
  );

  return (
    <div className="space-y-4">
      {back}
      {unavailable ? (
        <EmptyState
          icon={MessageCircleOff}
          headline="This post isn't available"
          sub="It may have been deleted, or it's no longer shared with you."
        />
      ) : read.status === "error" ? (
        <ErrorState
          title="Couldn't load this post"
          description="Check your connection and try again."
          retry={{
            onClick: () => {
              setRead({ status: "loading" });
              setAttempt((n) => n + 1);
            },
          }}
        />
      ) : read.status === "ready" && (blocksReady || authorId === uid) ? (
        <ActivityCard feedItem={read.item} openComments={openComments} />
      ) : (
        <ActivityCardSkeleton />
      )}
    </div>
  );
}
