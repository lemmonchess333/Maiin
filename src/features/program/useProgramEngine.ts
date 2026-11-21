import { useOutletContext } from "react-router-dom";
import type { useProgram } from "./useProgram";

/** The programme engine: what `useProgram()` returns. */
export type ProgramEngine = ReturnType<typeof useProgram>;

/**
 * The engine `ProgramEngineRoute` holds for the pages under `/program`:
 * Train and a session's own page read the one plan, and a change made on
 * either is the one both show.
 */
export function useProgramEngine(): ProgramEngine {
  const engine = useOutletContext<ProgramEngine | undefined>();
  if (!engine) {
    throw new Error("useProgramEngine is for a page under the /program route");
  }
  return engine;
}
