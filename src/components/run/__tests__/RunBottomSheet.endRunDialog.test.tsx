/**
 * The End-run dialog reads the pace in the runner's unit. Its caption was
 * a hardcoded "/KM", so a miles runner saw a per-mile pace labelled per
 * kilometre, over the bar behind it that said "/MI".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { DistanceUnit } from "@/lib/distanceUnits";

const h = vi.hoisted(() => ({ unit: "km" as DistanceUnit }));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => h.unit,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RunBottomSheet from "../RunBottomSheet";

afterEach(() => cleanup());

/** 2.14 km in 12:34: 352.3 s/km, which is 5:52 /km or 9:27 /mi. */
function openEndRunDialog(unit: DistanceUnit) {
  h.unit = unit;
  render(
    <RunBottomSheet
      elapsed={754}
      distance={2140}
      points={[]}
      formatTime={(s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
      }
      onPause={vi.fn()}
      onLock={vi.fn()}
      isPaused
      onResume={vi.fn()}
      onStop={vi.fn()}
      onDiscard={vi.fn()}
      weightKg={72}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /^stop run$/i }));
  return screen.getByRole("alertdialog", { name: "End run?" });
}

describe("RunBottomSheet — the End-run dialog's pace", () => {
  it("is per mile for a miles runner, and says so", () => {
    const dialog = openEndRunDialog("mi");
    const pace = within(dialog).getByText("9:27");
    expect(pace.nextElementSibling?.textContent).toBe("/MI");
    expect(within(dialog).queryByText("/KM")).toBeNull();
  });

  it("is per kilometre for a kilometres runner", () => {
    const dialog = openEndRunDialog("km");
    const pace = within(dialog).getByText("5:52");
    expect(pace.nextElementSibling?.textContent).toBe("/KM");
  });
});
