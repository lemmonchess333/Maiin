/**
 * `/space/:spaceId/post/:postId` — one Space post, where its props and
 * comments are.
 *
 * The notification tray opens it for props and a comment on your Space
 * post: the post is the thing the notice is about, and its comments are
 * where you answer. `?comments=1` opens the comments at once, for a
 * comment notice. The card and the comment sheet are the Space page's
 * own, so the post reads and behaves here as it does in its Space, and
 * the Space is one tap away above it.
 *
 * One document is read. A Space's posts are open to anyone signed in,
 * member or not (membership gates posting, not reading), so the rules
 * refuse only what nobody may read. The post is unavailable when it is
 * gone, when the rules refuse it, when its Space is not one the app has,
 * when it is one of the retired coach posts, and across a block either
 * way. The page then says so and links to the Space, or, when the tray
 * asked (`fallbackToSpace` in the route state), opens the Space instead.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ChevronLeft, ChevronRight, MessageCircleOff } from "lucide-react";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { isPermissionDenied } from "@/lib/socialApi";
import { logger } from "@/lib/logger";
import type { SpacePostState } from "@/lib/notificationTarget";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { spaceDef } from "@/features/spaces/spaceDefs";
import { SPACE_ACCENT_HEX } from "@/features/spaces/spaceAccent";
import {
  isMemberFacing,
  type SpacePostDoc,
} from "@/features/spaces/spaceTypes";
import SpacePostCard from "@/features/spaces/SpacePostCard";
import SpaceCommentSheet from "@/features/spaces/SpaceCommentSheet";
import { useSpacePostLikes } from "@/features/spaces/useSpacePostLikes";
import { ActivityCardSkeleton } from "@/components/LoadingSkeleton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

type PostRead =
  | { status: "loading" }
  | { status: "ready"; post: SpacePostDoc }
  | { status: "unavailable" }
  | { status: "error" };

/** No post to read likes for: one array, so the likes hook sees no change. */
const NO_POSTS: string[] = [];

export default function SpacePost() {
  const { spaceId, postId } = useParams<{ spaceId: string; postId: string }>();
  const uid = useUid();
  if (!spaceId || !postId) return null;
  // Keyed, so a second notice opening another post starts from loading.
  return (
    <SpacePostPage
      key={`${uid ?? ""}:${spaceId}/${postId}`}
      spaceId={spaceId}
      postId={postId}
      uid={uid}
    />
  );
}

function SpacePostPage({
  spaceId,
  postId,
  uid,
}: {
  spaceId: string;
  postId: string;
  uid: string | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const fallbackToSpace =
    (location.state as SpacePostState | null)?.fallbackToSpace === true;
  const def = spaceDef(spaceId);
  const known = !!def;
  const { blocked, ready: blocksReady } = useBlockedUsers();
  const [read, setRead] = useState<PostRead>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(
    searchParams.get("comments") === "1"
  );
  // This visit's comments, added or deleted, on top of the stored count.
  const [commentDelta, setCommentDelta] = useState(0);

  useEffect(() => {
    // The Space page shows nothing of a Space the app does not have.
    if (!known) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "spaces", spaceId, "posts", postId));
        if (cancelled) return;
        setRead(
          snap.exists()
            ? { status: "ready", post: snap.data() as SpacePostDoc }
            : { status: "unavailable" }
        );
      } catch (err) {
        if (cancelled) return;
        if (isPermissionDenied(err)) {
          setRead({ status: "unavailable" });
          return;
        }
        logger.warn("[space-post] read failed", err);
        setRead({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [known, spaceId, postId, attempt]);

  const post = read.status === "ready" ? read.post : null;
  /* Blocking hides each person from the other, here as in the Space:
     `blocked` holds both directions. */
  const hidden =
    !!post &&
    (!isMemberFacing(post) ||
      (post.authorId !== uid && blocked.has(post.authorId)));
  const unavailable = !def || read.status === "unavailable" || hidden;
  const shown =
    def && post && !unavailable && (blocksReady || post.authorId === uid)
      ? { def, post }
      : null;

  // The viewer's props are read only for a post that is drawn.
  const thisPost = useMemo(() => [postId], [postId]);
  const likes = useSpacePostLikes(spaceId, shown ? thisPost : NO_POSTS);

  const spacePath = `/space/${encodeURIComponent(spaceId)}`;
  if (unavailable && fallbackToSpace) {
    return <Navigate to={spacePath} replace />;
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
          action={
            def ? { label: `Open ${def.name}`, href: spacePath } : undefined
          }
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
      ) : shown ? (
        <>
          {/* The Space the post is in, one tap away: the same row as the
              race header's link to the official website. */}
          <Link
            to={spacePath}
            className="flex items-center justify-between gap-2 min-h-[44px] rounded-xl bg-muted/50 px-3.5 text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
          >
            <span className="min-w-0">{shown.def.name}</span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Link>
          <SpacePostCard
            spaceId={shown.def.id}
            postId={postId}
            post={shown.post}
            accent={SPACE_ACCENT_HEX[shown.def.accent]}
            // The author deleted it: back to the Space it was in.
            onRemoved={() => navigate(spacePath, { replace: true })}
            liked={likes.liked.has(postId)}
            likeDelta={likes.deltas[postId] ?? 0}
            onToggleLike={uid ? () => likes.toggle(postId) : undefined}
            commentDelta={commentDelta}
            onOpenComments={uid ? () => setCommentsOpen(true) : undefined}
          />
        </>
      ) : (
        <ActivityCardSkeleton />
      )}

      {shown && uid && commentsOpen && (
        <SpaceCommentSheet
          spaceId={shown.def.id}
          postId={postId}
          open
          onOpenChange={(open) => {
            if (!open) setCommentsOpen(false);
          }}
          // The count the card shows, as the Space page hands it over.
          commentCount={(shown.post.commentCount ?? 0) + commentDelta}
          onCountChange={(delta) => setCommentDelta((n) => n + delta)}
        />
      )}
    </div>
  );
}
