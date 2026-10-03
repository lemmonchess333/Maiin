import PurposeDisclosure from "@/components/ui/PurposeDisclosure";
import type { WorkoutDay } from "@/features/program/programTypes";
import {
  liftSessionPurpose,
  type LiftPurposeProgramme,
} from "@/lib/liftSessionPurpose";

/**
 * "Why this session" on a lift day's details, the lifting half of "Why
 * this run". Nothing renders without a programme to explain, wrapper
 * included: an empty box in a spaced stack still takes its gap, so a
 * routine, a free session or a plan still loading shows nothing at all.
 */
export default function LiftPurpose({
  programme,
  day,
  date,
  className,
}: {
  programme: LiftPurposeProgramme | null | undefined;
  day: Pick<WorkoutDay, "isCustom"> | null | undefined;
  /** The day's local YYYY-MM-DD, or today where the surface has no date. */
  date: string;
  /** Applied to a wrapper, which exists only when there is a reason. */
  className?: string;
}) {
  const purpose = liftSessionPurpose(programme, day, date);
  if (!purpose) return null;
  const disclosure = (
    <PurposeDisclosure label="Why this session">{purpose}</PurposeDisclosure>
  );
  return className ? <div className={className}>{disclosure}</div> : disclosure;
}
