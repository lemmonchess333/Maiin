import { Outlet } from "react-router-dom";
import { useProgram } from "./useProgram";

/**
 * The `/program` route: one programme engine for Train and the session
 * pages under it (TrainWk1 call 2), handed down through the outlet
 * (`useProgramEngine`).
 *
 * Every `useProgram()` is its own engine, with its own load, rollovers and
 * writers. Were each page its own owner, opening a session would read the
 * plan again behind a skeleton, and a change made there while offline
 * (queued, shown only by the engine that made it) would be missing from
 * Train on the way back. `Layout` keys Train and these pages alike
 * (`layoutKey`), so this stays mounted between them.
 */
export default function ProgramEngineRoute() {
  const engine = useProgram();
  return <Outlet context={engine} />;
}
