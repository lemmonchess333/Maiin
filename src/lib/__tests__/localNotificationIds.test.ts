/**
 * Every local notification has its own id. Scheduling or cancelling by id
 * acts on whatever holds it, so two features sharing one cancel each
 * other: the rest timer once held the streak reminder's 3001, and ending a
 * rest removed the evening reminder.
 *
 * Read from the source, so a new id declared the house way
 * (`…_NOTIFICATION_ID`, `…_NOTIFICATION_IDS`, `…_REMINDER_IDS`) is held to
 * this without anyone adding it here.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { REST_NOTIFICATION_ID } from "../restTimerNotification";
import {
  FIRST_WEEK_NOTIFICATION_ID,
  STREAK_NOTIFICATION_ID,
} from "@/hooks/streakNotificationId";
import { TRIAL_NOTIFICATION_ID } from "@/hooks/useTrialReminder";

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "__tests__" || name === "__mocks__" || name === "test"
        ? []
        : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Each id a declaration assigns, with where it was declared. */
function declaredIds(): { id: number; where: string }[] {
  const declaration =
    /\b[A-Z_]*(?:NOTIFICATION_IDS?|REMINDER_IDS)\b[^=;]*=\s*([^;]+);/g;
  return sourceFiles(SRC).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(declaration)].flatMap((match) =>
      [...match[1].matchAll(/\b\d{3,}\b/g)].map((id) => ({
        id: Number(id[0]),
        where: relative(SRC, file),
      }))
    );
  });
}

describe("local notification ids", () => {
  it("finds the ids it is meant to hold", () => {
    const ids = declaredIds().map(({ id }) => id);
    for (const id of [
      REST_NOTIFICATION_ID,
      STREAK_NOTIFICATION_ID,
      FIRST_WEEK_NOTIFICATION_ID,
      TRIAL_NOTIFICATION_ID,
      1001,
      2001,
    ])
      expect(ids).toContain(id);
  });

  it("gives every local notification its own id", () => {
    const byId = new Map<number, string[]>();
    for (const { id, where } of declaredIds())
      byId.set(id, [...(byId.get(id) ?? []), where]);
    const shared = [...byId].filter(([, where]) => where.length > 1);
    expect(shared).toEqual([]);
  });
});
