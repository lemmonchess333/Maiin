import { useEffect, useState } from "react";
import { Users, Globe, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptic } from "@/lib/haptic";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useUid } from "@/lib/auth";
import { postActivity } from "@/lib/socialApi";
import { recordSharedActivity } from "@/lib/sessionDelete";
import { containsProfanity } from "@/lib/profanityFilter";
import {
  subscribeShareComposer,
  resolveCompose,
  drainQueue,
  type ShareType,
  type ShareVisibility,
  type ActivityPreview,
} from "@/lib/shareComposer";

const CAPTION_MAX = 140;

const TITLE: Record<ShareType, string> = {
  workout: "Share this workout?",
  run: "Share this run?",
};

const REMEMBER_LABEL: Record<ShareType, string> = {
  workout: "Make this my default for workouts",
  run: "Make this my default for runs",
};

/** Shown under the actions so the one-time nature of the ask is legible —
 *  the sheet is choosing a default, not interrogating this one session. */
const REMEMBER_HINT = "You can change this any time in Settings → Privacy.";

/**
 * App-level share composer. Mounted once (App.tsx) and listens to the
 * shareComposer singleton — opens whenever a save chain calls
 * `compose()` and the user has no stored preference.
 *
 * Doubles as the place where the offline share queue is drained: when
 * the user comes back online, any postActivity calls that were queued
 * while offline replay here.
 */
export default function ShareComposerSheet() {
  const [state, setState] = useState({
    open: false as boolean,
    type: null as ShareType | null,
    preview: null as ActivityPreview | null,
  });
  const [caption, setCaption] = useState("");
  const [remember, setRemember] = useState(false);
  const { isOnline } = useOnlineStatus();
  const uid = useUid();

  // Subscribe to singleton state changes.
  useEffect(() => {
    return subscribeShareComposer((s) => {
      setState(s);
      if (s.open) {
        setCaption("");
        // Pre-ticked, deliberately (2026-08-04). `compose()` already
        // short-circuits once a preference exists, so this sheet was only
        // ever meant to appear until the user chose a default — but the tick
        // defaulted OFF, so a user who never noticed it got prompted after
        // EVERY session. That is the "it duplicates it, and it's not needed"
        // in the operator's report: not a duplicated flow, a default that
        // never stuck.
        //
        // Reference apps (Strava, Hevy, Strong) all treat share visibility as
        // a setting with a per-post override, never a per-session prompt.
        // CLAUDE.md's grill heuristic: 3+ reference apps doing it invisibly
        // means Tropos surfaces it only with a Tropos-specific reason, and
        // there isn't one. Asking ONCE and remembering is that behaviour.
        //
        // Not defaulted to a VISIBILITY, note — only to remembering whatever
        // the user picks. Publishing training data without an explicit choice
        // is the one outcome worth avoiding outright.
        setRemember(true);
      }
    });
  }, []);

  // Drain the offline share queue when we come back online.
  // Scoped to the current user — items queued under a different
  // uid stay in the queue for that user's next sign-in.
  useEffect(() => {
    if (!isOnline || !uid) return;
    let cancelled = false;
    void (async () => {
      try {
        await drainQueue(uid, async (payload, source) => {
          const activityId = await postActivity(
            payload as Parameters<typeof postActivity>[0]
          );
          /* Queued items carry their source since the delete-link fix; a
             drained post records the same marker an online post would, so
             an offline share is deletable later exactly like an online
             one. Legacy items without a source drain as before and simply
             leave no link. recordSharedActivity is best-effort inside —
             a failed marker must NOT re-queue an already-successful post,
             which is also why it sits after postActivity resolves. */
          if (source) {
            await recordSharedActivity(uid, source, activityId);
          }
        });
        if (cancelled) return;
      } catch {
        /* swallow — anything that fails stays queued for next drain */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, uid]);

  if (!state.preview || !state.type) {
    return null;
  }

  // App Store Guideline 1.2 — block objectionable captions before
  // the post is created. The server-side onActivityCreated trigger
  // auto-flags the same content; surfacing the rejection here saves
  // the user a confusing "my post became invisible" surprise.
  const captionIsProfane = containsProfanity(caption);

  const choose = (visibility: ShareVisibility) => {
    if (captionIsProfane) {
      haptic("error");
      return;
    }
    haptic("light");
    resolveCompose({ visibility, caption: caption.trim() }, remember);
  };
  const skip = () => {
    haptic("light");
    resolveCompose(null, remember);
  };
  const dismiss = (open: boolean) => {
    if (!open && state.open) {
      // Drag-to-close + tap-outside both behave as "Don't share this one".
      // Remember-toggle still applies if checked, mirroring the explicit
      // skip button.
      haptic("light");
      resolveCompose(null, remember);
    }
  };

  return (
    // Sprint 3: vaul boilerplate replaced with the shared <BottomSheet>
    // primitive. The bespoke text-lg-bold title styling pre-Sprint-3
    // was design-system drift — the standard sheet title is
    // text-base-semibold and that's what we render now, matching
    // every other sheet in the app.
    <BottomSheet
      open={state.open}
      onOpenChange={dismiss}
      title={TITLE[state.type]}
      // Lifted above the default sheet stack. This is an APP-LEVEL sheet
      // (mounted once in App.tsx) that is opened from inside full-screen
      // route overlays — most visibly the post-save prompt, which fires while
      // `SessionCompleteScreen` is still mounted at `fixed inset-0 z-50` and
      // OPAQUE. At the defaults the scrim (z-40) was painted over by that
      // screen and the content (z-50) tied with it, winning on DOM order
      // alone: the sheet floated on an undimmed, full-brightness screen with
      // no layering cue at all. That is the "it looks weird" in the operator's
      // report — the sheet did not read as a layer because it was not being
      // drawn as one.
      overlayClassName="z-[60]"
      className="z-[70]"
    >
      <div className="px-5 pb-5 pt-3 space-y-4">
        {/* Activity preview */}
        <div className="rounded-xl bg-muted/50 px-3.5 py-3">
          <p className="text-sm font-semibold text-foreground truncate">
            {state.preview.title}
          </p>
          {state.preview.meta.length > 0 && (
            <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
              {state.preview.meta.join(" · ")}
            </p>
          )}
        </div>

        {/* Optional caption */}
        <div className="relative">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
            placeholder="Add a note about this session…"
            rows={2}
            aria-label="Add a note (optional)"
            aria-invalid={captionIsProfane}
            className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {caption.length > 0 && (
            <span className="absolute bottom-2 right-3 text-caption font-mono tabular-nums text-muted-foreground/70">
              {caption.length}/{CAPTION_MAX}
            </span>
          )}
        </div>
        {captionIsProfane && (
          <p role="alert" className="text-xs text-destructive-strong font-medium px-1">
            Please remove objectionable language before sharing.
          </p>
        )}

        {/* Visibility actions — three EQUAL rows, deliberately (operator,
            2026-08-05: the primary/tile/ghost ladder "just looks weird").
            This is a privacy choice the sheet remembers as a default, and
            none of the three answers is recommended over the others — a
            filled purple "Share to followers" was the UI nudging the user
            toward publishing training data, which is the one outcome the
            remember-toggle comment above says must never happen without an
            explicit choice. Same variant, same size, same alignment;
            the icons carry the difference. */}
        <div className="space-y-2">
          <Button
            fullWidth
            variant="secondary"
            onClick={() => choose("followers")}
            disabled={captionIsProfane}
            leftIcon={<Users className="size-4 shrink-0" aria-hidden="true" />}
          >
            Share to followers
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => choose("public")}
            disabled={captionIsProfane}
            leftIcon={<Globe className="size-4 shrink-0" aria-hidden="true" />}
          >
            Make public
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={skip}
            leftIcon={<EyeOff className="size-4 shrink-0" aria-hidden="true" />}
          >
            Don&apos;t share this one
          </Button>
        </div>

        {/* Remember toggle */}
        <label className="flex items-center gap-3 px-1 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-border accent-[var(--ds-purple-500)]"
          />
          <span className="text-xs text-muted-foreground">
            {REMEMBER_LABEL[state.type]}
          </span>
        </label>
        {remember && (
          <p className="text-caption text-muted-foreground px-1 -mt-1">
            {REMEMBER_HINT}
          </p>
        )}

        {!isOnline && (
          <p className="text-caption text-muted-foreground text-center">
            You&apos;re offline — your post will be queued and shared when
            you&apos;re back online.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
