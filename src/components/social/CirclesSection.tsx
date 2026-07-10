/**
 * Circles (GOALS-CORE-01, slice 4) — the Goal Space surface on the
 * Social → Crews tab. Per the audit IA, Circles render FIRST and
 * legacy Crews stay reachable below — no URL changes, no removed
 * entry points.
 *
 * v1 scope (GsPb1 lock): invite-only via a paste code (spaceId.code —
 * shared out-of-band, no public discovery), the three launch
 * templates, member row + summary-only event feed, and three explicit
 * publish actions (check in / milestone / need a nudge). Events pass
 * the checkEventPayload privacy fence client-side AND the rules
 * allowlist server-side — raw health data structurally cannot enter.
 */

import { useState } from "react";
import { CircleDashed, Copy, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SectionLabel from "@/components/ui/SectionLabel";
import { Spinner } from "@/components/ui/Spinner";
import { getTimeAgo } from "@/lib/timeAgo";
import {
  LAUNCH_TEMPLATES,
  type GoalSpaceEvent,
  type GoalSpaceMember,
  type GoalSpaceType,
} from "@/features/goalSpace/goalSpaceTypes";
import {
  useGoalSpaces,
  type CircleSummary,
} from "@/features/goalSpace/useGoalSpaces";

const EVENT_COPY: Record<GoalSpaceEvent["kind"], string> = {
  joined: "joined the circle",
  weekly_check_in: "checked in for the week",
  session_completed: "completed a session",
  milestone: "hit a milestone",
  needs_support: "would appreciate a nudge",
  routine_shared: "shared a routine",
};

function inviteString(spaceId: string, code: string): string {
  return `${spaceId}.${code}`;
}

export default function CirclesSection({ uid }: { uid: string }) {
  const {
    loading,
    circles,
    createCircle,
    joinCircle,
    leaveCircle,
    loadDetail,
    publishEvent,
  } = useGoalSpaces(uid);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [detailOf, setDetailOf] = useState<CircleSummary | null>(null);
  const [members, setMembers] = useState<GoalSpaceMember[] | null>(null);
  const [events, setEvents] = useState<GoalSpaceEvent[]>([]);
  const [template, setTemplate] = useState<GoalSpaceType>("strength_block");
  const [title, setTitle] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [busy, setBusy] = useState(false);

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

  const publish = async (
    kind: "weekly_check_in" | "milestone" | "needs_support"
  ) => {
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

  return (
    <div className="space-y-3">
      <SectionLabel as="h2">Circles</SectionLabel>

      {loading && (
        <div
          className="h-16 rounded-xl bg-muted/40 animate-pulse"
          aria-hidden="true"
        />
      )}

      {!loading && circles.length === 0 && (
        <div className="p-4 rounded-2xl bg-card space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <CircleDashed
                className="size-4 text-primary"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                A small circle around a shared goal
              </p>
              <p className="text-xs text-muted-foreground">
                2–8 people, invite-only. Support, not a leaderboard.
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading &&
        circles.map((c) => (
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
                    · until {c.space.targetDate}
                  </span>
                )}
              </p>
            </div>
          </button>
        ))}

      {!loading && (
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
            {LAUNCH_TEMPLATES.map((t) => (
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
            className="w-full min-h-[44px] px-3 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="w-full min-h-[44px] px-3 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
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
                    onClick={() => void publish("weekly_check_in")}
                  >
                    Check in
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
                  {events.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Quiet so far — a check-in gets things moving.
                    </p>
                  )}
                  {events.map((e) => {
                    const name =
                      members.find((m) => m.uid === e.uid)?.displayName ??
                      "Someone";
                    return (
                      <p key={e.id} className="text-sm text-foreground">
                        <span className="font-semibold">{name}</span>{" "}
                        <span className="text-muted-foreground">
                          {EVENT_COPY[e.kind]}
                          {e.text ? ` — “${e.text}”` : ""} ·{" "}
                          {getTimeAgo(new Date(e.createdAt))}
                        </span>
                      </p>
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
    </div>
  );
}
