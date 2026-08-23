/**
 * The capture spec's energy-card readiness anchor, pinned against the
 * component that produces the text it matches.
 *
 * `surfaces.screens.capture.spec.ts` waits for the Today's Energy card to
 * show a NON-ZERO calorie target before shooting `home-energy-default`.
 * That anchor exists because the previous one — the card's heading — is
 * present immediately, so the shutter could fire while the profile was
 * still loading. The frame measured 1191 → 1190 → 1458 → 1191 → 1358
 * across five captures, which is not diffable.
 *
 * It is a HARD assertion in the spec, and it gates four frames. So a
 * regex that stopped matching would not degrade one frame — it would take
 * `macro-tiles`, `home-day-peek` and both energy frames red, twelve
 * minutes into a capture run. That is the failure this file exists to
 * convert into a two-second one.
 *
 * The specific hazard is real rather than theoretical. The target is
 * rendered through `formatCalories`, which is
 * `Math.round(value).toLocaleString()` — with NO locale argument. The
 * group separator therefore follows the runtime: "2,200" on en-US,
 * "2.200" on de-DE, "2 200" (U+202F) on fr-FR. A regex written against a
 * comma is a bet on the CI runner's locale, and the assertions below
 * measure that bet instead of taking it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { formatCalories } from "@/utils/formatNutrition";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const {
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _tr,
          variants: _v,
          whileTap: _w,
          layout: _l,
          ...rest
        } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    }
  ),
  AnimatePresence: ({ children }: any) => children,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/components/home/MacroRing", () => ({
  default: () => <div data-testid="macro-ring" />,
}));
vi.mock("@/components/home/BreakdownRow", () => ({
  default: () => <div data-testid="breakdown-row" />,
}));

import TodayEnergy from "../TodayEnergy";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const SPEC = readFileSync(
  resolve(repoRoot, "e2e/screenshots/surfaces.screens.capture.spec.ts"),
  "utf8"
);

/** The anchor regex the spec actually uses — read out, not copied. */
function anchorPattern(): RegExp {
  const m = SPEC.match(
    /page\.getByText\(\/(\\\/ \[1-9\][^/]*?)\/\)\.first\(\)/
  );
  if (!m) {
    throw new Error(
      "could not find the energy readiness anchor in " +
        "surfaces.screens.capture.spec.ts — if the spec was restructured, " +
        "retarget this extractor rather than deleting it"
    );
  }
  return new RegExp(m[1].replace(/\\\//g, "/"));
}

function renderEnergy(finalTarget: number) {
  return render(
    <MemoryRouter>
      <TodayEnergy
        calories={1889}
        protein={0}
        carbs={0}
        fat={0}
        burn={
          {
            phase: null,
            phaseLabel: "Maintain",
            phaseAdjustedTdee: 2200,
            workoutCalories: 0,
            runCalories: 0,
            stepCalories: 0,
          } as any
        }
        targets={{ finalTarget, protein: 160, carbs: 220, fat: 70 } as any}
      />
    </MemoryRouter>
  );
}

describe("capture spec — Today's Energy readiness anchor", () => {
  it("extracts the anchor from the spec — the fixture this rests on", () => {
    // Without this, a broken extractor would leave every assertion below
    // vacuously satisfied.
    expect(anchorPattern().source).toContain("kcal");
  });

  it("matches a LOADED card", () => {
    const { container } = renderEnergy(2200);
    const rx = anchorPattern();
    expect(
      rx.test(container.textContent ?? ""),
      `the capture anchor ${rx} does not match a loaded Today's Energy card. ` +
        `That assertion is HARD and gates four frames — in CI this costs a ` +
        `red capture job twelve minutes in.`
    ).toBe(true);
  });

  it("does NOT match the pre-load card — which is the whole point", () => {
    /* A target of 0 is what the card shows before the profile arrives.
       If the anchor matched it, the spec would shoot the pre-load state
       and the frame would keep swinging, silently. */
    const { container } = renderEnergy(0);
    const rx = anchorPattern();
    expect(
      rx.test(container.textContent ?? ""),
      "the anchor matches a card with a ZERO target, so it does not " +
        "distinguish loaded from loading and cannot stabilise the frame"
    ).toBe(false);
  });

  it("survives the group separator this runtime actually uses", () => {
    /* `formatCalories` is `toLocaleString()` with no locale, so the
       separator is the runtime's. This asserts the anchor agrees with
       whatever THIS runtime produces, rather than assuming a comma — if
       CI ever runs under a locale that groups with "." or U+202F, this
       fails here instead of in the capture job. */
    const rendered = formatCalories(2200);
    renderEnergy(2200);
    expect(
      screen.getByText(
        new RegExp(`/ ${rendered.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} kcal`)
      )
    ).toBeInTheDocument();
    expect(
      anchorPattern().test(`/ ${rendered} kcal`),
      `formatCalories(2200) renders "${rendered}" on this runtime, and the ` +
        `capture anchor does not match it. The anchor is written against a ` +
        `comma separator; this runtime groups differently.`
    ).toBe(true);
  });
});
