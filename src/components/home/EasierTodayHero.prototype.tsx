/**
 * PROTOTYPE, throwaway (claude/prototype-three-features).
 *
 * Question: how should Home offer "Go easier today" (spec feature 1,
 * call 2)? Three variants on Home's real hero, with a stub leg day after a
 * hard run. Stub data only: nothing is read or written.
 *
 *   A  Only with a reason: the link shows when the app knows one (Lift4).
 *   B  Always a choice: the link every day; the reason joins it when known.
 *   C  Morning question: one tap before the session; Tired or Rough makes
 *      the easier session the main button.
 *
 * `?reason=0` shows the same variant on a day with no reason.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import SessionHero from "@/components/home/SessionHero";
import { formArtCutoutUrl, getFormArtCutout } from "@/lib/formArtCutouts";
import { heroMotionFor } from "@/lib/heroMotion";
import PrototypeSwitcher from "@/components/dev/PrototypeSwitcher";

const EASIER_VARIANTS = [
  ["A", "Only with a reason"],
  ["B", "Always a choice"],
  ["C", "Morning question"],
] as const;

const REASON = "Hard run yesterday, and this session works the same legs";
const EASIER = "one set less per lift, lighter loads";

type Answer = "good" | "tired" | "rough" | null;

export default function EasierTodayHeroPrototype({
  variant,
}: {
  variant: string;
}) {
  const [params] = useSearchParams();
  const hasReason = params.get("reason") !== "0";
  const [answer, setAnswer] = useState<Answer>(null);
  const [started, setStarted] = useState<string | null>(null);

  const cutout =
    getFormArtCutout("goblet-squat") ?? getFormArtCutout("front-squat");
  const src = cutout ? formArtCutoutUrl(cutout) : null;
  const picture = src
    ? { src, motion: cutout ? heroMotionFor(cutout.src) : null }
    : null;

  const answerEases = answer === "tired" || answer === "rough";
  const shownReason =
    variant === "C" && answerEases
      ? answer === "tired"
        ? "You said you're tired today"
        : "You said you're feeling rough"
      : variant === "C" && answer === "good"
        ? null
        : hasReason
          ? REASON
          : null;
  const showLink =
    variant === "A" ? shownReason !== null : variant === "B" ? true : false; // C asks instead; a known reason sits in the question card

  const start = (how: string) => () => setStarted(how);

  const action = started ? (
    <p className="pointer-events-auto rounded-xl bg-muted p-3 text-sm font-medium text-foreground">
      Prototype: the {started} session would open here. The plan is unchanged.
    </p>
  ) : (
    <div className="pointer-events-auto space-y-3">
      {variant === "C" && answer === null && (
        <div className="rounded-xl border border-border bg-card p-3">
          {hasReason && (
            <p className="mb-1 text-sm text-muted-foreground">{REASON}.</p>
          )}
          <p className="text-sm font-semibold text-foreground">
            How do you feel today?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["good", "Good"],
                ["tired", "Tired"],
                ["rough", "Rough"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => setAnswer(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {variant === "C" && answerEases ? (
        <>
          <Button
            variant="neutral"
            className="w-full text-base"
            onClick={start("easier")}
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
            Start easier session
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {shownReason}. Easier: {EASIER}.
          </p>
          <Button variant="ghost" className="w-full" onClick={start("full")}>
            Full session
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="neutral"
            className="w-full text-base"
            onClick={start("full")}
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
            Start workout
          </Button>
          {showLink && (
            <div className="text-center">
              {shownReason && (
                <p className="text-sm text-muted-foreground">{shownReason}</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={start("easier")}
                className="mt-0.5 text-lifting-strong"
              >
                Go easier today · {EASIER}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <SessionHero
        sport="lift"
        title="Lower A"
        meta={["Legs and glutes", "about 50 min"]}
        picture={picture}
        line={{
          title: "Goblet squat 24 kg × 10",
          detail: "2 kg more than last time",
          mark: "up",
        }}
        action={action}
      />
      <PrototypeSwitcher variants={EASIER_VARIANTS} />
    </>
  );
}
