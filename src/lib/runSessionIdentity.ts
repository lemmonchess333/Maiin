import { localDateString } from "@/lib/dateHelpers";
import type { RunConfig } from "@/components/run/runConfigDefaults";

/** One phone-owned identity from Start through review, queue retry and sync. */
export interface RunSessionIdentity {
  sessionId: string;
  runId: string;
  uid: string;
  scheduledRunId: string | null;
  startedAt: number;
  startLocalDate: string;
  originTimeZone: string;
}

export function createRunSessionIdentity(
  uid: string,
  runId: string,
  config: RunConfig,
  startedAt: number = Date.now()
): RunSessionIdentity {
  const originTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    // A phone-led run has one identity in every store. The Watch never
    // allocates a second session or saved-run document.
    sessionId: runId,
    runId,
    uid,
    scheduledRunId: config.planMetadata?.scheduledRunId ?? null,
    startedAt,
    startLocalDate: localDateString(new Date(startedAt)),
    originTimeZone,
  };
}

/**
 * The identity of a run whose clock started at `at` (Run25 call 2). A GPS
 * run's identity is made at the tap of Start, before its clock waits for a
 * good fix; when the clock starts, the run's start moves to that instant,
 * and its day with it, so the saved run, its name and its finish screen
 * count none of the seconds spent finding GPS. Who, which run and where
 * it began stay as they were.
 */
export function identityStartedAt(
  identity: RunSessionIdentity,
  at: number
): RunSessionIdentity {
  return {
    ...identity,
    startedAt: at,
    startLocalDate: localDateString(new Date(at)),
  };
}

export function parseRunSessionIdentity(
  value: unknown,
  uid: string
): RunSessionIdentity | null {
  if (!value || typeof value !== "object") return null;
  const identity = value as Record<string, unknown>;
  if (
    identity.uid !== uid ||
    typeof identity.sessionId !== "string" ||
    !identity.sessionId ||
    identity.sessionId.includes("/") ||
    identity.runId !== identity.sessionId ||
    !Number.isFinite(identity.startedAt) ||
    typeof identity.startLocalDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(identity.startLocalDate) ||
    typeof identity.originTimeZone !== "string" ||
    !identity.originTimeZone ||
    !(
      identity.scheduledRunId === null ||
      typeof identity.scheduledRunId === "string"
    )
  )
    return null;
  return identity as unknown as RunSessionIdentity;
}
