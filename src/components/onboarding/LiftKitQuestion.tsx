/**
 * Setup's second lifting question: the equipment, what else is to hand,
 * and the lifting experience. Nothing is chosen until the person chooses
 * it: equipment shapes the plan and experience its starting loads, so
 * neither is taken from a default (`equipmentConfirmed`,
 * `experienceConfirmed`). Setup's "Your setup" step and Lift plan's Add
 * lifting both draw it (TrainWk1 step 6).
 */
import { Toggle } from "@/components/ui/Toggle";
import OptionCard from "@/components/onboarding/OptionCard";
import ChoiceArt from "@/components/onboarding/ChoiceArt";
import { smallPlatesHint } from "@/lib/liftRules";
import { noEquipmentPullNote } from "@/features/program/noEquipment";
import {
  pullUpBarWhenChosen,
  takesBarbellAtHome,
  takesPullUpBar,
  takesSmallPlates,
} from "@/features/program/programLabels";
import type { LiftUnit } from "@/lib/liftLoad";
import type { OnboardingDraft } from "@/lib/onboardingDraft";

type Equipment = OnboardingDraft["equipment"];
type Experience = OnboardingDraft["experience"];

const EQUIPMENT = [
  {
    id: "full_gym",
    label: "Full gym",
    desc: "Barbells, dumbbells, cables and machines.",
    art: "chest-press-machine",
  },
  {
    id: "home_gym",
    label: "Home gym",
    desc: "Dumbbells and a bench.",
    art: "incline-db-press",
  },
  {
    id: "minimal",
    label: "Minimal",
    desc: "Dumbbells and your bodyweight.",
    art: "goblet-squat",
  },
  {
    id: "no_equipment",
    label: "No equipment",
    desc: "Just your bodyweight, on the floor.",
    art: "bodyweight-squat",
  },
] as const;

const EXPERIENCE = [
  {
    id: "beginner",
    label: "New to lifting",
    desc: "Up to six months of consistent training.",
    level: 1,
  },
  {
    id: "intermediate",
    label: "Some experience",
    desc: "Six months to two years.",
    level: 2,
  },
  {
    id: "advanced",
    label: "Experienced",
    desc: "More than two years of consistent training.",
    level: 3,
  },
] as const;

export default function LiftKitQuestion({
  equipment,
  equipmentConfirmed,
  onEquipmentChange,
  barbellAtHome,
  onBarbellAtHomeChange,
  pullUpBar,
  onPullUpBarChange,
  smallPlates,
  onSmallPlatesChange,
  liftUnit,
  experience,
  experienceConfirmed,
  onExperienceChange,
}: {
  equipment: Equipment;
  equipmentConfirmed: boolean;
  onEquipmentChange: (equipment: Equipment) => void;
  barbellAtHome: boolean;
  onBarbellAtHomeChange: (has: boolean) => void;
  /** "A pull-up bar" (Lift4 (11)), asked beside a home gym, Minimal and no
   *  equipment. A setup chosen anew starts from its own answer
   *  (`pullUpBarWhenChosen`). */
  pullUpBar: boolean;
  onPullUpBarChange: (has: boolean) => void;
  smallPlates: boolean;
  onSmallPlatesChange: (has: boolean) => void;
  /** The unit the plates are in, for the small plates' line. */
  liftUnit: LiftUnit;
  experience: Experience;
  experienceConfirmed: boolean;
  onExperienceChange: (experience: Experience) => void;
}) {
  // What a no-equipment plan can't pull, under the bar switch: the level
  // counts once it's chosen (`noEquipmentPullNote`).
  const pullNote = noEquipmentPullNote(
    equipment,
    pullUpBar,
    experienceConfirmed ? experience : undefined
  );
  return (
    <>
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Equipment access</h2>
        {EQUIPMENT.map((option) => (
          <OptionCard
            key={option.id}
            selected={equipmentConfirmed && equipment === option.id}
            onSelect={() => {
              // A setup chosen anew starts from its own bar answer.
              if (option.id !== equipment)
                onPullUpBarChange(pullUpBarWhenChosen(option.id));
              onEquipmentChange(option.id);
            }}
            /* The kit each setup means, drawn: a machine, dumbbells on a
               bench, a dumbbell alone, no equipment at all. */
            icon={<ChoiceArt art={{ kind: "exercise", id: option.art }} />}
            label={option.label}
            desc={option.desc}
          />
        ))}
      </div>
      {/* With no equipment the one thing to add is a doorway bar: there
          are no plates to make small. */}
      {equipmentConfirmed &&
        (takesSmallPlates(equipment) || takesPullUpBar(equipment)) && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">What do you have?</h3>
              <p className="text-xs text-muted-foreground">
                Optional. The plan uses what you have.
              </p>
            </div>
            {takesBarbellAtHome(equipment) && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">
                    A barbell and a rack
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Squats, deadlifts and presses with the bar.
                  </p>
                </div>
                <Toggle
                  checked={barbellAtHome}
                  label="A barbell and a rack"
                  className="ml-3"
                  onChange={() => onBarbellAtHomeChange(!barbellAtHome)}
                />
              </div>
            )}
            {takesPullUpBar(equipment) && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">A pull-up bar</p>
                  <p className="text-xs text-muted-foreground">
                    A doorway bar works. Pull-ups and chin-ups.
                  </p>
                </div>
                <Toggle
                  checked={pullUpBar}
                  label="A pull-up bar"
                  className="ml-3"
                  onChange={() => onPullUpBarChange(!pullUpBar)}
                />
              </div>
            )}
            {takesSmallPlates(equipment) && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Small plates</p>
                  <p className="text-xs text-muted-foreground">
                    {smallPlatesHint(liftUnit)}
                  </p>
                </div>
                <Toggle
                  checked={smallPlates}
                  label="Small plates"
                  className="ml-3"
                  onChange={() => onSmallPlatesChange(!smallPlates)}
                />
              </div>
            )}
            {/* What a no-equipment plan can't train, under its bar switch,
                once, where the setup is chosen. */}
            {pullNote && (
              <p className="text-sm text-muted-foreground">{pullNote}</p>
            )}
          </div>
        )}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Lifting experience</h2>
        {EXPERIENCE.map((option) => (
          <OptionCard
            key={option.id}
            selected={experienceConfirmed && experience === option.id}
            onSelect={() => onExperienceChange(option.id)}
            icon={<ChoiceArt art={{ kind: "level", level: option.level }} />}
            label={option.label}
            desc={option.desc}
          />
        ))}
      </div>
    </>
  );
}
