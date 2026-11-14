/**
 * The weekly review's ending (App1 Q36): the week ahead as the plan holds
 * it, and any change the app offers for it, each taken in one tap.
 *
 * Rev1 made the review a passive recap; Q36 makes its last card where next
 * week is agreed. It shows the seven days (`weekAheadView`, the week Home
 * and Train read), then the offers (`reviewWeekOffers`: the ones Home's
 * sheets and Train's banner already make, through the same commands), then
 * one button. With nothing offered the button is "Looks good". With an
 * offer still open it is "Keep my plan", which sets each one aside as its
 * own "Not now" does, so Home and Train do not ask again that week.
 *
 * The plan is read live (`useHomeProgram`): opened from Monday's
 * notification before Home, the review still shows the week after its
 * rollover, and the commands run through the same engine Home's run.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useHomeProgram } from "@/features/program/useHomeProgram";
import {
  raceCheckDismissKey,
  raceLongRunCheck,
} from "@/features/program/raceLongRunCheck";
import { lighterWeekAllowed } from "@/features/program/weekPrescription";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useSavedRuns } from "@/hooks/useSavedRuns";
import { usePaceInsightFromRuns } from "@/hooks/usePaceInsight";
import {
  localDateString,
  parseLocalDate,
  rollingWindowStart,
} from "@/lib/dateHelpers";
import type { DistanceUnit } from "@/lib/distanceUnits";
import {
  loadFromRunning,
  shouldSuggestDeload,
} from "@/lib/deloadSuggestVisibility";
import { haptic } from "@/lib/haptic";
import { resolveDeloadRecommended } from "@/lib/performanceDocFields";
import { planDeloadWeek } from "@/lib/planDeloadWeek";
import { deloadDismissKey } from "@/lib/programNotices";
import { realignResultMessage } from "@/lib/realignCopy";
import {
  reviewWeekOffers,
  type WeekOffer,
  type WeekOfferKind,
} from "@/lib/reviewWeekOffers";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  weekAheadView,
  type WeekAheadDay,
  type WeekAheadView,
} from "@/lib/weekAhead";
import { formatShortWeekday, formatWeekdayDayMonth } from "@/utils/formatters";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import MomentumCheckinCard from "./MomentumCheckinCard";

type HomeProgram = ReturnType<typeof useHomeProgram>;

/** Where one offer stands on the card (docs/state-machines.md): open to
 *  take, being taken or routed, taken (with its result), or being undone. */
type OfferStatus = "open" | "busy" | "done" | "undoing";

interface OfferCardState {
  offer: WeekOffer;
  status: OfferStatus;
  /** What the offer did, once taken. */
  line: string | null;
}

/** The offers in the order the card shows them. The two race-plan offers
 *  never show together: the weekly check's prompt speaks first. */
const ORDER: readonly WeekOfferKind[] = [
  "fell-behind",
  "race-check",
  "lighter-week",
  "paces",
];
const REALIGN: readonly WeekOfferKind[] = ["fell-behind", "race-check"];

/** How far back new paces read a race or tempo: the run summary's window. */
const PACE_WINDOW_DAYS = 90;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "5 sessions planned, 3 lifts and 2 runs": the recap's first-card form. */
function plannedCaption(lifts: number | null, runs: number | null): string {
  if (lifts !== null && runs !== null) {
    return `${plural(lifts + runs, "session", "sessions")} planned, ${lifts} ${plural(lifts, "lift", "lifts")} and ${runs} ${plural(runs, "run", "runs")}`;
  }
  if (lifts !== null) return `${plural(lifts, "lift", "lifts")} planned`;
  return `${plural(runs ?? 0, "run", "runs")} planned`;
}

function DayRow({ day }: { day: WeekAheadDay }) {
  const date = parseLocalDate(day.dateKey);
  const quiet = day.past || day.beforeStart;
  return (
    <li className="flex min-h-11 items-start gap-3 py-2">
      {/* In ems, so the column grows with larger text and "Today" stays
          inside it. */}
      <p className="w-[3.5em] shrink-0 text-sm leading-snug">
        <span className="sr-only">
          {day.isToday ? "Today, " : ""}
          {formatWeekdayDayMonth(date)}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "block font-semibold",
            quiet ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {day.isToday ? "Today" : formatShortWeekday(date)}
        </span>
        <span
          aria-hidden="true"
          className="block font-mono text-xs tabular-nums text-muted-foreground"
        >
          {date.getDate()}
        </span>
      </p>
      <div
        className={cn(
          "min-w-0 flex-1 space-y-1 text-sm leading-snug",
          quiet ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {day.beforeStart ? (
          <p className="text-muted-foreground">Before you started</p>
        ) : !day.lift && !day.run ? (
          <p className="text-muted-foreground">Rest</p>
        ) : (
          <>
            {day.lift && (
              <p className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-lifting"
                />
                Lift
              </p>
            )}
            {day.run && (
              <p className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-running"
                />
                <span className="min-w-0">
                  {day.run.name}
                  {day.run.dose && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {day.run.dose}
                    </span>
                  )}
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** The week ahead's figure, its seven days and the lifts' order. */
function WeekPlan({
  view,
  loading,
  className,
}: {
  view: WeekAheadView;
  /** The plan is still being read: the days wait rather than show a week
   *  without its runs. */
  loading: boolean;
  className?: string;
}) {
  const { days, lifts, runs, liftOrder, planLine } = view;
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading the week ahead"
        className={cn(
          "h-72 rounded-2xl bg-muted motion-safe:animate-pulse",
          className
        )}
      />
    );
  }
  return (
    <div className={cn("space-y-4", className)}>
      {planLine && <p className="text-sm text-muted-foreground">{planLine}</p>}
      {lifts !== null || runs !== null ? (
        <div>
          <p className="text-display font-extrabold leading-none font-figure tabular-nums text-foreground">
            {(lifts ?? 0) + (runs ?? 0)}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {plannedCaption(lifts, runs)}
          </p>
        </div>
      ) : (
        <p className="text-base text-muted-foreground">
          Train when it suits you. Log it and it counts.
        </p>
      )}
      <ul aria-label="Your week" className="divide-y divide-border/60">
        {days.map((day) => (
          <DayRow key={day.dateKey} day={day} />
        ))}
      </ul>
      {/* Lifts follow their order, not a weekday (ADR-0002): the order is
          said once, as Train's plan says it. */}
      {liftOrder.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Lifts in order: {liftOrder.join(" · ")}
        </p>
      )}
    </div>
  );
}

function OfferCard({
  offer,
  status,
  busyAction,
  line,
  locked,
  onAccept,
  onRoute,
  onUndo,
}: {
  offer: WeekOffer;
  status: OfferStatus;
  /** Which of its buttons is under way, while `status` is "busy". */
  busyAction: "accept" | "route" | null;
  /** The result, once taken. */
  line: string | null;
  /** Another offer, or closing, is under way. */
  locked: boolean;
  onAccept: () => void;
  onRoute: () => void;
  onUndo: () => void;
}) {
  /* The screen's one filled button is "Looks good" (§14i): an offer's
     action is its sport's tinted form, or a neutral one for a change to
     both sports. */
  const lead = offer.sport === "run" ? "sport-tinted" : "secondary";
  const taken = status === "done" || status === "undoing";
  const accept = (
    <Button
      key="accept"
      variant={offer.routeFirst ? "ghost" : lead}
      loading={status === "busy" && busyAction === "accept"}
      disabled={locked || status === "busy"}
      onClick={onAccept}
    >
      {offer.acceptLabel}
    </Button>
  );
  const route = offer.route && (
    <Button
      key="route"
      variant={offer.routeFirst ? lead : "ghost"}
      loading={status === "busy" && busyAction === "route"}
      disabled={locked || status === "busy"}
      onClick={onRoute}
    >
      {offer.route.label}
    </Button>
  );
  return (
    <section
      aria-label={offer.title}
      className="space-y-2 rounded-2xl bg-card p-4 card-shadow"
    >
      <SectionHeading size="compact" as="h3">
        {offer.title}
      </SectionHeading>
      {taken ? (
        <>
          <p role="status" className="text-sm text-foreground">
            {line}
          </p>
          {offer.undoable && (
            <Button
              variant="ghost"
              loading={status === "undoing"}
              disabled={locked}
              onClick={onUndo}
            >
              Undo
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{offer.reason}</p>
          {offer.change && (
            <p className="text-sm text-muted-foreground">{offer.change}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {offer.routeFirst ? [route, accept] : [accept, route]}
          </div>
        </>
      )}
    </section>
  );
}

/** Swallows a rejection: a step whose failure is already said, or that
 *  only sets an offer aside. */
async function settle(step: Promise<unknown>): Promise<void> {
  try {
    await step;
  } catch {
    /* said by the writer, or nothing to say */
  }
}

/**
 * The offers and the closing button. Its own component so its reads (the
 * score's last week, the runs new paces come from) are made only on the
 * review's last card, not on the page before a first review.
 */
function WeekAgreement({
  program,
  todayKey,
  unit,
  onClose,
  children,
}: {
  program: HomeProgram;
  todayKey: string;
  unit: DistanceUnit;
  onClose: () => void;
  /** Why the person trains and the check-in, between the offers and the
   *  button. */
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const programState = program.programState;

  /* Train's lighter-week offer, as Train decides it (Program.tsx), set
     aside per programme week under Train's own key. The one place the
     review asks: when Train's decision carries its words for the reason
     that fired, this hands them on as `why`. */
  const { currentWeek: perfWeek } = usePerformanceWeeks(2);
  const deloadNotice = useDismissOnce(
    deloadDismissKey(`w${programState?.weekNumber ?? 1}`)
  );
  const raceGoal = resolveRunPlan(profile, programState, todayKey).raceGoal;
  const lighterWeek: { why: string | null } | null =
    programState &&
    !deloadNotice.dismissed &&
    shouldSuggestDeload({
      deloadRecommended: resolveDeloadRecommended(perfWeek),
      loadFromRunning: loadFromRunning(perfWeek),
      lighterWeekAllowed: lighterWeekAllowed(programState),
      currentWeek: programState.runPlan?.currentWeek,
      totalWeeks: programState.runPlan?.totalWeeks,
      distance: raceGoal?.distance as
        "5k" | "10k" | "half" | "marathon" | undefined,
    })
      ? { why: null }
      : null;

  /* Home's race check (Run24 (11)), set aside per week under Home's key. */
  const raceCheck = useMemo(
    () =>
      raceLongRunCheck({
        profile,
        programState,
        recentRuns: program.recentRuns,
        today: todayKey,
      }),
    [profile, programState, program.recentRuns, todayKey]
  );
  const raceCheckNotice = useDismissOnce(
    raceCheckDismissKey(raceCheck?.weekKey ?? null)
  );
  const raceModeActive = profile?.runMode === "race_prep" && !!profile.raceGoal;
  const prompt = programState?.pendingFellBehindPrompt;

  /* New paces, as the run summary offers them to every account (Run24
     (4)). Read only for someone with paces to change. */
  const paceWindow = useMemo(
    () =>
      profile?.runFitness
        ? {
            since: localDateString(
              rollingWindowStart(PACE_WINDOW_DAYS, parseLocalDate(todayKey))
            ),
            until: todayKey,
          }
        : null,
    [profile?.runFitness, todayKey]
  );
  const paceRuns = useSavedRuns(paceWindow);
  const pace = usePaceInsightFromRuns(paceRuns.runs, {
    enabled: paceWindow !== null,
    loading: paceRuns.loading,
    everyAccount: true,
  });
  /* An offer the person's plan cannot take, where the controller marks one
     (`locked`: new paces that are Pro's): the review is no paywall (Rev1
     Q7), so it is not offered here. */
  const paceLocked = "locked" in pace && pace.locked === true;

  const offers = reviewWeekOffers({
    fellBehind:
      raceModeActive && prompt
        ? {
            realRunCount: prompt.realRunCount,
            weeklyTarget: prompt.weeklyTarget,
          }
        : null,
    recentLayoff: program.recentLayoff,
    raceCheck:
      raceCheck && !raceCheckNotice.dismissed && profile?.raceGoal
        ? { ...raceCheck, distance: profile.raceGoal.distance }
        : null,
    lighterWeek:
      lighterWeek && programState
        ? {
            why: lighterWeek.why,
            liftSessions: programState.workouts.filter(
              (workout) => !workout.completed && !workout.skipped
            ).length,
            runsEased: planDeloadWeek(programState.runDays ?? [], todayKey)
              .length,
          }
        : null,
    paces:
      pace.insight && !paceLocked
        ? {
            direction: pace.insight.direction,
            currentVdot: pace.insight.currentVdot,
            suggestedVdot: pace.insight.suggestedVdot,
          }
        : null,
    unit,
  });

  /* An offer being taken, routed or undone, held as it was tapped: the
     live plan can stop offering it before the command answers. */
  const [pending, setPending] = useState<{
    offer: WeekOffer;
    action: "accept" | "route" | "undo";
  } | null>(null);
  /* The offers taken here, with what each did. */
  const [taken, setTaken] = useState<
    Partial<Record<WeekOfferKind, { offer: WeekOffer; line: string }>>
  >({});
  const [closing, setClosing] = useState(false);

  const realignTaken = REALIGN.some((kind) => taken[kind]);
  const cards = ORDER.flatMap((kind): OfferCardState[] => {
    const done = taken[kind];
    const mine = pending?.offer.kind === kind ? pending : null;
    if (done) {
      const status = mine?.action === "undo" ? "undoing" : "done";
      return [{ offer: done.offer, status, line: done.line }];
    }
    if (mine) return [{ offer: mine.offer, status: "busy", line: null }];
    if (realignTaken && REALIGN.includes(kind)) return [];
    const live = offers.find((offer) => offer.kind === kind);
    return live ? [{ offer: live, status: "open", line: null }] : [];
  });
  const open = cards.filter((card) => card.status === "open");

  async function accept(offer: WeekOffer) {
    if (pending || closing) return;
    haptic("light");
    setPending({ offer, action: "accept" });
    let line: string | null = null;
    try {
      if (offer.kind === "fell-behind" || offer.kind === "race-check") {
        const result = await program.realignRacePlan();
        // A refusal or a failed save has already been said by the writer.
        if (result.status === "applied") {
          line = profile?.raceGoal
            ? realignResultMessage({
                timing: result.timing,
                distance: profile.raceGoal.distance as
                  "5k" | "10k" | "half" | "marathon",
                totalWeeks: result.totalWeeks,
              })
            : "Plan realigned.";
          if (offer.kind === "race-check") raceCheckNotice.dismiss();
        }
      } else if (offer.kind === "lighter-week") {
        if (await program.applyDeloadWeek()) line = offer.doneLine;
        else
          toast.error(
            "Couldn’t take a lighter week. Check your connection and try again."
          );
      } else {
        const result = await pace.accept();
        if (result === "success") line = offer.doneLine;
        else if (result === "failure")
          toast.error("Couldn’t update your paces. Try again.");
      }
    } catch {
      toast.error(
        "Couldn’t change your plan. Check your connection and try again."
      );
    }
    if (line) {
      haptic("success");
      const result = line;
      setTaken((now) => ({ ...now, [offer.kind]: { offer, line: result } }));
    }
    setPending(null);
  }

  async function undo(offer: WeekOffer) {
    if (pending || closing) return;
    haptic("light");
    setPending({ offer, action: "undo" });
    let undone = false;
    try {
      undone = await program.revertDeloadWeek();
    } catch {
      undone = false;
    }
    if (undone) {
      setTaken((now) => {
        const next = { ...now };
        delete next[offer.kind];
        return next;
      });
    } else {
      toast.error("Couldn’t undo the lighter week.");
    }
    setPending(null);
  }

  /** Set one offer aside, as its own "Not now" does where it lives. */
  async function setAside(offer: WeekOffer) {
    if (offer.kind === "fell-behind")
      await settle(program.dismissFellBehindPrompt());
    else if (offer.kind === "race-check") raceCheckNotice.dismiss();
    else if (offer.kind === "lighter-week") deloadNotice.dismiss();
    else pace.dismiss();
  }

  async function route(offer: WeekOffer) {
    if (!offer.route || pending || closing) return;
    haptic("light");
    setPending({ offer, action: "route" });
    // The race's date is changed on its own page: the offer is answered.
    await setAside(offer);
    navigate(offer.route.to);
  }

  async function keepPlan() {
    if (pending || closing) return;
    setClosing(true);
    for (const card of open) await setAside(card.offer);
    onClose();
  }

  return (
    <>
      {cards.length > 0 && (
        <div className="mt-6 space-y-3">
          {cards.map((card) => (
            <OfferCard
              key={card.offer.kind}
              offer={card.offer}
              status={card.status}
              busyAction={
                pending && pending.offer.kind === card.offer.kind
                  ? pending.action === "undo"
                    ? null
                    : pending.action
                  : null
              }
              line={card.line}
              locked={
                closing || (!!pending && pending.offer.kind !== card.offer.kind)
              }
              onAccept={() => void accept(card.offer)}
              onRoute={() => void route(card.offer)}
              onUndo={() => void undo(card.offer)}
            />
          ))}
        </div>
      )}
      <div className="mt-6 space-y-6">{children}</div>
      <div className="mt-auto pt-8">
        <Button
          variant="neutral"
          fullWidth
          loading={closing}
          disabled={!!pending}
          onClick={() => (open.length > 0 ? void keepPlan() : onClose())}
        >
          {open.length > 0 ? "Keep my plan" : "Looks good"}
        </Button>
      </div>
    </>
  );
}

/**
 * The week ahead. As the review's last card (`preview` false) it carries
 * its heading, the offers and the closing button; before a first review
 * (`preview`) it is the plan alone, under the page's own heading and Done.
 */
export default function WeekAheadEnding({
  reviewedWeekKey,
  trainingWhy,
  uid,
  onClose,
  preview = false,
}: {
  /** The reviewed week: the momentum check-in's key. */
  reviewedWeekKey: string;
  trainingWhy: string | undefined;
  uid: string | null;
  onClose: () => void;
  preview?: boolean;
}) {
  const { profile } = useAuth();
  const program = useHomeProgram();
  const todayKey = useLocalDateKey();
  const unit = useDistanceUnit();
  const view = useMemo(
    () =>
      weekAheadView({
        todayKey,
        profile,
        programState: program.programState,
        unit,
      }),
    [todayKey, profile, program.programState, unit]
  );

  const extras = (
    <>
      {/* D16: the personal "why", resurfaced in the user's own words, on a
          review only: never on the page before a first one. */}
      {trainingWhy && !preview && (
        <div className="space-y-1.5">
          <SectionHeading size="compact">Why you train</SectionHeading>
          <p className="text-lg font-semibold leading-snug text-foreground">
            &ldquo;{trainingWhy}&rdquo;
          </p>
          <p className="text-sm text-muted-foreground">
            You wrote this when you started.
          </p>
        </div>
      )}
      {/* CHECKIN-01: gone for the week once answered or dismissed. */}
      {uid && <MomentumCheckinCard uid={uid} weekKey={reviewedWeekKey} />}
    </>
  );

  if (preview) {
    return (
      <div className="space-y-6">
        {program.controller}
        <WeekPlan view={view} loading={program.loading} />
        {extras}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      {program.controller}
      <h2 className="text-h1 font-extrabold leading-tight tracking-tight text-foreground">
        The week ahead
      </h2>
      <WeekPlan view={view} loading={program.loading} className="mt-6" />
      <WeekAgreement
        program={program}
        todayKey={todayKey}
        unit={unit}
        onClose={onClose}
      >
        {extras}
      </WeekAgreement>
    </div>
  );
}
