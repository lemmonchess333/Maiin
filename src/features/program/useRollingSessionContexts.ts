import { useEffect, useMemo, useState } from "react";
import type { UserProfile } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { DatedRun, LayoffClass } from "./layoffDetection";
import { rollingGoalOf } from "./programMaintenance";
import type { ProgramState } from "./programTypes";
import type { RollingSessionContext } from "./rollingWeeksAhead";

type RollingWeeksModule = typeof import("./rollingWeeksAhead");

/** The module once loaded, so a later page has it as it first draws. */
let loaded: RollingWeeksModule | null = null;
let loading: Promise<RollingWeeksModule> | null = null;

function loadRollingWeeks(): Promise<RollingWeeksModule> {
  loading ??= import("./rollingWeeksAhead").then(
    (module) => (loaded = module),
    (error: unknown) => {
      loading = null;
      throw error;
    }
  );
  return loading;
}

/**
 * A plan with no race date's weeks, by their Mondays, each with its place
 * in the plan for "Why this run" (Run24 (3), `rollingSessionContexts`):
 * worked out once per page from the plan, the profile, today's layoff
 * reading and the recent runs, and handed to each surface that explains a
 * run. Null without such a plan, and until the weeks are read.
 *
 * The weeks come from the run generator, which Home does not load as it
 * first draws (`eagerGraph.test.ts`), so the module is fetched only for
 * someone on such a plan. "Why this run" opens closed, so its reason is
 * there before anyone reads it.
 */
export function useRollingSessionContexts(input: {
  profile: UserProfile | null | undefined;
  programState: ProgramState | null | undefined;
  recentLayoff: LayoffClass;
  recentRuns: readonly DatedRun[] | null | undefined;
  /** Local "YYYY-MM-DD". */
  today: string;
}): ReadonlyMap<string, RollingSessionContext> | null {
  const { profile, programState, recentLayoff, recentRuns, today } = input;
  const onPlan = rollingGoalOf(programState, profile) !== null;
  const [module, setModule] = useState<RollingWeeksModule | null>(loaded);
  useEffect(() => {
    if (!onPlan || module) return;
    let live = true;
    loadRollingWeeks().then(
      (value) => {
        if (live) setModule(value);
      },
      (error: unknown) =>
        logger.warn("Plan with no race date: weeks not loaded", error)
    );
    return () => {
      live = false;
    };
  }, [onPlan, module]);
  return useMemo(
    () =>
      module && profile && onPlan
        ? module.rollingSessionContexts({
            profile,
            programState,
            recentLayoff,
            recentRuns,
            today,
          })
        : null,
    [module, profile, onPlan, programState, recentLayoff, recentRuns, today]
  );
}
