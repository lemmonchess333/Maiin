/**
 * The notification types the server sends, against the ones the tray shows.
 *
 * createNotification (functions/lib/socialFanout.js) writes only a type on
 * VALID_NOTIFICATION_TYPES; the tray (useNotifications) drops any stored
 * type it does not list, and NotificationsSheet draws an icon and words
 * per type it does. A type added to the server alone is written, never
 * seen, and every test on both sides stays green, which is how a new
 * notification could ship dead. A type the tray lists that the server
 * refuses is a row nobody can send.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { TRAY_NOTIFICATION_TYPES } from "@/hooks/useNotifications";

const require = createRequire(import.meta.url);
const { VALID_NOTIFICATION_TYPES } =
  require("../../../functions/lib/socialFanout.js") as {
    VALID_NOTIFICATION_TYPES: string[];
  };

/** What is sent but not shown, and shown but never sent. */
function drift(server: readonly string[], tray: readonly string[]) {
  return {
    notShown: server.filter((t) => !tray.includes(t)),
    neverSent: tray.filter((t) => !server.includes(t)),
  };
}

describe("notification types — the server and the tray agree", () => {
  it("the tray shows every type the server sends, and no other", () => {
    expect(drift(VALID_NOTIFICATION_TYPES, TRAY_NOTIFICATION_TYPES)).toEqual({
      notShown: [],
      neverSent: [],
    });
  });

  it("reads a type on one side only as a mismatch", () => {
    // Guards the guard against an equality that passes over empty lists.
    expect(VALID_NOTIFICATION_TYPES.length).toBeGreaterThan(5);
    expect(
      drift([...VALID_NOTIFICATION_TYPES, "brand_new"], TRAY_NOTIFICATION_TYPES)
        .notShown
    ).toEqual(["brand_new"]);
    expect(
      drift(VALID_NOTIFICATION_TYPES, [...TRAY_NOTIFICATION_TYPES, "retired"])
        .neverSent
    ).toEqual(["retired"]);
  });
});
