/**
 * Surface coordinator — React wiring (#995).
 *
 * Holds the per-app-open CoordinatorState and delegates every decision to the
 * pure core in src/lib/surfaceCoordinator.ts. Tier-4 (blocking) surfaces
 * declare their intent via `useSurface(...)`; the provider waits a short
 * SETTLE window so all candidates for a given app-open register before it
 * picks, then renders at most ONE — the rest defer (decisions) or drop
 * (celebrations).
 *
 * NOT YET MOUNTED. PR1 ships this inert (no <SurfaceCoordinatorProvider> in
 * App.tsx, no surface calls useSurface), so runtime behaviour is unchanged.
 * PR2 mounts it and migrates the four tier-4 surfaces one commit at a time.
 *
 * Design notes baked in here for the migration:
 *  - SETTLE window mirrors the onAuthStateChanged multi-fire rule in
 *    CLAUDE.md — never pick on the first eligibility signal; let the frame
 *    settle so a higher-priority late-registrant isn't beaten by a faster one.
 *  - App-open boundary = mount + visibilitychange→visible after being hidden.
 *  - Re-entrancy: a higher-priority surface arriving WHILE one is open does
 *    not preempt — we never yank a sheet out from under a tap (resolve() is a
 *    no-op while active !== null).
 */
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type SurfaceRegistration,
  type CoordinatorState,
  initialState,
  resolve,
  dismissActive,
  beginAppOpen,
  celebrationsToDrop,
} from "@/lib/surfaceCoordinator";

const SETTLE_MS = 400;

export interface SurfaceConfig extends SurfaceRegistration {
  /** Fired exactly once when a celebration is dropped (e.g. dismissNewBadge). */
  onDrop?: () => void;
}

interface CoordinatorContextValue {
  register: (config: SurfaceConfig) => void;
  unregister: (id: string) => void;
  isActive: (id: string) => boolean;
  dismiss: (id: string) => void;
}

const SurfaceCoordinatorContext =
  createContext<CoordinatorContextValue | null>(null);

export function SurfaceCoordinatorProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Registrations live in a ref (mutating them shouldn't thrash render); a
  // version counter triggers re-evaluation when the set or eligibility shifts.
  const regs = useRef<Map<string, SurfaceConfig>>(new Map());
  const dropped = useRef<Set<string>>(new Set());
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setVersion] = useState(0);
  const [state, setState] = useState<CoordinatorState>(initialState);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const runResolve = useCallback(() => {
    const list = [...regs.current.values()];
    setState((prev) => {
      const next = resolve(list, prev);
      // Drop eligible celebrations that won't show this open (lost or
      // suppressed), once budget is committed.
      if (next.budgetSpent) {
        for (const id of celebrationsToDrop(list, next)) {
          if (!dropped.current.has(id)) {
            dropped.current.add(id);
            regs.current.get(id)?.onDrop?.();
          }
        }
      }
      return next;
    });
  }, []);

  const scheduleSettle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(runResolve, SETTLE_MS);
  }, [runResolve]);

  const register = useCallback(
    (config: SurfaceConfig) => {
      regs.current.set(config.id, config);
      scheduleSettle();
      bump();
    },
    [scheduleSettle, bump]
  );

  const unregister = useCallback(
    (id: string) => {
      regs.current.delete(id);
      bump();
    },
    [bump]
  );

  const isActive = useCallback((id: string) => state.active === id, [state]);

  const dismiss = useCallback(
    (id: string) => {
      setState((prev) => (prev.active === id ? dismissActive(prev) : prev));
    },
    []
  );

  // App-open boundary: reset the per-open budget when the app returns to the
  // foreground after being hidden, then re-evaluate.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        dropped.current.clear();
        setState(beginAppOpen());
        scheduleSettle();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [scheduleSettle]);

  const value: CoordinatorContextValue = {
    register,
    unregister,
    isActive,
    dismiss,
  };

  return (
    <SurfaceCoordinatorContext.Provider value={value}>
      {children}
    </SurfaceCoordinatorContext.Provider>
  );
}

/**
 * A tier-4 surface declares its intent here. Returns whether it is the chosen
 * surface this app-open (render the modal/sheet only when `active`) and a
 * `dismiss` to call when the user closes it.
 *
 * Outside a provider it FAILS OPEN — `active` mirrors `eligible` — so a surface
 * that hasn't been wired to a mounted provider yet behaves exactly as it does
 * today. This keeps the PR2 migration safe per-surface.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSurface(config: SurfaceConfig): {
  active: boolean;
  dismiss: () => void;
} {
  const ctx = useContext(SurfaceCoordinatorContext);
  const { id, priority, eligible, suppressedBy, dropWhenMissed, onDrop } =
    config;

  useEffect(() => {
    if (!ctx) return;
    ctx.register({
      id,
      priority,
      eligible,
      suppressedBy,
      dropWhenMissed,
      onDrop,
    });
    return () => ctx.unregister(id);
    // onDrop/suppressedBy are stable-by-intent; re-register on the values that
    // change the decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, id, priority, eligible]);

  if (!ctx) {
    return { active: eligible, dismiss: () => {} };
  }
  return { active: ctx.isActive(id), dismiss: () => ctx.dismiss(id) };
}
