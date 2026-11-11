import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { spaceDef } from "./spaceDefs";
import { resolveRaceEvent, useRaceEventOverrides } from "./raceEventOverrides";
import { localDateString, wholeWeeksBetween } from "@/lib/dateHelpers";
import { THEME } from "@/lib/theme";

/**
 * SOC-P2f — the "Training for {race}" identity chip (Runna's race-anchor
 * pattern: the race you're training for IS your social identity).
 *
 * Renders from a public-profile `trainingForSpaceId` value. Display is
 * the safety net for the self-declared field: the chip only renders
 * when the id resolves to a KNOWN race-kind space whose (override-
 * resolved) event date hasn't passed — a stale value after race day, or
 * a non-race id that slipped through, degrades to NOTHING rather than a
 * lie. Coral = running identity; links into the race space.
 */
export default function TrainingForChip({ spaceId }: { spaceId: string }) {
  const overrides = useRaceEventOverrides();
  const def = spaceDef(spaceId);
  if (!def || def.kind !== "race") return null;
  const event = resolveRaceEvent(def, overrides);
  const today = localDateString();
  if (!event || event.dateKey < today) return null;

  const weeksOut = wholeWeeksBetween(today, event.dateKey);

  /* The words and the weeks are one run of text, so the chip wraps as a
     line of text does: "· 23 wks" stays on the line with the race's name
     or moves under it whole. As flex items of their own, the name wrapped
     inside its box and the weeks stood beside it as a narrow column. The
     corner is rounded-2xl, not full: still a pill on one line, where it is
     more than half the height, and no stadium ends cutting into a second
     line. */
  return (
    <Link
      to={`/space/${def.id}`}
      className="relative inline-flex max-w-full items-center gap-1.5 min-h-[28px] px-2.5 py-1 rounded-2xl text-xs font-semibold active:scale-[0.97] transition-transform before:content-[''] before:absolute before:inset-x-0 before:-inset-y-2"
      style={{ background: `${THEME.running}14`, color: THEME.running }}
    >
      <Flag className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">
        Training for {def.name}
        {weeksOut > 0 && (
          <>
            {" "}
            <span className="whitespace-nowrap font-mono tabular-nums font-medium opacity-80">
              · {weeksOut} wk{weeksOut === 1 ? "" : "s"}
            </span>
          </>
        )}
        {weeksOut === 0 && (
          <>
            {" "}
            <span className="whitespace-nowrap font-medium opacity-80">
              · race week
            </span>
          </>
        )}
      </span>
    </Link>
  );
}
