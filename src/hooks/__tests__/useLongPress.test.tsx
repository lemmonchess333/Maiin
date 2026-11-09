/**
 * A long press on something that also has a tap: held still for 500 ms it
 * fires, a finger's tremor does not cancel it, a scroll does, and the tap
 * that follows a fired press is swallowed once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { restoreRealTimers } from "@/test/fakeTimers";
import {
  LONG_PRESS_CLICK_MS,
  LONG_PRESS_MS,
  useLongPress,
} from "../useLongPress";

function Row({
  onLongPress,
  onTap,
}: {
  onLongPress: (target: string, at: { x: number; y: number }) => void;
  onTap: () => void;
}) {
  const press = useLongPress<string>(onLongPress);
  return (
    <button
      type="button"
      onClick={() => {
        if (press.swallowClick()) return;
        onTap();
      }}
      onTouchStart={(e) => press.start(e, "squat")}
      onTouchMove={press.move}
      onTouchEnd={press.end}
      onTouchCancel={press.end}
    >
      Squat
    </button>
  );
}

const row = () => screen.getByRole("button", { name: "Squat" });
const touch = (x: number, y: number) => ({
  touches: [{ clientX: x, clientY: y }],
});

let onLongPress: ReturnType<
  typeof vi.fn<(target: string, at: { x: number; y: number }) => void>
>;
let onTap: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
  vi.useFakeTimers();
  onLongPress = vi.fn<(target: string, at: { x: number; y: number }) => void>();
  onTap = vi.fn<() => void>();
  render(<Row onLongPress={onLongPress} onTap={onTap} />);
});
afterEach(async () => {
  cleanup();
  await restoreRealTimers();
});

describe("useLongPress", () => {
  it("fires after the hold, with what it was given and where the finger came down", () => {
    fireEvent.touchStart(row(), touch(100, 200));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1));
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onLongPress).toHaveBeenCalledWith("squat", { x: 100, y: 200 });
  });

  it("survives a finger's tremor, and gives way to a scroll", () => {
    fireEvent.touchStart(row(), touch(100, 200));
    fireEvent.touchMove(row(), touch(104, 206));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).toHaveBeenCalledTimes(1);

    fireEvent.touchStart(row(), touch(100, 200));
    fireEvent.touchMove(row(), touch(100, 215));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire once the finger lifts early, and a quick tap still taps", () => {
    fireEvent.touchStart(row(), touch(100, 200));
    act(() => vi.advanceTimersByTime(200));
    fireEvent.touchEnd(row());
    fireEvent.click(row());
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("swallows the one tap that follows a fired press, and no other", () => {
    fireEvent.touchStart(row(), touch(100, 200));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.touchEnd(row());
    fireEvent.click(row());
    expect(onTap).not.toHaveBeenCalled();
    fireEvent.click(row());
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("lets a later tap through once the window has passed", () => {
    fireEvent.touchStart(row(), touch(100, 200));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.touchEnd(row());
    act(() => vi.advanceTimersByTime(LONG_PRESS_CLICK_MS + 1));
    fireEvent.click(row());
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("ignores a second finger", () => {
    fireEvent.touchStart(row(), {
      touches: [
        { clientX: 100, clientY: 200 },
        { clientX: 150, clientY: 200 },
      ],
    });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
