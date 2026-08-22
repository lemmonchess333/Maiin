/**
 * The run-HUD capture spec's selectors, pinned against the components that
 * produce the names it selects on.
 *
 * `e2e/screenshots/run-hud.screens.capture.spec.ts` drives the live run
 * HUD — the one product surface with no frames at all, and the reason D18
 * (~15 hardcoded 8-9px labels against a documented 11px floor) has stayed
 * open. That spec is the prerequisite the backlog row names.
 *
 * It is also the exact shape that goes wrong silently. An e2e selector is
 * only exercised by e2e, which the agent sandbox cannot run, so a label
 * that never matched — or stopped matching — shows up as a CI timeout
 * minutes into a capture, or worse, as a frame of the wrong screen. That
 * already happened once in this repo: `surfaces.screens.capture.spec.ts`
 * selected day cells on `/day, \w+ \d+$/`, which WeekStrip's accessible
 * name stopped satisfying the day a training descriptor was appended, and
 * the only symptom was one frame quietly leaving the set.
 *
 * So the names are read OUT of the spec here and asserted against real
 * renders. If either side moves, this fails in the unit suite in seconds.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import RunTilePicker from "../RunTilePicker";
import RunBottomSheet from "../RunBottomSheet";
import { ACTIVITY_TYPES, DIRECT_LAUNCH_TYPES } from "../runConfigDefaults";

/* Same one-symbol mock the sibling RunTilePicker suite uses: `useAuth`
   throws outside an AuthProvider, and a bare factory mock of `@/lib/auth`
   would leave its other exports undefined at some unrelated call site. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("../ShoeSelector", () => ({
  default: () => <div data-testid="shoe" />,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

afterEach(() => cleanup());

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const SPEC = readFileSync(
  resolve(repoRoot, "e2e/screenshots/run-hud.screens.capture.spec.ts"),
  "utf8"
);

/** Every `getByRole("button", { name: /…/ })` pattern the spec uses. */
function specButtonPatterns(): RegExp[] {
  const found = [
    ...SPEC.matchAll(
      /getByRole\("button",\s*\{\s*name:\s*\/(.+?)\/([a-z]*)\s*\}\)/g
    ),
  ].map((m) => new RegExp(m[1], m[2]));
  if (found.length === 0) {
    throw new Error(
      "no button selectors found in run-hud.screens.capture.spec.ts — if the " +
        "spec was restructured, retarget this extractor rather than deleting it"
    );
  }
  return found;
}

function renderSheet(isPaused: boolean) {
  return render(
    <RunBottomSheet
      elapsed={754}
      distance={2140}
      points={[]}
      formatTime={(s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
      }
      onPause={vi.fn()}
      onLock={vi.fn()}
      isPaused={isPaused}
      onResume={vi.fn()}
      onStop={vi.fn()}
      onDiscard={vi.fn()}
      weightKg={72}
    />
  );
}

describe("run-HUD capture spec — selectors", () => {
  it("extracts the spec's button selectors — the fixture this rests on", () => {
    // Without a floor here, a regex that stopped matching would leave every
    // assertion below vacuously satisfied.
    expect(specButtonPatterns().length).toBeGreaterThanOrEqual(4);
  });

  it('"Free Run" is really the tile the spec taps', () => {
    // The spec enters the run through the freeform tile picker. The name
    // comes from the ACTIVITY_TYPES catalogue, so assert the catalogue AND
    // the render — a renamed tile would otherwise only surface in CI.
    const freerun = ACTIVITY_TYPES.find((a) => a.type === "freerun");
    expect(freerun?.name).toBe("Free Run");
    expect(DIRECT_LAUNCH_TYPES).toContain("freerun");

    render(
      <RunTilePicker
        paceTable={null}
        selectedShoeId={null}
        onSelectShoe={vi.fn()}
        onPickType={vi.fn()}
        onMoreOptions={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /free run/i })
    ).toBeInTheDocument();
  });

  it("the running HUD exposes Pause, Lock and the resize handle by those names", () => {
    // `Pause run` is the spec's proof that the active phase was reached —
    // if it does not exist under that name, the spec would shoot the setup
    // screen or the countdown while claiming to be the HUD.
    renderSheet(false);
    for (const name of [
      /^pause run$/i,
      /^lock screen$/i,
      /drag to resize the run panel/i,
    ]) {
      expect(
        screen.getByRole("button", { name }),
        `the HUD has no control named ${name}`
      ).toBeInTheDocument();
    }
  });

  it("does NOT expose an expand control while the sheet is already expanded", () => {
    /* The premise the capture spec originally got wrong, kept as an
       assertion so it cannot be got wrong again. `snapIdx` starts at 2 —
       the sheet opens EXPANDED — and `Expand bottom sheet` renders only
       under `!isExpanded`. A spec that clicks it from the default state
       waits for a control that cannot exist, which in e2e is a timeout
       minutes into a capture. */
    renderSheet(false);
    expect(
      screen.queryByRole("button", { name: /expand bottom sheet/i })
    ).toBeNull();
  });

  it("the paused HUD exposes Resume", () => {
    renderSheet(true);
    expect(
      screen.getByRole("button", { name: /^resume run$/i })
    ).toBeInTheDocument();
  });

  it("every selector the spec uses matches something on one of these screens", () => {
    // The catch-all: if a NEW selector is added to the spec, it has to be
    // satisfiable by one of the surfaces the spec actually visits, or this
    // fails rather than waiting for a CI timeout to say so.
    const { container: picker } = render(
      <RunTilePicker
        paceTable={null}
        selectedShoeId={null}
        onSelectShoe={vi.fn()}
        onPickType={vi.fn()}
        onMoreOptions={vi.fn()}
        onBack={vi.fn()}
      />
    );
    const { container: active } = renderSheet(false);
    const { container: paused } = renderSheet(true);

    const names = [picker, active, paused].flatMap((root) =>
      Array.from(root.querySelectorAll("button,[role='button']")).map(
        (el) => el.getAttribute("aria-label") ?? (el.textContent ?? "").trim()
      )
    );

    const unmatched = specButtonPatterns()
      .filter((rx) => !names.some((n) => rx.test(n)))
      // The spec's launch-card fallback (`/^start( run)?$/`) belongs to
      // RunLaunchCard, a surface only a PROGRAMME user sees; it is a
      // deliberate alternative entry, not a selector for these screens.
      .filter((rx) => !/start/.test(rx.source));

    expect(
      unmatched.map((r) => r.source),
      "selectors in the run-HUD capture spec that match nothing on the " +
        "tile picker or the HUD. In e2e this costs a timeout minutes into " +
        "a capture; here it costs a second."
    ).toEqual([]);
  });
});
