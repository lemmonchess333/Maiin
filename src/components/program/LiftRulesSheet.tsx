import { BottomSheet } from "@/components/ui/BottomSheet";
import SectionHeading from "@/components/ui/SectionHeading";
import type { Experience } from "@/features/program/programTypes";
import { liftRules, liftRulesContext } from "@/lib/liftRules";
import type { LiftPurposeProgramme } from "@/lib/liftSessionPurpose";

/**
 * The plan's rules on one sheet, merged with "Why this session" (Lift4
 * (3)): the session's reasons first, when there is a session to explain,
 * then how the plan works. Loaded only when opened (`LiftPurpose`,
 * `LiftRulesInfo`): the rules read the engine's constants, which a day
 * card on Home has no other need for.
 */
export default function LiftRulesSheet({
  open,
  onOpenChange,
  purpose,
  programme,
  experience,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Why this session" for the day, or null on a surface with no
   *  session to explain. */
  purpose: string | null;
  programme: LiftPurposeProgramme | null | undefined;
  experience?: Experience;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={purpose ? "Why this session" : "How your plan works"}
    >
      <div className="overflow-y-auto px-4 pt-4 pb-6 space-y-6">
        {purpose && (
          <section className="space-y-2">
            <SectionHeading size="compact" as="h3">
              This session
            </SectionHeading>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {purpose}
            </p>
          </section>
        )}
        <section className="space-y-3">
          {purpose && (
            <SectionHeading size="compact" as="h3">
              How your plan works
            </SectionHeading>
          )}
          <dl className="space-y-4">
            {liftRules(liftRulesContext(programme, experience)).map((rule) => (
              <div key={rule.id}>
                <dt className="text-sm font-semibold text-foreground">
                  {rule.title}
                </dt>
                <dd className="mt-0.5 text-sm text-muted-foreground leading-relaxed">
                  {rule.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </BottomSheet>
  );
}
