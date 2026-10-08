/**
 * The taps the app sends as programme commands (`runProgramCommand` in
 * useProgram.ts, through the `applyProgramCommand` callable), run through
 * the server's own code in the order its transaction runs it
 * (`programCommandTransaction.js`): the reducer (`programCommands.js`),
 * then the top-level allow-list (`programStateSanitizer.js`). On success
 * the client re-reads the stored document and holds it raw
 * (`refetchProgramState`), and so does the simulator.
 *
 * A refusal is the app's answer, not a crash: it comes back with the
 * server's words, as the person's toast would say them. So does a result
 * the transaction couldn't store: a key the allow-list drops, or an
 * `undefined` anywhere in it, which the Admin SDK's `tx.set` refuses (the
 * client's own writes strip them, `stripUndefined`; the server's don't).
 * The reducer reads the stored document, so the state sent is stripped as
 * the client's last write stored it: an `undefined` in a result is the
 * reducer's own.
 */
import { createRequire } from "node:module";
import type { UserProfile } from "@/lib/auth";
import { stripUndefined } from "@/lib/firestoreGuards";
import type { ProgramState } from "@/features/program/programTypes";

const requireServer = createRequire(import.meta.url);
const server = requireServer("../../../functions/lib/programCommands") as {
  applyProgramCommand: (args: {
    state: unknown;
    profile: unknown;
    command: unknown;
    now: number;
  }) => { state: ProgramState; effects: { profile?: Partial<UserProfile> } };
};
const sanitizer = requireServer(
  "../../../functions/lib/programStateSanitizer"
) as {
  sanitizeProgramState: (state: unknown) => {
    value: ProgramState;
    dropped: string[];
  };
  programStateTooLarge: (state: unknown) => boolean;
};

export type CommandOutcome =
  | { applied: true; state: ProgramState; profile?: Partial<UserProfile> }
  /** The server said no, in these words. */
  | { applied: false; refused: string }
  /** The reducer's result is one the transaction can't store. */
  | { applied: false; unstorable: string };

/** Where an `undefined` sits in a value, or null when none does. */
export function undefinedAt(value: unknown, path = "state"): string | null {
  if (value === undefined) return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = undefinedAt(value[i], `${path}[${String(i)}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const found = undefinedAt(v, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

/** One person's commands: ids the validator accepts, counted so a season
 *  replays, and a clock that moves on between two commands of a day (the
 *  undo order between a lighter week and an easier one reads it). */
export class CommandSender {
  private sent = 0;
  private readonly who: string;

  constructor(who: string) {
    this.who = who;
  }

  /** A command id (`assertCommandId`: 16–128 of A–Z, a–z, 0–9, _ and -). */
  nextId(): string {
    this.sent++;
    return `sim-${this.who}-${String(this.sent).padStart(6, "0")}`.replace(
      /[^A-Za-z0-9_-]/g,
      "-"
    );
  }

  send(
    state: ProgramState,
    profile: UserProfile,
    command: { kind: string } & Record<string, unknown>
  ): CommandOutcome {
    const now = Date.now() + this.sent;
    let result: ReturnType<typeof server.applyProgramCommand>;
    try {
      result = server.applyProgramCommand({
        state: stripUndefined(state),
        profile,
        command: { commandId: this.nextId(), ...command },
        now,
      });
    } catch (error) {
      return {
        applied: false,
        refused: error instanceof Error ? error.message : String(error),
      };
    }
    const { value, dropped } = sanitizer.sanitizeProgramState(result.state);
    if (dropped.length > 0)
      return { applied: false, unstorable: `drops ${dropped.join(", ")}` };
    if (sanitizer.programStateTooLarge(value))
      return { applied: false, unstorable: "too large to store" };
    const hole = undefinedAt(value);
    if (hole) return { applied: false, unstorable: `undefined at ${hole}` };
    return {
      applied: true,
      state: value,
      ...(result.effects.profile ? { profile: result.effects.profile } : {}),
    };
  }
}
