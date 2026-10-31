import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Footprints,
  RotateCcw,
  Settings,
} from "lucide-react";
import PageShell from "@/components/ui/PageShell";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import SectionHeading from "@/components/ui/SectionHeading";
import MetaLine from "@/components/ui/MetaLine";
import { ProgramSkeleton } from "@/components/LoadingSkeleton";
import ProgramOfflineBanner from "@/components/program/ProgramOfflineBanner";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import ScheduleLayoutSheet from "@/components/program/ScheduleLayoutSheet";
import InProgressStrip from "@/components/session/InProgressStrip";
import MoveRunSheet from "@/components/program/plan/MoveRunSheet";
import WeekResetCard, {
  type WeekResetOutcome,
} from "@/components/program/plan/WeekResetCard";
import { useAuth } from "@/lib/auth";
import { useProgram } from "@/features/program/useProgram";
import { useSavedSessions } from "@/hooks/useSavedSessions";
import { SAVED_WORKOUTS, type WorkoutWindow } from "@/lib/savedWorkouts";
import { goalLabel } from "@/features/program/programLabels";
import { useClaimMapForProgram } from "@/hooks/useClaimMapForProgram";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import { useSessionsInFlight } from "@/hooks/useSessionsInFlight";
import {
  buildTrainingPlanWorkspace,
  weekCountLabel,
} from "@/lib/trainingPlanWorkspace";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth, formatWeekday } from "@/utils/formatters";
import { cn } from "@/lib/utils";
import { sessionDayContext } from "@/features/program/sessionDay";
import {
  isLiftSessionOpen,
  liftSessionVersion,
  subscribeLiftSession,
} from "@/features/program/openLiftSession";
import {
  hasPendingProgrammeCompletion,
  queuedWritesVersion,
  subscribeQueuedWrites,
} from "@/lib/offlineQueue";
import {
  emptyWorkoutInProgress,
  liftInProgress,
  resumableWorkout,
  routineInProgress,
  runInProgress,
  storedRunName,
} from "@/lib/sessionsInFlight";
import { resolveDistanceUnit } from "@/lib/distanceUnits";
import type { ProgramOutcome } from "@/features/program/programOutcome";
import {
  subscribeCommandOutbox,
  commandOutboxVersion,
  outboxLength,
  lastCommandSettlement,
} from "@/features/program/commandOutbox";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import type { PlanFeel } from "@/lib/momentumCheckin";

function returnPath(value: unknown): string {
  return typeof value === "string" &&
    (/^\/program(?:[?#]|$)/.test(value) || value === "/review")
    ? value
    : "/program";
}

export default function TrainingPlan() {
  const { profile, user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const resetMode = new URLSearchParams(location.search).get("reset") === "1";
  const backTo = returnPath(
    (location.state as { returnTo?: unknown } | null)?.returnTo
  );
  const enteredFeel = (location.state as { resetFeel?: unknown } | null)
    ?.resetFeel;
  const resetFeel: PlanFeel | undefined =
    enteredFeel === "a_bit_much" || enteredFeel === "too_light"
      ? enteredFeel
      : undefined;
  const {
    programState,
    loading,
    readiness,
    refreshProgram,
    moveRunDay,
    refreshRunSchedule,
    regenerateProgram,
  } = useProgram();
  const todayKey = useLocalDateKey();
  const workoutWindow = useMemo<WorkoutWindow>(
    () => ({ since: localWeekKey(parseLocalDate(todayKey)) }),
    [todayKey]
  );
  const {
    items: workouts,
    loading: workoutsLoading,
    failed: workoutsFailed,
    refresh: refreshWorkouts,
  } = useSavedSessions(SAVED_WORKOUTS, user?.uid, workoutWindow);
  const claims = useClaimMapForProgram(programState, todayKey);
  const inFlight = useSessionsInFlight(user?.uid);
  useSyncExternalStore(
    subscribeLiftSession,
    liftSessionVersion,
    liftSessionVersion
  );
  useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  const [move, setMove] = useState<{ id?: string } | null>(null);
  const [layout, setLayout] = useState(false);
  const [resetResult, setResetResult] = useState<
    (WeekResetOutcome & { uid: string }) | null
  >(null);
  const resetViewed = useRef<string | null>(null);
  useEffect(() => {
    if (!resetMode || !user?.uid || loading) return;
    const key = `${user.uid}:${location.key}`;
    if (resetViewed.current === key) return;
    resetViewed.current = key;
    trackLifecycle("week_reset_viewed");
  }, [resetMode, user?.uid, loading, location.key]);
  const [notice, setNotice] = useState<{
    text: string;
    queued: boolean;
    uid: string;
  } | null>(null);
  const outboxVersion = useSyncExternalStore(
    subscribeCommandOutbox,
    commandOutboxVersion,
    commandOutboxVersion
  );
  const visibleNotice = notice?.uid === user?.uid ? notice : null;
  const waitingToSync = !!visibleNotice?.queued && outboxLength(user?.uid) > 0;
  const [refreshFailed, setRefreshFailed] = useState(false);
  useEffect(() => {
    if (visibleNotice?.queued && !waitingToSync) {
      void refreshProgram().catch(() => setRefreshFailed(true));
    }
  }, [outboxVersion, visibleNotice, waitingToSync, refreshProgram]);
  const settledMove = user?.uid ? lastCommandSettlement(user.uid) : null;
  const model = useMemo(
    () =>
      buildTrainingPlanWorkspace({
        todayKey,
        profile,
        programState,
        workouts,
        runs: claims.runs,
        claimMap: claims.claimMap,
      }),
    [todayKey, profile, programState, workouts, claims.runs, claims.claimMap]
  );
  const unfinished = resumableWorkout(
    inFlight.drafts,
    programState,
    sessionDayContext(programState, profile),
    inFlight.routines
  );
  const workoutStrip =
    unfinished?.kind === "programme"
      ? liftInProgress(
          unfinished,
          programState?.workouts[unfinished.dayIndex]?.dayName ?? "Workout"
        )
      : unfinished?.kind === "routine"
        ? routineInProgress(unfinished)
        : unfinished?.kind === "empty"
          ? emptyWorkoutInProgress(unfinished)
          : null;
  const runStrip = inFlight.run
    ? runInProgress(
        inFlight.run,
        storedRunName(
          inFlight.run.config,
          null,
          resolveDistanceUnit(profile?.preferredDistanceUnit)
        )
      )
    : null;
  const pendingFinish = !!user?.uid && hasPendingProgrammeCompletion(user.uid);
  const sessionBusy =
    isLiftSessionOpen() || pendingFinish || !!workoutStrip || !!runStrip;
  const oldWeek =
    !!programState?.liftWeekKey && programState.liftWeekKey < model.weekKey;
  const evidencePending = claims.loading || workoutsLoading;
  const evidenceFailed = claims.failed || workoutsFailed;
  const historyUnknown =
    evidencePending && workouts.length === 0 && claims.runs.length === 0;
  const canEdit =
    !evidencePending &&
    !evidenceFailed &&
    claims.evidenceReady &&
    !oldWeek &&
    readiness === "ready";
  const canResetLayout = canEdit && !sessionBusy && !!profile;
  const visibleResetResult =
    resetResult?.uid === user?.uid ? resetResult : null;
  const activeRunId = inFlight.run?.config.planMetadata?.scheduledRunId;
  const eligibleRuns = model.days
    .flatMap((day) => day.activities)
    .filter(
      (item) =>
        item.canMove &&
        (!runStrip || (!!activeRunId && item.runDay?.id !== activeRunId))
    )
    .flatMap((item) => (item.runDay ? [item.runDay] : []));
  const firstDate = model.days[0]?.dateKey ?? model.weekKey;
  const lastDate = model.days[6]?.dateKey ?? firstDate;

  function assertLayoutIdle() {
    if (
      readiness !== "ready" ||
      (resetMode && !canResetLayout) ||
      sessionBusy ||
      isLiftSessionOpen() ||
      (!!user?.uid && hasPendingProgrammeCompletion(user.uid))
    ) {
      throw new Error(
        "Finish or resolve your current session before changing the usual week."
      );
    }
  }
  function handleResult(outcome: ProgramOutcome, text: string) {
    if (outcome.status === "applied" || outcome.status === "queued") {
      setNotice({
        text,
        queued: outcome.status === "queued",
        uid: user?.uid ?? "",
      });
      if (resetMode && user?.uid) {
        setResetResult({
          kind: "run",
          status: outcome.status,
          text,
          uid: user.uid,
        });
        trackLifecycle("week_reset_completed", {
          weekResetAction: "run_move",
          weekResetOutcome: outcome.status,
        });
      }
    }
  }

  if (loading) return <ProgramSkeleton />;
  return (
    <PageShell
      title="Your plan"
      actions={
        <Link
          to="/history/sessions"
          state={{ returnTo: `${location.pathname}${location.search}` }}
          className={buttonClasses({ variant: "ghost" })}
        >
          History
        </Link>
      }
      eyebrow={
        <Link
          to={backTo}
          className="inline-flex min-h-[44px] items-center gap-1 -ml-2 px-2"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backTo === "/review" ? "Review" : "Train"}
        </Link>
      }
      subtitle={
        programState
          ? `${programState.workouts.length ? `Lift week ${programState.weekNumber} · ` : ""}${goalLabel(programState.primaryGoal ?? profile?.primaryGoal ?? "general")}`
          : "Your training week"
      }
      banner={<ProgramOfflineBanner />}
    >
      {visibleNotice && (
        <Banner
          variant="neutral"
          description={
            waitingToSync
              ? `${visibleNotice.text}. Waiting to sync; the change will be checked when you reconnect.`
              : visibleNotice.queued
                ? settledMove?.kind === "moveRunDay" &&
                  settledMove.result === "declined"
                  ? "A queued run change could not be applied. Review the current week."
                  : "Queued changes checked. Review the updated week."
                : `${visibleNotice.text}.`
          }
          onDismiss={() => setNotice(null)}
          dismissLabel="Dismiss plan update"
        />
      )}
      {refreshFailed && (
        <ErrorState
          title="Could not refresh the latest plan"
          retry={{
            onClick: () => {
              void refreshProgram()
                .then(() => setRefreshFailed(false))
                .catch(() => setRefreshFailed(true));
            },
          }}
        />
      )}
      {readiness === "failed" && (
        <ErrorState
          title="Could not load the latest plan"
          description="Any cached week is shown below. Reload before making changes."
          retry={{ onClick: () => navigate(0) }}
        />
      )}
      {readiness === "pending" && (
        <p role="status" className="text-sm text-muted-foreground">
          Checking the latest plan…
        </p>
      )}
      {!programState ? (
        readiness === "failed" ? null : (
          <EmptyState
            headline="Your plan is getting ready"
            sub="Open Train to set up or reload your programme."
            action={{ label: "Open Train", href: backTo }}
          />
        )
      ) : (
        <>
          {oldWeek && (
            <Banner
              variant="neutral"
              description="Your plan is waiting for the previous week to finish. Resolve the open session or pending save before moving this week's runs."
            />
          )}
          {runStrip && (
            <InProgressStrip
              session={runStrip}
              onResume={() => navigate(runStrip.resumeTarget)}
            />
          )}
          {workoutStrip ? (
            <InProgressStrip
              session={workoutStrip}
              onResume={() => navigate(workoutStrip.resumeTarget)}
            />
          ) : model.nextLift && !runStrip && !pendingFinish && !oldWeek ? (
            <SessionCommandCard
              compact
              eyebrow="Next lift"
              title={model.nextLift.dayName}
              meta={[
                `${model.nextLift.exercises.length} exercises`,
                "Follows your rotation",
              ]}
              sport="lift"
              primaryActionLabel={
                readiness === "ready"
                  ? `Start ${model.nextLift.dayName}`
                  : undefined
              }
              onPrimaryAction={() =>
                navigate(`/program?tab=lift&day=${model.nextLiftIndex}&start=1`)
              }
            />
          ) : pendingFinish ? (
            <Banner
              variant="neutral"
              description="Your finished workout is waiting to sync. Your lifting order will update when it is confirmed."
            />
          ) : null}
          {evidenceFailed && (
            <ErrorState
              title="Some saved activities couldn't load"
              description="The plan is still here. Reload activity before changing a run."
              retry={{
                onClick: () => {
                  claims.refresh();
                  refreshWorkouts();
                },
              }}
            />
          )}
          {resetMode && (
            <WeekResetCard
              feel={resetFeel}
              range={`${formatDayMonth(parseLocalDate(firstDate))} – ${formatDayMonth(parseLocalDate(lastDate))}`}
              liftDays={model.summary.lifts.planned ?? 0}
              plannedRuns={model.summary.runs.planned ?? 0}
              canMoveRun={canEdit && eligibleRuns.length > 0}
              canEditLayout={canResetLayout}
              moveReason={
                !canEdit
                  ? "Wait for the latest plan and saved sessions before moving a run."
                  : "No uncompleted scheduled run can move this week."
              }
              layoutReason={
                sessionBusy
                  ? "Finish or resolve your current session first."
                  : "Wait for the latest plan and saved sessions before editing."
              }
              outcome={visibleResetResult}
              onMoveRun={() => {
                trackLifecycle("week_reset_choice", {
                  weekResetAction: "run_move",
                });
                setMove({});
              }}
              onEditLayout={() => {
                trackLifecycle("week_reset_choice", {
                  weekResetAction: "usual_layout",
                });
                setLayout(true);
              }}
              onGoToday={() => {
                if (!visibleResetResult) {
                  trackLifecycle("week_reset_choice", {
                    weekResetAction: "keep_plan",
                  });
                }
                navigate("/");
              }}
              onReviewWeek={() =>
                navigate("/program/plan", {
                  replace: true,
                  state: location.state,
                })
              }
            />
          )}
          <section className="space-y-2" aria-label="This week's plan">
            <SectionHeading
              action={
                canEdit && eligibleRuns.length > 0 ? (
                  <Button
                    variant="ghost"
                    className="text-running-strong"
                    onClick={() => setMove({})}
                  >
                    Move a run
                  </Button>
                ) : undefined
              }
            >
              {formatDayMonth(parseLocalDate(firstDate))} –{" "}
              {formatDayMonth(parseLocalDate(lastDate))}
            </SectionHeading>
            {evidencePending || evidenceFailed ? (
              <p role="status" className="text-sm text-muted-foreground">
                {evidenceFailed
                  ? "Saved activities unavailable"
                  : "Loading saved activities…"}
              </p>
            ) : (
              <MetaLine
                items={[
                  weekCountLabel("Lifts", model.summary.lifts),
                  weekCountLabel("Runs", model.summary.runs),
                  `${model.summary.restDays} rest ${model.summary.restDays === 1 ? "day" : "days"}`,
                ].filter((item): item is string => item !== null)}
              />
            )}
            <Card padded={false} size="compact" className="overflow-hidden">
              <ol className="divide-y divide-border">
                {model.days.map((day) => (
                  <li
                    key={day.dateKey}
                    className={cn("flex gap-3 p-3", day.isToday && "bg-muted")}
                    aria-current={day.isToday ? "date" : undefined}
                  >
                    <div className="w-11 shrink-0 text-center">
                      <p className="text-xs text-muted-foreground">
                        {parseLocalDate(day.dateKey).toLocaleDateString(
                          "en-GB",
                          { weekday: "short" }
                        )}
                      </p>
                      <p className="text-base font-semibold font-mono tabular-nums">
                        {parseLocalDate(day.dateKey).getDate()}
                      </p>
                      {day.isToday && (
                        <p className="text-xs font-semibold text-foreground">
                          Today
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      {!historyUnknown &&
                        day.activities.map((activity) => {
                          const content = (
                            <>
                              <span
                                className={cn(
                                  "mt-1 shrink-0",
                                  activity.kind === "run"
                                    ? "text-running-strong"
                                    : "text-lifting-strong"
                                )}
                              >
                                {activity.kind === "run" ? (
                                  <Footprints
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Dumbbell
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-base font-bold">
                                  {activity.title}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {activity.meta}
                                </span>
                              </span>
                              {activity.completed ? (
                                <CheckCircle2
                                  className="size-4 mt-1 shrink-0 text-muted-foreground"
                                  aria-label="Completed"
                                />
                              ) : (
                                <ChevronRight
                                  className="size-4 mt-1 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              )}
                            </>
                          );
                          return activity.href ? (
                            <Link
                              key={activity.id}
                              to={activity.href}
                              className="flex min-h-[44px] items-start gap-2 rounded-lg py-1 focus-visible:outline-2 focus-visible:outline-primary"
                              aria-label={`${activity.title}, ${activity.meta}, ${formatWeekday(parseLocalDate(day.dateKey))}`}
                            >
                              {content}
                            </Link>
                          ) : (
                            <div
                              key={activity.id}
                              className="flex min-h-[44px] items-start gap-2 py-1"
                            >
                              {content}
                            </div>
                          );
                        })}
                      {(day.isEmpty || historyUnknown) && (
                        <div className="py-1">
                          <p className="text-base font-bold">
                            {evidenceFailed
                              ? "Activity unavailable"
                              : evidencePending
                                ? "Loading activities"
                                : day.beforeStart
                                  ? "Before your programme"
                                  : "Rest day"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {evidencePending || evidenceFailed
                              ? "Saved sessions are still arriving or need a reload"
                              : day.beforeStart
                                ? "Your programme had not started"
                                : "No activity planned"}
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
            <p className="text-xs text-muted-foreground">
              Lift days show your usual pattern. Your next lift follows the
              rotation.
            </p>
          </section>
          {!evidencePending && !evidenceFailed && eligibleRuns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No planned runs to move this week.{" "}
              <Link
                to="/settings/run-plan"
                className="underline text-running-strong"
              >
                Edit run plan
              </Link>
            </p>
          )}
          <section className="space-y-2" aria-label="Programme setup">
            <Button
              variant="ghost"
              fullWidth
              className="justify-between"
              disabled={
                sessionBusy ||
                readiness !== "ready" ||
                (resetMode && !canResetLayout)
              }
              leftIcon={<RotateCcw className="size-4" />}
              rightIcon={<ChevronRight className="size-4" />}
              onClick={() => setLayout(true)}
            >
              Usual weekly layout
            </Button>
            {sessionBusy && (
              <p className="text-xs text-muted-foreground">
                Finish or resolve your current session before changing the usual
                week.
              </p>
            )}
            <Link
              to="/settings/training"
              className={buttonClasses({
                variant: "ghost",
                fullWidth: true,
                className: "justify-between",
              })}
            >
              <span className="inline-flex items-center gap-2">
                <Settings className="size-4" aria-hidden="true" />
                Programme settings
              </span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        </>
      )}
      {move && programState && profile && (
        <MoveRunSheet
          runs={eligibleRuns}
          allRuns={programState.runDays ?? []}
          savedRuns={claims.runs}
          runDescriptions={Object.fromEntries(
            model.days
              .flatMap((day) => day.activities)
              .filter((activity) => activity.runDay?.id)
              .map((activity) => [activity.runDay!.id!, activity.meta])
          )}
          weekSchedule={profile.weekSchedule ?? []}
          todayKey={todayKey}
          nextLiftName={model.nextLift?.dayName}
          initialRunId={move.id}
          blocked={!canEdit}
          onClose={() => setMove(null)}
          onMove={moveRunDay}
          onResult={handleResult}
        />
      )}
      {layout && (
        <ScheduleLayoutSheet
          open
          guided={resetMode}
          profile={profile}
          onClose={() => setLayout(false)}
          onSaved={() => {
            if (!resetMode || !user?.uid) return;
            setResetResult({
              kind: "layout",
              status: "applied",
              text: "Your usual weekly layout is saved. Your completed sessions stay in your history.",
              uid: user.uid,
            });
            trackLifecycle("week_reset_completed", {
              weekResetAction: "usual_layout",
              weekResetOutcome: "applied",
            });
          }}
          updateProfile={async (data, options) => {
            assertLayoutIdle();
            return updateProfile(data, options);
          }}
          refreshRunSchedule={async (options) => {
            assertLayoutIdle();
            return refreshRunSchedule(options);
          }}
          regenerateProgram={async (goal, target, options) => {
            assertLayoutIdle();
            return regenerateProgram(goal, target, options);
          }}
        />
      )}
    </PageShell>
  );
}
