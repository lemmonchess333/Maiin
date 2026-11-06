import {
  INACTIVE_RUNNING_ACCESS,
  UNAVAILABLE_RUNNING_ACCESS,
  type RunningGateContext,
  type RunningNegotiationTransport,
  type RunningPrescriptionAccess,
} from "./runningPrescriptionGate";

const PENDING: RunningPrescriptionAccess = {
  status: "pending",
  legacyAllowed: false,
  authority: null,
};
const MAX_AGE_MS = 60_000;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function sameContext(a: RunningGateContext, b: RunningGateContext) {
  return (
    a.accountId === b.accountId &&
    a.session === b.session &&
    a.online === b.online
  );
}
function validatedResponse(
  value: unknown,
  uid: string,
  now: number
): RunningPrescriptionAccess {
  if (
    !record(value) ||
    value.accountId !== uid ||
    !Number.isSafeInteger(value.checkedAtMs) ||
    (value.checkedAtMs as number) > now ||
    now - (value.checkedAtMs as number) >= MAX_AGE_MS
  )
    return UNAVAILABLE_RUNNING_ACCESS;
  if (value.status === "not_enrolled" || value.status === "unavailable")
    return { status: value.status, legacyAllowed: false, authority: null };
  const a = value.authority;
  if (
    (value.status !== "ready" && value.status !== "held") ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !record(a) ||
    a.schemaVersion !== 1 ||
    a.accountId !== uid ||
    a.revision !== value.revision ||
    !Array.isArray(a.holds) ||
    !a.holds.every((hold) => typeof hold === "string") ||
    !record(a.plan) ||
    !Array.isArray(a.plan.sessions)
  )
    return UNAVAILABLE_RUNNING_ACCESS;
  // Held responses must not carry actionable sessions. Unknown holds are
  // still holds; an empty hold list is not enough to invent a ready response.
  if (value.status === "held" && a.plan.sessions.length !== 0)
    return UNAVAILABLE_RUNNING_ACCESS;
  if (value.status === "ready" && a.holds.length !== 0)
    return UNAVAILABLE_RUNNING_ACCESS;
  return { status: value.status, legacyAllowed: false, authority: a };
}

/** A fail-closed negotiation controller with no Firestore or callable imports.
 * Consumers supply current identity at read time, so the first render of a new
 * account cannot see the old account while React effects are still pending. */
export function createRunningPrescriptionGate(options: {
  enabled: boolean;
  transport?: RunningNegotiationTransport;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let context: RunningGateContext = {
    accountId: null,
    session: null,
    online: false,
  };
  let access = options.enabled
    ? UNAVAILABLE_RUNNING_ACCESS
    : INACTIVE_RUNNING_ACCESS;
  let generation = 0;
  let version = 0;
  let expiresAt = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  function invalidate() {
    generation += 1;
    expiresAt = 0;
    access = options.enabled
      ? UNAVAILABLE_RUNNING_ACCESS
      : INACTIVE_RUNNING_ACCESS;
    notify();
  }
  async function negotiate() {
    if (!options.enabled) return;
    const current = context;
    const requestGeneration = ++generation;
    expiresAt = 0;
    access = UNAVAILABLE_RUNNING_ACCESS;
    if (
      !current.accountId ||
      !current.session ||
      !current.online ||
      !options.transport
    ) {
      notify();
      return;
    }
    access = PENDING;
    notify();
    try {
      const response = await options.transport({
        expectedUid: current.accountId,
        supportedSchemaVersions: [1],
      });
      if (requestGeneration !== generation || !sameContext(context, current))
        return;
      access = validatedResponse(response, current.accountId, now());
      expiresAt =
        record(response) && typeof response.checkedAtMs === "number"
          ? response.checkedAtMs + MAX_AGE_MS
          : 0;
    } catch {
      if (requestGeneration !== generation || !sameContext(context, current))
        return;
      access = UNAVAILABLE_RUNNING_ACCESS;
    }
    notify();
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
    setContext(next: RunningGateContext) {
      if (!options.enabled || sameContext(context, next)) return;
      context = next;
      invalidate();
      void negotiate();
    },
    read(current: RunningGateContext): RunningPrescriptionAccess {
      if (!options.enabled) return INACTIVE_RUNNING_ACCESS;
      if (
        !sameContext(context, current) ||
        !current.accountId ||
        !current.session ||
        !current.online
      )
        return UNAVAILABLE_RUNNING_ACCESS;
      if (expiresAt && now() >= expiresAt) return UNAVAILABLE_RUNNING_ACCESS;
      return access;
    },
    /** Called on foreground/reconnect/review changes, never reuse a cached success. */
    refresh: negotiate,
    invalidate,
  };
}
