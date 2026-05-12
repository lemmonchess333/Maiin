import { useEffect, useState } from "react";
import { Users, Globe, EyeOff, Trophy } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { haptic } from "@/lib/haptic";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/lib/auth";
import { postActivity } from "@/lib/socialApi";
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
  workout: "Always do this for workouts",
  run: "Always do this for runs",
};

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
  const { user, profile } = useAuth();

  // Subscribe to singleton state changes.
  useEffect(() => {
    return subscribeShareComposer((s) => {
      setState(s);
      if (s.open) {
        setCaption("");
        setRemember(false);
      }
    });
  }, []);

  // Drain the offline share queue when we come back online.
  useEffect(() => {
    if (!isOnline || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        await drainQueue(async (payload) => {
          await postActivity(payload as Parameters<typeof postActivity>[0]);
        });
        if (cancelled) return;
      } catch {
        /* swallow — anything that fails stays queued for next drain */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, user]);

  if (!state.preview || !state.type) {
    return null;
  }

  // "Share to my crew" is only meaningful when the user has joined a
  // crew. Hide the row otherwise — listing a destination with no
  // payload would be a dead button.
  const hasCrew = !!profile?.crewId;

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
                <span className="absolute bottom-2 right-3 text-[10px] font-mono tabular-nums text-muted-foreground/70">
                  {caption.length}/{CAPTION_MAX}
                </span>
              )}
            </div>
            {captionIsProfane && (
              <p
                role="alert"
                className="text-xs text-destructive font-medium px-1"
              >
                Please remove objectionable language before sharing.
              </p>
            )}

            {/* Visibility actions */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => choose("followers")}
                disabled={captionIsProfane}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
              >
                <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold">Share to followers</span>
              </button>
              {hasCrew && (
                <button
                  type="button"
                  onClick={() => choose("crews")}
                  disabled={captionIsProfane}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted text-foreground active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
                >
                  <Trophy className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-semibold">Share to my crew</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => choose("public")}
                disabled={captionIsProfane}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted text-foreground active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
              >
                <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold">Make public</span>
              </button>
              <button
                type="button"
                onClick={skip}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground active:scale-[0.98] transition-transform"
              >
                <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">Don&apos;t share this one</span>
              </button>
            </div>

            {/* Remember toggle */}
            <label className="flex items-center gap-3 px-1 py-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-[var(--brand-primary,#7B72E9)]"
              />
              <span className="text-xs text-muted-foreground">
                {REMEMBER_LABEL[state.type]}
              </span>
            </label>

        {!isOnline && (
          <p className="text-[11px] text-muted-foreground text-center">
            You&apos;re offline — your post will be queued and shared when you&apos;re back online.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
