/**
 * Education lane — React wiring (#995, tier 3).
 *
 * Renders at most one inline education card at a time. Cards register via
 * `useEducationCard({ id, priority, eligible })`; the provider recomputes the
 * single winner whenever the registry or any eligibility changes. When the
 * winning card is dismissed (eligible→false) the next-highest takes its place.
 *
 * Same two-context split as SurfaceCoordinatorProvider (stable methods +
 * reactive winnerId) to avoid the recreate-value-every-render → re-register
 * loop. No budget, no drop, no settle window — recompute is batched to the next
 * tick so the several cards mounting in one Home render resolve to one winner
 * without flashing the lower-priority ones.
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
  type EducationRegistration,
  pickEducationWinner,
} from "@/lib/educationLane";

interface EducationMethods {
  register: (reg: EducationRegistration) => void;
  unregister: (id: string) => void;
}

const EducationMethodsContext = createContext<EducationMethods | null>(null);
const EducationWinnerContext = createContext<string | null>(null);

export function EducationLaneProvider({ children }: { children: ReactNode }) {
  const regs = useRef<Map<string, EducationRegistration>>(new Map());
  const recomputeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const recompute = useCallback(() => {
    setWinnerId(pickEducationWinner([...regs.current.values()]));
  }, []);

  const scheduleRecompute = useCallback(() => {
    if (recomputeTimer.current) clearTimeout(recomputeTimer.current);
    // 0ms → batch every registration from one render pass into one recompute.
    recomputeTimer.current = setTimeout(recompute, 0);
  }, [recompute]);

  const register = useCallback(
    (reg: EducationRegistration) => {
      regs.current.set(reg.id, reg);
      scheduleRecompute();
    },
    [scheduleRecompute]
  );

  const unregister = useCallback(
    (id: string) => {
      regs.current.delete(id);
      scheduleRecompute();
    },
    [scheduleRecompute]
  );

  const methods = useMemo<EducationMethods>(
    () => ({ register, unregister }),
    [register, unregister]
  );

  useEffect(() => {
    return () => {
      if (recomputeTimer.current) clearTimeout(recomputeTimer.current);
    };
  }, []);

  return (
    <EducationMethodsContext.Provider value={methods}>
      <EducationWinnerContext.Provider value={winnerId}>
        {children}
      </EducationWinnerContext.Provider>
    </EducationMethodsContext.Provider>
  );
}

/**
 * An inline education card declares its intent. Returns whether it is the one
 * card allowed to show right now. Outside a provider it FAILS OPEN
 * (`visible === eligible`) so a card used elsewhere behaves as before.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useEducationCard(reg: EducationRegistration): {
  visible: boolean;
} {
  const methods = useContext(EducationMethodsContext);
  const winnerId = useContext(EducationWinnerContext);
  const { id, priority, eligible } = reg;

  useEffect(() => {
    if (!methods) return;
    methods.register({ id, priority, eligible });
    return () => methods.unregister(id);
  }, [methods, id, priority, eligible]);

  if (!methods) return { visible: eligible };
  return { visible: winnerId === id };
}
