/**
 * A Circle's meet-ups in its sheet (Run26 call 4): what is coming up, when
 * and where, who is in, and the one answer the viewer can give. The
 * organiser is in by planning it and can call it off, as can the Circle's
 * owner; any other member says they're in or that they can't make it.
 *
 * Calling one off asks first, in the card itself: a dialog over the sheet
 * would sit outside the sheet's focus trap.
 *
 * Presentational: the reads and the callable live in `useGoalSpaces`, and
 * CirclesSection hands the answers in. Times show in this phone's zone
 * (`meetupWhen`); names come from the Circle's own member docs.
 */
import { useState } from "react";
import { CalendarPlus, Dumbbell, Footprints, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import {
  goingLine,
  goingMembers,
  meetupWhen,
  type CircleMeetup,
} from "@/features/goalSpace/circleMeetups";
import type { GoalSpaceMember } from "@/features/goalSpace/goalSpaceTypes";

export default function CircleMeetupList({
  meetups,
  members,
  viewerUid,
  ownerUid,
  canPlan,
  busyId,
  onPlan,
  onAnswer,
  onCancel,
}: {
  /** Already filtered to the ones not yet over, soonest first. */
  meetups: readonly CircleMeetup[];
  members: readonly GoalSpaceMember[];
  viewerUid: string;
  ownerUid: string;
  /** False in an ended Circle and in a Circle of one that its owner can
   *  invite to, where a plan reaches nobody. */
  canPlan: boolean;
  /** The meet-up an answer or a call-off is in flight for. */
  busyId: string | null;
  onPlan: () => void;
  onAnswer: (meetup: CircleMeetup, going: boolean) => void;
  onCancel: (meetup: CircleMeetup) => void;
}) {
  /* The meet-up whose call-off is waiting on a second tap. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  if (meetups.length === 0 && !canPlan) return null;
  return (
    <section className="space-y-2" aria-label="Meet-ups">
      <SectionHeading size="compact" as="h3">
        Coming up
      </SectionHeading>
      {meetups.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Plan a run or a lift, with a time and a place, and the circle can say
          they’re in.
        </p>
      )}
      {meetups.length > 0 && (
        <ul className="space-y-2">
          {meetups.map((m) => {
            const organiser = m.organiserUid === viewerUid;
            const going = m.going.includes(viewerUid);
            const canCancel = organiser || ownerUid === viewerUid;
            const busy = busyId === m.id;
            const Icon = m.sport === "lift" ? Dumbbell : Footprints;
            return (
              <li
                key={m.id}
                className="rounded-xl bg-muted p-3 space-y-2"
                data-testid="circle-meetup"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background"
                  >
                    <Icon
                      className={
                        m.sport === "lift"
                          ? "size-4 text-lifting-strong"
                          : "size-4 text-running-strong"
                      }
                    />
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground break-words">
                      {m.title}
                    </p>
                    <p className="text-xs font-medium text-foreground font-mono tabular-nums">
                      {meetupWhen(m.startsAt)}
                    </p>
                    <p className="flex items-start gap-1 text-xs text-muted-foreground break-words">
                      <MapPin
                        className="mt-px size-3.5 shrink-0"
                        aria-label="Where"
                      />
                      <span className="min-w-0">{m.place}</span>
                    </p>
                    {m.note && (
                      <p className="text-xs text-muted-foreground break-words">
                        {m.note}
                      </p>
                    )}
                    <p className="text-xs text-foreground">
                      {goingLine(goingMembers(m, members), viewerUid)}
                    </p>
                  </div>
                </div>
                {confirmingId === m.id ? (
                  <div
                    className="space-y-2"
                    role="group"
                    aria-label="Call it off?"
                  >
                    <p className="text-xs text-foreground">
                      Call it off? Anyone who said they’re in will be told.
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingId(null)}
                      >
                        Keep it
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        loading={busy}
                        onClick={() => {
                          setConfirmingId(null);
                          onCancel(m);
                        }}
                      >
                        Call it off
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-end gap-2">
                    {!organiser &&
                      (going ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busy}
                          onClick={() => onAnswer(m, false)}
                        >
                          Can’t make it
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy}
                          onClick={() => onAnswer(m, true)}
                        >
                          I’m in
                        </Button>
                      ))}
                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmingId(m.id)}
                      >
                        Call it off
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canPlan && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          leftIcon={<CalendarPlus className="size-4" aria-hidden />}
          onClick={onPlan}
        >
          Plan a meet-up
        </Button>
      )}
    </section>
  );
}
