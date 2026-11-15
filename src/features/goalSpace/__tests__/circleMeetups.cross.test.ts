/**
 * Run26 call 4 — the meet-up bounds the plan sheet holds are the ones the
 * server enforces (functions/lib/circleMeetups.js). If they drift, the
 * sheet offers a title, a place or a day the callable refuses, or the
 * list reads fewer meet-ups than a Circle may hold.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import * as client from "../circleMeetups";
import { describeMeetupRejection } from "../meetupRejection";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/circleMeetups.js");

describe("meet-up bounds — client and server agree", () => {
  it("has the same sports, lengths, windows and cap", () => {
    expect([...client.MEETUP_SPORTS]).toEqual([...server.MEETUP_SPORTS]);
    expect(client.MEETUP_TITLE_MAX).toBe(server.MEETUP_TITLE_MAX);
    expect(client.MEETUP_PLACE_MAX).toBe(server.MEETUP_PLACE_MAX);
    expect(client.MEETUP_NOTE_MAX).toBe(server.MEETUP_NOTE_MAX);
    expect(client.MEETUP_MAX_AHEAD_MS).toBe(server.MEETUP_MAX_AHEAD_MS);
    expect(client.MEETUP_SHOWN_AFTER_START_MS).toBe(
      server.MEETUP_SHOWN_AFTER_START_MS
    );
    expect(client.MEETUPS_AHEAD_MAX).toBe(server.MEETUPS_AHEAD_MAX);
    // Run27 call 10: the pace groups' cap, how a meet-up repeats, and the
    // reminder's lead the plan sheet's words rest on.
    expect(client.MEETUP_PACE_GROUPS_MAX).toBe(server.MEETUP_PACE_GROUPS_MAX);
    expect([...client.MEETUP_REPEATS]).toEqual([...server.MEETUP_REPEATS]);
    expect(client.MEETUP_REMINDER_LEAD_MS).toBe(server.MEETUP_REMINDER_LEAD_MS);
  });

  it("reads a stored weekly meet-up with its pace groups as the server writes it", () => {
    const now = Date.now();
    const stored = {
      organiserUid: "maya",
      ...server.normaliseMeetupInput(
        {
          sport: "run",
          title: "Saturday long run",
          place: "Tooting Lido gate",
          paceGroups: "5:30 and 6:15 /km",
          repeat: "weekly",
          startsAt: now + 3 * 86_400_000,
          timeZone: "Europe/London",
        },
        now
      ),
      going: ["maya"],
      createdAt: now,
    };
    expect(client.parseCircleMeetup({ id: "m1", ...stored })).toMatchObject({
      paceGroups: "5:30 and 6:15 /km",
      repeat: "weekly",
    });
  });

  it("says each server refusal in words, never the fallback", () => {
    const now = Date.now();
    const valid = {
      sport: "run",
      title: "Saturday long run",
      place: "Tooting Lido gate",
      note: null,
      startsAt: now + 3_600_000,
      timeZone: "Europe/London",
    };
    const refusals: unknown[] = [];
    for (const patch of [
      { startsAt: now - 3_600_000 },
      { startsAt: now + server.MEETUP_MAX_AHEAD_MS + 3_600_000 },
      { title: "rude" },
      { paceGroups: "rude" },
      { paceGroups: "x".repeat(server.MEETUP_PACE_GROUPS_MAX + 1) },
    ]) {
      try {
        server.normaliseMeetupInput({ ...valid, ...patch }, now, (t: string) =>
          t.includes("rude")
        );
      } catch (err) {
        refusals.push(err);
      }
    }
    expect(refusals).toHaveLength(5);
    for (const err of refusals) {
      expect(describeMeetupRejection(err)).not.toBe(
        "Couldn’t save that. Try again."
      );
    }
  });
});
