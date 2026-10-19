import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const announcements = require("../lib/challengeAnnouncements");
const { buildCurrentChallenges } = require("../lib/challengeDefs");
const NOW = new Date("2026-11-01T09:00:00Z");
const PROFILE = { timezone: "Europe/London" };
const CONSENT = { enabled: true, challenges: true };
const UID = "monthly-owner";
const STATE = `users/${UID}/settings/challengeAnnouncement-2026-11`;
const feature = (now = NOW) =>
  buildCurrentChallenges(now).find((d) => d.id.startsWith("featured-monthly-"));

// Versioned optimistic transactions: simultaneous readers retry after a
// conflicting commit, rather than letting an unrealistically serial fake
// make a broken read-then-write claim look atomic.
function firestore(seed = {}) {
  const store = new Map(Object.entries(seed));
  const versions = new Map();
  const clone = (value) =>
    value === undefined ? undefined : structuredClone(value);
  const snap = (path) => ({
    id: path.split("/").at(-1),
    ref: { path },
    exists: store.has(path),
    data: () => clone(store.get(path)),
  });
  const put = (path, value) => {
    if (value === undefined) store.delete(path);
    else store.set(path, clone(value));
    versions.set(path, (versions.get(path) || 0) + 1);
  };
  const db = {
    store,
    put,
    doc: (path) => ({ path, get: async () => snap(path) }),
    collection: (path) => ({
      aggregate: () => ({
        get: async () => ({
          data: () => ({
            total: [...store.entries()]
              .filter(
                ([key]) =>
                  key.startsWith(`${path}/`) &&
                  key.split("/").length === path.split("/").length + 1
              )
              .reduce(
                (total, [, value]) =>
                  total +
                  (typeof value.currentValue === "number"
                    ? value.currentValue
                    : 0),
                0
              ),
          }),
        }),
      }),
    }),
    runTransaction: async (fn) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const reads = new Map();
        const writes = [];
        const result = await fn({
          get: async ({ path }) => {
            reads.set(path, versions.get(path) || 0);
            return snap(path);
          },
          set: (ref, value) => writes.push([ref.path, value]),
          update: (ref, value) => {
            if (!store.has(ref.path))
              throw new Error("Cannot update missing document");
            writes.push([ref.path, { ...store.get(ref.path), ...value }]);
          },
        });
        if (
          [...reads].some(
            ([path, version]) => (versions.get(path) || 0) !== version
          )
        )
          continue;
        writes.forEach(([path, value]) => put(path, value));
        return result;
      }
      throw new Error("Transaction retries exhausted");
    },
  };
  return db;
}

function setup(extra = {}) {
  const db = firestore({
    [`users/${UID}`]: PROFILE,
    [`users/${UID}/settings/push`]: CONSENT,
    [`challenges/${feature().id}`]: feature(),
    ...extra,
  });
  const registrations = [
    { token: "native-fcm-token", bindingId: "native-binding", hash: "hash" },
  ];
  return {
    db,
    uid: UID,
    now: NOW,
    serverTimestamp: "SERVER_TIMESTAMP",
    leaseRegistrations: vi.fn(async () => registrations),
    releaseRegistrations: vi.fn(async () => {}),
    send: vi.fn(async () => ({ responses: [{ success: true }] })),
    prune: vi.fn(async () => {}),
  };
}

const END_NOW = new Date("2026-10-29T09:00:00Z");
const END_CONSENT = {
  enabled: true,
  challenges: false,
  challengeReminders: true,
};
const END_STATE = `users/${UID}/settings/challengeReminder-2026-10`;
function reminderSetup() {
  const args = { ...setup(), now: END_NOW };
  const candidate = announcements.reminderCandidate(
    PROFILE,
    END_CONSENT,
    END_NOW
  );
  args.db = firestore({
    [`users/${UID}`]: PROFILE,
    [`users/${UID}/settings/push`]: END_CONSENT,
    ...Object.fromEntries(
      candidate.definitions.map((definition) => [
        `challenges/${definition.id}`,
        definition,
      ])
    ),
  });
  args.definitions = candidate.definitions;
  args.join = (
    definition = candidate.definitions[0],
    currentValue = 0,
    uid = UID
  ) =>
    args.db.put(`challenges/${definition.id}/participants/${uid}`, {
      currentValue,
      tierAchieved: null,
    });
  return args;
}

describe("monthly closing reminders", () => {
  it.each([
    ["2026-10-28T09:00:00Z", false],
    ["2026-10-29T09:00:00Z", true],
    ["2026-10-31T09:59:00Z", true],
    ["2026-11-01T09:00:00Z", false],
    ["2027-02-25T09:00:00Z", false],
    ["2027-02-26T09:00:00Z", true],
    ["2028-02-26T09:00:00Z", false],
    ["2028-02-27T09:00:00Z", true],
    ["2026-04-27T08:00:00Z", false],
    ["2026-04-28T08:00:00Z", true],
    ["2026-12-29T09:00:00Z", true],
    ["2026-10-29T22:00:00Z", false],
    ["invalid", false],
  ])(
    "uses the final three LOCAL dates at the morning hour: %s => %s",
    (iso, expected) => {
      expect(
        Boolean(
          announcements.reminderCandidate(PROFILE, END_CONSENT, new Date(iso))
        )
      ).toBe(expected);
    }
  );

  it("covers February at UTC+14, UTC-12 and fractional offsets without announcing the previous month", () => {
    const east = new Date("2027-02-25T19:00:00Z");
    expect(announcements.isReminderSweepWindow(east)).toBe(true);
    expect(
      announcements.reminderCandidate(
        { timezone: "Pacific/Kiritimati" },
        END_CONSENT,
        east
      )?.dayKey
    ).toBe("2027-02-26");
    expect(
      announcements.reminderCandidate(
        { timezone: "Etc/GMT+12" },
        END_CONSENT,
        new Date("2027-02-28T21:00:00Z")
      )?.dayKey
    ).toBe("2027-02-28");
    expect(
      announcements.reminderCandidate(
        { timezone: "Asia/Kathmandu" },
        END_CONSENT,
        new Date("2027-02-26T04:00:00Z")
      )?.dayKey
    ).toBe("2027-02-26");
    expect(
      announcements.reminderCandidate(
        { timezone: "Pacific/Kiritimati" },
        END_CONSENT,
        new Date("2026-10-31T19:00:00Z")
      )
    ).toBeNull();
    for (const timezone of [undefined, "not-a-zone"])
      expect(
        announcements.reminderCandidate({ timezone }, END_CONSENT, END_NOW)
      ).toBeNull();
    expect(announcements.isReminderSweepWindow(new Date("invalid"))).toBe(
      false
    );
  });

  it("requires its own explicit opt-in, independent of launch announcements", async () => {
    for (const consent of [
      null,
      {},
      { enabled: true, challenges: true },
      { enabled: false, challengeReminders: true },
      { enabled: 1, challengeReminders: true },
      { enabled: true, challengeReminders: "true" },
    ])
      expect(
        announcements.reminderCandidate(PROFILE, consent, END_NOW)
      ).toBeNull();
    const args = reminderSetup();
    args.join();
    expect(await announcements.maybeSendReminder(args)).toBe(true);
    expect(args.send.mock.calls[0][0]).toMatchObject({
      data: {
        type: "challengeReminders",
        route: "/social",
        title: "Monthly challenges end soon",
        ownerUid: UID,
      },
      apns: { headers: { "apns-collapse-id": "challenges-ending-2026-10" } },
    });
  });

  it("sends a single campaign for several unfinished goals, once per account/month", async () => {
    const args = reminderSetup();
    args.definitions.slice(0, 3).forEach((definition) => args.join(definition));
    args.db.put(`users/${UID}/settings/challengeAnnouncement-2026-10`, {
      status: "sent",
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => announcements.maybeSendReminder(args))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(args.send).toHaveBeenCalledTimes(1);
    await announcements.maybeSendReminder({
      ...args,
      now: new Date("2026-10-30T09:00:00Z"),
    });
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(args.db.store.get(END_STATE)).toMatchObject({
      status: "sent",
      lastAttemptDateKey: "2026-10-29",
    });
    expect(
      args.db.store.get(`users/${UID}/settings/challengeAnnouncement-2026-10`)
    ).toEqual({ status: "sent" });
  });

  it("does not nudge non-members, weekly/seasonal memberships, or another account", async () => {
    const args = reminderSetup();
    args.join(undefined, 0, "someone-else");
    for (const definition of buildCurrentChallenges(END_NOW).filter(
      (item) => item.type !== "monthly"
    ))
      args.join(definition);
    expect(await announcements.maybeSendReminder(args)).toBe(false);
    expect(args.send).not.toHaveBeenCalled();
    expect(args.db.store.has(END_STATE)).toBe(false);
  });

  it("skips fully completed Gold goals for every personal metric, including lower-is-better 5K", async () => {
    for (const definition of reminderSetup().definitions.filter(
      (item) => !item.collectiveTarget
    )) {
      const args = reminderSetup();
      args.join(definition, definition.tiers.gold);
      expect(await announcements.maybeSendReminder(args), definition.id).toBe(
        false
      );
      args.join(
        definition,
        definition.metric === "fastest_effort"
          ? definition.tiers.gold + 1
          : definition.tiers.gold - 1
      );
      expect(await announcements.maybeSendReminder(args), definition.id).toBe(
        true
      );
    }
  });

  it("uses current progress rather than a stale tier marker, and rejects malformed values", async () => {
    const args = reminderSetup();
    const definition = args.definitions[0];
    for (const currentValue of [null, "0", NaN, Infinity, -1]) {
      args.join(definition, currentValue);
      expect(await announcements.maybeSendReminder(args)).toBe(false);
    }
    args.db.put(`challenges/${definition.id}/participants/${UID}`, {
      currentValue: 0,
      tierAchieved: "gold",
    });
    expect(await announcements.maybeSendReminder(args)).toBe(true);
  });

  it("uses the shared total to skip a completed collective goal, not the member's mileage", async () => {
    const args = reminderSetup();
    const group = args.definitions.find((item) => item.collectiveTarget);
    args.join(group, 1);
    args.join(group, 999, "another-runner");
    expect(await announcements.maybeSendReminder(args)).toBe(false);
    args.join(group, 998, "another-runner");
    expect(await announcements.maybeSendReminder(args)).toBe(true);
  });

  it.each([
    "consent",
    "leave",
    "completed",
    "definition",
    "profile",
    "deletion",
    "tombstone",
  ])("rechecks %s when acquiring the send claim", async (change) => {
    const args = reminderSetup();
    args.join();
    const definition = args.definitions[0];
    args.leaseRegistrations.mockImplementationOnce(async () => {
      if (change === "consent")
        args.db.put(`users/${UID}/settings/push`, {
          ...END_CONSENT,
          challengeReminders: false,
        });
      if (change === "leave")
        args.db.put(
          `challenges/${definition.id}/participants/${UID}`,
          undefined
        );
      if (change === "completed") args.join(definition, definition.tiers.gold);
      if (change === "definition")
        args.db.put(`challenges/${definition.id}`, {
          ...definition,
          metric: "wrong",
        });
      if (change === "profile") args.db.put(`users/${UID}`, undefined);
      if (change === "deletion")
        args.db.put(`accountDeletionRequests/${UID}`, { status: "running" });
      if (change === "tombstone") args.db.put(`deletedAccounts/${UID}`, {});
      return [{ token: "fcm" }];
    });
    expect(await announcements.maybeSendReminder(args)).toBe(false);
    expect(args.send).not.toHaveBeenCalled();
    expect(args.db.store.has(END_STATE)).toBe(false);
    expect(args.releaseRegistrations).toHaveBeenCalledOnce();
  });

  it("retries only confirmed zero-accepted delivery on a later remaining morning", async () => {
    const args = reminderSetup();
    args.join();
    args.send.mockResolvedValueOnce({
      responses: [
        { success: false, error: { code: "messaging/server-unavailable" } },
      ],
    });
    expect(await announcements.maybeSendReminder(args)).toBe(false);
    await announcements.maybeSendReminder(args);
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(
      await announcements.maybeSendReminder({
        ...args,
        now: new Date("2026-10-30T09:00:00Z"),
      })
    ).toBe(true);
    expect(args.db.store.get(END_STATE).status).toBe("sent");
  });

  it("consumes an ambiguous send and cannot recreate an erased reminder ledger", async () => {
    const args = reminderSetup();
    args.join();
    args.send.mockRejectedValueOnce(new Error("ambiguous"));
    await announcements.maybeSendReminder(args);
    await announcements.maybeSendReminder({
      ...args,
      now: new Date("2026-10-30T09:00:00Z"),
    });
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(args.db.store.get(END_STATE).status).toBe("uncertain");
    const erased = reminderSetup();
    erased.join();
    erased.send.mockImplementationOnce(async () => {
      erased.db.put(END_STATE, undefined);
      return { responses: [{ success: true }] };
    });
    await announcements.maybeSendReminder(erased);
    expect(erased.db.store.has(END_STATE)).toBe(false);
  });
});

describe("monthly announcement local eligibility", () => {
  it.each([
    ["2026-11-01T09:00:00Z", PROFILE, true],
    ["2026-11-03T09:59:00Z", PROFILE, true],
    ["2026-11-04T09:00:00Z", PROFILE, false],
    ["2026-10-31T09:00:00Z", PROFILE, false],
    ["2026-11-01T08:00:00Z", PROFILE, false],
    ["2026-11-01T22:00:00Z", PROFILE, false],
    ["invalid", PROFILE, false],
    ["2026-11-01T09:00:00Z", {}, false],
    ["2026-11-01T09:00:00Z", { timezone: "not-a-zone" }, false],
  ])("%s %j => %s", (instant, profile, eligible) => {
    expect(
      Boolean(
        announcements.announcementCandidate(profile, CONSENT, new Date(instant))
      )
    ).toBe(eligible);
  });

  it("requires explicit new consent, independently of older default-on types", () => {
    for (const consent of [
      null,
      {},
      { enabled: true },
      { enabled: true, challenges: false },
      { enabled: 1, challenges: true },
      { enabled: true, challenges: "true" },
    ]) {
      expect(
        announcements.announcementCandidate(PROFILE, consent, NOW)
      ).toBeNull();
    }
  });

  it("selects the local month at UTC month boundaries and handles fractional zones", () => {
    const east = announcements.announcementCandidate(
      { timezone: "Pacific/Kiritimati" },
      CONSENT,
      new Date("2026-10-31T19:00:00Z")
    );
    expect(east.periodKey).toBe("2026-11");
    expect(east.definition.id).toBe("featured-monthly-2026-11-01");
    const west = announcements.announcementCandidate(
      { timezone: "Etc/GMT+12" },
      CONSENT,
      new Date("2026-11-03T21:00:00Z")
    );
    expect(west.dayKey).toBe("2026-11-03");
    expect(
      announcements.announcementCandidate(
        { timezone: "Asia/Kathmandu" },
        CONSENT,
        new Date("2026-11-01T04:00:00Z")
      )?.dayKey
    ).toBe("2026-11-01");
  });

  it("bounds all-users sweeps to UTC dates covering every local catchup morning", () => {
    for (const instant of [
      "2026-10-31T19:00:00Z",
      "2026-11-01T09:00:00Z",
      "2026-11-04T00:00:00Z",
    ]) {
      expect(announcements.isSweepWindow(new Date(instant))).toBe(true);
    }
    expect(announcements.isSweepWindow(new Date("2026-11-05T09:00:00Z"))).toBe(
      false
    );
    expect(announcements.isSweepWindow(new Date("invalid"))).toBe(false);
  });
});

describe("monthly delivery claim and retry behavior", () => {
  it("sends once under concurrent sweep deliveries and repeated calls", async () => {
    const args = setup();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        announcements.maybeSendAnnouncement(args)
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(args.db.store.get(STATE)).toMatchObject({
      status: "sent",
      lastAttemptDateKey: "2026-11-01",
    });
    await announcements.maybeSendAnnouncement({
      ...args,
      now: new Date("2026-11-02T09:00:00Z"),
    });
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(args.releaseRegistrations).toHaveBeenCalledTimes(13);
  });

  it("retries explicit zero-accepted delivery on the next morning only, then stops", async () => {
    const args = setup();
    args.send.mockResolvedValueOnce({
      responses: [
        { success: false, error: { code: "messaging/server-unavailable" } },
      ],
    });
    expect(await announcements.maybeSendAnnouncement(args)).toBe(false);
    expect(args.db.store.get(STATE).status).toBe("retryable");
    await announcements.maybeSendAnnouncement(args);
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(
      await announcements.maybeSendAnnouncement({
        ...args,
        now: new Date("2026-11-02T09:00:00Z"),
      })
    ).toBe(true);
    expect(args.send).toHaveBeenCalledTimes(2);
    await announcements.maybeSendAnnouncement(args); // stale older invocation
    expect(args.send).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate an accepted delivery to another device after partial success", async () => {
    const args = setup();
    args.leaseRegistrations.mockResolvedValue([
      { token: "native" },
      { token: "web" },
    ]);
    args.send.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: "messaging/internal-error" } },
      ],
    });
    expect(await announcements.maybeSendAnnouncement(args)).toBe(true);
    await announcements.maybeSendAnnouncement({
      ...args,
      now: new Date("2026-11-02T09:00:00Z"),
    });
    expect(args.send).toHaveBeenCalledTimes(1);
  });

  it.each(["throw", "malformed"])(
    "consumes ambiguous %s delivery to avoid duplicate banners",
    async (result) => {
      const args = setup();
      if (result === "throw")
        args.send.mockRejectedValue(
          new Error("transport may have accepted token-secret")
        );
      else args.send.mockResolvedValue({ responses: [{ success: false }] });
      expect(await announcements.maybeSendAnnouncement(args)).toBe(false);
      expect(args.db.store.get(STATE).status).toBe("uncertain");
      await announcements.maybeSendAnnouncement({
        ...args,
        now: new Date("2026-11-02T09:00:00Z"),
      });
      expect(args.send).toHaveBeenCalledTimes(1);
      expect(args.prune).not.toHaveBeenCalled();
    }
  );

  it("a crash or failed completion after FCM acceptance leaves a consumed claim", async () => {
    const args = setup();
    const realTx = args.db.runTransaction;
    let calls = 0;
    args.db.runTransaction = async (fn) => {
      if (++calls === 2) throw new Error("database unavailable after send");
      return realTx(fn);
    };
    await expect(announcements.maybeSendAnnouncement(args)).rejects.toThrow(
      "database unavailable"
    );
    expect(args.db.store.get(STATE).status).toBe("sending");
    await announcements.maybeSendAnnouncement(args);
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(args.releaseRegistrations).toHaveBeenCalledTimes(2);
  });

  it("does not consume the month when no owned tokens are available", async () => {
    const args = setup();
    args.leaseRegistrations.mockResolvedValueOnce([]);
    expect(await announcements.maybeSendAnnouncement(args)).toBe(false);
    expect(args.db.store.has(STATE)).toBe(false);
    expect(await announcements.maybeSendAnnouncement(args)).toBe(true);
  });

  it.each([
    "missing",
    "metric",
    "type",
    "name",
    "tiers",
    "startDate",
    "endDate",
  ])("waits for a canonical current definition (%s)", async (change) => {
    const args = setup();
    const path = `challenges/${feature().id}`;
    const definition = feature();
    if (change === "missing") args.db.put(path, undefined);
    else
      args.db.put(path, {
        ...definition,
        [change]: change === "tiers" ? {} : "wrong",
      });
    await announcements.maybeSendAnnouncement(args);
    expect(args.send).not.toHaveBeenCalled();
    expect(args.db.store.has(STATE)).toBe(false);
    args.db.put(path, definition);
    expect(await announcements.maybeSendAnnouncement(args)).toBe(true);
  });

  it("tomorrow's lookahead definition cannot trigger tomorrow's notification today", async () => {
    const args = setup();
    await announcements.maybeSendAnnouncement({
      ...args,
      now: new Date("2026-10-31T09:00:00Z"),
    });
    expect(args.send).not.toHaveBeenCalled();
    expect(args.leaseRegistrations).not.toHaveBeenCalled();
  });

  it.each(["consent", "profile", "deletion", "tombstone"])(
    "rechecks %s inside the atomic claim",
    async (change) => {
      const args = setup();
      args.leaseRegistrations.mockImplementationOnce(async () => {
        if (change === "consent")
          args.db.put(`users/${UID}/settings/push`, {
            ...CONSENT,
            challenges: false,
          });
        if (change === "profile") args.db.put(`users/${UID}`, undefined);
        if (change === "deletion")
          args.db.put(`accountDeletionRequests/${UID}`, { status: "running" });
        if (change === "tombstone") args.db.put(`deletedAccounts/${UID}`, {});
        return [{ token: "fcm" }];
      });
      await announcements.maybeSendAnnouncement(args);
      expect(args.send).not.toHaveBeenCalled();
      expect(args.db.store.has(STATE)).toBe(false);
      expect(args.releaseRegistrations).toHaveBeenCalledTimes(1);
    }
  );

  it("completion cannot recreate an erased ledger or write through a deletion lock", async () => {
    for (const erase of [true, false]) {
      const args = setup();
      args.send.mockImplementationOnce(async () => {
        if (erase) args.db.put(STATE, undefined);
        args.db.put(`accountDeletionRequests/${UID}`, { status: "running" });
        return { responses: [{ success: true }] };
      });
      await announcements.maybeSendAnnouncement(args);
      expect(args.db.store.get(STATE)?.status).toBe(
        erase ? undefined : "sending"
      );
    }
  });

  it("an older attempt's completion cannot overwrite a newer claim", async () => {
    const args = setup();
    const candidate = announcements.announcementCandidate(
      PROFILE,
      CONSENT,
      NOW
    );
    const first = await announcements.claimAnnouncement(
      args.db,
      UID,
      candidate,
      NOW,
      "TS"
    );
    await announcements.finishAnnouncement(
      args.db,
      UID,
      first,
      "retryable",
      NOW,
      "TS"
    );
    const tomorrow = new Date("2026-11-02T09:00:00Z");
    const next = await announcements.claimAnnouncement(
      args.db,
      UID,
      announcements.announcementCandidate(PROFILE, CONSENT, tomorrow),
      tomorrow,
      "TS"
    );
    await announcements.finishAnnouncement(
      args.db,
      UID,
      first,
      "sent",
      NOW,
      "TS"
    );
    expect(args.db.store.get(STATE)).toMatchObject({
      status: "sending",
      attemptId: next.attemptId,
    });
  });

  it("each later calendar month can claim independently", async () => {
    const args = setup();
    await announcements.maybeSendAnnouncement(args);
    const december = new Date("2026-12-01T09:00:00Z");
    args.db.put(`challenges/${feature(december).id}`, feature(december));
    expect(
      await announcements.maybeSendAnnouncement({ ...args, now: december })
    ).toBe(true);
    expect(
      args.db.store.get(`users/${UID}/settings/challengeAnnouncement-2026-12`)
        .status
    ).toBe("sent");
  });

  it("sends APNs alerts plus data-only web fields and account-safe tap data", async () => {
    const args = setup();
    await announcements.maybeSendAnnouncement(args);
    expect(args.send).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["native-fcm-token"],
        data: expect.objectContaining({
          type: "challenges",
          route: "/social",
          ownerUid: UID,
          challengeId: "featured-monthly-2026-11-01",
        }),
        webpush: { headers: { TTL: "3600" } },
        apns: {
          headers: {
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-expiration": String(NOW.getTime() / 1000 + 3600),
            "apns-collapse-id": "challenges-2026-11",
          },
          payload: {
            aps: {
              alert: expect.objectContaining({
                title: "New monthly challenges",
              }),
              sound: "default",
            },
          },
        },
      })
    );
    expect(args.send.mock.calls[0][0].notification).toBeUndefined();
  });
});

describe("all-users announcement pagination", () => {
  function pages(users, failPage) {
    let page = 0;
    const cursors = [];
    return {
      cursors,
      collection: (name) => {
        expect(name).toBe("users");
        const query = {
          orderBy: (field) => {
            expect(field).toBe("DOCUMENT_ID");
            return query;
          },
          limit: () => query,
          startAfter: (doc) => {
            cursors.push(doc.id);
            return query;
          },
          get: async () => {
            if (page === failPage) throw new Error("page unavailable");
            return {
              docs: (users[page++] || []).map((id) => ({
                id,
                data: () => ({ timezone: "Europe/London" }),
              })),
            };
          },
        };
        return query;
      },
    };
  }

  it("visits every paginated user, including those without lastActiveAt", async () => {
    const db = pages([["a", "b"], ["c", "d"], ["e"]]);
    const perUser = vi.fn(async () => {});
    await announcements.sweepAnnouncementUsers({
      db,
      now: NOW,
      documentId: "DOCUMENT_ID",
      perUser,
      pageSize: 2,
    });
    expect(perUser.mock.calls.map(([uid]) => uid)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(db.cursors).toEqual(["b", "d"]);
  });

  it("does not query users outside the global catchup window", async () => {
    await announcements.sweepAnnouncementUsers({
      db: {},
      now: new Date("2026-11-10T09:00:00Z"),
    });
  });

  it("includes closing mornings in the actual bounded user sweep when enabled", async () => {
    const perUser = vi.fn(async () => {});
    await announcements.sweepAnnouncementUsers({
      db: pages([[UID]]),
      now: END_NOW,
      documentId: "DOCUMENT_ID",
      perUser,
      includeReminders: true,
    });
    expect(perUser).toHaveBeenCalledOnce();
    perUser.mockClear();
    await announcements.sweepAnnouncementUsers({
      db: {},
      now: END_NOW,
      documentId: "DOCUMENT_ID",
      perUser,
    });
    expect(perUser).not.toHaveBeenCalled();
  });

  it("surfaces a failed later page for a future scheduled catchup", async () => {
    const perUser = vi.fn(async () => {});
    await expect(
      announcements.sweepAnnouncementUsers({
        db: pages([["a", "b"]], 1),
        now: NOW,
        documentId: "DOCUMENT_ID",
        perUser,
        pageSize: 2,
      })
    ).rejects.toThrow("page unavailable");
    expect(perUser).toHaveBeenCalledTimes(2);
  });

  it("continues other recipients then catches up failed user work without redelivering successful sends", async () => {
    const args = setup();
    let fail = true;
    const perUser = vi.fn(async (uid) => {
      if (uid === "failed" && fail)
        throw new Error("claim database unavailable");
      if (uid === "owner") await announcements.maybeSendAnnouncement(args);
    });
    const sweep = () =>
      announcements.sweepAnnouncementUsers({
        db: pages([["failed", "owner"]]),
        now: NOW,
        documentId: "DOCUMENT_ID",
        perUser,
        pageSize: 2,
      });
    await expect(sweep()).rejects.toThrow("sweep incomplete");
    fail = false;
    await sweep();
    expect(args.send).toHaveBeenCalledTimes(1);
    expect(perUser).toHaveBeenCalledTimes(4);
  });
});

describe("production monthly sender wiring", () => {
  it("the same hourly export reaches the closing reminder sender in the final-days window", async () => {
    const fns = require("../index");
    const locks = require("../lib/accountDeletionLocks");
    const guard = vi
      .spyOn(locks, "shouldSystemWriteProceed")
      .mockResolvedValue(true);
    const reminder = vi
      .spyOn(announcements, "maybeSendReminder")
      .mockResolvedValue(true);
    const launch = vi
      .spyOn(announcements, "maybeSendAnnouncement")
      .mockResolvedValue(true);
    const sweep = vi
      .spyOn(announcements, "sweepAnnouncementUsers")
      .mockImplementation(async ({ perUser, includeReminders }) => {
        expect(includeReminders).toBe(true);
        await perUser(UID, PROFILE);
      });
    vi.useFakeTimers();
    vi.setSystemTime(END_NOW);
    try {
      await fns.hourlyChallengeAnnouncements.run();
      expect(reminder).toHaveBeenCalledOnce();
      expect(reminder).toHaveBeenCalledWith(
        expect.objectContaining({ uid: UID, now: END_NOW })
      );
      expect(launch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      guard.mockRestore();
      reminder.mockRestore();
      launch.mockRestore();
      sweep.mockRestore();
    }
  });

  it("the scheduled export reaches the tested projection and skips other local-hour deletion reads", async () => {
    const fns = require("../index");
    const locks = require("../lib/accountDeletionLocks");
    const guard = vi
      .spyOn(locks, "shouldSystemWriteProceed")
      .mockResolvedValue(true);
    const decision = vi
      .spyOn(announcements, "maybeSendAnnouncement")
      .mockResolvedValue(true);
    const sweep = vi
      .spyOn(announcements, "sweepAnnouncementUsers")
      .mockImplementation(async ({ perUser }) => {
        await perUser("other-hour", { timezone: "Asia/Tokyo" });
        await perUser(UID, PROFILE);
      });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await fns.hourlyChallengeAnnouncements.run();
      expect(sweep).toHaveBeenCalledOnce();
      expect(guard).toHaveBeenCalledOnce();
      expect(guard).toHaveBeenCalledWith(
        expect.anything(),
        UID,
        "hourlyChallengeAnnouncements"
      );
      expect(decision).toHaveBeenCalledOnce();
      expect(decision).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: UID,
          now: NOW,
          profile: PROFILE,
          leaseRegistrations: expect.any(Function),
          releaseRegistrations: expect.any(Function),
          send: expect.any(Function),
          prune: expect.any(Function),
        })
      );
    } finally {
      vi.useRealTimers();
      guard.mockRestore();
      decision.mockRestore();
      sweep.mockRestore();
    }
  });
});
