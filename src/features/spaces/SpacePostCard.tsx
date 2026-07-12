/**
 * Space post card (Spc1 PR3). Author row (Tropos Team badge is
 * rules-backed), title/body, optional attached-session art — the SAME
 * hero grammar as the feed's ActivityCard (RouteScene glow for runs,
 * MiniMuscleFigure for lifts) — read-only engagement counts, and the
 * moderation kit: author delete, or report/block for everyone else.
 * photoUrl renders when present (written by the PR4 photo slice).
 */
import { useState } from "react";
import { deleteDoc, doc, type Timestamp } from "firebase/firestore";
import {
  Ban,
  Flag,
  Flame,
  MessageCircle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { blockUser } from "@/lib/socialApi";
import { getTimeAgo } from "@/lib/timeAgo";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { THEME } from "@/lib/theme";
import Avatar from "@/components/Avatar";
import RouteScene from "@/components/social/RouteScene";
import MiniMuscleFigure, {
  hasMuscleFigure,
} from "@/components/social/MiniMuscleFigure";
import ReportModal from "@/components/social/ReportModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
import type { SpacePostDoc } from "./spaceTypes";

function formatPace(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SpacePostCard({
  spaceId,
  postId,
  post,
  accent,
  onRemoved,
}: {
  spaceId: string;
  postId: string;
  post: SpacePostDoc;
  accent: string;
  onRemoved: (postId: string) => void;
}) {
  const { user } = useAuth();
  const { addBlocked } = useBlockedUsers();
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isAuthor = user?.uid === post.authorId;
  const activity = post.activity;
  const isRunAttach =
    activity?.type === "run" &&
    !!activity.routePreview &&
    activity.routePreview.length > 1;
  const isLiftAttach =
    activity?.type === "workout" &&
    hasMuscleFigure(activity.muscleGroups ?? []);

  const removePost = async () => {
    try {
      await deleteDoc(doc(db, "spaces", spaceId, "posts", postId));
      haptic("light");
      onRemoved(postId);
    } catch {
      toast.error("Couldn't delete the post. Try again.");
    }
  };

  return (
    <article className="rounded-2xl bg-card card-shadow overflow-hidden">
      {/* Attached-session art — full-bleed top panel, ActivityCard
          hero grammar (static layers only). */}
      {isRunAttach && activity && (
        <div
          className="relative h-24 border-b border-border/50"
          style={{
            background: `linear-gradient(150deg, ${THEME.running}24 0%, ${THEME.running}0A 55%, ${THEME.running}12 100%)`,
          }}
        >
          <RouteScene preview={activity.routePreview!} />
          {(activity.distance ?? 0) > 0 && (
            <div className="absolute bottom-2.5 left-3.5">
              <p className="text-xl font-bold font-mono tabular-nums leading-none text-running">
                {((activity.distance ?? 0) / 1000).toFixed(2)}
              </p>
              <SectionLabel className="mt-0.5">km</SectionLabel>
            </div>
          )}
          {(activity.avgPace ?? 0) > 0 && (
            <div className="absolute bottom-2.5 right-3.5 text-right">
              <p className="text-sm font-bold font-mono tabular-nums leading-none text-foreground">
                {formatPace(activity.avgPace!)}
              </p>
              <SectionLabel className="mt-0.5">/km</SectionLabel>
            </div>
          )}
        </div>
      )}
      {isLiftAttach && activity && (
        <div
          className="relative h-24 border-b border-border/50 overflow-hidden"
          style={{
            background: `linear-gradient(150deg, ${THEME.lifting}22 0%, ${THEME.lifting}08 55%, ${THEME.lifting}10 100%)`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center py-1.5">
            <MiniMuscleFigure
              categories={activity.muscleGroups ?? []}
              className="h-full w-auto"
            />
          </div>
          {(activity.totalVolume ?? 0) > 0 && (
            <div className="absolute bottom-2.5 left-3.5">
              <p className="text-xl font-bold font-mono tabular-nums leading-none text-lifting">
                {Math.round(activity.totalVolume ?? 0).toLocaleString()}
              </p>
              <SectionLabel className="mt-0.5">kg volume</SectionLabel>
            </div>
          )}
          {(activity.exerciseCount ?? 0) > 0 && (
            <div className="absolute bottom-2.5 right-3.5 text-right">
              <p className="text-sm font-bold font-mono tabular-nums leading-none text-foreground">
                {activity.exerciseCount}
              </p>
              <SectionLabel className="mt-0.5">exercises</SectionLabel>
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2.5">
          <Avatar
            photoURL={post.authorPhotoURL}
            displayName={post.authorName}
            size="md"
            fallbackBg={`${accent}20`}
            fallbackColor={accent}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {post.authorName}
              </p>
              {post.official && (
                <span
                  className="inline-flex items-center text-caption font-semibold px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: `${THEME.success}1F`,
                    color: THEME.success,
                  }}
                >
                  Tropos Team
                </span>
              )}
              {post.pinned && (
                <span className="text-caption text-muted-foreground shrink-0">
                  Pinned
                </span>
              )}
            </div>
            <p className="text-caption text-muted-foreground">
              {(post.createdAt as Timestamp)?.toDate
                ? getTimeAgo((post.createdAt as Timestamp).toDate())
                : ""}
            </p>
          </div>
          {user && (
            <div className="relative">
              <IconButton
                onClick={() => setShowMenu(!showMenu)}
                aria-label="Post options"
                aria-expanded={showMenu}
                icon={<MoreHorizontal />}
              />
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    role="presentation"
                    aria-hidden="true"
                    onClick={() => setShowMenu(false)}
                  />
                  <div
                    className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-lg py-1 w-44"
                    role="menu"
                    tabIndex={-1}
                    ref={(el) => el?.focus()}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setShowMenu(false);
                    }}
                  >
                    {isAuthor ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowMenu(false);
                          setShowDeleteConfirm(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                      >
                        <Trash2 className="size-4" />
                        Delete post
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowMenu(false);
                            setShowReport(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                          <Flag className="size-4 text-muted-foreground" />
                          Report post
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowMenu(false);
                            setShowBlockConfirm(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                        >
                          <Ban className="size-4" />
                          Block user
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {post.title && (
          <p className="text-sm font-bold text-foreground">{post.title}</p>
        )}
        <p className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap">
          {post.body}
        </p>

        {/* PR4 photo slice renders here when photoUrl is present. */}
        {post.photoUrl && (
          <img
            src={post.photoUrl}
            alt=""
            loading="lazy"
            className="w-full max-h-80 object-cover rounded-xl"
          />
        )}

        {/* Read-only engagement counts — the interactive like/comment
            kit is a later callable-backed slice; zero counts render
            nothing rather than dead buttons. */}
        {((post.likeCount ?? 0) > 0 || (post.commentCount ?? 0) > 0) && (
          <div className="flex items-center gap-4 pt-1 text-muted-foreground">
            {(post.likeCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium font-mono tabular-nums">
                <Flame className="size-4" aria-hidden />
                {post.likeCount}
              </span>
            )}
            {(post.commentCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium font-mono tabular-nums">
                <MessageCircle className="size-4" aria-hidden />
                {post.commentCount}
              </span>
            )}
          </div>
        )}
      </div>

      {showReport && (
        <ReportModal
          targetType="space_post"
          targetId={`${spaceId}:${postId}`}
          targetAuthorUid={post.authorId}
          onClose={() => setShowReport(false)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete this post?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await removePost();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showBlockConfirm}
        title="Block this user?"
        description="They won't be able to see your activities and you won't see theirs."
        confirmLabel="Block"
        destructive
        onConfirm={async () => {
          setShowBlockConfirm(false);
          if (!user) return;
          haptic("heavy");
          try {
            await blockUser(user.uid, post.authorId);
            addBlocked(post.authorId);
            toast.success(`Blocked ${post.authorName}`);
          } catch {
            toast.error(`Couldn't block ${post.authorName}. Try again.`);
          }
        }}
        onCancel={() => setShowBlockConfirm(false)}
      />
    </article>
  );
}
