/**
 * RunTilePicker contract (run fast-launch arc). Pins the freeform one-tap
 * surface: the four direct-launch tiles (Easy/Tempo/Long/Free), a tile tap
 * emitting its activityType, and "More options" → the full modal.
 * See spec `spec-run-fast-launch.md` §10.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import RunTilePicker from "../RunTilePicker";

vi.mock("../ShoeSelector", () => ({
  default: () => <div data-testid="shoe" />,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

afterEach(() => cleanup());

function setup(
  overrides: Partial<React.ComponentProps<typeof RunTilePicker>> = {}
) {
  const onPickType = vi.fn();
  const onMoreOptions = vi.fn();
  const onBack = vi.fn();
  const onSelectShoe = vi.fn();
  render(
    <RunTilePicker
      paceTable={null}
      selectedShoeId={null}
      onSelectShoe={onSelectShoe}
      onPickType={onPickType}
      onMoreOptions={onMoreOptions}
      onBack={onBack}
      {...overrides}
    />
  );
  return { onPickType, onMoreOptions, onBack };
}

describe("RunTilePicker", () => {
  it("renders the four direct-launch tiles", () => {
    setup();
    ["Easy Run", "Tempo Run", "Long Run", "Free Run"].forEach((name) =>
      expect(screen.getByText(name)).toBeInTheDocument()
    );
  });

  it("tapping a tile calls onPickType with its activityType", () => {
    const { onPickType } = setup();
    fireEvent.click(screen.getByText("Tempo Run"));
    expect(onPickType).toHaveBeenCalledWith("tempo");
  });

  it("More options calls onMoreOptions (→ full modal)", () => {
    const { onMoreOptions } = setup();
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(onMoreOptions).toHaveBeenCalledTimes(1);
  });

  it("Back calls onBack", () => {
    const { onBack } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
