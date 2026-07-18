/**
 * Circles (GOALS-CORE-01, slice 4) — the Goal Space surface on the
 * Social → Crews tab. Per the audit IA, Circles render FIRST and
 * legacy Crews stay reachable below — no URL changes, no removed
 * entry points.
 *
 * v1 scope (GsPb1 lock): invite-only via a paste code (spaceId.code —
 * shared out-of-band, no public discovery), the three launch
 * templates, member row + summary-only event feed, and three explicit
 * publish actions (set weekly focus / milestone / need a nudge).
 * Milestone/nudge events pass the checkEventPayload privacy fence
 * client-side AND the rules allowlist server-side; the weekly
 * check-in (SOCIAL-FOCUS-01) is SERVER-owned via the
 * goalSpaceWeeklyCheckIn callable — deterministic one-per-week event,
 * optional closed-enum focus, "Back this focus" response loop — so
 * raw health data structurally cannot enter either path.
 *
 * SOCIAL-HOME-01 Stage C: the user's active Circle leads as a featured
 * hero card with ONE useful action (the weekly focus), fed by an eager
 * one-shot loadDetail for AT MOST that circle; remaining circles stay
 * summary rows (no extra reads). A failed list read renders a retry
 * block; a genuinely-empty list renders the cold-start goal selector
 * instead of a static empty state.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SectionLabel from "@/components/ui/SectionLabel";
import { Spinner } from "@/components/ui/Spinner";
import { getTimeAgo } from "@/lib/timeAgo";
import { localWeekKey } from "@/lib/dateHelpers";
import {
  LAUNCH_TEMPLATES,
  type GoalSpaceEvent,
  type GoalSpaceMember,
  type GoalSpaceType,
  type WeeklyFocus,
} from "@/features/goalSpace/goalSpaceTypes";
import {
  checkInTimelineCopy,
  countWeeklyFocusSet,
} from "@/features/goalSpace/weeklyFocus";
import {
  useGoalSpaces,
  type CircleDetail,
  type CircleSummary,
} from "@/features/goalSpace/useGoalSpaces";
import CircleWeeklyFocusSheet from "./CircleWeeklyFocusSheet";

// weekly_check_in copy is dynamic (checkInTimelineCopy — the focus
// changes the sentence); the static map covers every other kind.
const EVENT_COPY: Record<
  Exclude<GoalSpaceEvent["kind"], "weekly_check_in">,
  string
> = {
  joined: "joined the circle",
  session_completed: "completed a session",
  milestone: "hit a milestone",
  needs_support: "would appreciate a nudge",
  routine_shared: "shared a routine",
};

function inviteString(spaceId: string, code: string): string {
  return `${spaceId}.${code}`;
}

/* SOCIAL-HOME-01 — cold-start goal selector options. The first four
   map straight onto a create-sheet template; "Private Progress" (its
   own button below) routes to the private Momentum check-in page and
   NEVER creates a circle. */
const COLD_START_OPTIONS: Array<{
  type: GoalSpaceType;
  label: string;
  description: string;
}> = [
  {
    type: "strength_block",
    label: "Strength Block",
    description: "A shared 4–12 week lifting focus.",
  },
  {
    type: "race",
    label: "Race",
    description: "Training for the same event, together.",
  },
  {
    type: "nutrition_consistency",
    label: "Nutrition Consistency",
    description: "Support for logging steadily — never calories or meals.",
  },
  {
    type: "hybrid",
    label: "Hybrid",
    description: "Lifting + running, one shared push.",
  },
];

/* LAUNCH_TEMPLATES is lock-pinned to three entries (GsPb1) — "hybrid"
   is reachable only via the cold-start selector, so the create sheet
   appends this fourth RENDERED option when it's the current selection,
   keeping the choice visible and re-selectable inside the sheet
   without touching the locked constant. */
const HYBRID_TEMPLATE: {
  type: GoalSpaceType;
  label: string;
  description: string;
} = {
  type: "hybrid",
  label: "Hybrid",
  description: "Lifting + running together — one shared push.",
};

/** "YYYY-MM-DD" → "12 Sep" — same short-date idiom as the rest of the app. */
function formatTargetDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function CirclesSection({ uid }: { uid: string }) {
  const {
    loading,
    circles,
    loadFailed,
    reload,
    createCircle,
    joinCircle,
    leaveCircle,
    loadDetail,
    publishEvent,
    setWeeklyFocus,
    backCheckIn,
  } = useGoalSpaces(uid);
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [detailOf, setDetailOf] = useState<CircleSummary | null>(null);
  const [members, setMembers] = useState<GoalSpaceMember[] | null>(null);
  const [events, setEvents] = useState<GoalSpaceEvent[]>([]);
  const [template, setTemplate] = useState<GoalSpaceType>("strength_block");
  const [title, setTitle] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [focusSheetOpen, setFocusSheetOpen] = useState(false);
  /* SOCIAL-HOME-01 — the ONE CircleWeeklyFocusSheet instance serves two
     opening surfaces; this records which one opened it so the sheet's
     circleType/currentFocus/hasCheckedIn come from the right state. */
  const [focusSource, setFocusSource] = useState<"featured" | "detail">(
    "detail"
  );
  const [focusBusy, setFocusBusy] = useState(false);
  const [backingId, setBackingId] = useState<string | null>(null);

  /* SOCIAL-HOME-01 — featured circle: first active summary, else the
     first. Only THIS circle gets an eager detail read; the remaining
     circles stay summary rows (no extra reads). */
  const featured = circles.find((c) => c.space.active) ?? circles[0] ?? null;
  const featuredId = featured?.space.id ?? null;
  /* Deliberately separate from the detail-sheet's members/events state —
     the sheet keeps its own load flow when opened. One-shot reads only;
     loadDetail never opens a listener. */
  const [featuredDetail, setFeaturedDetail] = useState<CircleDetail | null>(
    null
  );
  useEffect(() => {
    if (!featuredId) {
      setFeaturedDetail(null);
      return;
    }
    let cancelled = false;
    setFeaturedDetail(null);
    void loadDetail(featuredId).then((detail) => {
      if (!cancelled) setFeaturedDetail(detail);
    });
    return () => {
      cancelled = true;
    };
  }, [featuredId, loadDetail]);

  // SOCIAL-FOCUS-01 — this LOCAL week's state, derived from the loaded
  // events (one-shot reads; deliberately no listeners). Departed
  // members' events survive leaving (only account deletion sweeps
  // them), so the pulse count and the backable rows filter to CURRENT
  // members — otherwise "3 of 2 focusing" and permanently-erroring
  // Back buttons appear after a mid-week departure.
  const thisWeek = localWeekKey();
  const memberUids = new Set((members ?? []).map((m) => m.uid));
  const myCheckIn =
    events.find(
      (e) =>
        e.kind === "weekly_check_in" && e.uid === uid && e.weekKey === thisWeek
    ) ?? null;
  const focusSetCount = countWeeklyFocusSet(
    events.filter((e) => memberUids.has(e.uid)),
    thisWeek
  );

  /* Featured-card equivalents of the sheet derivations above, from the
     eager featuredDetail (member-filtered for the same mid-week-
     departure reason). */
  const featuredMemberUids = new Set(
    (featuredDetail?.members ?? []).map((m) => m.uid)
  );
  const featuredMyCheckIn =
    featuredDetail?.events.find(
      (e) =>
        e.kind === "weekly_check_in" && e.uid === uid && e.weekKey === thisWeek
    ) ?? null;
  const featuredFocusCount = featuredDetail
    ? countWeeklyFocusSet(
        featuredDetail.events.filter((e) => featuredMemberUids.has(e.uid)),
        thisWeek
      )
    : 0;

  const openDetail = async (c: CircleSummary) => {
    haptic("light");
    setDetailOf(c);
    setMembers(null);
    const detail = await loadDetail(c.space.id);
    setMembers(detail.members);
    setEvents(detail.events);
  };

  const create = async () => {
    setBusy(true);
    const res = await createCircle({ type: template, title: title.trim() });
    setBusy(false);
    if (res) {
      setShowCreate(false);
      setTitle("");
      toast.success("Circle started — share the invite from its page.");
    } else {
      toast.error("Couldn't start the circle. Check the title and try again.");
    }
  };

  const join = async () => {
    const dot = joinInput.indexOf(".");
    if (dot <= 0) {
      toast.error("Paste the full invite code.");
      return;
    }
    setBusy(true);
    const ok = await joinCircle(
      joinInput.slice(0, dot).trim(),
      joinInput.slice(dot + 1).trim()
    );
    setBusy(false);
    if (ok) {
      setShowJoin(false);
      setJoinInput("");
      toast.success("You're in.");
    } else {
      toast.error(
        "Couldn't join — the invite may be wrong or the circle full."
      );
    }
  };

  const publish = async (kind: "milestone" | "needs_support") => {
    if (!detailOf) return;
    haptic("light");
    const ok = await publishEvent(detailOf.space.id, kind);
    if (ok) {
      const detail = await loadDetail(detailOf.space.id);
      setEvents(detail.events);
      toast.success("Shared with your circle.");
    } else {
      toast.error("Couldn't share. Please try again.");
    }
  };

  // Mutations patch the events state LOCALLY from the callable's
  // result instead of refetching the whole detail: the callable told
  // us exactly what changed, a refetch costs a full members+events
  // round trip, and — worse — loadDetail's error fallback returns
  // empty arrays, so a transient blip after a successful write would
  // wipe the visible timeline (and with it the "has checked in" state
  // that guards the focus-clearing path).
  //
  // SOCIAL-HOME-01: the submit targets whichever surface opened the
  // sheet (featured card or detail sheet) and refreshes BOTH copies of
  // that circle's events — the featuredDetail state whenever the
  // submitted circle IS the featured one, and the detail-sheet state
  // whenever that surface is open on it — so the card label/pulse and
  // the sheet timeline can never disagree.
  const submitFocus = async (focus: WeeklyFocus | null) => {
    const target = focusSource === "featured" ? featured : detailOf;
    if (!target) return;
    const spaceId = target.space.id;
    setFocusBusy(true);
    const res = await setWeeklyFocus(spaceId, focus);
    setFocusBusy(false);
    if (!res) {
      toast.error("Couldn't update your focus. Please try again.");
      return;
    }
    setFocusSheetOpen(false);
    if (res.duplicate) {
      toast.success("Already set for this week.");
      return; // nothing changed server-side
    }
    const patch = (prev: GoalSpaceEvent[]): GoalSpaceEvent[] => {
      const existing = prev.find((e) => e.id === res.eventId);
      if (existing) {
        return prev.map((e) =>
          e.id === res.eventId ? { ...e, weeklyFocus: focus } : e
        );
      }
      const created: GoalSpaceEvent = {
        id: res.eventId,
        uid,
        kind: "weekly_check_in",
        text: null,
        weekKey: thisWeek,
        weeklyFocus: focus,
        supporterIds: [],
        createdAt: Date.now(),
      };
      return [created, ...prev];
    };
    if (spaceId === featuredId) {
      setFeaturedDetail((prev) =>
        prev ? { ...prev, events: patch(prev.events) } : prev
      );
    }
    if (detailOf?.space.id === spaceId) {
      setEvents(patch);
    }
    if (res.updated) toast.success("Focus updated.");
    else toast.success("Shared with your circle.");
  };

  const back = async (eventId: string) => {
    if (!detailOf) return;
    haptic("light");
    setBackingId(eventId);
    const res = await backCheckIn(detailOf.space.id, eventId);
    if (res) {
      // Patch BEFORE clearing backingId so the row flips straight to
      // "Backed" — clearing first left a window where the button
      // re-enabled un-backed while a refetch was in flight.
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId && !e.supporterIds.includes(uid)
            ? { ...e, supporterIds: [...e.supporterIds, uid] }
            : e
        )
      );
    } else {
      toast.error("Couldn't back this focus. Please try again.");
    }
    setBackingId(null);
  };

  return (
    <div className="space-y-3">
      <SectionLabel as="h2">Circles</SectionLabel>

      {loading && (
        <div
          className="h-16 rounded-xl bg-muted/40 animate-pulse"
          aria-hidden="true"
        />
      )}

      {/* SOCIAL-HOME-01 — a failed list read is NOT an empty list: the
          retry block replaces the list/empty state so a network blip
          never funnels an existing member into the cold-start selector. */}
      {!loading && loadFailed && (
        <div className="p-3 rounded-xl bg-card flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Couldn't load your Circles.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => void reload()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* SOCIAL-HOME-01 — cold-start goal selector. Genuinely-empty
          only (!loadFailed). Four options preselect a create-sheet
          template; "Private Progress" routes to the private Momentum
          check-in page and never creates a circle. "Join with code"
          stays below so invited users aren't funneled into creating. */}
      {!loading && !loadFailed && circles.length === 0 && (
        <div className="rounded-2xl bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              What support would help?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Circles are small, invite-only groups around one shared goal —
              numbers and photos stay private.
            </p>
          </div>
          <div className="space-y-2">
            {COLD_START_OPTIONS.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => {
                  haptic("light");
                  setTemplate(t.type);
                  setShowCreate(true);
                }}
                className="w-full min-h-[44px] p-3 rounded-xl text-left bg-muted transition-colors active:scale-[0.97]"
              >
                <p className="text-sm font-semibold text-foreground">
                  {t.label}
                </p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                haptic("light");
                navigate("/review");
              }}
              className="w-full min-h-[44px] p-3 rounded-xl text-left bg-muted transition-colors active:scale-[0.97]"
            >
              <p className="text-sm font-semibold text-foreground">
                Private Progress
              </p>
              <p className="text-xs text-muted-foreground">
                Private — just for you, never shared.
              </p>
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              haptic("light");
              setShowJoin(true);
            }}
          >
            Join with code
          </Button>
        </div>
      )}

      {/* SOCIAL-HOME-01 — the featured circle leads as a hero card with
          one useful action; the card body itself opens the detail sheet. */}
      {!loading && !loadFailed && featured && (
        <div className="bg-card rounded-2xl p-4 space-y-3">
          <button
            type="button"
            onClick={() => void openDetail(featured)}
            className="block w-full min-h-[44px] text-left active:scale-[0.97] transition-transform"
          >
            <p className="text-base font-bold text-foreground truncate">
              {featured.space.title}
              {!featured.space.active && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · ended
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
              {featured.space.memberCount}{" "}
              <span className="font-sans">
                {featured.space.memberCount === 1 ? "member" : "members"}
              </span>
              {featured.space.targetDate && (
                <span className="font-sans">
                  {" "}
                  · until {formatTargetDate(featured.space.targetDate)}
                </span>
              )}
            </p>
            {/* Chosen-focus pulse — a count, never a ranking. */}
            {featuredDetail && featuredFocusCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono tabular-nums">
                  {featuredFocusCount}
                </span>{" "}
                of{" "}
                <span className="font-mono tabular-nums">
                  {featuredDetail.members.length}
                </span>{" "}
                focusing this week
              </p>
            )}
          </button>
          <Button
            className="w-full"
            onClick={() => {
              haptic("light");
              setFocusSource("featured");
              setFocusSheetOpen(true);
            }}
          >
            {featuredMyCheckIn ? "Change weekly focus" : "Set weekly focus"}
          </Button>
        </div>
      )}

      {!loading &&
        !loadFailed &&
        circles
          .filter((c) => c.space.id !== featuredId)
          .map((c) => (
            <button
              key={c.space.id}
              type="button"
              onClick={() => void openDetail(c)}
              className="w-full min-h-[44px] p-3 rounded-xl bg-card flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
            >
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <Users className="size-4 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {c.space.title}
                  {!c.space.active && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · ended
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground font-mono tabular-nums">
                  {c.space.memberCount}{" "}
                  <span className="font-sans">
                    {c.space.memberCount === 1 ? "member" : "members"}
                  </span>
                  {c.space.targetDate && (
                    <span className="font-sans">
                      {" "}
                      · until {formatTargetDate(c.space.targetDate)}
                    </span>
                  )}
                </p>
              </div>
            </button>
          ))}

      {!loading && !loadFailed && circles.length > 0 && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => {
              haptic("light");
              setShowCreate(true);
            }}
          >
            Start a circle
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => {
              haptic("light");
              setShowJoin(true);
            }}
          >
            Join with code
          </Button>
        </div>
      )}

      {/* ── Create sheet ── */}
      <BottomSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        title="Start a circle"
        description="Invite-only, 2–8 people. Numbers, meals and photos stay private — a circle only ever sees check-ins."
      >
        <div className="space-y-3 pb-2">
          <div className="space-y-2" role="group" aria-label="Circle template">
            {/* SOCIAL-HOME-01: "hybrid" is only reachable via the
                cold-start selector — append it to the RENDERED list
                while selected so the choice stays visible and
                re-selectable. LAUNCH_TEMPLATES itself is lock-pinned
                to three entries and must not change. */}
            {(template === "hybrid"
              ? [...LAUNCH_TEMPLATES, HYBRID_TEMPLATE]
              : LAUNCH_TEMPLATES
            ).map((t) => (
              <button
                key={t.type}
                type="button"
                aria-pressed={template === t.type}
                onClick={() => {
                  haptic("light");
                  setTemplate(t.type);
                }}
                className={cn(
                  "w-full min-h-[44px] p-3 rounded-xl text-left transition-colors active:scale-[0.97]",
                  template === t.type
                    ? "bg-primary/10 border border-primary/40"
                    : "bg-muted border border-transparent"
                )}
              >
                <p className="text-sm font-semibold text-foreground">
                  {t.label}
                </p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="Name it — e.g. Autumn strength block"
            aria-label="Circle name"
            className="w-full min-h-[44px] px-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            className="w-full"
            loading={busy}
            disabled={title.trim().length === 0}
            onClick={() => void create()}
          >
            Start circle
          </Button>
        </div>
      </BottomSheet>

      {/* ── Join sheet ── */}
      <BottomSheet
        open={showJoin}
        onOpenChange={setShowJoin}
        title="Join a circle"
        description="Paste the invite code a friend shared with you."
      >
        <div className="space-y-3 pb-2">
          <input
            type="text"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Invite code"
            aria-label="Invite code"
            className="w-full min-h-[44px] px-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
          />
          <Button
            className="w-full"
            loading={busy}
            disabled={joinInput.trim().length === 0}
            onClick={() => void join()}
          >
            Join
          </Button>
        </div>
      </BottomSheet>

      {/* ── Detail sheet ── */}
      <BottomSheet
        open={detailOf !== null}
        onOpenChange={(open) => {
          if (!open) setDetailOf(null);
        }}
        title={detailOf?.space.title ?? ""}
        description={
          detailOf
            ? `${detailOf.space.memberCount} of ${detailOf.space.maxMembers} members`
            : undefined
        }
      >
        {detailOf && (
          <div className="space-y-4 pb-2">
            {members === null && (
              <div className="flex justify-center py-6">
                <Spinner label="Loading circle" />
              </div>
            )}

            {members !== null && (
              <>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <span
                      key={m.uid}
                      className="px-3 py-2 rounded-xl bg-muted text-xs font-semibold text-foreground"
                    >
                      {m.displayName}
                      {m.role === "owner" && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · owner
                        </span>
                      )}
                    </span>
                  ))}
                </div>

                {detailOf.inviteCode && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(
                          inviteString(detailOf.space.id, detailOf.inviteCode!)
                        )
                        .then(() => toast.success("Invite code copied."))
                        .catch(() =>
                          toast.error(
                            "Couldn't copy — long-press to select it."
                          )
                        );
                    }}
                  >
                    <Copy className="size-4 mr-1.5" aria-hidden="true" />
                    Copy invite code
                  </Button>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      haptic("light");
                      setFocusSource("detail");
                      setFocusSheetOpen(true);
                    }}
                  >
                    {myCheckIn ? "Change weekly focus" : "Set weekly focus"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => void publish("milestone")}
                  >
                    Milestone
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => void publish("needs_support")}
                  >
                    Need a nudge
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <SectionLabel as="h3">Recent</SectionLabel>
                  {/* Chosen-focus pulse — a count, never a ranking. */}
                  {focusSetCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {focusSetCount}
                      </span>{" "}
                      of{" "}
                      <span className="font-mono tabular-nums">
                        {members.length}
                      </span>{" "}
                      focusing this week
                    </p>
                  )}
                  {events.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Quiet so far — setting a weekly focus gets things moving.
                    </p>
                  )}
                  {events.map((e) => {
                    const name =
                      members.find((m) => m.uid === e.uid)?.displayName ??
                      "Someone";
                    const copy =
                      e.kind === "weekly_check_in"
                        ? checkInTimelineCopy(e.weeklyFocus)
                        : EVENT_COPY[e.kind];
                    const backable =
                      e.kind === "weekly_check_in" &&
                      e.weeklyFocus !== null &&
                      e.uid !== uid &&
                      // Departed author → the server rejects the back;
                      // don't render a button that can only error.
                      memberUids.has(e.uid);
                    const backed = backable && e.supporterIds.includes(uid);
                    return (
                      <div
                        key={e.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <p className="min-w-0 text-sm text-foreground">
                          <span className="font-semibold">{name}</span>{" "}
                          <span className="text-muted-foreground">
                            {copy}
                            {e.text ? ` — “${e.text}”` : ""} ·{" "}
                            {getTimeAgo(new Date(e.createdAt))}
                          </span>
                        </p>
                        {backable && (
                          <Button
                            variant={backed ? "ghost" : "secondary"}
                            size="sm"
                            className="min-h-[44px] shrink-0"
                            disabled={backed || backingId === e.id}
                            loading={backingId === e.id}
                            onClick={() => void back(e.id)}
                          >
                            {backed ? "Backed" : "Back this focus"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    void leaveCircle(detailOf.space.id).then((ok) => {
                      if (ok) {
                        setDetailOf(null);
                        toast.success("You left the circle.");
                      } else toast.error("Couldn't leave. Please try again.");
                    });
                  }}
                >
                  Leave circle
                </Button>
              </>
            )}
          </div>
        )}
      </BottomSheet>

      {/* ── Weekly focus sheet (SOCIAL-FOCUS-01) ──
          Exactly ONE instance; its inputs come from whichever surface
          opened it (SOCIAL-HOME-01: featured card or detail sheet). */}
      {(() => {
        const focusCircle = focusSource === "featured" ? featured : detailOf;
        const focusOwnCheckIn =
          focusSource === "featured" ? featuredMyCheckIn : myCheckIn;
        if (!focusCircle) return null;
        return (
          <CircleWeeklyFocusSheet
            open={focusSheetOpen}
            onOpenChange={setFocusSheetOpen}
            circleType={focusCircle.space.type}
            currentFocus={focusOwnCheckIn?.weeklyFocus ?? null}
            hasCheckedIn={focusOwnCheckIn !== null}
            busy={focusBusy}
            onSubmit={(focus) => void submitFocus(focus)}
          />
        );
      })()}
    </div>
  );
}
