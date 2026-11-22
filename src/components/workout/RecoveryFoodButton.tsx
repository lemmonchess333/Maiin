import { Button } from "@/components/ui/Button";

/** The finish screens' way to the food log once the session is saved, at
 *  the moment there is refuel intent (FOOD-02; App1 Q30: the lift's finish
 *  has it as the run's does). Secondary and skippable: it opens the
 *  existing composer, where Food says one refuel line for the sport
 *  (`recoveryFoodPath`), with no separate recovery-meal flow and no
 *  change to the target. Logging food is the food orange on any page,
 *  tinted here because it is the skippable step and Done is the screen's
 *  one filled button (DESIGN_GUIDE §14i). Each screen says where it goes,
 *  since a lift's screen leaves its page differently from a run's. */
export default function RecoveryFoodButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button variant="nutrition-tinted" fullWidth onClick={onClick}>
      Log recovery food
    </Button>
  );
}
