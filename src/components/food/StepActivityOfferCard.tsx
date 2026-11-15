import { useState } from "react";
import { Button } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { haptic } from "@/lib/haptic";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { isNativePlatform } from "@/lib/platform";
import { stepActivityOfferWords, stepsFeedTheTarget } from "@/lib/stepActivity";
import { useStepActivityOffer } from "@/hooks/useStepActivityOffer";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";

type OfferWords = ReturnType<typeof stepActivityOfferWords>;

/**
 * The activity level offer (whole-app grill Q31): last week's steps
 * disagree with the activity level the calorie target assumes, so Food
 * offers the level they fall in, with the target it sets, under the
 * wheel that shows the target. One tap takes it; "Keep" leaves the level
 * and the offer stays away for 30 days (Q5: a big change is offered).
 */
export default function StepActivityOfferCard({
  words,
  onAccept,
  onKeep,
}: {
  words: OfferWords;
  onAccept: () => Promise<void>;
  onKeep: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"accept" | "keep" | null>(null);
  const run = async (which: "accept" | "keep", action: () => Promise<void>) => {
    haptic(which === "accept" ? "medium" : "light");
    setBusy(which);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card as="section" aria-labelledby="step-offer-heading" className="mt-3">
      <h3
        id="step-offer-heading"
        className="text-sm font-semibold text-foreground text-pretty"
      >
        {words.heading}
      </h3>
      <p className="mt-1 text-sm text-foreground text-pretty">{words.line}</p>
      <p className="mt-1 text-sm text-foreground text-pretty">{words.target}</p>
      {words.caveat && (
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          {words.caveat}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="flex-1 min-w-[8rem]"
          disabled={busy !== null}
          loading={busy === "keep"}
          onClick={() => void run("keep", onKeep)}
        >
          {words.keep}
        </Button>
        <Button
          className="flex-1 min-w-[8rem]"
          disabled={busy !== null}
          loading={busy === "accept"}
          onClick={() => void run("accept", onAccept)}
        >
          {words.accept}
        </Button>
      </div>
    </Card>
  );
}

/**
 * The offer where steps can change the target: on the phone (Apple Health
 * is not on the web, so the web never reads steps and never shows this),
 * for a Pro account (Q45: the app using your body's data to adjust things
 * for you) whose target is the formula's, with no number of its own, and
 * not in a race taper, whose target is its own for those days.
 */
export function StepActivityOffer({ targets }: { targets: EffectiveTargets }) {
  if (!isNativePlatform()) return null;
  return <PhoneStepActivityOffer targets={targets} />;
}

function PhoneStepActivityOffer({ targets }: { targets: EffectiveTargets }) {
  const { profile } = useAuth();
  const { isPro } = useSubscription();
  const applies =
    stepsFeedTheTarget({
      isPro,
      adaptiveSource: targets.adaptiveSource,
      manualTarget: !!profile?.customCalorieTarget,
    }) && !targets.taperActive;
  if (!applies) return null;
  return <StepActivityOfferReader currentTarget={targets.finalTarget} />;
}

function StepActivityOfferReader({ currentTarget }: { currentTarget: number }) {
  const { offer, nextTarget, accept, keep } = useStepActivityOffer();
  if (!offer || nextTarget == null) return null;
  const words = stepActivityOfferWords(
    offer,
    { now: currentTarget, next: nextTarget },
    {
      steps: (n) => Math.round(n).toLocaleString(),
      kcal: (n) => `${formatCalories(n)} ${CALORIE_UNIT}`,
    }
  );
  return (
    <StepActivityOfferCard words={words} onAccept={accept} onKeep={keep} />
  );
}
