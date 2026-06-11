import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Users, Trophy, RefreshCw, Share2 } from "lucide-react";
import { httpsCallable, getFunctions } from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from "firebase/firestore";
import Avatar from "../components/Avatar";
import { motion } from "framer-motion";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { useCrews, type Crew as CrewType } from "../hooks/useCrews";
import { SOCIAL_GATES, shouldShowCrewSurface } from "@/lib/socialGates";
import { cn } from "../lib/utils";
import {
  formatScore,
  formatTotalForMetric,
} from "../lib/crewLeaderboardFormat";
import { getCrewActivities } from "../lib/socialApi";
import ActivityCard from "../components/social/ActivityCard";
import type { FeedItem } from "../hooks/useSocialFeed";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/LoadingSkeleton";
import { THEME } from "../lib/theme";
import { CREW_ICON_MAP } from "../lib/crewIcons";
import { toast } from "@/lib/toast";

const itemVariant = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.24 } },
};

/**
 * Per-crew home page (PR 3 core).
 *
 * Surfaces:
 *  - Header: icon + name + description + member count
 *  - Join / Leave button bound to useCrews
 *  - Recent activity feed scoped to this crewId via getCrewActivities
 *
 * Deferred to PR 3.5 / PR 4:
 *  - Weekly leaderboard (needs a scheduled rollup Cloud Function)
 *  - Active challenge per crew (ChallengeList isn't crew-scoped yet)
 *  - Member list view
 *
 * Activities arrive here because the post chain (useProgram +
 * RunSummary) auto-attaches `crewId: profile?.crewId` to every
 * postActivity call, so any post by a crew member surfaces on the
 * crew's home automatically. No new write path needed for PR 3.
 */
export default function Crew() {
  const { crewId } = useParams<{ crewId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { crews, currentCrew, joinCrew, leaveCrew } = useCrews();

  const [crewDoc, setCrewDoc] = useState<CrewType | null>(null);
  const [crewLoading, setCrewLoading] = useState(true);
  const [activities, setActivities] = useState<FeedItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [refreshingLeaderboard, setRefreshingLeaderboard] = useState(false);
  /* Top members for the preview row beneath the crew header. Just
     the first ~5 by join order — gives the page some human texture
     without an N+1 read against each user's public profile. */
  const [memberPreviews, setMemberPreviews] = useState<
    { uid: string; displayName: string; photoURL: string | null }[]
  >([]);
  // Sprint 5: leaderboard avatar hydration. CrewLeaderboardEntry
  // (written by crewWeeklyLeaderboardRollup) carries only uid +
  // displayName, not photoURL. Until the rollup CF denormalises
  // photoURL onto leaderboard entries, the client hydrates from the
  // cross-user-readable users/{uid}/public/profile. Keys are uids;
  // values may be null when the user has no profile photo.
  const [leaderboardAvatars, setLeaderboardAvatars] = useState<
    Record<string, string | null>
  >({});

  // Try the in-memory crews list first (covers the navigated-from-Social
  // case without a refetch); fall back to a direct read if the user
  // landed on this URL cold.
  useEffect(() => {
    if (!crewId) return;
    const fromList = crews.find((c) => c.id === crewId);
    if (fromList) {
      setCrewDoc(fromList);
      setCrewLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "groups", crewId));
        if (cancelled) return;
        if (snap.exists()) {
          // Don't trust a stored `id` field on the document — the
          // /groups create rule doesn't lock the keyset, so a
          // creator could store `{ id: 'other-crew', ... }` and
          // alias their crew over an unrelated one. Spread data
          // first, then `id` from the doc path wins.
          const data = snap.data() as Omit<CrewType, "id">;
          setCrewDoc({ ...data, id: snap.id });
        } else {
          setCrewDoc(null);
        }
      } finally {
        if (!cancelled) setCrewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [crewId, crews]);

  const loadActivities = useCallback(async () => {
    if (!crewId) return;
    setActivitiesLoading(true);
    try {
      const { items } = await getCrewActivities(crewId, 20);
      const mapped: FeedItem[] = items.map((a) => {
        const act = a as { id: string } & Record<string, unknown>;
        return {
          id: act.id,
          activityId: act.id,
          authorId: (act.authorId as string) ?? "",
          authorName: (act.authorName as string) ?? "Athlete",
          ...(act.authorPhotoURL
            ? { authorPhotoURL: act.authorPhotoURL as string }
            : {}),
          type: (act.type as "run" | "workout") ?? "workout",
          summary: "",
          createdAt: act.createdAt,
          activity: act,
          kudosCount: (act.kudosCount as number) ?? 0,
        };
      });
      setActivities(mapped);
    } catch {
      // Most likely cause on first run: missing composite index for
      // (crewId asc, visibility in, createdAt desc). Firestore logs a
      // one-click index creation link in the browser console.
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }, [crewId]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  /* Member preview fetch. Limits at 5 because that's enough for an
     avatar stack; full member browsing would belong on a dedicated
     /crew/{id}/members page if it ever lands. Members rule allows
     authed reads. Failures fall through silently — the page works
     without the preview row. */
  useEffect(() => {
    if (!crewId) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "groups", crewId, "members"), limit(5))
        );
        if (cancelled) return;
        // Sprint 5: hydrate photoURL from each member's public
        // profile so the stacked avatars render real images, not
        // initial-letter fallbacks. Pre-Sprint-5 the member doc
        // schema didn't carry photoURL (only displayName) and the
        // avatars were faceless. The public/profile read is
        // cross-user-allowed by firestore.rules. Tolerant of
        // missing photos — Avatar handles photoURL: null.
        const base = snap.docs.map((d) => ({
          uid: d.id,
          displayName: (d.data().displayName as string) || "Athlete",
        }));
        const hydrated = await Promise.all(
          base.map(async (m) => {
            try {
              const profileSnap = await getDoc(
                doc(db, "users", m.uid, "public", "profile")
              );
              const data = profileSnap.data() as
                | { photoURL?: string }
                | undefined;
              return { ...m, photoURL: data?.photoURL ?? null };
            } catch {
              return { ...m, photoURL: null };
            }
          })
        );
        if (cancelled) return;
        setMemberPreviews(hydrated);
      } catch {
        if (!cancelled) setMemberPreviews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [crewId]);

  // Sprint 5: hydrate leaderboard avatars from public profiles.
  // Effect keyed on the joined uid list so it only re-runs when the
  // top-N leaderboard membership changes, not on every crew-doc
  // update.
  const boardUidsKey = (crewDoc?.currentLeaderboard ?? [])
    .map((e) => e.uid)
    .join(",");
  useEffect(() => {
    if (!crewDoc) return;
    const entries = crewDoc.currentLeaderboard ?? [];
    if (entries.length === 0) {
      setLeaderboardAvatars({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const pairs = await Promise.all(
        entries.map(async (e): Promise<[string, string | null]> => {
          try {
            const profileSnap = await getDoc(
              doc(db, "users", e.uid, "public", "profile")
            );
            const data = profileSnap.data() as
              | { photoURL?: string }
              | undefined;
            return [e.uid, data?.photoURL ?? null];
          } catch {
            return [e.uid, null];
          }
        })
      );
      if (cancelled) return;
      setLeaderboardAvatars(Object.fromEntries(pairs));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardUidsKey]);

  if (!crewId) {
    return null;
  }

  if (crewLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!crewDoc) {
    return (
      <EmptyState
        icon={Users}
        headline="Crew not found"
        sub="This crew doesn't exist or you don't have access to it. Try refreshing or contact whoever shared the link."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  const isMember = currentCrew?.id === crewDoc.id;
  const Icon = CREW_ICON_MAP[crewDoc.icon];
  /* "This week" pulse — derived from the leaderboard rather than a
     separate query. currentLeaderboard is written by the rollup CF
     and contains every active member's score. Active = currentValue
     > 0, which means they've logged something this week toward the
     crew metric. */
  const activeThisWeek = (crewDoc.currentLeaderboard ?? []).filter(
    (e) => (e.score ?? 0) > 0
  ).length;
  /* The "active this week · N members" inline header used to repeat
     what the This-week stat band now shows numerically, so the header
     is reduced to a plain member count to avoid redundancy on iPhone
     SE width where the longer string risked wrapping. */
  const memberLabel =
    crewDoc.memberCount === 0
      ? "No members yet"
      : `${crewDoc.memberCount} member${crewDoc.memberCount === 1 ? "" : "s"}`;

  /* Invite handler — uses the Web Share API on platforms that
     support it (mobile native + Capacitor), falls back to copying a
     deep link to the clipboard with a toast confirmation otherwise.
     URL is the canonical /crew/{id} route on the deployed app, so
     the recipient lands on this same page.
     Sprint 5: removed the `#/` hash from the URL. The app uses
     react-router-dom BrowserRouter (App.tsx:313) with basename =
     import.meta.env.BASE_URL, so the correct shape is
     {origin}{BASE_URL}crew/{id} with no hash. Pre-Sprint-5 the
     hash variant produced links that failed to resolve under
     BrowserRouter — recipients got the app's root page instead
     of the crew page.
     Sprint 5: clipboard fallback for environments where
     navigator.clipboard is unavailable (older Android WebViews,
     Capacitor file:// contexts) — fall back to navigator.share
     text-only if available, otherwise show the URL in a copyable
     toast so the user can still complete the share. */
  const handleInvite = async () => {
    if (!crewDoc) return;
    const base = (import.meta.env.BASE_URL as string | undefined) || "/";
    const normalisedBase = base.endsWith("/") ? base : base + "/";
    const url = `${window.location.origin}${normalisedBase}crew/${crewDoc.id}`;
    const shareText = `Join "${crewDoc.name}" on Tropos`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareText, text: shareText, url });
      } catch {
        /* user cancelled or share unsupported — fall through */
      }
      return;
    }
    // Defensive: clipboard API isn't always available in WebView
    // contexts. Try it; if it throws or is missing, surface the URL
    // in the toast so the user can copy manually.
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Crew link copied");
        return;
      } catch {
        /* fall through to manual-copy fallback */
      }
    }
    toast.message("Copy this link to invite friends", { description: url });
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      className="px-4 pt-4 pb-8 space-y-4"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
    >
      {/* Back link */}
      <motion.div variants={itemVariant}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
      </motion.div>

      {/* Header card */}
      <motion.div
        variants={itemVariant}
        className="p-4 rounded-2xl bg-card border border-border/40"
      >
        <div className="flex items-start gap-3">
          <div
            className="size-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${THEME.brand}14` }}
          >
            {Icon ? (
              <Icon size={24} className="text-primary" />
            ) : (
              <span className="text-2xl">{crewDoc.icon}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-foreground truncate">
              {crewDoc.name}
            </h1>
            {crewDoc.description?.trim() && (
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                {crewDoc.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-small text-muted-foreground mt-2">
              <Users size={13} />
              <span>{memberLabel}</span>
            </div>
          </div>
        </div>

        {/* Member preview row — gives the crew header some human
            texture beyond the bare member count. Stacked avatars +
            a "+N more" pill when there are more members than fit. */}
        {memberPreviews.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-2">
              {memberPreviews.map((m) => (
                <Avatar
                  key={m.uid}
                  photoURL={m.photoURL}
                  displayName={m.displayName}
                  size="sm"
                  className="ring-2 ring-card"
                />
              ))}
            </div>
            {crewDoc.memberCount > memberPreviews.length && (
              <span className="text-xs text-muted-foreground">
                +{crewDoc.memberCount - memberPreviews.length} more
              </span>
            )}
          </div>
        )}

        {/* Action row.
            Non-member view: full-width Join CTA.
            Member view: Invite is the primary CTA (the action you
            actually want members taking) and Leave is demoted to a
            small secondary text button below — visible but not
            visually competing with Invite. */}
        {!isMember ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={async () => {
                if (!user) return;
                try {
                  await joinCrew(crewDoc.id);
                  toast.success("Joined");
                } catch {
                  toast.error("Couldn't join. Try again.");
                }
              }}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-strong text-white active:scale-[0.98] transition-transform"
            >
              Join crew
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleInvite}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-strong text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Share2 className="size-4" />
              Invite friends
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!user) return;
                setLeaving(true);
                try {
                  await leaveCrew();
                  toast.success("Left crew");
                } finally {
                  setLeaving(false);
                }
              }}
              disabled={leaving}
              className="w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1.5 disabled:opacity-60"
            >
              {leaving ? "Leaving…" : "Leave crew"}
            </button>
          </div>
        )}
      </motion.div>

      {/* Weekly leaderboard.
          Sourced from currentLeaderboard on the crew doc, written by
          crewWeeklyLeaderboardRollup (functions/index.js). The "Refresh"
          affordance only renders for members of THIS crew (the callable
          enforces it server-side too — anyone else gets a 403). For
          crews with no leaderboard yet (rollup hasn't run, or no
          members have logged anything this week) we render an inline
          empty prompt instead of a dead empty card.

          SOCIAL S4: the leaderboard is a vs-others surface — it only earns
          its place once the crew has ≥3 members (shouldShowCrewSurface).
          Below that we show the aspirational invite row instead, so a
          2-person crew never sees a near-empty board. */}
      {!shouldShowCrewSurface(crewDoc.memberCount) ? (
        <motion.div
          variants={itemVariant}
          className="rounded-2xl bg-card border border-border/50 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Users className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold">
                Your crew leaderboard unlocks at{" "}
                {SOCIAL_GATES.CREW_ACTIVATION_MIN_MEMBERS} members
              </h3>
              <p className="text-small text-muted-foreground mt-0.5">
                Invite{" "}
                {SOCIAL_GATES.CREW_ACTIVATION_MIN_MEMBERS - crewDoc.memberCount}{" "}
                more to start competing this week.
              </p>
              {isMember && (
                <button
                  type="button"
                  onClick={handleInvite}
                  className="mt-3 inline-flex items-center gap-2 px-3 h-11 rounded-xl text-sm font-semibold bg-primary-strong text-white active:scale-[0.98] transition-transform"
                >
                  <Share2 className="size-4" />
                  Invite friends
                </button>
              )}
            </div>
          </div>
        </motion.div>
      ) : (
        (() => {
          const board = crewDoc.currentLeaderboard ?? [];
          const metric = crewDoc.leaderboardMetric || "hybrid_score";
          return (
            <motion.div variants={itemVariant} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
                  This week
                </h2>
                {isMember && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (refreshingLeaderboard) return;
                      setRefreshingLeaderboard(true);
                      try {
                        // No explicit region — Cloud Functions live at
                        // us-central1 (the project default), and the SDK
                        // constructs the URL from getFunctions's region
                        // arg, so passing the wrong region just 404s
                        // silently. Default = us-central1 matches deploy.
                        const fns = getFunctions();
                        const refresh = httpsCallable(
                          fns,
                          "refreshMyCrewLeaderboard"
                        );
                        await refresh();
                        // Mutate the in-memory crew doc by re-fetching so
                        // the standings re-render without a page reload.
                        const snap = await getDoc(doc(db, "groups", crewId));
                        if (snap.exists()) {
                          setCrewDoc({
                            id: snap.id,
                            ...(snap.data() as Omit<CrewType, "id">),
                          });
                        }
                        toast.success("Leaderboard refreshed");
                      } catch (err) {
                        // Surface real failure modes to the console so
                        // network/region/auth issues are debuggable
                        // without re-instrumenting in prod.
                        logger.error("refreshMyCrewLeaderboard failed:", err);
                        toast.error("Couldn't refresh. Try again.");
                      } finally {
                        setRefreshingLeaderboard(false);
                      }
                    }}
                    disabled={refreshingLeaderboard}
                    aria-label="Refresh leaderboard"
                    className="text-xs font-medium text-primary disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw
                      size={12}
                      className={
                        refreshingLeaderboard ? "animate-spin" : undefined
                      }
                    />
                    Refresh
                  </button>
                )}
              </div>

              {/* This-week pulse band — gives the crew page a numeric
                identity beyond just the leaderboard rows. Even with no
                activity yet, framing the zero state ("Be the first to
                put {crew} on the board") is calmer than a passive
                "standings will appear" caption. */}
              {(() => {
                const totalScore = board.reduce(
                  (s, e) => s + (e.score ?? 0),
                  0
                );
                const totalLabel = formatTotalForMetric(metric, totalScore);
                const hasActivity = board.length > 0 && totalScore > 0;
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-card border border-border/40 p-3">
                      <p className="text-xs text-muted-foreground">
                        Active this week
                      </p>
                      <p className="text-lg font-mono tabular-nums font-bold text-foreground mt-0.5">
                        {activeThisWeek}
                        <span className="text-xs font-sans text-muted-foreground font-normal ml-1">
                          / {crewDoc.memberCount}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-card border border-border/40 p-3">
                      <p className="text-xs text-muted-foreground">
                        {totalLabel.label}
                      </p>
                      <p className="text-lg font-mono tabular-nums font-bold text-foreground mt-0.5">
                        {hasActivity ? totalLabel.value : "—"}
                        {hasActivity && totalLabel.unit && (
                          <span className="text-xs font-sans text-muted-foreground font-normal ml-1">
                            {totalLabel.unit}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {board.length === 0 ? (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border/40">
                  <div
                    className="size-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${THEME.brand}14` }}
                  >
                    <Trophy size={16} style={{ color: THEME.brand }} />
                  </div>
                  <p className="text-small text-muted-foreground leading-snug">
                    No activity yet this week. Be the first to put{" "}
                    {crewDoc.name} on the board.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-card border border-border/40 divide-y divide-border/20">
                  {board.map((entry) => (
                    <div
                      key={entry.uid}
                      className="flex items-center gap-3 px-3.5 py-2.5"
                    >
                      <span
                        className={cn(
                          "size-6 rounded-full flex items-center justify-center text-caption font-bold tabular-nums shrink-0",
                          entry.rank === 1
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground"
                        )}
                      >
                        {entry.rank}
                      </span>
                      <Avatar
                        photoURL={leaderboardAvatars[entry.uid] ?? null}
                        displayName={entry.displayName}
                        size="sm"
                        className="shrink-0"
                      />
                      <p className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">
                        {entry.displayName}
                      </p>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                        {formatScore(metric, entry)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })()
      )}

      {/* Recent activity */}
      <motion.div variants={itemVariant} className="space-y-2">
        <h2 className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
          Recent activity
        </h2>

        {activitiesLoading && (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!activitiesLoading && activities.length === 0 && (
          /* Inline empty prompt — same compact pattern as the
             ChallengeList empty state on the Crews tab and the
             Following empty state on Feed. Keeps surface low-emotion
             when there's nothing to render. */
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/40">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="size-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${THEME.brand}14` }}
              >
                <Users size={16} style={{ color: THEME.brand }} />
              </div>
              <p className="text-small text-muted-foreground leading-snug">
                {isMember
                  ? "Be the first to log a workout or run for this crew"
                  : "No activity yet — join to start posting here"}
              </p>
            </div>
          </div>
        )}

        {!activitiesLoading && activities.length > 0 && (
          <div className="space-y-3">
            {activities.map((item) => (
              <ActivityCard key={item.id} feedItem={item} />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
