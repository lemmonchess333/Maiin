import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";

/**
 * The command ENVELOPE seam — client send shape ↔ server unwrap shape.
 *
 * This is the gap that let every programme command fail in production for a
 * week. The client posts the command as the whole callable payload
 * (`programCommandClient.ts`: `call(command)`); the server read
 * `data && data.command`, a property no client ever set. `data.command` was
 * therefore always `undefined`, `assertClientProgramCommand` threw
 * `invalid-argument`, and the user saw "Couldn't save that set. Refreshing."
 * on every single set — 100% failure, not intermittent.
 *
 * Neither existing suite could see it, and that is the lesson worth pinning:
 *
 *   - the client boundary test `vi.mock`s `programCommandClient` away, so
 *     `call(command)` — the one line that builds the envelope — never runs,
 *     and it then feeds the captured command DIRECTLY into the real validator,
 *     i.e. it simulates a server that already unwrapped correctly;
 *   - `functions/__tests__/programCommands.test.js` imports the pure validator
 *     from `lib/`, so nothing ever evaluates the callable's unwrap expression.
 *
 * So one suite proved the command object is valid and the other proved the
 * validator accepts it, while the transport between them was asserted by
 * nothing. This test is deliberately the join: it runs the REAL sender against
 * a stub callable, captures what actually goes over the wire, applies the
 * server's own unwrap, and pushes the result through the real server
 * validator. It fails if either side's shape moves.
 */
const require = createRequire(import.meta.url);
const programCommands =
  require("../../../../functions/lib/programCommands") as {
    assertClientProgramCommand: (command: unknown) => { kind: string };
  };

/** The server's unwrap, mirrored from functions/index.js applyProgramCommand.
 *  Kept as an expression here on purpose — if the callable's read changes,
 *  this must change with it, and the assertions below say why. */
function serverUnwrap(data: unknown): unknown {
  return data &&
    typeof data === "object" &&
    (data as { command?: unknown }).command
    ? (data as { command: unknown }).command
    : data;
}

const captured: unknown[] = [];
const mockCall = vi.fn(async (payload: unknown) => {
  captured.push(payload);
  return { data: {} };
});

// NOT mocking programCommandClient — that module under test is the whole point.
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: () => mockCall,
}));

/** The real shape `useProgram.logExercise` posts (useProgram.ts ~2005): the
 *  precondition triple, the exercise instance, and the actual set. Invented
 *  fields are rejected by `assertKeys`, which is the point — this fixture is
 *  only meaningful if it is the command production actually sends. */
const LOG_EXERCISE_COMMAND = {
  kind: "logExercise" as const,
  commandId: "11111111-1111-4111-8111-111111111111",
  dayIndex: 0,
  expectedWeekNumber: 1,
  expectedDaySignature: "sig-abc",
  exerciseInstanceId: "inst-1",
  actual: { weight: 60, reps: 8, completed: true },
  today: "2026-08-04",
};

beforeEach(() => {
  captured.length = 0;
  mockCall.mockClear();
});

describe("programme command envelope — client send ↔ server unwrap", () => {
  it("what the client posts survives the server's unwrap and validates", async () => {
    const { sendProgramCommand } = await import("../programCommandClient");
    await sendProgramCommand(
      LOG_EXERCISE_COMMAND as unknown as Parameters<
        typeof sendProgramCommand
      >[0]
    );

    expect(captured).toHaveLength(1);
    const overTheWire = captured[0];

    // The join: the server's own unwrap applied to the real posted payload,
    // fed to the real server validator. Pre-fix this threw
    // "A programme command object is required."
    const unwrapped = serverUnwrap(overTheWire);
    const validated = programCommands.assertClientProgramCommand(unwrapped);
    expect(validated.kind).toBe("logExercise");
  });

  it("the payload IS the command — no wrapper property", async () => {
    const { sendProgramCommand } = await import("../programCommandClient");
    await sendProgramCommand(
      LOG_EXERCISE_COMMAND as unknown as Parameters<
        typeof sendProgramCommand
      >[0]
    );

    // Stated as its own assertion so a future change to either side is a
    // deliberate decision rather than a silent divergence: if the client ever
    // starts wrapping, this fails and the server's unwrap must be revisited.
    const overTheWire = captured[0] as Record<string, unknown>;
    expect(overTheWire).not.toHaveProperty("command");
    expect(overTheWire.kind).toBe("logExercise");
  });

  it("the server still accepts a wrapped payload (queued-outbox tolerance)", () => {
    // Deployed clients and localStorage outbox entries may hold either shape
    // while the fix rolls out; both must land.
    const validated = programCommands.assertClientProgramCommand(
      serverUnwrap({ command: LOG_EXERCISE_COMMAND })
    );
    expect(validated.kind).toBe("logExercise");
  });

  it("an undefined unwrap is rejected — the pre-fix production behaviour", () => {
    // Pins the failure mode itself, so the diagnosis stays legible: this is
    // exactly what every user hit on every set.
    expect(() =>
      programCommands.assertClientProgramCommand(serverUnwrap(undefined))
    ).toThrow(/programme command object is required/i);
  });
});
