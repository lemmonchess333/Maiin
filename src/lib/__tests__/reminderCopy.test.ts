import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it.each([
  "src/hooks/useStreakReminder.ts",
  "src/components/StreakReminderPrimingModal.tsx",
  "functions/lib/pushSend.js",
  "functions/lib/streakNudge.js",
])("keeps loss framing out of reminder copy in %s", (path) => {
  const source = readFileSync(resolve(path), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
    .replace(/&apos;|&#39;/g, "'");
  expect(source).not.toMatch(
    /\blose\b|at risk|don't break|keep your streak alive/i
  );
});
