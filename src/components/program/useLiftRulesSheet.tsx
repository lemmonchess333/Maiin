import { Suspense, useState } from "react";
import type { Experience } from "@/features/program/programTypes";
import type { LiftPurposeProgramme } from "@/lib/liftSessionPurpose";
import { lazyRetry } from "@/lib/lazyRetry";

const LiftRulesSheet = lazyRetry(() => import("./LiftRulesSheet"));

/**
 * The rules sheet behind a control (Lift4 (3)): `open` shows it, and
 * `sheet` is what to render beside the control. The sheet loads on the
 * first open and stays mounted after, so it can animate closed.
 */
export function useLiftRulesSheet({
  purpose,
  programme,
  experience,
}: {
  purpose: string | null;
  programme: LiftPurposeProgramme | null | undefined;
  experience?: Experience;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return {
    open: () => {
      setLoaded(true);
      setOpen(true);
    },
    sheet: loaded ? (
      <Suspense fallback={null}>
        <LiftRulesSheet
          open={open}
          onOpenChange={setOpen}
          purpose={purpose}
          programme={programme}
          experience={experience}
        />
      </Suspense>
    ) : null,
  };
}
