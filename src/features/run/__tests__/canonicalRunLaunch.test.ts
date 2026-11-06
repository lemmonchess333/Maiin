// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  authorizeCanonicalRunStart,
  canonicalRunConfig,
  hasRecordedCanonicalActivity,
  selectCanonicalRunLaunch,
  type CanonicalRunLaunchContext,
} from "../canonicalRunLaunch";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  isUnprescribedRun,
  withoutRunningPrescription,
} from "../runningPrescriptionLaunch";

const NOW = Date.parse("2026-11-06T12:00:00Z");
function fixture() {
  const authority = {
    schemaVersion: 1,
    accountId: "runner",
    revision: 4,
    timeZone: "Europe/London",
    migration: { version: 1, status: "complete" },
    holds: [] as string[],
    constraints: {
      reviewConfirmation: {
        version: 1,
        confirmed: true,
        authorityRevision: 4,
        raceGoalId: null,
      },
    },
    plan: {
      raceGoalId: null,
      sessions: [
        {
          id: "session_1",
          date: "2026-11-06",
          templateId: "run_walk_1",
          minutes: 29,
          kind: "run_walk",
        },
      ],
    },
  };
  const context: CanonicalRunLaunchContext = {
    user: { uid: "runner" },
    online: true,
    access: { status: "ready", legacyAllowed: false, authority },
    nowMs: NOW,
  };
  const identity = selectCanonicalRunLaunch(context)!;
  const response = {
    ...identity,
    authorizedAtMs: NOW,
    expiresAtMs: NOW + 15_000,
  };
  return { authority, context, identity, response };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const preferences = { audioCues: true };
describe("strict canonical session mapping", () => {
  it.each([{}, null, { activityId: "activity_1" }])(
    "never re-launches a linked session, regardless of link value %j",
    (link) => {
      const f = fixture();
      Object.assign(f.authority, {
        recordedActivityLinks: { session_1: link },
      });
      expect(selectCanonicalRunLaunch(f.context)).toBeNull();
      expect(hasRecordedCanonicalActivity(f.context)).toBe(true);
      f.authority.constraints.reviewConfirmation.authorityRevision--;
      expect(hasRecordedCanonicalActivity(f.context)).toBe(true);
      f.context.user = { uid: "other" };
      expect(hasRecordedCanonicalActivity(f.context)).toBe(false);
    }
  );
  it.each([null, [], "malformed"])(
    "fails closed for malformed recorded activity links %j",
    (links) => {
      const f = fixture();
      Object.assign(f.authority, { recordedActivityLinks: links });
      expect(selectCanonicalRunLaunch(f.context)).toBeNull();
      expect(hasRecordedCanonicalActivity(f.context)).toBe(false);
    }
  );

  it("maps only the pinned run-walk structure with no legacy completion claim or profile pace", () => {
    const f = fixture();
    const config = canonicalRunConfig(f.identity, preferences);
    expect(config.target).toEqual({ type: "time", value: 1740 });
    expect(config.segments).toHaveLength(17);
    expect(
      config.segments!.reduce(
        (sum, s) => sum + (s.target.kind === "duration" ? s.target.seconds : 0),
        0
      )
    ).toBe(1740);
    expect(config.paceAlerts).toBe(false);
    expect(config.planMetadata).toMatchObject({
      planMode: "freeform",
      planSource: "manual",
      scheduledRunId: null,
      plannedTemplateId: null,
      actualTemplateId: null,
      matchedPlanExact: null,
    });
    expect(isUnprescribedRun(config)).toBe(false);
    const free = withoutRunningPrescription(config);
    expect(free.canonicalLaunch).toBeUndefined();
    expect(isUnprescribedRun(free)).toBe(true);
  });
  it("uses every supported real catalogue easy/run-walk duration exactly", () => {
    for (const t of RUN_TEMPLATES.filter(
      (t) =>
        t.type === "easy" &&
        Object.keys(t.config).every((k) =>
          ["targetDurationMinutes", "runWalk"].includes(k)
        )
    )) {
      const f = fixture();
      Object.assign(f.authority.plan.sessions[0], {
        templateId: t.id,
        minutes: t.estimatedDuration,
        kind: t.config.runWalk ? "run_walk" : "easy",
      });
      const identity = selectCanonicalRunLaunch(f.context)!;
      expect(identity, t.id).not.toBeNull();
      expect(canonicalRunConfig(identity, preferences).target.value).toBe(
        t.estimatedDuration * 60
      );
    }
  });
  it.each([
    [
      "signed out",
      (f: ReturnType<typeof fixture>) => {
        f.context.user = null;
      },
    ],
    [
      "wrong account",
      (f: ReturnType<typeof fixture>) => {
        f.context.user = { uid: "other" };
      },
    ],
    [
      "offline",
      (f: ReturnType<typeof fixture>) => {
        f.context.online = false;
      },
    ],
    [
      "pending negotiation",
      (f: ReturnType<typeof fixture>) => {
        f.context.access.status = "pending";
      },
    ],
    [
      "legacy permission",
      (f: ReturnType<typeof fixture>) => {
        f.context.access.legacyAllowed = true;
      },
    ],
    [
      "held",
      (f: ReturnType<typeof fixture>) => {
        f.authority.holds.push("review_required");
      },
    ],
    [
      "migration pending",
      (f: ReturnType<typeof fixture>) => {
        f.authority.migration.status = "pending";
      },
    ],
    [
      "old review",
      (f: ReturnType<typeof fixture>) => {
        f.authority.constraints.reviewConfirmation.authorityRevision--;
      },
    ],
    [
      "unknown timezone",
      (f: ReturnType<typeof fixture>) => {
        f.authority.timeZone = "No/Such_Place";
      },
    ],
    [
      "elapsed date",
      (f: ReturnType<typeof fixture>) => {
        f.authority.plan.sessions[0].date = "2026-11-05";
      },
    ],
    [
      "future date",
      (f: ReturnType<typeof fixture>) => {
        f.authority.plan.sessions[0].date = "2026-11-07";
      },
    ],
    [
      "unknown template",
      (f: ReturnType<typeof fixture>) => {
        f.authority.plan.sessions[0].templateId = "missing";
      },
    ],
    [
      "quality template",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authority.plan.sessions[0], {
          templateId: "tempo_20",
          minutes: 30,
          kind: "easy",
        });
      },
    ],
    [
      "strides template",
      (f: ReturnType<typeof fixture>) => {
        f.authority.plan.sessions[0].templateId = "easy_30_strides";
      },
    ],
    [
      "duration mismatch",
      (f: ReturnType<typeof fixture>) => {
        f.authority.plan.sessions[0].minutes = 28;
      },
    ],
    [
      "kind mismatch",
      (f: ReturnType<typeof fixture>) => {
        f.authority.plan.sessions[0].kind = "easy";
      },
    ],
    [
      "completed",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authority.plan.sessions[0], { completed: true });
      },
    ],
    [
      "skipped",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authority.plan.sessions[0], { status: "skipped" });
      },
    ],
    [
      "protected",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authority.plan.sessions[0], { protected: true });
      },
    ],
    [
      "manual claim",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authority, { manualCompletions: { session_1: {} } });
      },
    ],
    [
      "moved",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authority.plan.sessions[0], {
          movedFromDate: "2026-11-05",
        });
      },
    ],
    [
      "unknown session field",
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authority.plan.sessions[0], { pace: 150 });
      },
    ],
    [
      "duplicate session",
      (f: ReturnType<typeof fixture>) => {
        f.authority.plan.sessions.push({ ...f.authority.plan.sessions[0] });
      },
    ],
  ] as const)("rejects %s without legacy fallback", (_name, change) => {
    const f = fixture();
    change(f);
    expect(selectCanonicalRunLaunch(f.context)).toBeNull();
  });
  it("pins an explicit id and uses the authority timezone instead of the device date", () => {
    const f = fixture();
    expect(selectCanonicalRunLaunch(f.context, "old_legacy_slot")).toBeNull();
    f.context.nowMs = Date.parse("2026-11-06T00:30:00Z");
    f.authority.timeZone = "America/Los_Angeles";
    expect(selectCanonicalRunLaunch(f.context)).toBeNull();
    f.authority.plan.sessions[0].date = "2026-11-05";
    expect(selectCanonicalRunLaunch(f.context)?.session.id).toBe("session_1");
  });
});
describe("actual-start reauthorization", () => {
  it("calls the server only after awaited setup and returns a fresh pinned config", async () => {
    const f = fixture(),
      setup = deferred<void>();
    const transport = vi.fn(async () => f.response);
    const pending = authorizeCanonicalRunStart({
      identity: f.identity,
      readContext: () => f.context,
      preferences,
      transport,
      setup: () => setup.promise,
    });
    expect(transport).not.toHaveBeenCalled();
    setup.resolve();
    const config = await pending;
    expect(transport).toHaveBeenCalledWith({
      expectedUid: "runner",
      expectedRevision: 4,
      sessionId: "session_1",
    });
    expect(config.canonicalLaunch).toEqual(f.response);
  });
  it.each([
    "session",
    "account",
    "revision",
    "holds",
    "offline",
    "date",
    "goal",
    "template",
  ])("rejects %s changes while setup is awaited", async (kind) => {
    const f = fixture(),
      setup = deferred<void>();
    const transport = vi.fn(async () => f.response);
    const pending = authorizeCanonicalRunStart({
      identity: f.identity,
      readContext: () => f.context,
      preferences,
      transport,
      setup: () => setup.promise,
    });
    if (kind === "session") f.context.user = { uid: "runner" };
    if (kind === "account") f.context.user = { uid: "other" };
    if (kind === "revision") f.authority.revision++;
    if (kind === "holds") f.authority.holds.push("stop");
    if (kind === "offline") f.context.online = false;
    if (kind === "date") f.context.nowMs += 86400000;
    if (kind === "goal")
      Object.assign(f.authority.plan, { raceGoalId: "other" });
    if (kind === "template")
      f.authority.plan.sessions[0].templateId = "run_walk_2";
    setup.resolve();
    await expect(pending).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["session", "revision", "holds", "offline", "expired"])(
    "rejects %s changes while the server reply is delayed",
    async (kind) => {
      const f = fixture(),
        reply = deferred<unknown>();
      const transport = vi.fn(() => reply.promise);
      const pending = authorizeCanonicalRunStart({
        identity: f.identity,
        readContext: () => f.context,
        preferences,
        transport,
      });
      await Promise.resolve();
      expect(transport).toHaveBeenCalledOnce();
      if (kind === "session") f.context.user = { uid: "runner" };
      if (kind === "revision") f.authority.revision++;
      if (kind === "holds") f.authority.holds.push("stop");
      if (kind === "offline") f.context.online = false;
      if (kind === "expired") f.context.nowMs += 15000;
      reply.resolve(f.response);
      await expect(pending).rejects.toThrow();
    }
  );
  it.each([
    "accountId",
    "revision",
    "schemaVersion",
    "raceGoalId",
    "timeZone",
    "session",
    "authorizedAtMs",
    "expiresAtMs",
  ])("rejects a mismatched response %s", async (key) => {
    const f = fixture();
    const response: Record<string, unknown> = { ...f.response };
    response[key] =
      key === "session" ? { ...f.response.session, id: "other" } : "wrong";
    await expect(
      authorizeCanonicalRunStart({
        identity: f.identity,
        readContext: () => f.context,
        preferences,
        transport: async () => response,
      })
    ).rejects.toThrow();
  });
  it("rejects future timestamps, enlarged TTL, stale errors and missing responses", async () => {
    for (const response of [
      null,
      {},
      { ...fixture().response, authorizedAtMs: NOW + 1 },
      { ...fixture().response, expiresAtMs: NOW + 60000 },
    ]) {
      const f = fixture();
      await expect(
        authorizeCanonicalRunStart({
          identity: f.identity,
          readContext: () => f.context,
          preferences,
          transport: async () => response,
        })
      ).rejects.toThrow();
    }
  });
});

describe("server-owned start registration identity", () => {
  it("binds the exact allocated activity and preserves the server receipt", async () => {
    const f = fixture();
    const response = {
      ...f.response,
      activityId: "activity_1",
      launchId: `launch_${"a".repeat(64)}`,
    };
    const transport = vi.fn(async () => response);
    const config = await authorizeCanonicalRunStart({
      identity: f.identity,
      readContext: () => f.context,
      preferences,
      transport,
      activityId: "activity_1",
    });
    expect(transport).toHaveBeenCalledWith({
      expectedUid: "runner",
      expectedRevision: 4,
      sessionId: "session_1",
      activityId: "activity_1",
    });
    expect(config.canonicalLaunch).toEqual(response);
    expect(config.legacyPlanClaimExcluded).toBe(true);
  });
  it.each([
    { activityId: "other", launchId: `launch_${"a".repeat(64)}` },
    { activityId: "activity_1", launchId: "client-assertion" },
    {},
  ])("rejects unbound registration %j", async (extras) => {
    const f = fixture();
    await expect(
      authorizeCanonicalRunStart({
        identity: f.identity,
        readContext: () => f.context,
        preferences,
        activityId: "activity_1",
        transport: async () => ({ ...f.response, ...extras }),
      })
    ).rejects.toThrow();
  });
  it("does not treat an expired registration replay as fresh authorization", async () => {
    const f = fixture();
    f.context.nowMs += 15000;
    await expect(
      authorizeCanonicalRunStart({
        identity: f.identity,
        readContext: () => f.context,
        preferences,
        activityId: "activity_1",
        transport: async () => ({
          ...f.response,
          activityId: "activity_1",
          launchId: `launch_${"a".repeat(64)}`,
        }),
      })
    ).rejects.toThrow();
  });
});
