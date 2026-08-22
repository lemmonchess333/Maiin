/**
 * The rest-timer default is one number, shown and used.
 *
 * It was two. `WorkoutSession` fell back to 90 seconds; the Settings →
 * Workout preferences select initialised its shown value to 120. So a user
 * who had never touched the setting READ "2:00" on the settings page and
 * RESTED for 1:30 in the session — the same displayed-vs-behavioural drift
 * HOME-TARGET-01 fixed for the protein figure, and for the same reason:
 * each default was written where it was needed rather than shared.
 *
 * Both now read `DEFAULT_REST_SECONDS`. Asserted as "neither file carries a
 * bare literal" rather than by comparing the two — they import the same
 * binding now, so an equality check between them would be a tautology, and
 * it would still pass if a third surface grew its own copy.
 *
 * 90 rather than 120 is deliberate and is the conservative half of this
 * change: 90 is what the timer has always actually done, so aligning the
 * label corrects a lie instead of silently lengthening every user's rest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_REST_SECONDS } from "../programTypes";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

describe("rest-timer default", () => {
  it("is the value the timer has always used", () => {
    // Pins the CHOICE, so a later edit to 120 has to be deliberate rather
    // than a tidy-up — it would change every existing user's rest length.
    expect(DEFAULT_REST_SECONDS).toBe(90);
  });

  it("the session reads the shared constant, not a literal", () => {
    const src = read("src/components/WorkoutSession.tsx");
    expect(src).toMatch(/:\s*DEFAULT_REST_SECONDS;/);
  });

  it("the settings page reads the same constant", () => {
    const src = read("src/pages/settings/SettingsWorkoutPrefs.tsx");
    expect(src).toMatch(/defaultRestSeconds \?\? DEFAULT_REST_SECONDS/);
    // The literal that made the two disagree, named so its return is loud.
    expect(src).not.toMatch(/defaultRestSeconds \?\? 120/);
  });

  it("is one of the values the picker can actually select", () => {
    /* A default outside the select's options renders as a blank control —
       so this is not merely tidiness. The picker is the only way to change
       it, and it offers a fixed list. */
    const picker = read("src/components/settings/WorkoutPrefsSection.tsx");
    const options = [...picker.matchAll(/<option value=\{(\d+)\}>/g)].map((m) =>
      Number(m[1])
    );
    expect(options.length).toBeGreaterThan(3);
    expect(options).toContain(DEFAULT_REST_SECONDS);
  });
});
