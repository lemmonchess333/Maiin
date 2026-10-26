import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

it.each([
  "src/hooks/useStreakReminder.ts",
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

/**
 * A reminder or a push lands on the lock screen, outside the app, so it is
 * the copy most likely to be read cold. It is held to the house voice
 * (`docs/voice-and-tone.md`): calm, no cheer, no chatbot, and no account
 * of what the person didn't do.
 */
const VOICE_SLIPS: [string, RegExp][] = [
  ["an emoji", /\p{Extended_Pictographic}/u],
  ["an exclamation mark", /!/],
  ['"Let\'s"', /\blet['’]s\b/i],
  ['"tap to"', /\btap to\b/i],
  ['"please"', /\bplease\b/i],
  [
    "what-you-missed framing",
    /didn['’]t go to plan|\bmissed\b|fell behind|\bbehind\b|you haven['’]t|you didn['’]t/i,
  ],
];

const require = createRequire(import.meta.url);

/** Every message the server builds for a phone, from its own builders. */
function serverPushes(): { name: string; title: string; body: string }[] {
  const pushSend = require("../../../functions/lib/pushSend.js") as Record<
    string,
    unknown
  >;
  return Object.entries(pushSend)
    .filter(
      ([name, fn]) => /^build\w+Message$/.test(name) && typeof fn === "function"
    )
    .map(([name, fn]) => {
      const { data } = (
        fn as () => { data: { title: string; body: string } }
      )();
      return { name, title: data.title, body: data.body };
    });
}

/** Files that write a notification's words inline, as `title:` / `body:`. */
const INLINE = [
  "src/hooks/useStreakReminder.ts",
  "src/hooks/useWorkoutReminders.ts",
  "src/hooks/useMealReminders.ts",
  "src/lib/notifications.ts",
  // The test push Settings sends to check a device.
  "functions/index.js",
];

function inlineCopy(path: string): string[] {
  const source = readFileSync(resolve(path), "utf8").replace(
    /\/\*[\s\S]*?\*\/|^\s*\/\/[^\n]*/gm,
    ""
  );
  return [...source.matchAll(/\b(?:title|body)\s*:\s*(["'`])((?:(?!\1).)*)\1/g)]
    .map((m) => m[2])
    .filter((text) => /[a-z]/i.test(text));
}

describe("reminder and push copy keeps the house voice", () => {
  it("reads every push the server builds", () => {
    // Anchors the checks below: a builder renamed out of the pattern
    // would otherwise leave them passing over nothing.
    const names = serverPushes().map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "buildStreakNudgeMessage",
        "buildFirstWeekNudgeMessage",
        "buildBadgeNudgeMessage",
        "buildWeeklyRecapMessage",
        "buildFellBehindRecapMessage",
      ])
    );
    for (const path of INLINE)
      expect(inlineCopy(path).length).toBeGreaterThan(0);
  });

  it("finds each slip it looks for", () => {
    const old = [
      "Yesterday was a good start 💪",
      "Nice work!",
      "Let's realign this week",
      "Last week didn't go to plan — tap to adjust your runs.",
      "Please open Tropos",
      "You missed two runs",
    ];
    for (const text of old) {
      expect(
        VOICE_SLIPS.some(([, re]) => re.test(text)),
        text
      ).toBe(true);
    }
  });

  it.each(VOICE_SLIPS)("no push or reminder carries %s", (_slip, re) => {
    const copy = [
      ...serverPushes().flatMap((p) => [p.title, p.body]),
      ...INLINE.flatMap(inlineCopy),
    ];
    expect(copy.filter((text) => re.test(text))).toEqual([]);
  });
});
