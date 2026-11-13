import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import type { Feel, Readiness } from "@/lib/readiness";

const FEELS: ReadonlyArray<readonly [Feel, string]> = [
  ["good", "Good"],
  ["tired", "Tired"],
  ["rough", "Rough"],
];

/**
 * Readiness on Home's lift hero, above Start (whole-app grill Q41, Q42).
 *
 * With nothing known it asks one question, "How do you feel today?", with
 * three answers. With an answer or a fact it says one word and the fact
 * behind it ("Steady · Hard run yesterday, and today loads the same legs"),
 * and on a Steady or Go easy day it offers the easier session as a quiet
 * link. Start stays the hero's one filled button (DESIGN_GUIDE §14m rule
 * 21): an easier session is offered, never made the default (Q40).
 *
 * "Change" clears the morning's answer so it can be given again; a fact
 * the app read cannot be changed here, only the person's own word.
 *
 * For Pro on the phone, before Health is asked, one quiet link adds sleep
 * and heart (Q76, as recommended); a free account sees no link here.
 */
export default function ReadinessStrip({
  readiness,
  feel,
  onFeel,
  onEasier,
  easierSummary,
  onConnectBody = null,
}: {
  readiness: Readiness;
  feel: Feel | null;
  onFeel: (feel: Feel | null) => void;
  onEasier: () => void;
  /** What the easier session changes ("one set less per lift, lighter loads"). */
  easierSummary: string;
  /** Pro on the phone, before Health has been asked: one quiet link to add
   *  sleep and heart. Null hides it. */
  onConnectBody?: (() => Promise<void>) | null;
}) {
  const connectLink = onConnectBody ? (
    <button
      type="button"
      className="pointer-events-auto mt-1 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-2"
      onClick={function () {
        haptic("light");
        void onConnectBody();
      }}
    >
      Add sleep and heart from Apple Health
    </button>
  ) : null;
  if (readiness.word === null) {
    return (
      <div
        role="group"
        aria-label="How do you feel today?"
        className="pointer-events-auto"
      >
        <p className="text-sm font-semibold text-foreground">
          How do you feel today?
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FEELS.map(([value, label]) => (
            <Button
              key={value}
              variant="outline"
              onClick={function () {
                haptic("light");
                onFeel(value);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        {connectLink}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{readiness.word}</span>
        {readiness.line && <> · {readiness.line}</>}
        {feel !== null && (
          <>
            {" "}
            <button
              type="button"
              className="inline-flex min-h-11 items-center px-1 font-medium text-foreground underline underline-offset-2"
              onClick={function () {
                onFeel(null);
              }}
            >
              Change
            </button>
          </>
        )}
      </p>
      {readiness.offerEasier && (
        /* A quiet text link, not a button shape: Start stays the hero's
           one filled control (§14m rule 21), and the link reads as the
           sentence it is. */
        <button
          type="button"
          className="mt-1 flex min-h-11 w-full items-center text-left text-sm"
          onClick={function () {
            haptic("light");
            onEasier();
          }}
        >
          <span>
            <span className="font-semibold text-foreground underline underline-offset-2">
              Go easier today
            </span>{" "}
            <span className="text-muted-foreground">· {easierSummary}</span>
          </span>
        </button>
      )}
      {connectLink}
    </div>
  );
}
