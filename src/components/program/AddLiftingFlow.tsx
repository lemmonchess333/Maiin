/**
 * Add lifting: Lift plan for someone with no lift days on their plan
 * (TrainWk1 step 6; the Train grill's Q28). Before, a runner's Lift plan
 * showed the whole editor with nothing selected in its days (their saved
 * value, 0, matched none of 2 to 6), and there was no way in.
 *
 * It asks setup's three lifting questions, drawn by setup's own components
 * (days and minutes, the kit and the experience, anything to work around),
 * one a screen as setup asks them, and builds the lifting from them
 * (`sportChange`'s `add_lifting`) around the runs the person has, which
 * keep their days. It never goes through setup's route or its steps.
 *
 * The steps (`docs/state-machines.md`): week, then kit, then limits; Back
 * goes one step back; Add lifting saves from limits, and while it saves
 * nothing else can be pressed. A refused save stays on limits with the
 * answers kept.
 */
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import WeekPreview from "@/components/onboarding/WeekPreview";
import FirstLiftPreview from "@/components/onboarding/FirstLiftPreview";
import InjuryChangesList from "@/components/onboarding/InjuryChangesList";
import LiftWeekQuestion, {
  type LiftDaysChoice,
  type SessionMinutesChoice,
} from "@/components/onboarding/LiftWeekQuestion";
import LiftKitQuestion from "@/components/onboarding/LiftKitQuestion";
import LiftLimitsQuestion from "@/components/onboarding/LiftLimitsQuestion";
import {
  LIFT_KIT_QUESTION,
  LIFT_LIMITS_QUESTION,
} from "@/lib/liftingQuestions";
import { sportChange, type LiftingAnswers } from "@/lib/sportChange";
import { buildPlan } from "@/features/program/planBuilder";
import {
  configureLiftPlan,
  planSaveRejection,
} from "@/features/program/liftPlanRebuild";
import { injuryChanges } from "@/features/program/injuryChanges";
import { sessionLengthOption } from "@/features/program/sessionFit";
import { pullUpBarWhenChosen } from "@/features/program/programLabels";
import type { DatedRun, LayoffClass } from "@/features/program/layoffDetection";
import type { ProgramState } from "@/features/program/programTypes";
import type { ProgramReadiness } from "@/features/program/useProgram";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { resolveLiftUnit } from "@/lib/liftLoad";
import type { UserProfile } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

export type AddLiftingStep = "week" | "kit" | "limits";
const STEPS: readonly AddLiftingStep[] = ["week", "kit", "limits"];

/** The days the question opens on: three, between setup's two and six.
 *  Tropos heuristic: someone adding lifting to a running week starts in
 *  the middle, and setup's four would fill most of a three-run week. */
const FIRST_DAYS: LiftDaysChoice = 3;

const HEADINGS: Record<AddLiftingStep, { title: string; hint: string }> = {
  week: {
    title: "How often will you lift?",
    hint: "Your lift days go into your week from today. Your runs keep their days.",
  },
  kit: LIFT_KIT_QUESTION,
  limits: LIFT_LIMITS_QUESTION,
};

export default function AddLiftingFlow({
  profile,
  programState,
  readiness,
  recentLayoff = "none",
  recentRuns,
  refreshProfile,
}: {
  profile: UserProfile;
  programState: ProgramState | null;
  /** The save is built on the programme and sent against it, so it waits
   *  for the server's copy, as the editors' saves do. */
  readiness: ProgramReadiness;
  recentLayoff?: LayoffClass;
  recentRuns: readonly DatedRun[] | null;
  refreshProfile: () => Promise<void>;
}) {
  const today = useLocalDateKey();
  const [step, setStep] = useState<AddLiftingStep>("week");
  const [days, setDays] = useState<LiftDaysChoice>(FIRST_DAYS);
  const [minutes, setMinutes] = useState<SessionMinutesChoice>(
    sessionLengthOption(profile.liftTimeBudgetMinutes)
  );
  const [equipment, setEquipment] = useState<LiftingAnswers["equipment"]>(
    profile.equipment ?? "full_gym"
  );
  const [equipmentConfirmed, setEquipmentConfirmed] = useState(false);
  const [barbellAtHome, setBarbellAtHome] = useState(
    profile.barbellAtHome === true
  );
  // As setup: the answer given, or the one the kit starts from.
  const [pullUpBar, setPullUpBar] = useState(
    profile.pullUpBar ?? pullUpBarWhenChosen(profile.equipment)
  );
  const [smallPlates, setSmallPlates] = useState(
    programState?.settings?.smallPlates === true
  );
  const [experience, setExperience] = useState<LiftingAnswers["experience"]>(
    profile.experience ?? "beginner"
  );
  const [experienceConfirmed, setExperienceConfirmed] = useState(false);
  const [injuries, setInjuries] = useState<string[]>(
    (profile.injuries ?? []).length > 0 ? [...profile.injuries!] : []
  );
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // What the answers build, drawn as setup draws it: the week, the first
  // lift, what the limitations changed.
  const change = useMemo(
    () =>
      sportChange(
        { profile, programState, today, recentLayoff, recentRuns },
        {
          kind: "add_lifting",
          answers: {
            liftDays: days,
            sessionMinutes: minutes,
            equipment,
            barbellAtHome,
            pullUpBar,
            smallPlates,
            experience,
            injuries,
          },
        }
      ),
    [
      profile,
      programState,
      today,
      recentLayoff,
      recentRuns,
      days,
      minutes,
      equipment,
      barbellAtHome,
      pullUpBar,
      smallPlates,
      experience,
      injuries,
    ]
  );
  const plan = useMemo(
    () => (change.ok ? buildPlan(change.input) : null),
    [change]
  );

  const index = STEPS.indexOf(step);
  const ready =
    step === "kit"
      ? equipmentConfirmed && experienceConfirmed
      : step === "limits"
        ? injuries.length > 0
        : true;
  const last = step === "limits";
  const programReady = readiness === "ready";

  function go(next: AddLiftingStep) {
    setStep(next);
    // The new question is read first, as setup moves focus to its title.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function add() {
    if (saving || !programReady || !ready) return;
    if (!change.ok || !plan) {
      toast.error(change.ok ? "Couldn’t build your plan." : change.sentence);
      return;
    }
    setSaving(true);
    try {
      Object.assign(plan.profileUpdates, change.patch);
      await configureLiftPlan(plan, profile, programState);
      await refreshProfile();
      toast.success("Lifting added");
    } catch (err) {
      logger.error("[AddLiftingFlow] save failed:", err);
      const rejection = planSaveRejection(
        err,
        "Your plan changed. Check Lift plan, then add lifting again."
      );
      if (rejection.refresh)
        await refreshProfile().catch((error) =>
          logger.warn("Plan refresh failed", error)
        );
      toast.error(rejection.message);
    } finally {
      setSaving(false);
    }
  }

  const heading = HEADINGS[step];
  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-2">
        <SectionLabel>
          Add lifting ·{" "}
          <span className="font-mono tabular-nums">
            {index + 1} of {STEPS.length}
          </span>
        </SectionLabel>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-h2 leading-tight tracking-tight font-extrabold focus:outline-none"
        >
          {heading.title}
        </h2>
        <p className="text-sm text-muted-foreground">{heading.hint}</p>
      </div>

      {step === "week" && (
        <div className="space-y-5">
          <LiftWeekQuestion
            days={days}
            onDaysChange={setDays}
            minutes={minutes}
            onMinutesChange={setMinutes}
          />
          {plan && (
            <WeekPreview
              schedule={plan.weekSchedule}
              workouts={plan.programState.workouts}
              runDays={plan.programState.runDays}
              draft
            />
          )}
        </div>
      )}

      {step === "kit" && (
        <div className="space-y-6">
          <LiftKitQuestion
            equipment={equipment}
            equipmentConfirmed={equipmentConfirmed}
            onEquipmentChange={(next) => {
              setEquipmentConfirmed(true);
              setEquipment(next);
            }}
            barbellAtHome={barbellAtHome}
            onBarbellAtHomeChange={setBarbellAtHome}
            pullUpBar={pullUpBar}
            onPullUpBarChange={setPullUpBar}
            smallPlates={smallPlates}
            onSmallPlatesChange={setSmallPlates}
            liftUnit={resolveLiftUnit(programState?.settings?.loadUnit)}
            experience={experience}
            experienceConfirmed={experienceConfirmed}
            onExperienceChange={(next) => {
              setExperienceConfirmed(true);
              setExperience(next);
            }}
          />
          {equipmentConfirmed && plan && (
            <FirstLiftPreview workouts={plan.programState.workouts} />
          )}
        </div>
      )}

      {step === "limits" && (
        <div className="space-y-3">
          <LiftLimitsQuestion injuries={injuries} onChange={setInjuries} />
          {plan && injuries.some((id) => id !== "none") && (
            <InjuryChangesList
              changes={injuryChanges(plan.programState.workouts, injuries)}
            />
          )}
        </div>
      )}

      {/* Back and the main button side by side, the main button on top
          once they no longer fit (larger text), as setup's footer. Sticky
          over the tab bar, as the editors' save bars are. */}
      <div
        className="@container sticky z-20 -mx-[16px] px-[16px] pt-3 pb-3 bg-background/92 backdrop-blur border-t border-border"
        style={{ bottom: "calc(var(--tab-bar-height) + var(--safe-bottom))" }}
      >
        {last && readiness === "failed" && (
          <p
            id="add-lifting-load-failed"
            className="mb-2 text-center text-xs text-muted-foreground"
          >
            Couldn’t load your programme. Reopen this page to try again.
          </p>
        )}
        <div className="flex gap-3 @max-[15em]:flex-col-reverse">
          {index > 0 && (
            <Button
              variant="secondary"
              disabled={saving}
              leftIcon={<ArrowLeft className="size-4" />}
              onClick={() => go(STEPS[index - 1])}
            >
              Back
            </Button>
          )}
          <Button
            variant="neutral"
            className="flex-1"
            disabled={!ready || (last && !programReady) || saving}
            loading={saving || (last && readiness === "pending")}
            aria-describedby={
              last && readiness === "failed"
                ? "add-lifting-load-failed"
                : undefined
            }
            rightIcon={last ? undefined : <ChevronRight className="size-4" />}
            onClick={() => (last ? void add() : go(STEPS[index + 1]))}
          >
            {last ? (saving ? "Adding lifting…" : "Add lifting") : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
