/**
 * Community Space page (Spc1 PR2 shell + PR3 posting).
 *
 * A photo hero with the space's name, its size and this week's post
 * count, and one small membership control (Join, or Joined with a
 * confirmed Leave). Below it: the tagline, the race header on race spaces,
 * any pinned Tropos Team note, then the members' posts. The retired
 * weekly coach posts and blocked authors are filtered out. An empty space
 * offers to share the member's last session. Post cards carry the
 * moderation kit (author delete / report / block) and likes and comments.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { format } from "date-fns";
import {
  ArrowLeft,
  Check,
  Dumbbell,
  ExternalLink,
  Flag,
  Footprints,
  Heart,
  Medal,
  MessagesSquare,
  Mountain,
  PenLine,
  Plane,
  Sprout,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import InlineNumerals from "@/components/ui/InlineNumerals";
import SectionHeading from "@/components/ui/SectionHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import {
  spaceDef,
  isTrainableRaceEvent,
  type SpaceEventInfo,
} from "@/features/spaces/spaceDefs";
import { raceDistanceLabel } from "@/features/spaces/raceBrowse";
import {
  raceEventDates,
  formatRaceEventDate,
} from "@/features/spaces/raceDates";
import {
  resolveRaceEvent,
  useRaceEventOverrides,
} from "@/features/spaces/raceEventOverrides";
import { useSpaceMembership } from "@/features/spaces/useSpaceMembership";
import SpacePostCard from "@/features/spaces/SpacePostCard";
import { useSpacePostLikes } from "@/features/spaces/useSpacePostLikes";
import RaceIdentityToggle from "@/features/spaces/RaceIdentityToggle";
import SpaceCommentSheet from "@/features/spaces/SpaceCommentSheet";
import SpacePostComposer from "@/features/spaces/SpacePostComposer";
import { useRecentSessions } from "@/features/spaces/useRecentSessions";
import {
  countPostsThisWeek,
  spaceHeroMeta,
} from "@/features/spaces/spaceHeroMeta";
import {
  isMemberFacing,
  type SpacePostDoc,
} from "@/features/spaces/spaceTypes";

const ICON_MAP: Record<string, LucideIcon> = {
  sprout: Sprout,
  zap: Zap,
  heart: Heart,
  footprints: Footprints,
  mountain: Mountain,
  dumbbell: Dumbbell,
  medal: Medal,
  plane: Plane,
  flag: Flag,
};

const ELEVATION_LABEL: Record<
  NonNullable<SpaceEventInfo["elevation"]>,
  string
> = {
  flat: "Flat course",
  rolling: "Rolling course",
  hilly: "Hilly course",
};

/**
 * Race event header (races plan PR3) — the event-metadata block for
 * kind === "race" spaces: distance/elevation chips, race day, city,
 * the "Train for this race" CTA (Door 1 — deep-links to the run-plan
 * editor prefilled; Q1's no-inline-edit lock), the official-site
 * link, and the Q10 not-affiliated line. Join stays a separate action
 * below — joining never sets the race.
 */
function RaceEventHeader({
  spaceId,
  name,
  event,
}: {
  spaceId: string;
  name: string;
  event: SpaceEventInfo;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const todayKey = localDateString();
  const past = event.dateKey < todayKey;
  const trainable = isTrainableRaceEvent(event);
  const isYourRace = profile?.raceGoal?.eventSpaceId === spaceId;
  const dates = raceEventDates(event);
  const [chosenDay, setChosenDay] = useState("");
  const trainingDate =
    dates.length === 1
      ? dates[0]
      : dates.includes(chosenDay) && chosenDay >= todayKey
        ? chosenDay
        : "";
  const raceDay = formatRaceEventDate(event, true);
  const shortDay = formatRaceEventDate(event);

  return (
    <div className="rounded-2xl bg-card card-shadow p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold"
          style={{
            /* Ink on the -strong step — the coral identity is 3.12:1 as
               11px text on its light tint; the tint concat stays hex. */
            background: `${THEME.running}1F`,
            color: "hsl(var(--running-strong))",
          }}
        >
          <InlineNumerals>{raceDistanceLabel(event)}</InlineNumerals>
        </span>
        {event.elevation && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-muted text-muted-foreground">
            {ELEVATION_LABEL[event.elevation]}
          </span>
        )}
      </div>

      <div>
        <p
          className={cn(
            "text-base font-bold text-foreground",
            !past && "font-mono tabular-nums"
          )}
        >
          {past ? "Next date to be announced" : raceDay}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {event.city} {event.countryFlag}
          {past && ` · Last edition: ${shortDay}`}
        </p>
      </div>

      {trainable && !past && !isYourRace && dates.length > 1 && (
        <div className="space-y-1">
          <label htmlFor="space-race-day" className="text-sm font-medium">
            Your assigned race day
          </label>
          <select
            id="space-race-day"
            className="ds-input w-full"
            value={trainingDate}
            onChange={(e) => setChosenDay(e.target.value)}
          >
            <option value="">Choose the day on your entry</option>
            {dates
              .filter((d) => d >= todayKey)
              .map((d) => (
                <option key={d} value={d}>
                  {format(parseLocalDate(d), "EEEE d MMMM yyyy")}
                </option>
              ))}
          </select>
        </div>
      )}

      {isYourRace ? (
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-3"
          style={{ background: `${THEME.running}14` }}
        >
          <Check className="size-4 shrink-0 text-running" aria-hidden />
          <p className="text-sm font-semibold text-foreground">
            Your race ·{" "}
            <span className="font-mono tabular-nums">
              {profile?.raceGoal?.targetDate
                ? format(
                    parseLocalDate(profile.raceGoal.targetDate),
                    "d MMM yyyy"
                  )
                : shortDay}
            </span>
          </p>
        </div>
      ) : (
        trainable &&
        !past && (
          <Button
            variant="sport"
            fullWidth
            disabled={!trainingDate}
            onClick={() =>
              navigate(
                `/settings/run-plan?distance=${event.distance}&date=${
                  trainingDate
                }&eventName=${encodeURIComponent(name)}&spaceId=${spaceId}`
              )
            }
          >
            Train for this race
          </Button>
        )
      )}

      {!trainable && (
        <p className="text-sm text-muted-foreground">
          Ultra training plans aren’t available in Tropos yet. Visit the
          organiser for event preparation and entry details.
        </p>
      )}

      <a
        href={event.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-2 min-h-[44px] rounded-xl bg-muted/50 px-3.5 text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
      >
        Visit official website
        <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
      </a>

      <p className="text-micro text-muted-foreground">
        Community space — not affiliated with the event.
      </p>
    </div>
  );
}

/* The two round chips on the hero (Back, Joined): scrim glass over a
   cover photo, the page colour over the plain tinted band. */
const PHOTO_CHIP =
  "rounded-full text-white backdrop-blur-md border border-white/20";
const PLAIN_CHIP = "rounded-full bg-background/80 border border-border/60";

const ACCENT_HEX: Record<"running" | "lifting" | "brand", string> = {
  running: THEME.running,
  lifting: THEME.lifting,
  brand: THEME.brand,
};

type PostItem = SpacePostDoc & { id: string };

/** Posts one page load reads. The week count says "50+" when it hits it. */
const POSTS_FETCH_LIMIT = 50;

export default function Space() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const def = spaceId ? spaceDef(spaceId) : undefined;
  const { joined, memberCount, busy, join, leave } =
    useSpaceMembership(spaceId);
  const { blocked: blockedUsers } = useBlockedUsers();
  const sessions = useRecentSessions();
  const [posts, setPosts] = useState<PostItem[] | null>(null);
  /* SOC-P2g — comment sheet target + per-post optimistic count deltas
     (same grammar as likes; server owns the stored count). */
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [commentDeltas, setCommentDeltas] = useState<Record<string, number>>(
    {}
  );
  /* `attachLatest` starts the draft with the newest session attached: the
     empty space's "Share your last session" and the post-race hand-off. */
  const [composer, setComposer] = useState({
    open: false,
    attachLatest: false,
  });
  const openComposer = (attachLatest: boolean) =>
    setComposer({ open: true, attachLatest });
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  /* Races plan PR4 — `?compose=1` (the post-race share hand-off from
   * RunSummary) opens the composer as soon as membership allows, with the
   * race attached: it is the newest session. For a non-member the param
   * survives until they tap Join, then the composer opens — the intended
   * "join, then post" flow. Consumed once (replace) so back/refresh
   * doesn't re-open it. */
  const [searchParams, setSearchParams] = useSearchParams();
  const composeRequested = searchParams.get("compose") === "1";
  const composeReady = composeRequested && joined === true;
  /* The composer opens during render, the moment the request can be
     honoured; only the URL clean-up, which talks to the router, is an
     effect. */
  const [composeWasReady, setComposeWasReady] = useState(false);
  if (composeReady !== composeWasReady) {
    setComposeWasReady(composeReady);
    if (composeReady) setComposer({ open: true, attachLatest: true });
  }
  useEffect(() => {
    if (!composeReady) return;
    const next = new URLSearchParams(searchParams);
    next.delete("compose");
    setSearchParams(next, { replace: true });
  }, [composeReady, searchParams, setSearchParams]);

  useEffect(() => {
    if (!def || !spaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "spaces", spaceId, "posts"),
            orderBy("createdAt", "desc"),
            limit(POSTS_FETCH_LIMIT)
          )
        );
        if (cancelled) return;
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PostItem));
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [def, spaceId, reloadNonce]);

  /* Retired coach posts and blocked authors are dropped. Pinned Tropos
     Team notes sit above the members' posts rather than among them. */
  const visiblePosts = useMemo(
    () =>
      (posts ?? []).filter(
        (p) =>
          isMemberFacing(p) && (!blockedUsers || !blockedUsers.has(p.authorId))
      ),
    [posts, blockedUsers]
  );
  const pinnedPosts = visiblePosts.filter((p) => p.pinned);
  const memberPosts = visiblePosts.filter((p) => !p.pinned);

  /* SOC-P2c — viewer like state for the rendered posts (bounded batch
     read + optimistic toggle; counts stay server-owned). */
  const postIds = useMemo(() => visiblePosts.map((p) => p.id), [visiblePosts]);
  const spaceLikes = useSpacePostLikes(spaceId ?? "", postIds);

  const photo = useMemo(
    () => (spaceId ? spaceEditorialImage(spaceId) : null),
    [spaceId]
  );

  /* RACE-EVENTS-REMOTE: the event header renders the RESOLVED event —
   * server overrides win over the bundled block, so a stale binary
   * still shows the current race day (and its Train CTA deep-links
   * carry the current date). */
  const overrides = useRaceEventOverrides();
  const resolvedEvent =
    def?.kind === "race" && def.event
      ? resolveRaceEvent(def, overrides)
      : undefined;

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
  const week = countPostsThisWeek(visiblePosts, new Date(), {
    size: posts?.length ?? 0,
    limit: POSTS_FETCH_LIMIT,
    oldest: posts?.[posts.length - 1],
  });
  const meta = spaceHeroMeta({
    memberCount,
    postsThisWeek: week.count,
    capped: week.capped,
  });

  const renderPost = (post: PostItem) => (
    <SpacePostCard
      key={post.id}
      spaceId={def.id}
      postId={post.id}
      post={post}
      accent={accent}
      onRemoved={handleRemoved}
      liked={spaceLikes.liked.has(post.id)}
      likeDelta={spaceLikes.deltas[post.id] ?? 0}
      onToggleLike={user ? () => spaceLikes.toggle(post.id) : undefined}
      commentDelta={commentDeltas[post.id] ?? 0}
      onOpenComments={user ? () => setCommentsFor(post.id) : undefined}
    />
  );

  return (
    <div className="pb-6">
      {/* Hero header — photo (wash + scrim, white text) or the tinted
          fallback band. Back button floats on the art; membership sits
          beside the name as one small control. */}
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
        {/* Back sits on a round chip of its own. Bare over a cover photo,
            a white arrow disappeared on light covers (a sunlit sky, a pale
            street), and people did not know they could go back. Over a
            photo the chip is the dark scrim RunDetail's back button uses
            over its map; over the plain tinted hero it is the page colour. */}
        <div className="absolute top-3 left-3">
          <IconButton
            onClick={() => navigate(-1)}
            aria-label="Back"
            icon={<ArrowLeft />}
            data-testid="space-back"
            className={photo ? PHOTO_CHIP : PLAIN_CHIP}
            style={photo ? { background: THEME.scrim } : undefined}
          />
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <h1
              className={`text-h2 font-extrabold leading-tight ${
                photo ? "text-white" : "text-foreground"
              }`}
            >
              {def.name}
            </h1>
            <p
              className={`text-caption font-medium mt-1 ${
                photo ? "text-white/85" : "text-muted-foreground"
              }`}
            >
              <InlineNumerals>{meta}</InlineNumerals>
            </p>
          </div>
          {joined === false && (
            <Button
              className="rounded-full px-5 shrink-0"
              loading={busy}
              onClick={join}
            >
              Join
            </Button>
          )}
          {joined === true && (
            <Button
              variant="ghost"
              className={cn(
                "rounded-full px-4 shrink-0",
                photo ? PHOTO_CHIP : PLAIN_CHIP
              )}
              style={photo ? { background: THEME.scrim } : undefined}
              leftIcon={<Check className="size-4" />}
              aria-label={`Joined. Leave ${def.name}`}
              aria-haspopup="dialog"
              disabled={busy}
              onClick={() => setConfirmLeave(true)}
            >
              Joined
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <p className="text-sm text-muted-foreground">{def.tagline}</p>

        {def.kind === "race" && resolvedEvent && (
          <>
            <RaceEventHeader
              spaceId={def.id}
              name={def.name}
              event={resolvedEvent}
            />
            {/* SOC-P2f — opt-in public race identity; renders only when
                this space is bound to the viewer's own race goal. */}
            <RaceIdentityToggle spaceId={def.id} />
          </>
        )}

        {pinnedPosts.map(renderPost)}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <SectionHeading>From members</SectionHeading>
            {joined === true && memberPosts.length > 0 && (
              <Button
                variant="secondary"
                className="rounded-full"
                leftIcon={<PenLine className="size-4" />}
                onClick={() => openComposer(false)}
              >
                Write a post
              </Button>
            )}
          </div>
          {posts === null ? (
            <div
              className="h-24 rounded-2xl bg-muted/40 motion-safe:animate-pulse"
              aria-hidden
            />
          ) : memberPosts.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              headline="No posts from members yet"
              sub={
                joined === true
                  ? "Share a session, ask a question, or say what you're training for."
                  : joined === false
                    ? "Join to post here."
                    : undefined
              }
              accent={accent}
              compact
              action={
                joined !== true
                  ? undefined
                  : sessions.length > 0
                    ? {
                        label: "Share your last session",
                        onClick: () => openComposer(true),
                      }
                    : {
                        label: "Write a post",
                        onClick: () => openComposer(false),
                      }
              }
            />
          ) : (
            memberPosts.map(renderPost)
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${def.name}?`}
        description="You can join again at any time. Your posts stay in the space."
        confirmLabel="Leave"
        destructive
        onConfirm={() => {
          setConfirmLeave(false);
          void leave();
        }}
        onCancel={() => setConfirmLeave(false)}
      />

      {commentsFor && (
        <SpaceCommentSheet
          spaceId={def.id}
          postId={commentsFor}
          open
          onOpenChange={(o) => {
            if (!o) setCommentsFor(null);
          }}
          onCountChange={(delta) =>
            setCommentDeltas((prev) => ({
              ...prev,
              [commentsFor]: (prev[commentsFor] ?? 0) + delta,
            }))
          }
        />
      )}

      <SpacePostComposer
        spaceId={def.id}
        open={composer.open}
        onOpenChange={(open) => setComposer((c) => ({ ...c, open }))}
        onPosted={() => setReloadNonce((n) => n + 1)}
        sessions={sessions}
        attachLatest={composer.attachLatest}
      />
    </div>
  );
}
