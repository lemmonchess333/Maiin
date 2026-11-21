import { Users } from "lucide-react";
import {
  FILLING_UP,
  PEOPLE_COUNT_MIN_VISIBLE,
  roomPeople,
} from "@/lib/fillingUp";
import { cn } from "@/lib/utils";

/**
 * Who is in a challenge, in one short line (App1 Q6, `src/lib/fillingUp.ts`):
 * "12 joined" from 3, and "Filling up" under it, since a challenge is
 * offered from a person's first day however few have joined. "0 joined"
 * was the loudest empty-room signal on Together, and a count is never
 * made up. Draws nothing while the count is not a number.
 */
export default function ChallengePeople({
  count,
  className,
}: {
  /** The challenge's `participantCount`, kept by the server. */
  count: unknown;
  className?: string;
}) {
  const people = roomPeople(count, PEOPLE_COUNT_MIN_VISIBLE);
  if (!people) return null;
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Users className="size-3.5 shrink-0" aria-hidden="true" />
      {people === "fillingUp" ? (
        <span>{FILLING_UP}</span>
      ) : (
        <span>
          <span className="font-mono tabular-nums">
            {people.count.toLocaleString()}
          </span>{" "}
          joined
        </span>
      )}
    </span>
  );
}
