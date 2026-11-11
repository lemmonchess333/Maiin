/**
 * An invite code's shape, client and server (Soc15).
 *
 * The server makes and checks every code (functions/lib/inviteCodes.js);
 * the app reads what a person types the same way (src/lib/inviteCode.ts),
 * and offers the code field only in the 14 days the server will accept
 * one. If the two drift, the app sends codes the server reads as unknown,
 * or refuses ones it would take, or offers a field the server will refuse.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_WINDOW_DAYS,
  formatInviteCode,
  isWithinInviteWindow,
  normaliseInviteCode,
} from "@/lib/inviteCode";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/inviteCodes.js") as {
  INVITE_CODE_ALPHABET: string;
  INVITE_CODE_LENGTH: number;
  INVITE_WINDOW_DAYS: number;
  normaliseInviteCode: (input: unknown) => string | null;
  isWithinInviteWindow: (created: number, now: number) => boolean;
  makeInviteCode: () => string;
};

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 4, 12);

describe("invite codes — client and server agree", () => {
  it("share the alphabet, the length and the window", () => {
    expect(INVITE_CODE_ALPHABET).toBe(server.INVITE_CODE_ALPHABET);
    expect(INVITE_CODE_LENGTH).toBe(server.INVITE_CODE_LENGTH);
    expect(INVITE_WINDOW_DAYS).toBe(server.INVITE_WINDOW_DAYS);
  });

  it("read what a person types the same way", () => {
    const typed: unknown[] = [
      "K7P49M2H",
      "k7p4-9m2h",
      " K7P4 9M2H ",
      "K7P4--9M2H",
      "K7P49M2",
      "K7P49M2HH",
      "K7P49M2O",
      "K7P49M21",
      "K7P49M2I",
      "K7P49M2L",
      "K7P49M2U",
      "",
      "../../users",
      "ÄÖÜ12345",
      "x".repeat(40),
      null,
      12345678,
    ];
    for (const input of typed) {
      expect(normaliseInviteCode(input), JSON.stringify(input)).toBe(
        server.normaliseInviteCode(input)
      );
    }
  });

  it("accept every code the server makes, and show it grouped", () => {
    for (let i = 0; i < 25; i++) {
      const code = server.makeInviteCode();
      expect(normaliseInviteCode(code)).toBe(code);
      expect(normaliseInviteCode(formatInviteCode(code))).toBe(code);
    }
    expect(formatInviteCode("K7P49M2H")).toBe("K7P4-9M2H");
  });

  it("open and close the window on the same day", () => {
    for (const age of [0, DAY, 14 * DAY, 14 * DAY + 1, 30 * DAY, -DAY]) {
      expect(isWithinInviteWindow(NOW - age, NOW), String(age)).toBe(
        server.isWithinInviteWindow(NOW - age, NOW)
      );
    }
    expect(isWithinInviteWindow(Number.NaN, NOW)).toBe(
      server.isWithinInviteWindow(Number.NaN, NOW)
    );
  });
});
