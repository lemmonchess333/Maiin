import { useCallback, useState } from "react";

/**
 * A boolean that survives navigation and reload, backed by localStorage.
 *
 * The sibling primitives are both one-way: `useDismissOnce` can only
 * dismiss and `useSnoozeDismiss` only snoozes. Neither can express "the
 * user opened this and wants it to stay open", which is what an
 * expand/collapse needs — so expandable cards kept reaching for bare
 * `useState` and forgetting the choice on every visit.
 *
 * Home's Today's Energy card was the reported case: it defaults closed
 * for a documented reason (keeping the Home scroll calm), but the state
 * was plain `useState`, so a user who wanted the macro breakdown had to
 * re-open it every single time they landed on Home. Persisting turns one
 * tap into a preference, and keeps the calm default for everyone who
 * never taps it — the reason for defaulting closed is untouched.
 *
 * Callers MUST scope the key by uid. CLAUDE.md's shared-device rule
 * (one account's cached state must not leak into the next) is why
 * `useSnoozeDismiss` is uid-scoped too; a bare key would carry one
 * person's layout preference into another person's session.
 *
 * localStorage access is wrapped because Safari private mode throws on
 * both read and write. A lost preference is a nuisance, not a fault, so
 * failures fall back to the default rather than surfacing.
 */
export function usePersistedToggle(
  key: string,
  defaultValue = false
): { value: boolean; toggle: () => void; set: (next: boolean) => void } {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      // Absent means "never chosen" — the default, not `false`. A card
      // that defaults OPEN must not be closed by the mere absence of a
      // stored value.
      if (stored === null) return defaultValue;
      return stored === "1";
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* private mode / quota — the in-memory value still applies */
      }
    },
    [key]
  );

  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* private mode / quota — the in-memory value still applies */
      }
      return next;
    });
  }, [key]);

  return { value, toggle, set };
}
