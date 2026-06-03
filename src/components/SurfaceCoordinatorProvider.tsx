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
 * Context is split in two on purpose:
 *   - SurfaceMethodsContext — register / unregister / dismiss. STABLE identity
 *     (memoised once) so a consumer's register effect doesn't re-run every
 *     render. (An earlier single-context version recreated the value object
 *     each render → consumers re-registered every render → bump → infinite
 *     loop. The split is the fix.)
 *   - SurfaceActiveContext — the single active id. Reactive: changes when the
 *     coordinator picks, so consumers re-render to show/hide.
 *
 * Design notes:
 *  - SETTLE window mirrors the onAuthStateChanged multi-fire rule in CLAUDE.md
 *    — never pick on the first eligibility signal; let the frame settle so a
 *    higher-priority late-registrant isn't beaten by a faster one.
 *  - App-open boundary = mount + visibilitychange→visible after being hidden.
 *  - Re-entrancy: a higher-priority surface arriving WHILE one is open does not
 *    preempt — resolve() is a no-op while active !== null (never yank a sheet
 *    out from under a tap).
 */
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
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

interface CoordinatorMethods {
  register: (config: SurfaceConfig) => void;
  unregister: (id: string) => void;
  dismiss: (id: string) => void;
}

const SurfaceMethodsContext = createContext<CoordinatorMethods | null>(null);
const SurfaceActiveContext = createContext<string | null>(null);

export function SurfaceCoordinatorProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Registrations live in a ref — mutating them must NOT trigger a render
  // (that's what caused the loop). The render that reveals a surface comes
  // only from setState inside runResolve.
  const regs = useRef<Map<string, SurfaceConfig>>(new Map());
  const dropped = useRef<Set<string>>(new Set());
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<CoordinatorState>(initialState);

  const runResolve = useCallback(() => {
    const list = [...regs.current.values()];
    setState((prev) => resolve(list, prev));
  }, []);

  const scheduleSettle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(runResolve, SETTLE_MS);
  }, [runResolve]);

  const register = useCallback(
    (config: SurfaceConfig) => {
      regs.current.set(config.id, config);
      scheduleSettle();
    },
    [scheduleSettle]
  );

  const unregister = useCallback((id: string) => {
    regs.current.delete(id);
  }, []);

  const dismiss = useCallback((id: string) => {
    setState((prev) => (prev.active === id ? dismissActive(prev) : prev));
  }, []);

  // Stable methods identity — consumers' register effects depend on this.
  const methods = useMemo<CoordinatorMethods>(
    () => ({ register, unregister, dismiss }),
    [register, unregister, dismiss]
  );

  // Drop eligible celebrations that won't show this open (lost or suppressed)
  // once the budget is committed. Post-commit effect — NOT inside the resolve()
  // updater — so firing onDrop (e.g. dismissNewBadge, which itself setState's)
  // never happens during this provider's render.
  useEffect(() => {
    if (!state.budgetSpent) return;
    const list = [...regs.current.values()];
    for (const id of celebrationsToDrop(list, state)) {
      if (!dropped.current.has(id)) {
        dropped.current.add(id);
        regs.current.get(id)?.onDrop?.();
      }
    }
  }, [state]);

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

  return (
    <SurfaceMethodsContext.Provider value={methods}>
      <SurfaceActiveContext.Provider value={state.active}>
        {children}
      </SurfaceActiveContext.Provider>
    </SurfaceMethodsContext.Provider>
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
  const methods = useContext(SurfaceMethodsContext);
  const activeId = useContext(SurfaceActiveContext);
  const { id, priority, eligible, suppressedBy, dropWhenMissed, onDrop } =
    config;

  // Keep the latest config (onDrop/suppressedBy may close over fresh values)
  // in a ref so re-registering on the decision-relevant deps still hands the
  // coordinator current side-effects.
  const latest = useRef(config);
  latest.current = config;

  useEffect(() => {
    if (!methods) return;
    methods.register(latest.current);
    return () => methods.unregister(id);
    // Re-register on the values that change the decision; `methods` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods, id, priority, eligible, suppressedBy, dropWhenMissed, onDrop]);

  if (!methods) {
    return { active: eligible, dismiss: () => {} };
  }
  return { active: activeId === id, dismiss: () => methods.dismiss(id) };
}
