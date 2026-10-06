import { Info } from "lucide-react";
import type { Experience, WorkoutDay } from "@/features/program/programTypes";
import {
  liftSessionPurpose,
  type LiftPurposeProgramme,
} from "@/lib/liftSessionPurpose";
import { useLiftRulesSheet } from "./useLiftRulesSheet";

/**
 * "Why this session" on a lift day's details, the lifting half of "Why
 * this run". It opens the rules sheet, the session's reasons first (Lift4
 * (3): the rules live on one sheet, merged with "Why this session").
 * Nothing renders without a programme to explain, wrapper included: an
 * empty box in a spaced stack still takes its gap, so a routine, a free
 * session or a plan still loading shows nothing at all.
 */
export default function LiftPurpose({
  programme,
  day,
  date,
  experience,
  className,
}: {
  programme: LiftPurposeProgramme | null | undefined;
  day:
    | (Pick<WorkoutDay, "isCustom"> & Partial<Pick<WorkoutDay, "exercises">>)
    | null
    | undefined;
  /** The day's local YYYY-MM-DD, or today where the surface has no date. */
  date: string;
  /** The person's level (`profile.experience`). */
  experience?: Experience;
  /** Applied to a wrapper, which exists only when there is a reason. */
  className?: string;
}) {
  const purpose = liftSessionPurpose(programme, day, date, experience);
  const rules = useLiftRulesSheet({ purpose, programme, experience });
  if (!purpose) return null;
  const control = (
    <>
      <button
        type="button"
        onClick={rules.open}
        className="min-h-11 inline-flex items-center gap-2 rounded-lg text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        Why this session
      </button>
      {rules.sheet}
    </>
  );
  return className ? <div className={className}>{control}</div> : control;
}
