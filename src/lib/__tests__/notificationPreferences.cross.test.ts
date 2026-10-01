/**
 * The notification switches, client and server (S3).
 *
 * Settings draws each switch from src/lib/notificationPreferences.ts; the
 * server decides what is sent from functions/lib/notificationPreferences.js,
 * and the rules' value gate decides what may be stored. If the client's
 * defaults drift from the server's, a switch shows "on" for a kind that is
 * not sent; if a key drifts from the rules, flipping that switch is refused.
 * Both would look like working settings.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_DEFAULTS,
  notificationEnabled,
  resolvedNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notificationPreferences";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/notificationPreferences.js");

/** One notification type per switch, for asking the server. */
const TYPE_FOR: Record<string, string> = {};
for (const [type, category] of Object.entries(
  server.CATEGORY_BY_TYPE as Record<string, string | null>
)) {
  if (category && !TYPE_FOR[category]) TYPE_FOR[category] = type;
}

describe("notification switches — client and server agree", () => {
  it("has the same switches, in the same order", () => {
    expect([...NOTIFICATION_CATEGORIES]).toEqual([
      ...server.NOTIFICATION_CATEGORIES,
    ]);
  });

  it("has the same defaults", () => {
    expect({ ...NOTIFICATION_DEFAULTS }).toEqual({
      ...server.NOTIFICATION_DEFAULTS,
    });
  });

  it("reads stored values the way the server does", () => {
    const stored: unknown[] = [
      undefined,
      null,
      {},
      { kudos: false, follows: true },
      { comments: false, circles: false, spaces: false },
      { kudos: "false", follows: "true" },
      { follows: 1 },
      ["kudos"],
      "off",
    ];
    for (const prefs of stored) {
      for (const category of NOTIFICATION_CATEGORIES) {
        expect(
          notificationEnabled(prefs as NotificationPreferences, category),
          `${JSON.stringify(prefs)} · ${category}`
        ).toBe(server.wantsNotification(prefs, TYPE_FOR[category]));
      }
    }
  });

  it("writes a full map the rules accept", () => {
    const resolved = resolvedNotificationPreferences({ follows: true });
    expect(Object.keys(resolved)).toEqual([...NOTIFICATION_CATEGORIES]);
    expect(Object.values(resolved).every((v) => typeof v === "boolean")).toBe(
      true
    );
  });

  it("stores the keys the rules allow, each as a boolean", () => {
    const rules = readFileSync(
      join(__dirname, "..", "..", "..", "firestore.rules"),
      "utf8"
    );
    const gate = rules.slice(
      rules.indexOf("function notificationPreferencesValid()"),
      rules.indexOf("function notificationPreferencesUnchangedOrValid()")
    );
    const keys = NOTIFICATION_CATEGORIES.map((k) => `'${k}'`).join(", ");
    expect(gate).toContain(`p.keys().hasOnly([${keys}])`);
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(gate).toContain(
        `(!('${category}' in p) || p.${category} is bool)`
      );
    }
  });
});
