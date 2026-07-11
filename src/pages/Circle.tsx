/**
 * Circle (GOALS-CORE-01) — one Goal Space's command surface at
 * /circle/:spaceId.
 *
 * Deliberately NOT a chat room and NOT a leaderboard: a member row, the
 * caller's two intentional actions (weekly check-in, ask for a nudge),
 * an invite path, and the summary-only event stream. Raw health data
 * never renders here because it never reaches these documents (the
 * callables enforce the closed event contract).
 *
 * States: loading → skeleton; non-member/removed/deleted → unavailable
 * EmptyState (rules deny the read, so both look identical by design);
 * archived → read-only banner.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Share2,
  HandHeart,
  CheckCircle2,
  Users,
  UserMinus,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { getTimeAgo } from "@/lib/timeAgo";
import { useAuth } from "@/lib/auth";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";
import { useGoalSpace } from "@/hooks/useGoalSpaces";
import {
  createGoalSpaceInvite,
  leaveGoalSpace,
  publishGoalSpaceEvent,
  removeGoalSpaceMember,
} from "@/lib/goalSpacesApi";
import {
  checkinWeekKey,
  eventKindLabel,
  goalSpaceTypeLabel,
} from "@/features/goalSpaces/goalSpaceModel";
import Avatar from "@/components/Avatar";
import Button from "@/components/ui/Button";
import BottomSheet from "@/components/ui/BottomSheet";
import SectionLabel from "@/components/ui/SectionLabel";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/LoadingSkeleton";

export default function Circle() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { space, members, events, loading, notFound } = useGoalSpace(spaceId);

  const [busy, setBusy] = useState<
    null | "checkin" | "nudge" | "invite" | "leave"
  >(null);
  const [showLeave, setShowLeave] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const uid = user?.uid ?? "";
  const isOwner = space?.ownerId === uid;
  const myDisplayName = profile?.displayName || "Athlete";

  // One check-in per Monday-anchored week — mirror of the server's
  // deterministic event id, so the button state matches what a re-post
  // would actually do (overwrite, not duplicate).
  const checkedInThisWeek = useMemo(() => {
    const weekKey = checkinWeekKey(new Date());
    return events.some(
      (e) =>
        e.kind === "weekly_check_in" &&
        e.authorUid === uid &&
        e.createdAt.slice(0, 10) >= weekKey
    );
  }, [events, uid]);

  async function handleCheckin(): Promise<void> {
    if (!spaceId || busy) return;
    setBusy("checkin");
    try {
      await publishGoalSpaceEvent({
        spaceId,
        kind: "weekly_check_in",
        note: "",
        displayName: myDisplayName,
      });
      trackSocialEvent("circle_checkin_posted");
      toast.success("Checked in for the week");
    } catch (e) {
      logger.warn("[Circle] check-in failed", e);
      toast.error("Couldn't check in. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleNudge(): Promise<void> {
    if (!spaceId || busy) return;
    setBusy("nudge");
    try {
      await publishGoalSpaceEvent({
        spaceId,
        kind: "needs_support",
        note: "",
        displayName: myDisplayName,
      });
      trackSocialEvent("circle_support_requested");
      toast.success("Your circle will see you'd like a nudge");
    } catch (e) {
      logger.warn("[Circle] nudge failed", e);
      toast.error("Couldn't send that. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleInvite(): Promise<void> {
    if (!spaceId || busy || !space) return;
    setBusy("invite");
    try {
      const { code } = await createGoalSpaceInvite({ spaceId });
      const base = (import.meta.env.BASE_URL as string | undefined) || "/";
      const normalisedBase = base.endsWith("/") ? base : base + "/";
      const url = `${window.location.origin}${normalisedBase}circle/join/${code}`;
      const shareText = `Join my "${space.title}" circle on Tropos`;
      trackSocialEvent("circle_invite_shared");
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: shareText, text: shareText, url });
        } catch {
          /* user cancelled the share sheet */
        }
        return;
      }
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Invite link copied — valid for 7 days");
          return;
        } catch {
          /* fall through */
        }
      }
      toast.message("Copy this link to invite someone", { description: url });
    } catch (e) {
      logger.warn("[Circle] invite failed", e);
      toast.error("Couldn't create an invite. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleLeave(): Promise<void> {
    if (!spaceId || busy) return;
    setBusy("leave");
    try {
      await leaveGoalSpace({ spaceId });
      toast.success("You've left the circle");
      navigate("/social?tab=crews", { replace: true });
    } catch (e) {
      logger.warn("[Circle] leave failed", e);
      toast.error("Couldn't leave. Please try again.");
      setBusy(null);
      setShowLeave(false);
    }
  }

  async function handleRemove(memberUid: string): Promise<void> {
    if (!spaceId || busy) return;
    try {
      await removeGoalSpaceMember({ spaceId, memberUid });
      toast.success("Member removed");
    } catch (e) {
      logger.warn("[Circle] remove failed", e);
      toast.error("Couldn't remove that member.");
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 min-h-[44px] -my-2 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      )}

      {!loading && notFound && (
        <EmptyState
          icon={Users}
          headline="Circle unavailable"
          sub="It may have been archived, or you're no longer a member."
          action={{
            label: "Back to Social",
            onClick: () => navigate("/social?tab=crews"),
          }}
        />
      )}

      {!loading && !notFound && space && (
        <>
          {/* ── Header ────────────────────────────────────────────── */}
          <div>
            <h1 className="text-xl font-extrabold text-foreground">
              {space.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {goalSpaceTypeLabel(space.type)} circle ·{" "}
              <span className="font-mono tabular-nums">
                {space.memberCount}
              </span>{" "}
              of{" "}
              <span className="font-mono tabular-nums">{space.maxMembers}</span>{" "}
              members
            </p>
          </div>

          {!space.active && (
            <div className="p-3 rounded-2xl bg-muted text-sm text-muted-foreground">
              This circle has been archived — it's read-only now.
            </div>
          )}

          {/* ── Members ───────────────────────────────────────────── */}
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel as="h2">Members</SectionLabel>
              {isOwner && members.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setShowManage(true);
                  }}
                  className="min-h-[44px] px-2 -my-2 text-xs font-semibold text-muted-foreground active:scale-[0.97]"
                >
                  Manage
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {members.map((m) => (
                <div key={m.uid} className="flex flex-col items-center w-14">
                  <Avatar
                    photoURL={m.photoURL}
                    displayName={m.displayName}
                    size="md"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground truncate w-full text-center">
                    {m.uid === uid ? "You" : m.displayName}
                  </p>
                </div>
              ))}
            </div>
            {space.active && space.memberCount < space.maxMembers && (
              <Button
                fullWidth
                variant="secondary"
                loading={busy === "invite"}
                leftIcon={<Share2 className="size-4" />}
                onClick={handleInvite}
              >
                Invite someone
              </Button>
            )}
            {space.memberCount === 1 && (
              <p className="text-xs text-center text-muted-foreground">
                A circle of one is just you — share an invite to make it real.
              </p>
            )}
          </div>

          {/* ── Actions ───────────────────────────────────────────── */}
          {space.active && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={checkedInThisWeek ? "secondary" : "primary"}
                disabled={checkedInThisWeek}
                loading={busy === "checkin"}
                leftIcon={<CheckCircle2 className="size-4" />}
                onClick={handleCheckin}
              >
                {checkedInThisWeek ? "Checked in" : "Check in"}
              </Button>
              <Button
                variant="secondary"
                loading={busy === "nudge"}
                leftIcon={<HandHeart className="size-4" />}
                onClick={handleNudge}
              >
                Need a nudge
              </Button>
            </div>
          )}

          {/* ── Event stream ──────────────────────────────────────── */}
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
            <SectionLabel as="h2">This circle</SectionLabel>
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Quiet so far. Check in for the week to start the thread —
                members see moments, never metrics.
              </p>
            )}
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 shrink-0 mt-0.5">
                  {e.kind === "needs_support" ? (
                    <HandHeart
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">
                      {e.authorUid === uid ? "You" : e.authorName}
                    </span>{" "}
                    {eventKindLabel(e.kind)}
                  </p>
                  {e.note && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {e.note}
                    </p>
                  )}
                  {e.createdAt && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {getTimeAgo(new Date(e.createdAt))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Leave ─────────────────────────────────────────────── */}
          <Button fullWidth variant="ghost" onClick={() => setShowLeave(true)}>
            Leave circle
          </Button>

          <BottomSheet
            open={showLeave}
            onOpenChange={(o) => !o && setShowLeave(false)}
            title="Leave this circle?"
            description={
              isOwner && members.length > 1
                ? "The longest-standing member becomes the new owner."
                : isOwner
                  ? "You're the only member — the circle will be archived."
                  : "You can rejoin later with a new invite."
            }
          >
            <div className="px-4 pb-6 space-y-2">
              <Button
                fullWidth
                variant="destructive"
                loading={busy === "leave"}
                onClick={handleLeave}
              >
                Leave circle
              </Button>
              <Button
                fullWidth
                variant="ghost"
                onClick={() => setShowLeave(false)}
              >
                Cancel
              </Button>
            </div>
          </BottomSheet>

          {/* ── Owner: manage members ─────────────────────────────── */}
          <BottomSheet
            open={showManage}
            onOpenChange={(o) => !o && setShowManage(false)}
            title="Manage members"
            description="Removing someone frees their spot. They can rejoin with a new invite."
          >
            <div className="px-4 pb-6 space-y-1">
              {members
                .filter((m) => m.uid !== uid)
                .map((m) => (
                  <div key={m.uid} className="flex items-center gap-3 py-2">
                    <Avatar
                      photoURL={m.photoURL}
                      displayName={m.displayName}
                      size="sm"
                    />
                    <p className="text-sm font-medium text-foreground flex-1 truncate">
                      {m.displayName}
                    </p>
                    <Button
                      variant="destructive-tinted"
                      size="sm"
                      leftIcon={<UserMinus className="size-4" />}
                      onClick={() => handleRemove(m.uid)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
            </div>
          </BottomSheet>
        </>
      )}
    </div>
  );
}
