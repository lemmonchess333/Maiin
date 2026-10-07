/**
 * What happens to a saved session's feed post, on the finish screen.
 *
 * Owner decision: sharing works like Strava's, where a session posts
 * itself, with one change. Strava makes every new account public by
 * default; Tropos asks once. The first finish shows one question ("Share
 * sessions automatically?"). After that, the answer applies to every
 * session with no sheet, and this row says what it did.
 *
 * Why ask rather than default: UK GDPR Article 25(2) says personal data
 * must not be made available to an unlimited number of people by default,
 * without the person's own action. The answer to the question is that
 * action.
 *
 * Four states:
 * - no answer yet: the question, three equal answers (none is nudged;
 *   ShareComposerSheet's note on equal rows applies here too);
 * - shared or queued: what happened, and Undo;
 * - held: "Don't share", or an account that must verify its email before
 *   posting publicly. The one-off share button opens the sheet;
 * - failed: the same button, with a line saying so.
 *
 * The answer is saved on the account (`profile.shareDefaults`), and another
 * device can change it while this one keeps the app open. So the row reads
 * the account's answer (`refreshProfile`) before acting on it, and shows
 * nothing until it has. Offline there is nothing fresher to read, and it
 * acts on the answer this device holds.
 *
 * A restricted account shares nothing (S4e): the row waits for that answer
 * too, so an automatic share never goes out ahead of it, and then says so
 * in the row's place. A post that already went out keeps its Undo.
 */
import { useEffect, useId, useState } from "react";
import { Check, Clock, EyeOff, Globe, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import RestrictedNotice from "@/components/social/RestrictedNotice";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { THEME } from "@/lib/theme";
import { toast } from "@/lib/toast";
import {
  answerShareQuestion,
  finishShareStart,
  savedShareDefault,
  type ShareDefault,
  type ShareDefaults,
} from "@/lib/shareDefaults";
import type { ShareType, ShareVisibility } from "@/lib/shareComposer";
import {
  liveSessionPost,
  withdrawSessionPost,
  type LiveShareOutcome,
  type SessionShareAction,
} from "@/lib/sessionPost";

type Note = "verify" | "failed" | "removed" | "cancelled";

type RowState =
  | { kind: "ask" }
  | { kind: "posting"; visibility: ShareVisibility }
  | { kind: "live"; outcome: LiveShareOutcome; undoing?: boolean }
  | { kind: "held"; note?: Note }
  /** The one-off sheet is open. */
  | { kind: "sheet" };

const AUDIENCE: Record<ShareVisibility, string> = {
  followers: "with your followers",
  public: "publicly",
};

const NOTE: Record<Note, string> = {
  verify: "Verify your email to share sessions.",
  failed: "Couldn't share this session.",
  removed: "Removed from the feed.",
  cancelled: "It won't be shared.",
};

const NOUN: Record<ShareType, string> = {
  run: "run",
  workout: "workout",
};

function initialState(
  action: SessionShareAction,
  saved: ShareDefaults | null | undefined,
  needsEmailVerification: boolean
): RowState {
  const live = liveSessionPost(action);
  if (live) return { kind: "live", outcome: live };
  const start = finishShareStart(
    savedShareDefault(saved, action.type),
    needsEmailVerification
  );
  if (start.kind === "ask") return { kind: "ask" };
  if (start.kind === "post") {
    return { kind: "posting", visibility: start.visibility };
  }
  return start.reason === "verify"
    ? { kind: "held", note: "verify" }
    : { kind: "held" };
}

function statusText(state: RowState): string {
  switch (state.kind) {
    case "posting":
      return `Sharing ${AUDIENCE[state.visibility]}`;
    case "live":
      return state.outcome.status === "posted"
        ? `Shared ${AUDIENCE[state.outcome.visibility]}`
        : `Will share ${AUDIENCE[state.outcome.visibility]} when you're back online`;
    case "held":
      return state.note ? NOTE[state.note] : "";
    default:
      return "";
  }
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export default function SessionShareRow({
  action,
}: {
  action: SessionShareAction;
}) {
  const { user, refreshProfile } = useAuth();
  const restriction = useRestrictedStatus(user?.uid);
  // Nothing to read first when the post already exists, or offline.
  const [checked, setChecked] = useState(
    () => liveSessionPost(action) !== undefined || isOffline()
  );
  useEffect(() => {
    if (checked) return;
    let current = true;
    refreshProfile()
      .catch((err: unknown) =>
        logger.warn("[SessionShareRow] couldn't read the saved answer:", err)
      )
      .finally(() => {
        if (current) setChecked(true);
      });
    return () => {
      current = false;
    };
  }, [checked, refreshProfile]);
  if (!checked || restriction.loading) return null;
  if (restriction.isRestricted && !liveSessionPost(action)) {
    return <RestrictedNotice />;
  }
  return <ShareRow action={action} />;
}

function ShareRow({ action }: { action: SessionShareAction }) {
  const { user, profile, updateShareDefaults } = useAuth();
  const gate = useEmailVerificationGate(user);
  const headingId = useId();
  // The signed-in account's answers. A session another account is signed
  // in over has none here: it is held, and nothing is saved for it.
  const mine = profile?.uid === action.uid;
  const saved = mine ? profile.shareDefaults : undefined;
  const [state, setState] = useState<RowState>(() =>
    mine || liveSessionPost(action)
      ? initialState(action, saved, gate.needsVerification)
      : { kind: "held" }
  );

  const postingVisibility = state.kind === "posting" ? state.visibility : null;
  useEffect(() => {
    if (!postingVisibility) return;
    // Under StrictMode this runs twice; `post` hands the second call the
    // first call's promise, so the session is posted once.
    let current = true;
    action.post({ visibility: postingVisibility, caption: "" }).then(
      (outcome) => {
        if (!current) return;
        setState(
          outcome.status === "declined"
            ? { kind: "held" }
            : { kind: "live", outcome }
        );
      },
      (err) => {
        if (!current) return;
        logger.warn("[SessionShareRow] automatic share failed:", err);
        setState({ kind: "held", note: "failed" });
      }
    );
    return () => {
      current = false;
    };
  }, [action, postingVisibility]);

  const answer = (value: ShareDefault) => {
    haptic("light");
    // Saved on the account, and shown at once; a refused save says so.
    void updateShareDefaults(answerShareQuestion(saved, action.type, value));
    if (value === "never") setState({ kind: "held" });
    else if (gate.needsVerification) setState({ kind: "held", note: "verify" });
    else setState({ kind: "posting", visibility: value });
  };

  const undo = async () => {
    if (state.kind !== "live" || state.undoing) return;
    haptic("light");
    const { outcome } = state;
    setState({ kind: "live", outcome, undoing: true });
    try {
      // What was done, not what the outcome was: a post queued offline can
      // have gone out by the time Undo is tapped, and then it was removed.
      const note = await withdrawSessionPost(action, outcome);
      setState({ kind: "held", note });
    } catch (err) {
      logger.warn("[SessionShareRow] undo failed:", err);
      toast.error("Couldn't remove the post. Try again.");
      setState({ kind: "live", outcome });
    }
  };

  const shareOnce = async () => {
    if (state.kind === "sheet") return;
    haptic("light");
    setState({ kind: "sheet" });
    try {
      const outcome = await action.post();
      setState(
        outcome.status === "declined"
          ? gate.needsVerification
            ? { kind: "held", note: "verify" }
            : { kind: "held" }
          : { kind: "live", outcome }
      );
    } catch (err) {
      logger.warn("[SessionShareRow] share failed:", err);
      setState({ kind: "held", note: "failed" });
    }
  };

  const other: ShareType = action.type === "run" ? "workout" : "run";
  const appliesTo =
    savedShareDefault(saved, other) === null
      ? "every run and workout"
      : `every ${NOUN[action.type]}`;

  const text = statusText(state);
  const live = state.kind === "live" ? state : null;
  const inRow = state.kind === "posting" || live !== null;
  const note = state.kind === "held" && !!state.note;

  return (
    <div className="space-y-2">
      {/* The status line is ONE element that stays mounted in every state,
          so a screen reader announces each change ("Sharing…", "Shared",
          "Removed from the feed"). A live region that mounts with its text
          already in it is often not read out. With nothing to show it is
          visually hidden, and first, so it never adds a gap. */}
      <div
        className={
          inRow ? "flex items-center gap-2 min-h-11" : note ? "" : "sr-only"
        }
      >
        {live &&
          (live.outcome.status === "posted" ? (
            <Check
              className="size-4 shrink-0"
              style={{ color: THEME.success }}
              aria-hidden
            />
          ) : (
            <Clock
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ))}
        <p
          role="status"
          className={
            live
              ? "flex-1 min-w-0 text-sm text-foreground"
              : note
                ? "text-xs text-muted-foreground"
                : "text-sm text-muted-foreground"
          }
        >
          {state.kind === "posting" ? `${text}…` : text}
        </p>
        {live && (
          <Button
            variant="ghost"
            loading={live.undoing}
            onClick={() => void undo()}
            aria-label="Undo sharing"
          >
            Undo
          </Button>
        )}
      </div>

      {state.kind === "ask" && (
        // The standard card: the answers are secondary buttons, whose fill
        // is the muted tone, so a muted card would hide them.
        <Card as="section" aria-labelledby={headingId} className="space-y-3">
          <div>
            <h3
              id={headingId}
              className="text-sm font-semibold text-foreground"
            >
              Share sessions automatically?
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Applies to {appliesTo} from now on. Change it any time in Settings
              → Privacy.
            </p>
          </div>
          <div className="space-y-2">
            <Button
              fullWidth
              variant="secondary"
              onClick={() => answer("followers")}
              leftIcon={<Users className="size-4 shrink-0" aria-hidden />}
            >
              Share with followers
            </Button>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => answer("public")}
              leftIcon={<Globe className="size-4 shrink-0" aria-hidden />}
            >
              Share publicly
            </Button>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => answer("never")}
              leftIcon={<EyeOff className="size-4 shrink-0" aria-hidden />}
            >
              Don&apos;t share
            </Button>
          </div>
        </Card>
      )}

      {(state.kind === "held" || state.kind === "sheet") && (
        <Button
          variant="ghost"
          fullWidth
          loading={state.kind === "sheet"}
          onClick={() => void shareOnce()}
        >
          Share this session
        </Button>
      )}
    </div>
  );
}
