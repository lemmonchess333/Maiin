/**
 * Community Space page (Spc1 PR2 — lean slice).
 *
 * Photo hero header (editorial pipeline, tinted fallback until the
 * licensed asset lands), join/leave, density-gated member count, and a
 * read-only post list (pinned Tropos Team posts first). The composer +
 * engagement kit arrive in the PR3 slice; posting is already
 * rules-live, so seeded/official posts render here today.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import {
  ArrowLeft,
  Dumbbell,
  Footprints,
  Heart,
  Medal,
  MessagesSquare,
  Plane,
  Sprout,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { THEME } from "@/lib/theme";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { getTimeAgo } from "@/lib/timeAgo";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import Avatar from "@/components/Avatar";
import {
  spaceDef,
  SPACE_MEMBER_COUNT_MIN_VISIBLE,
} from "@/features/spaces/spaceDefs";
import { useSpaceMembership } from "@/features/spaces/useSpaceMembership";
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
  const [posts, setPosts] = useState<PostItem[] | null>(null);

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
  }, [def, spaceId]);

  const photo = useMemo(
    () => (spaceId ? spaceEditorialImage(spaceId) : null),
    [spaceId]
  );

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

        <Button
          variant={joined ? "secondary" : "primary"}
          fullWidth
          loading={busy}
          onClick={joined ? leave : join}
          disabled={joined === null}
        >
          {joined ? "Joined — tap to leave" : "Join space"}
        </Button>

        <div className="space-y-3">
          <SectionLabel>Posts</SectionLabel>
          {posts === null ? (
            <div
              className="h-24 rounded-2xl bg-muted/40 animate-pulse"
              aria-hidden
            />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              headline="No posts yet"
              sub={
                joined
                  ? "You're in — posting opens with the composer, landing next."
                  : "Join the space to be part of the conversation."
              }
              accent={accent}
              compact
            />
          ) : (
            posts.map((post) => (
              <article
                key={post.id}
                className="p-4 rounded-2xl bg-card card-shadow space-y-2"
              >
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
                </div>
                {post.title && (
                  <p className="text-sm font-bold text-foreground">
                    {post.title}
                  </p>
                )}
                <p className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap">
                  {post.body}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
