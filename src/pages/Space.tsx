/**
 * Community Space page (Spc1 PR2 shell + PR3 posting).
 *
 * Photo hero header (editorial pipeline, tinted fallback until the
 * licensed asset lands), join/leave, density-gated member count, the
 * post list (pinned Tropos Team posts first, blocked authors filtered)
 * and the members-only composer (title + body + attach-a-session).
 * Post cards carry the moderation kit (author delete / report /
 * block); the interactive like/comment kit is a later callable-backed
 * slice.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import {
  ArrowLeft,
  Dumbbell,
  Footprints,
  Heart,
  Medal,
  MessagesSquare,
  PenLine,
  Plane,
  Sprout,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { THEME } from "@/lib/theme";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import {
  spaceDef,
  SPACE_MEMBER_COUNT_MIN_VISIBLE,
} from "@/features/spaces/spaceDefs";
import { useSpaceMembership } from "@/features/spaces/useSpaceMembership";
import SpacePostCard from "@/features/spaces/SpacePostCard";
import SpacePostComposer from "@/features/spaces/SpacePostComposer";
import type { SpacePostDoc } from "@/features/spaces/spaceTypes";

const ICON_MAP: Record<string, LucideIcon> = {
  sprout: Sprout,
  zap: Zap,
  heart: Heart,
  footprints: Footprints,
  dumbbell: Dumbbell,
  medal: Medal,
  plane: Plane,
};

const ACCENT_HEX: Record<"running" | "lifting" | "brand", string> = {
  running: THEME.running,
  lifting: THEME.lifting,
  brand: THEME.brand,
};

type PostItem = SpacePostDoc & { id: string };

export default function Space() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const def = spaceId ? spaceDef(spaceId) : undefined;
  const { joined, memberCount, busy, join, leave } =
    useSpaceMembership(spaceId);
  const { blocked: blockedUsers } = useBlockedUsers();
  const [posts, setPosts] = useState<PostItem[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!def || !spaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "spaces", spaceId, "posts"),
            orderBy("createdAt", "desc"),
            limit(50)
          )
        );
        if (cancelled) return;
        const items = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as PostItem
        );
        // Pinned Team posts lead regardless of age (Runna's pinned
        // intro pattern); everything else stays newest-first.
        items.sort(
          (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false)
        );
        setPosts(items);
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [def, spaceId, reloadNonce]);

  const photo = useMemo(
    () => (spaceId ? spaceEditorialImage(spaceId) : null),
    [spaceId]
  );

  const visiblePosts = useMemo(
    () =>
      (posts ?? []).filter(
        (p) => !blockedUsers || !blockedUsers.has(p.authorId)
      ),
    [posts, blockedUsers]
  );

  const handleRemoved = useCallback((postId: string) => {
    setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev);
  }, []);

  if (!def) {
    return (
      <div className="px-4 pt-8">
        <EmptyState
          icon={Users}
          headline="Space not found"
          sub="This space may have been merged or renamed."
          action={{ label: "Back to Community", href: "/social?tab=crews" }}
        />
      </div>
    );
  }

  const accent = ACCENT_HEX[def.accent];
  const Icon = ICON_MAP[def.icon] ?? Users;
  const showCount =
    memberCount !== null && memberCount >= SPACE_MEMBER_COUNT_MIN_VISIBLE;

  return (
    <div className="pb-6">
      {/* Hero header — photo (wash + scrim, white text) or the tinted
          fallback band. Back button floats on the art. */}
      <div
        className="relative h-44 overflow-hidden"
        style={
          photo
            ? undefined
            : {
                background: `linear-gradient(150deg, ${accent}26 0%, ${accent}0C 55%, ${accent}14 100%)`,
              }
        }
      >
        {photo ? (
          <>
            <img
              src={photo}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(150deg, ${accent}59 0%, ${accent}1F 60%, transparent 100%)`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to top, ${THEME.scrim} 0%, ${THEME.scrimSoft} 45%, transparent 70%)`,
              }}
            />
          </>
        ) : (
          <Icon
            size={140}
            className="absolute -right-4 -bottom-8"
            style={{
              color: accent,
              opacity: 0.16,
              transform: "rotate(-10deg)",
            }}
            aria-hidden
          />
        )}
        <div className="absolute top-3 left-3">
          <IconButton
            onClick={() => navigate(-1)}
            aria-label="Back"
            icon={<ArrowLeft />}
            className={photo ? "text-white" : undefined}
          />
        </div>
        <div className="absolute bottom-4 left-4 right-4 min-w-0">
          <h1
            className={`text-h2 font-extrabold leading-tight ${
              photo ? "text-white" : "text-foreground"
            }`}
          >
            {def.name}
          </h1>
          <p
            className={`text-caption font-medium mt-1 flex items-center gap-1 ${
              photo ? "text-white/85" : "text-muted-foreground"
            }`}
          >
            <Users className="size-3" aria-hidden />
            {showCount
              ? `${memberCount.toLocaleString()} members`
              : "New space"}
          </p>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <p className="text-sm text-muted-foreground">{def.tagline}</p>

        {joined ? (
          <div className="space-y-2">
            <Button
              variant="primary"
              fullWidth
              leftIcon={<PenLine className="size-4" />}
              onClick={() => setComposerOpen(true)}
            >
              Write a post
            </Button>
            <button
              type="button"
              onClick={leave}
              disabled={busy}
              className="w-full min-h-[44px] text-xs font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-60"
            >
              Leave space
            </button>
          </div>
        ) : (
          <Button
            variant="primary"
            fullWidth
            loading={busy}
            onClick={join}
            disabled={joined === null}
          >
            Join space
          </Button>
        )}

        <div className="space-y-3">
          <SectionLabel>Posts</SectionLabel>
          {posts === null ? (
            <div
              className="h-24 rounded-2xl bg-muted/40 animate-pulse"
              aria-hidden
            />
          ) : visiblePosts.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              headline="No posts yet"
              sub={
                joined
                  ? "Be the first — introduce yourself or share a session."
                  : "Join the space to be part of the conversation."
              }
              accent={accent}
              compact
              action={
                joined
                  ? {
                      label: "Write a post",
                      onClick: () => setComposerOpen(true),
                    }
                  : undefined
              }
            />
          ) : (
            visiblePosts.map((post) => (
              <SpacePostCard
                key={post.id}
                spaceId={def.id}
                postId={post.id}
                post={post}
                accent={accent}
                onRemoved={handleRemoved}
              />
            ))
          )}
        </div>
      </div>

      <SpacePostComposer
        spaceId={def.id}
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onPosted={() => setReloadNonce((n) => n + 1)}
      />
    </div>
  );
}
