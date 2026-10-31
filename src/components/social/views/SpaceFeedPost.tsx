import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SectionLabel from "@/components/ui/SectionLabel";
import SpacePostCard from "@/features/spaces/SpacePostCard";
import SpaceCommentSheet from "@/features/spaces/SpaceCommentSheet";
import { useSpacePostLikes } from "@/features/spaces/useSpacePostLikes";
import type { SpacePostDoc } from "@/features/spaces/spaceTypes";

/** A joined-Space post with the same props and comments as its detail page. */
export default function SpaceFeedPost({
  spaceId,
  spaceName,
  postId,
  post,
  accent,
  uid,
  onRemoved,
}: {
  spaceId: string;
  spaceName: string;
  postId: string;
  post: SpacePostDoc;
  accent: string;
  uid: string | null;
  onRemoved: () => void;
}) {
  const postIds = useMemo(() => [postId], [postId]);
  const likes = useSpacePostLikes(spaceId, postIds);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);
  const spacePath = `/space/${encodeURIComponent(spaceId)}`;
  const postPath = `${spacePath}/post/${encodeURIComponent(postId)}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Link
          to={spacePath}
          className="inline-flex min-h-11 items-center min-w-0"
        >
          <SectionLabel as="span" className="truncate">
            {spaceName}
          </SectionLabel>
        </Link>
        <Link
          to={postPath}
          className="inline-flex min-h-11 items-center text-xs font-semibold text-lifting-strong"
          aria-label={`Open post in ${spaceName}`}
        >
          Open post
        </Link>
      </div>
      <SpacePostCard
        spaceId={spaceId}
        postId={postId}
        post={post}
        accent={accent}
        onRemoved={onRemoved}
        liked={likes.liked.has(postId)}
        likeDelta={likes.deltas[postId] ?? 0}
        onToggleLike={uid ? () => likes.toggle(postId) : undefined}
        commentDelta={commentDelta}
        onOpenComments={uid ? () => setCommentsOpen(true) : undefined}
      />
      {uid && commentsOpen && (
        <SpaceCommentSheet
          spaceId={spaceId}
          postId={postId}
          open
          onOpenChange={(open) => {
            if (!open) setCommentsOpen(false);
          }}
          commentCount={(post.commentCount ?? 0) + commentDelta}
          onCountChange={(delta) => setCommentDelta((n) => n + delta)}
        />
      )}
    </div>
  );
}
