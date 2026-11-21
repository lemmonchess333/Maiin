/**
 * Setup's first lifting question: how many lift sessions a week, and about
 * how long each one is (Lift4 (5)). Setup's "Your week" step and Lift
 * plan's Add lifting both draw it (TrainWk1 step 6).
 */
import SegmentedControl from "@/components/ui/SegmentedControl";
import SessionLengthLabel from "@/components/program/SessionLengthLabel";
import {
  DRAFT_SESSION_MINUTES,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";

export type LiftDaysChoice = Exclude<OnboardingDraft["daysPerWeek"], 0>;
export type SessionMinutesChoice = (typeof DRAFT_SESSION_MINUTES)[number];

export default function LiftWeekQuestion({
  days,
  onDaysChange,
  minutes,
  onMinutesChange,
}: {
  days: LiftDaysChoice;
  onDaysChange: (days: LiftDaysChoice) => void;
  minutes: SessionMinutesChoice;
  onMinutesChange: (minutes: SessionMinutesChoice) => void;
}) {
  return (
    <>
      <SegmentedControl<LiftDaysChoice>
        ariaLabel="Lift sessions per week"
        value={days}
        options={([2, 3, 4, 5, 6] as const).map((n) => ({
          value: n,
          label: <span className="font-figure tabular-nums text-xl">{n}</span>,
        }))}
        onChange={onDaysChange}
        tone="lifting"
        className="py-2"
      />
      <SegmentedControl<SessionMinutesChoice>
        ariaLabel="Minutes per lift session"
        value={minutes}
        options={DRAFT_SESSION_MINUTES.map((n) => ({
          value: n,
          label: <SessionLengthLabel minutes={n} />,
        }))}
        onChange={onMinutesChange}
        tone="lifting"
        className="@container"
      />
    </>
  );
}
