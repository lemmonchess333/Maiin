/**
 * Run14 — the ease-week nudge card (RUN-05).
 *
 * A quiet, evidence-first suggestion in the race-prep cockpit: the
 * athlete rated several recent runs harder than expected, so we offer
 * to ease this week. Presentational only — the parent
 * (ProgrammeRunSection) owns the trigger evaluation (easeWeekNudge),
 * the local cooldown/dismissal markers, and analytics; this just
 * renders the copy and the two actions.
 *
 * Never auto-opens anything; the CTA opens the existing AdjustWeekSheet
 * (preselected to the easier preview). Suggest + approve — the app
 * changes nothing until the user applies in the sheet (Run14a).
 */
import { Feather, X } from "lucide-react";
import { THEME } from "@/lib/theme";

interface Props {
  /** How many of the recent rated runs were "harder". */
  harderCount: number;
  /** The recent rated-run count inspected (the denominator). */
  ratedCount: number;
  /** Open AdjustWeekSheet on the easier-week preview. */
  onEase: () => void;
  /** Dismiss for the rest of this week. */
  onDismiss: () => void;
}

export default function EaseWeekNudgeCard({
  harderCount,
  ratedCount,
  onEase,
  onDismiss,
}: Props) {
  return (
    <div
      className="relative rounded-xl p-3 flex items-start gap-3"
      style={{
        background: `${THEME.running}0F`,
        border: `1px solid ${THEME.running}2E`,
      }}
    >
      <div
        className="flex size-9 items-center justify-center rounded-lg shrink-0"
        style={{ background: `${THEME.running}1A` }}
      >
        <Feather
          className="size-4"
          style={{ color: THEME.running }}
          aria-hidden
        />
      </div>
      <div className="flex-1 min-w-0 pr-5">
        <p className="text-sm font-semibold text-foreground">
          Take this week easier?
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          You rated{" "}
          <span className="font-mono tabular-nums">{harderCount}</span> of your
          last <span className="font-mono tabular-nums">{ratedCount}</span> runs
          harder than expected. Ease this week&apos;s quality runs — you decide.
        </p>
        <button
          type="button"
          onClick={onEase}
          className="mt-2 min-h-[36px] px-3 rounded-lg text-xs font-semibold text-white active:scale-[0.97] transition-transform"
          style={{ background: THEME.running }}
        >
          Ease this week
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 size-8 flex items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground active:scale-90 transition-all"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
