/**
 * App1 Q62's two halves, one rule. The server counts the streak and review
 * pushes (`functions/lib/reminderAttention.js`) and the app writes the
 * answers it reads and reads the quiet marks it writes
 * (`src/lib/reminderAttention.ts`). Both run: if their field names part,
 * every answer the app writes is one the server never reads, and every
 * push reminder goes quiet after three, answered or not.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import * as client from "@/lib/reminderAttention";
import * as choices from "@/lib/reminderChoices";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/reminderAttention.js") as {
  IGNORED_LIMIT: number;
  PUSH_REMINDER_KINDS: readonly string[];
  reminderAttentionFields: typeof client.reminderAttentionFields;
  millisOf: typeof client.millisOf;
  quietPatch: (kind: string, at: unknown) => Record<string, unknown>;
  settleReminderPush: (
    kind: string,
    reminders: Record<string, unknown>
  ) => { ignored: number; quiet: boolean };
};

describe("Q62, the app's half and the server's", () => {
  it("go quiet at the same count", () => {
    expect(server.IGNORED_LIMIT).toBe(client.IGNORED_LIMIT);
  });

  it("agree on which reminders the server counts", () => {
    expect([...server.PUSH_REMINDER_KINDS]).toEqual([
      ...client.PUSH_REMINDER_KINDS,
    ]);
  });

  it("name every field alike", () => {
    for (const kind of client.REMINDER_KINDS)
      expect(server.reminderAttentionFields(kind)).toEqual(
        client.reminderAttentionFields(kind)
      );
  });

  it("read stored times alike", () => {
    for (const value of [
      0,
      5,
      new Date(7),
      { toMillis: () => 9 },
      { seconds: 1, nanoseconds: 5e6 },
      null,
      undefined,
      "x",
      {},
      Number.NaN,
    ])
      expect(server.millisOf(value)).toBe(client.millisOf(value));
  });

  it("turn off the switch the app reads, and leave the mark Home says once", () => {
    for (const kind of client.PUSH_REMINDER_KINDS) {
      const patch = server.quietPatch(kind, 5);
      const reminders = { ...patch };
      const off =
        kind === "streak"
          ? choices.streakReminderChoice({ reminders }).enabled
          : choices.reviewReminderChoice({ reminders }).enabled;
      expect(off).toBe(false);
      expect(client.quietToShow(reminders)).toEqual([kind]);
    }
  });

  it("an answer the app writes is one the server counts", () => {
    const now = new Date(2026, 10, 12, 21).getTime();
    const sent = new Date(2026, 10, 12, 20).getTime();
    for (const kind of client.PUSH_REMINDER_KINDS) {
      const fields = client.reminderAttentionFields(kind);
      const stored = { [fields.sentAt]: sent, [fields.ignored]: 2 };
      expect(client.pushRemindersToAnswer(stored, now)).toEqual([kind]);
      expect(server.settleReminderPush(kind, stored)).toMatchObject({
        quiet: true,
      });
      expect(
        server.settleReminderPush(kind, { ...stored, [fields.answeredAt]: now })
      ).toMatchObject({ ignored: 0, quiet: false });
    }
  });
});
