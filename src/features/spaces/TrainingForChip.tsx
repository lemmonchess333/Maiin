import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { spaceDef } from "./spaceDefs";
import { resolveRaceEvent, useRaceEventOverrides } from "./raceEventOverrides";
import { localDateString } from "@/lib/dateHelpers";
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

  // Whole weeks until race day — glanceable, and honest at 0 ("race week").
  const msOut =
    new Date(`${event.dateKey}T00:00:00`).getTime() -
    new Date(`${today}T00:00:00`).getTime();
  const weeksOut = Math.floor(msOut / (7 * 86_400_000));

  return (
    <Link
      to={`/space/${def.id}`}
      className="relative inline-flex items-center gap-1.5 min-h-[28px] px-2.5 py-1 rounded-full text-xs font-semibold active:scale-[0.97] transition-transform before:content-[''] before:absolute before:inset-x-0 before:-inset-y-2"
      style={{ background: `${THEME.running}14`, color: THEME.running }}
    >
      <Flag className="size-3.5" aria-hidden />
      Training for {def.name}
      {weeksOut > 0 && (
        <span className="font-mono tabular-nums font-medium opacity-80">
          · {weeksOut} wk{weeksOut === 1 ? "" : "s"}
        </span>
      )}
      {weeksOut === 0 && (
        <span className="font-medium opacity-80">· race week</span>
      )}
    </Link>
  );
}
