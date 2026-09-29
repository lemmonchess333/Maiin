/**
 * The capture specs' energy-card readiness anchor, pinned against the
 * component that produces the name it matches.
 *
 * `surfaces.screens.capture.spec.ts` waits for Home's food card to show a
 * NON-ZERO calorie target before shooting `home-energy-default`, and
 * `nutrition-card.screens.capture.spec.ts` waits the same way. That
 * anchor exists because the previous one — the card's heading — is
 * present immediately, so the shutter could fire while the profile was
 * still loading. The frame measured 1191 → 1190 → 1458 → 1191 → 1358
 * across five captures, which is not diffable.
 *
 * It is a HARD assertion in the spec, and it gates four frames. So a
 * pattern that stopped matching would not degrade one frame — it would
 * take `macro-tiles`, `home-day-peek` and both energy frames red, twelve
 * minutes into a capture run. That is the failure this file exists to
 * convert into a two-second one.
 *
 * The anchor is the calorie ring's accessible name, "1889 of 2200
 * calories consumed, …". It is built from raw numbers rather than
 * `formatCalories` (which follows the runtime's locale: "2,200", "2.200",
 * "2 200"), so it reads the same wherever CI runs, and the assertions
 * below hold it to that.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { formatCalories } from "@/utils/formatNutrition";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import TodayEnergy from "../TodayEnergy";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const specs = [
  "e2e/screenshots/surfaces.screens.capture.spec.ts",
  "e2e/screenshots/nutrition-card.screens.capture.spec.ts",
].map((path) => ({
  path,
  src: readFileSync(resolve(repoRoot, path), "utf8"),
}));

/** The anchor a spec actually uses — read out, not copied. */
function anchorIn(src: string, path: string): RegExp {
  const m = src.match(
    /getByRole\(\s*"button",\s*\{\s*name:\s*\/(of \[1-9\][^/]*?)\/\s*\}\s*\)/
  );
  if (!m) {
    throw new Error(
      `could not find the energy readiness anchor in ${path} — if the ` +
        "spec was restructured, retarget this extractor rather than " +
        "deleting it"
    );
  }
  return new RegExp(m[1]);
}
const anchor = () => anchorIn(specs[0].src, specs[0].path);

function renderEnergy(finalTarget: number) {
  return render(
    <MemoryRouter>
      <TodayEnergy
        calories={1889}
        protein={0}
        carbs={0}
        fat={0}
        targets={{ finalTarget, protein: 160, carbs: 220, fat: 70 } as any}
      />
    </MemoryRouter>
  );
}

describe("capture specs — Home food card readiness anchor", () => {
  it("extracts the anchor from both specs, and they agree", () => {
    // Without this, a broken extractor would leave every assertion below
    // vacuously satisfied.
    const [a, b] = specs.map((s) => anchorIn(s.src, s.path));
    expect(a.source).toContain("calories");
    expect(b.source).toBe(a.source);
  });

  it("matches a LOADED card", () => {
    renderEnergy(2200);
    const rx = anchor();
    expect(
      screen.queryByRole("button", { name: rx }),
      `the capture anchor ${rx} names no control on a loaded Home food ` +
        `card. That assertion is HARD and gates four frames — in CI this ` +
        `costs a red capture job twelve minutes in.`
    ).not.toBeNull();
  });

  it("does NOT match the pre-load card — which is the whole point", () => {
    /* A target of 0 is what the card shows before the profile arrives.
       If the anchor matched it, the spec would shoot the pre-load state
       and the frame would keep swinging, silently. */
    renderEnergy(0);
    expect(
      screen.queryByRole("button", { name: anchor() }),
      "the anchor matches a card with a ZERO target, so it does not " +
        "distinguish loaded from loading and cannot stabilise the frame"
    ).toBeNull();
  });

  it("reads the same in every locale: plain digits, whatever the grouping", () => {
    /* The ring's number is set with the runtime's grouping, but its name
       is not: the spec's pattern allows no separator, so the name must
       carry none, in this runtime or any other. */
    renderEnergy(2200);
    const ring = screen.getByRole("button", { name: anchor() });
    expect(ring.getAttribute("aria-label")).toContain("of 2200 calories");
    // And the figure this runtime draws would not have matched, where it
    // groups at all: the reason the anchor is the name, not the text.
    if (formatCalories(2200) !== "2200") {
      expect(anchor().test(`of ${formatCalories(2200)} calories`)).toBe(false);
    }
  });
});
