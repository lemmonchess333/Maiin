/**
 * Plan a meet-up in a Circle (Run26 call 4): run or lift, a name, a day
 * and a time, where to meet, and a note if there is something to know.
 * A run may carry its pace groups, and any meet-up may repeat every week
 * (Run27 call 10): the server plans the next when this one ends.
 *
 * The day and the time are this phone's (the native inputs), sent as one
 * instant with this phone's zone, so every member sees the start in their
 * own time. The place is words, never a pin: GsPb1 keeps coordinates out
 * of a Circle. The words meet the word filter here, and the server's
 * after it.
 */
import { useState } from "react";
import { haptic } from "@/lib/haptic";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import {
  MEETUP_MAX_AHEAD_MS,
  MEETUP_NOTE_MAX,
  MEETUP_PACE_GROUPS_MAX,
  MEETUP_PLACE_MAX,
  MEETUP_SPORTS,
  MEETUP_TITLE_MAX,
  deviceTimeZone,
  meetupPlanProblem,
  startsAtFromInputs,
  type MeetupPlan,
  type MeetupSport,
} from "@/features/goalSpace/circleMeetups";

const SPORT_LABEL: Record<MeetupSport, string> = {
  run: "Run",
  lift: "Lift",
};

const TITLE_PLACEHOLDER: Record<MeetupSport, string> = {
  run: "Name it (e.g. Saturday long run)",
  lift: "Name it (e.g. Thursday legs)",
};

export default function CircleMeetupSheet({
  open,
  onOpenChange,
  defaultSport,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sport the sheet starts on: the Circle's goal's. */
  defaultSport: MeetupSport;
  busy: boolean;
  /** Sends the plan; the parent closes the sheet once it is saved. */
  onSubmit: (plan: MeetupPlan) => Promise<unknown>;
}) {
  const [sport, setSport] = useState<MeetupSport>(defaultSport);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [paceGroups, setPaceGroups] = useState("");
  const [note, setNote] = useState("");
  const [weekly, setWeekly] = useState(false);
  /* What the last tap of Plan it found missing; cleared by any edit. */
  const [problem, setProblem] = useState<string | null>(null);

  /* A fresh sheet each time it opens, on the Circle's own sport. */
  const [openedFor, setOpenedFor] = useState({ open, defaultSport });
  if (openedFor.open !== open || openedFor.defaultSport !== defaultSport) {
    setOpenedFor({ open, defaultSport });
    if (open) {
      setSport(defaultSport);
      setTitle("");
      setDay("");
      setTime("");
      setPlace("");
      setPaceGroups("");
      setNote("");
      setWeekly(false);
      setProblem(null);
    }
  }

  /** Any field's change clears the line that said what was missing. */
  const edit =
    (set: (value: string) => void) => (e: { target: { value: string } }) => {
      set(e.target.value);
      setProblem(null);
    };
  const today = new Date();
  const lastDay = localDateString(
    addLocalDays(today, Math.floor(MEETUP_MAX_AHEAD_MS / 86_400_000) - 1)
  );

  const submit = async () => {
    const startsAt = startsAtFromInputs(day, time);
    const found = meetupPlanProblem(
      { title, place, note, startsAt },
      Date.now()
    );
    setProblem(found);
    if (found || startsAt === null) return;
    haptic("light");
    // Pace groups are a run's: switching to Lift keeps what was typed in
    // case of a switch back, and sends none.
    const pace = sport === "run" ? paceGroups.trim() : "";
    await onSubmit({
      sport,
      title: title.trim(),
      place: place.trim(),
      note: note.trim() ? note.trim() : null,
      paceGroups: pace ? pace : null,
      repeat: weekly ? "weekly" : null,
      startsAt,
      timeZone: deviceTimeZone(),
    });
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Plan a meet-up"
      description="Only this circle sees it. Each member sees the time in their own time zone."
    >
      <div className="px-4 space-y-3 pb-2">
        <SegmentedControl
          ariaLabel="Run or lift"
          options={MEETUP_SPORTS.map((s) => ({
            value: s,
            label: SPORT_LABEL[s],
          }))}
          value={sport}
          onChange={(s) => {
            haptic("light");
            setSport(s);
          }}
        />
        <input
          type="text"
          value={title}
          onChange={edit(setTitle)}
          maxLength={MEETUP_TITLE_MAX}
          placeholder={TITLE_PLACEHOLDER[sport]}
          aria-label="Meet-up name"
          className="ds-input text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <label className="block min-w-[9em] flex-1 space-y-1">
            <span className="text-xs font-semibold text-foreground">Day</span>
            <input
              type="date"
              value={day}
              min={localDateString(today)}
              max={lastDay}
              onChange={edit(setDay)}
              className="ds-input block w-full min-w-0 max-w-full appearance-none text-sm"
            />
          </label>
          <label className="block min-w-[7em] flex-1 space-y-1">
            <span className="text-xs font-semibold text-foreground">Time</span>
            <input
              type="time"
              value={time}
              onChange={edit(setTime)}
              className="ds-input block w-full min-w-0 max-w-full appearance-none text-sm"
            />
          </label>
        </div>
        <input
          type="text"
          value={place}
          onChange={edit(setPlace)}
          maxLength={MEETUP_PLACE_MAX}
          placeholder="Where to meet (e.g. Tooting Lido gate)"
          aria-label="Where to meet"
          className="ds-input text-sm"
        />
        {sport === "run" && (
          <input
            type="text"
            value={paceGroups}
            onChange={edit(setPaceGroups)}
            maxLength={MEETUP_PACE_GROUPS_MAX}
            placeholder="Pace groups (optional, e.g. 5:30 and 6:15 /km)"
            aria-label="Pace groups"
            className="ds-input text-sm"
          />
        )}
        <textarea
          value={note}
          onChange={edit(setNote)}
          maxLength={MEETUP_NOTE_MAX}
          rows={2}
          placeholder="Anything to know (optional)"
          aria-label="Note"
          className="ds-input text-sm resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-foreground">Every week</p>
            <p className="text-xs text-muted-foreground">
              The next one appears when this one ends.
            </p>
          </div>
          <Toggle
            checked={weekly}
            onChange={() => {
              haptic("light");
              setWeekly((on) => !on);
            }}
            label="Every week"
          />
        </div>
        {problem && (
          <p className="text-xs text-muted-foreground" role="alert">
            {problem}
          </p>
        )}
        <Button className="w-full" loading={busy} onClick={() => void submit()}>
          Plan it
        </Button>
      </div>
    </BottomSheet>
  );
}
