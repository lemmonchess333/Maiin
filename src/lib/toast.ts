import { toast as sonnerToast, type ExternalToast } from "sonner";

/**
 * Global toast wrapper with content-based deduplication.
 *
 * Sonner collapses any two toasts that share an `id` — the later call
 * updates the earlier toast in place rather than stacking a second copy.
 * We exploit that: when a caller doesn't pass an explicit `id`, we derive
 * a stable one from the message text. The upshot is that firing the same
 * message twice in quick succession (a retry loop, an effect that re-runs,
 * the offline queue flushing several failed writes) shows a single toast
 * instead of a stack of identical ones — without changing any call site's
 * copy.
 *
 * An explicit `id` always wins: callers that already dedupe, or that need
 * a stable handle for a loading→success transition, keep full control.
 * Non-string messages (JSX/ReactNode) can't be hashed, so they pass
 * through unchanged and stack as before.
 *
 * Every call site imports `toast` from here instead of from "sonner"
 * directly, so the dedup is genuinely global. The only sonner import that
 * remains is the `<Toaster />` mount in ToastProvider.tsx.
 */

type Message = Parameters<typeof sonnerToast>[0];

// djb2 — small, dependency-free, and stable across reloads. Collisions
// only matter if two *different* messages hash equal *and* are shown in
// the same ~1.5s window; the cost is one toast briefly replacing another,
// which is acceptable. Folded to an unsigned 32-bit int for a tidy id.
function contentId(message: Message): string | undefined {
  if (typeof message !== "string") return undefined;
  let hash = 5381;
  for (let i = 0; i < message.length; i++) {
    hash = ((hash << 5) + hash + message.charCodeAt(i)) | 0;
  }
  return `t:${hash >>> 0}`;
}

function withDedupe(message: Message, options?: ExternalToast): ExternalToast | undefined {
  if (options?.id != null) return options;
  const id = contentId(message);
  if (id == null) return options;
  return { ...options, id };
}

function base(message: Message, options?: ExternalToast) {
  return sonnerToast(message, withDedupe(message, options));
}

// Copy sonner's full surface (promise, custom, dismiss, getHistory, …)
// onto our callable, then override the string-message variants with
// deduping versions. Cast back to sonner's type so call sites are
// indistinguishable from importing `toast` directly.
export const toast = Object.assign(base, sonnerToast, {
  success: (message: Message, options?: ExternalToast) =>
    sonnerToast.success(message, withDedupe(message, options)),
  error: (message: Message, options?: ExternalToast) =>
    sonnerToast.error(message, withDedupe(message, options)),
  info: (message: Message, options?: ExternalToast) =>
    sonnerToast.info(message, withDedupe(message, options)),
  warning: (message: Message, options?: ExternalToast) =>
    sonnerToast.warning(message, withDedupe(message, options)),
  message: (message: Message, options?: ExternalToast) =>
    sonnerToast.message(message, withDedupe(message, options)),
  loading: (message: Message, options?: ExternalToast) =>
    sonnerToast.loading(message, withDedupe(message, options)),
}) as typeof sonnerToast;
