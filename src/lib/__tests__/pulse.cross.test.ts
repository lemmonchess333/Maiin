/**
 * The live pulse, both halves (Soc15): what the server writes is what the
 * app reads.
 *
 * functions/lib/pulse.js counts each session in `pulse/{its date}`, the
 * local day the app saved it under. The app reads `pulse/{its own local
 * today}` (usePulse) and takes `sessions` off it (pulseSessions). The
 * server's credit is driven here, on the in-memory Firestore, for sessions
 * the app dates with its own helper, so a renamed collection, a renamed
 * field or a day keyed another way on either side fails.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { localDateString } from "@/lib/dateHelpers";
import {
  PULSE_COLLECTION,
  PULSE_MIN_SESSIONS,
  pulseSessions,
  showsPulse,
} from "@/lib/pulse";

const require = createRequire(import.meta.url);
const { COLLECTION, creditSessionToPulse } =
  require("../../../functions/lib/pulse.js") as {
    COLLECTION: string;
    creditSessionToPulse: (
      db: unknown,
      args: Record<string, unknown>
    ) => Promise<boolean>;
  };
const {
  memoryFirestore,
  increment,
} = require("../../../functions/__tests__/helpers/memoryFirestore.cjs");

const fieldValue = { increment, serverTimestamp: () => "now" };

describe("the pulse, server and app", () => {
  it("keep each day's count in the same collection", () => {
    expect(PULSE_COLLECTION).toBe(COLLECTION);
  });

  it("the sessions the server counts today are the figure the app reads today", async () => {
    const db = memoryFirestore();
    // Workouts as the app saves them: dated with its own local day.
    const date = localDateString();
    for (let i = 0; i < PULSE_MIN_SESSIONS; i++) {
      const path = `users/u${i}/workouts/w${i}`;
      db.data.set(path, { date, durationMinutes: 40 });
      await expect(
        creditSessionToPulse(db, {
          uid: `u${i}`,
          kind: "workout",
          sessionId: `w${i}`,
          data: db.data.get(path),
          sourceRef: db.doc(path),
          fieldValue,
          nowMs: Date.now(),
        })
      ).resolves.toBe(true);
    }
    const read = pulseSessions(db.data.get(`${PULSE_COLLECTION}/${date}`));
    expect(read).toBe(PULSE_MIN_SESSIONS);
    expect(showsPulse(read)).toBe(true);
  });
});
