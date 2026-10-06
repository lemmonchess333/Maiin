import { Info } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import type { Experience } from "@/features/program/programTypes";
import type { LiftPurposeProgramme } from "@/lib/liftSessionPurpose";
import { useLiftRulesSheet } from "./useLiftRulesSheet";

/**
 * The ⓘ beside Train's week label (Lift4 (3)): how the plan works, on any
 * day, with the selected session's reasons first when it has some.
 */
export default function LiftRulesInfo({
  purpose,
  programme,
  experience,
}: {
  purpose: string | null;
  programme: LiftPurposeProgramme | null | undefined;
  experience?: Experience;
}) {
  const rules = useLiftRulesSheet({ purpose, programme, experience });
  return (
    <>
      <IconButton
        icon={<Info className="size-[15px] text-muted-foreground" />}
        aria-label="How your plan works"
        onClick={rules.open}
      />
      {rules.sheet}
    </>
  );
}
