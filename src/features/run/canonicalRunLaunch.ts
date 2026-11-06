import {
  DEFAULT_CONFIG,
  type RunConfig,
} from "@/components/run/runConfigDefaults";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { segmentsFromRunWalk } from "@/lib/runSegments";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import type { RunningPrescriptionAccess } from "@/features/program/runningPrescriptionGate";
import type {
  CanonicalRunLaunchAuthorization,
  CanonicalRunLaunchIdentity,
  CanonicalRunLaunchTransport,
  CanonicalRunSession,
} from "./canonicalRunLaunchTypes";

export interface CanonicalRunLaunchContext {
  user: { uid: string } | null;
  online: boolean;
  access: RunningPrescriptionAccess;
  nowMs: number;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function date(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
  );
}
const owns = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
function today(timeZone: string, nowMs: number): string | null {
  try {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !timeZone) return null;
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(nowMs));
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return null;
  }
}
function supportedSession(value: unknown): CanonicalRunSession | null {
  if (
    !record(value) ||
    !Object.keys(value).every((key) =>
      [
        "id",
        "date",
        "templateId",
        "minutes",
        "kind",
        "completed",
        "status",
        "protected",
      ].includes(key)
    ) ||
    !id(value.id) ||
    !date(value.date) ||
    !id(value.templateId) ||
    (owns(value, "completed") && value.completed !== false) ||
    (owns(value, "protected") && value.protected !== false) ||
    (owns(value, "status") && value.status !== "planned")
  )
    return null;
  const template = RUN_TEMPLATES.find((t) => t.id === value.templateId);
  if (
    !template ||
    template.type !== "easy" ||
    !Object.keys(template.config).every((key) =>
      ["targetDurationMinutes", "runWalk"].includes(key)
    ) ||
    template.estimatedDuration !== value.minutes ||
    !Number.isFinite(value.minutes) ||
    (value.minutes as number) <= 0 ||
    (template.config.targetDurationMinutes !== undefined &&
      template.config.targetDurationMinutes !== value.minutes) ||
    value.kind !== (template.config.runWalk ? "run_walk" : "easy")
  )
    return null;
  const shape = template.config.runWalk;
  if (
    shape &&
    (shape.runSecs.length === 0 ||
      shape.walkSecs.length !== shape.runSecs.length - 1 ||
      [
        shape.warmupWalkSec,
        ...shape.runSecs,
        ...shape.walkSecs,
        shape.cooldownWalkSec,
      ].some((seconds) => !Number.isFinite(seconds) || seconds <= 0) ||
      shape.warmupWalkSec +
        shape.cooldownWalkSec +
        shape.runSecs.reduce((a, b) => a + b, 0) +
        shape.walkSecs.reduce((a, b) => a + b, 0) !==
        (value.minutes as number) * 60)
  )
    return null;
  return {
    id: value.id,
    date: value.date,
    templateId: value.templateId,
    minutes: value.minutes as number,
    kind: value.kind as CanonicalRunSession["kind"],
  };
}
/** Resolve only current canonical authority. No runDays, profile, cache, URL
 * template or local completion inference is an input to this mapper. */
export function selectCanonicalRunLaunch(
  context: CanonicalRunLaunchContext,
  sessionId?: string | null
): CanonicalRunLaunchIdentity | null {
  const a = context.access.authority;
  if (
    !context.user ||
    !id(context.user.uid) ||
    !context.online ||
    context.access.status !== "ready" ||
    context.access.legacyAllowed ||
    !record(a) ||
    a.schemaVersion !== 1 ||
    a.accountId !== context.user.uid ||
    !Number.isSafeInteger(a.revision) ||
    (a.revision as number) < 0 ||
    !Array.isArray(a.holds) ||
    a.holds.length !== 0 ||
    typeof a.timeZone !== "string" ||
    !record(a.migration) ||
    a.migration.version !== 1 ||
    a.migration.status !== "complete" ||
    !record(a.plan) ||
    !Object.keys(a.plan).every((key) =>
      ["raceGoalId", "sessions"].includes(key)
    ) ||
    !(a.plan.raceGoalId === null || id(a.plan.raceGoalId)) ||
    !Array.isArray(a.plan.sessions) ||
    !record(a.constraints) ||
    !record(a.constraints.reviewConfirmation)
  )
    return null;
  const review = a.constraints.reviewConfirmation;
  if (
    review.version !== 1 ||
    review.confirmed !== true ||
    review.authorityRevision !== a.revision ||
    review.raceGoalId !== a.plan.raceGoalId
  )
    return null;
  if (owns(a, "manualCompletions") && !record(a.manualCompletions)) return null;
  if (owns(a, "recordedActivityLinks") && !record(a.recordedActivityLinks))
    return null;
  const localToday = today(a.timeZone, context.nowMs);
  if (
    !localToday ||
    (sessionId !== undefined && sessionId !== null && !id(sessionId))
  )
    return null;
  const ids = new Set<string>(),
    dates = new Set<string>();
  for (const session of a.plan.sessions) {
    if (
      !record(session) ||
      !id(session.id) ||
      !date(session.date) ||
      ids.has(session.id) ||
      dates.has(session.date)
    )
      return null;
    ids.add(session.id);
    dates.add(session.date);
  }
  const selected = a.plan.sessions.filter(
    (s) =>
      record(s) && s.date === localToday && (!sessionId || s.id === sessionId)
  );
  if (selected.length !== 1) return null;
  const session = supportedSession(selected[0]);
  if (
    !session ||
    (record(a.manualCompletions) && owns(a.manualCompletions, session.id)) ||
    (record(a.recordedActivityLinks) &&
      owns(a.recordedActivityLinks, session.id))
  )
    return null;
  return {
    schemaVersion: 1,
    accountId: context.user.uid,
    revision: a.revision as number,
    raceGoalId: a.plan.raceGoalId,
    timeZone: a.timeZone,
    session,
  };
}
/** Read-only linkage status, never a completion/progression or start permission. */
export function hasRecordedCanonicalActivity(
  context: CanonicalRunLaunchContext,
  sessionId?: string | null
): boolean {
  const a = context.access.authority;
  if (
    !context.user ||
    !context.online ||
    context.access.legacyAllowed ||
    !["ready", "held"].includes(context.access.status) ||
    !record(a) ||
    a.schemaVersion !== 1 ||
    a.accountId !== context.user.uid ||
    typeof a.timeZone !== "string" ||
    !record(a.plan) ||
    !Array.isArray(a.plan.sessions) ||
    !record(a.recordedActivityLinks)
  )
    return false;
  const localToday = today(a.timeZone, context.nowMs);
  if (!localToday || (sessionId != null && !id(sessionId))) return false;
  const selected = a.plan.sessions.filter(
    (s) =>
      record(s) &&
      id(s.id) &&
      s.date === localToday &&
      (!sessionId || s.id === sessionId)
  );
  return selected.length === 1 && owns(a.recordedActivityLinks, selected[0].id);
}
function sameIdentity(
  a: CanonicalRunLaunchIdentity,
  b: CanonicalRunLaunchIdentity
) {
  return (
    a.schemaVersion === b.schemaVersion &&
    a.accountId === b.accountId &&
    a.revision === b.revision &&
    a.raceGoalId === b.raceGoalId &&
    a.timeZone === b.timeZone &&
    a.session.id === b.session.id &&
    a.session.date === b.session.date &&
    a.session.templateId === b.session.templateId &&
    a.session.minutes === b.session.minutes &&
    a.session.kind === b.session.kind
  );
}
export function canonicalLaunchMatchesContext(
  identity: CanonicalRunLaunchIdentity,
  context: CanonicalRunLaunchContext
): boolean {
  if (
    !record(identity) ||
    !record(identity.session) ||
    !supportedSession(identity.session)
  )
    return false;
  const current = selectCanonicalRunLaunch(context, identity.session.id);
  return !!current && sameIdentity(identity, current);
}
/** Preferences cannot supply prescription fields or legacy credit linkage. */
export function canonicalRunConfig(
  identity: CanonicalRunLaunchIdentity,
  preferences: Pick<RunConfig, "audioCues" | "shoeId" | "place">
): RunConfig {
  const session = supportedSession(identity.session);
  if (!session) throw Error("This planned session needs review.");
  const shape = RUN_TEMPLATES.find((t) => t.id === session.templateId)!.config
    .runWalk;
  return {
    ...DEFAULT_CONFIG,
    activityType: "easy",
    audioCues: preferences.audioCues,
    ...(preferences.shoeId ? { shoeId: preferences.shoeId } : {}),
    ...(preferences.place === "treadmill"
      ? { place: "treadmill" as const }
      : {}),
    paceAlerts: false,
    target: { type: "time", value: session.minutes * 60 },
    segments: shape
      ? segmentsFromRunWalk(shape)
      : [
          {
            type: "easy",
            label: `Easy ${session.minutes} min`,
            instruction: "Conversational pace",
            target: { kind: "duration", seconds: session.minutes * 60 },
            cue: "Keep it conversational.",
          },
        ],
    planMetadata: freeformPlanMetadata("freeform"),
    canonicalLaunch: structuredClone(identity),
    legacyPlanClaimExcluded: true,
  };
}
/** Authorize AFTER any awaited setup. Re-read current identity and authority
 * after the response too. The response is a point-in-time check, not a lock or
 * a completion receipt. The caller must start synchronously after this returns. */
export async function authorizeCanonicalRunStart(input: {
  identity: CanonicalRunLaunchIdentity;
  readContext: () => CanonicalRunLaunchContext;
  transport: CanonicalRunLaunchTransport;
  preferences: Pick<RunConfig, "audioCues" | "shoeId" | "place">;
  setup?: () => Promise<unknown>;
  activityId?: string;
}): Promise<RunConfig> {
  if (input.activityId !== undefined && !id(input.activityId))
    throw Error("Invalid recording identity.");
  const originalUser = input.readContext().user;
  const identity = structuredClone(input.identity);
  const valid = () => {
    const current = input.readContext();
    return current.user === originalUser &&
      canonicalLaunchMatchesContext(identity, current)
      ? current
      : null;
  };
  if (!valid())
    throw Error(
      "Your plan, account or connection changed. Check the session again."
    );
  await input.setup?.();
  if (!valid())
    throw Error(
      "Your plan, account or connection changed. Check the session again."
    );
  const response = await input.transport({
    expectedUid: identity.accountId,
    expectedRevision: identity.revision,
    sessionId: identity.session.id,
    ...(input.activityId ? { activityId: input.activityId } : {}),
  });
  const current = valid();
  if (
    !current ||
    !record(response) ||
    !Object.keys(response).every((key) =>
      [
        "schemaVersion",
        "accountId",
        "revision",
        "raceGoalId",
        "timeZone",
        "session",
        "authorizedAtMs",
        "expiresAtMs",
        ...(input.activityId ? ["activityId", "launchId"] : []),
      ].includes(key)
    ) ||
    (input.activityId !== undefined &&
      (response.activityId !== input.activityId ||
        typeof response.launchId !== "string" ||
        !/^launch_[a-f0-9]{64}$/.test(response.launchId))) ||
    !record(response.session) ||
    !supportedSession(response.session) ||
    !sameIdentity(
      identity,
      response as unknown as CanonicalRunLaunchIdentity
    ) ||
    !Number.isSafeInteger(response.authorizedAtMs) ||
    !Number.isSafeInteger(response.expiresAtMs) ||
    (response.authorizedAtMs as number) > current.nowMs ||
    (response.expiresAtMs as number) - (response.authorizedAtMs as number) !==
      15_000
  )
    throw Error(
      "The session check expired or changed. Check it again before starting."
    );
  if ((response.expiresAtMs as number) <= current.nowMs)
    throw Object.assign(
      Error(
        input.activityId
          ? "This start check expired. Discard the unstarted session before trying again."
          : "The session check expired. Check it again before starting."
      ),
      { code: "canonical-start-expired" }
    );
  return canonicalRunConfig(
    response as unknown as CanonicalRunLaunchAuthorization,
    input.preferences
  );
}
