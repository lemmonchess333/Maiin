import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { Users, Globe, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@/lib/auth";
import { postActivity } from "@/lib/socialApi";
import {
  subscribeShareComposer,
  resolveCompose,
  drainQueue,
  type ShareType,
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
  const { user } = useAuth();

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

  const choose = (visibility: "followers" | "public") => {
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
    <Drawer.Root open={state.open} onOpenChange={dismiss}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card border-t border-border outline-none">
          <div className="mx-auto w-10 h-1 rounded-full bg-border my-3" aria-hidden="true" />
          <div className="px-5 pb-5 space-y-4">
            <div>
              <Drawer.Title className="text-lg font-bold text-foreground">
                {TITLE[state.type]}
              </Drawer.Title>
            </div>

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
                className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {caption.length > 0 && (
                <span className="absolute bottom-2 right-3 text-[10px] font-mono tabular-nums text-muted-foreground/70">
                  {caption.length}/{CAPTION_MAX}
                </span>
              )}
            </div>

            {/* Visibility actions */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => choose("followers")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground active:scale-[0.98] transition-transform"
              >
                <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold">Share to followers</span>
              </button>
              <button
                type="button"
                onClick={() => choose("public")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted text-foreground active:scale-[0.98] transition-transform"
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Small helper used by the save chains to surface the offline-queue
 *  toast after enqueueing. Lives here so the wording stays in one
 *  place across workout + run callers. */
export function showQueuedToast() {
  toast.success("Post queued — will share when you're back online.", {
    id: "share-queued",
    duration: 3000,
  });
}
