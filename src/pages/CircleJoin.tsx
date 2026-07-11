/**
 * CircleJoin (GOALS-CORE-01) — the invite-link landing at
 * /circle/join/:code.
 *
 * Auth is already guaranteed by the route shell (unauthenticated users
 * land on Login; the deep link survives because the router preserves
 * the path). The join itself is one callable — validation (expiry,
 * capacity, reciprocal blocks, membership cap) happens server-side and
 * each failure mode gets its own honest copy here, keyed off the typed
 * `details.errorCode` the callables attach.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { useAuth } from "@/lib/auth";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";
import { joinGoalSpace } from "@/lib/goalSpacesApi";
import EmptyState from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

type JoinFailure =
  | "invite-invalid"
  | "space-full"
  | "space-inactive"
  | "blocked"
  | "membership-cap"
  | "unknown";

const FAILURE_COPY: Record<JoinFailure, { headline: string; sub: string }> = {
  "invite-invalid": {
    headline: "This invite has expired",
    sub: "Invite links last 7 days. Ask for a fresh one.",
  },
  "space-full": {
    headline: "This circle is full",
    sub: "Circles hold up to 8 people. Ask the owner to free a spot, or start your own.",
  },
  "space-inactive": {
    headline: "This circle has ended",
    sub: "It's been archived by its owner.",
  },
  blocked: {
    headline: "You can't join this circle",
    sub: "One of its members isn't available to you.",
  },
  "membership-cap": {
    headline: "You're in a lot of circles",
    sub: "Leave one before joining another.",
  },
  unknown: {
    headline: "Couldn't join the circle",
    sub: "Something went wrong. Try the link again in a moment.",
  },
};

export default function CircleJoin() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [failure, setFailure] = useState<JoinFailure | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // One attempt per mount — strict-mode double-invoke and profile
    // updates must not re-fire the join.
    if (attempted.current || !code) return;
    attempted.current = true;
    (async () => {
      try {
        const { spaceId, alreadyMember } = await joinGoalSpace({
          code,
          displayName: profile?.displayName || "Athlete",
          photoURL: profile?.photoURL ?? null,
        });
        if (!alreadyMember) {
          trackSocialEvent("circle_invite_accepted");
          toast.success("You're in — welcome to the circle");
        }
        navigate(`/circle/${spaceId}`, { replace: true });
      } catch (e) {
        logger.warn("[CircleJoin] join failed", e);
        const errorCode = (
          e as { details?: { errorCode?: string } } | undefined
        )?.details?.errorCode;
        const known: JoinFailure[] = [
          "invite-invalid",
          "space-full",
          "space-inactive",
          "blocked",
          "membership-cap",
        ];
        setFailure(
          known.includes(errorCode as JoinFailure)
            ? (errorCode as JoinFailure)
            : "unknown"
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (failure) {
    const copy = FAILURE_COPY[failure];
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <EmptyState
          icon={Users}
          headline={copy.headline}
          sub={copy.sub}
          action={{
            label: "Back to Social",
            onClick: () => navigate("/social?tab=crews", { replace: true }),
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center gap-3">
      <Spinner />
      <p className="text-sm text-muted-foreground">Joining the circle…</p>
    </div>
  );
}
