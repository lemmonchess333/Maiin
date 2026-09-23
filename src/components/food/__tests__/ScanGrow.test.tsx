/**
 * ScanGrow — the scanner opening that grows out of the camera button.
 *
 * It must never strand the page under a black layer: it fades once the
 * scanner is showing, and gives up waiting after a while if the scanner
 * never arrives (a failed code load). It must never catch a tap either.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import ScanGrow from "../ScanGrow";

afterEach(() => {
  cleanup();
});

const from = new DOMRect(280, 630, 56, 56);

describe("ScanGrow", () => {
  it("is a screen-covering layer that takes no taps and is hidden from assistive tech", () => {
    render(<ScanGrow from={from} scannerShown={false} onDone={vi.fn()} />);
    const layer = screen.getByTestId("scan-grow");
    expect(layer).toHaveClass("pointer-events-none", "fixed", "inset-0");
    expect(layer).toHaveAttribute("aria-hidden", "true");
  });

  it("holds until the scanner is showing, then fades and says it is done", async () => {
    const onDone = vi.fn();
    const { rerender } = render(
      <ScanGrow from={from} scannerShown={false} onDone={onDone} />
    );
    // Grown (320ms) but the scanner is not there yet: it holds.
    await new Promise((r) => setTimeout(r, 600));
    expect(onDone).not.toHaveBeenCalled();
    rerender(<ScanGrow from={from} scannerShown onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
  });

  it("gives up waiting if the scanner never shows", async () => {
    const onDone = vi.fn();
    render(
      <ScanGrow
        from={from}
        scannerShown={false}
        onDone={onDone}
        maxHoldMs={50}
      />
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
  });
});
