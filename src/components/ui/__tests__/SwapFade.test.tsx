/**
 * SwapFade: words and a figure changing meaning in place (Food's left and
 * logged). The new copy fades in over the old in one grid cell; under
 * Reduce Motion it is simply there. `swapped` tells a figure inside
 * whether to count up on its first draw.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motion.reduce,
}));

import SwapFade from "../SwapFade";

afterEach(cleanup);
beforeEach(() => {
  motion.reduce = false;
});

function Words({ mode }: { mode: string }) {
  return (
    <SwapFade swapKey={mode}>
      {(swapped) => (
        <p data-testid="words" data-swapped={String(swapped)}>
          {mode}
        </p>
      )}
    </SwapFade>
  );
}

const copies = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-swap-fade]"));

describe("SwapFade", () => {
  it("draws its first copy at once, with no fade and nothing swapped", () => {
    render(<Words mode="left" />);
    expect(copies()).toHaveLength(1);
    expect(copies()[0].style.opacity).not.toBe("0");
    expect(copies()[0]).toHaveTextContent("left");
    expect(
      document.querySelector<HTMLElement>("[data-testid='words']")!.dataset
        .swapped
    ).toBe("false");
  });

  it("crosses to the new copy in the same cell, then leaves only it", async () => {
    const { rerender } = render(<Words mode="left" />);
    rerender(<Words mode="logged" />);
    // Both, while they cross: the new one starts clear.
    expect(copies().map((c) => c.textContent)).toEqual(["left", "logged"]);
    expect(copies()[1].style.opacity).toBe("0");
    expect(copies()[0].parentElement).toBe(copies()[1].parentElement);
    expect(copies()[0].parentElement).toHaveClass("grid");
    await waitFor(() =>
      expect(copies().map((c) => c.textContent)).toEqual(["logged"])
    );
    expect(copies()[0].querySelector<HTMLElement>("p")!.dataset.swapped).toBe(
      "true"
    );
  });

  it("under Reduce Motion, the new copy is there at full strength at once", async () => {
    motion.reduce = true;
    const { rerender } = render(<Words mode="left" />);
    rerender(<Words mode="logged" />);
    const entering = copies().find((c) => c.textContent === "logged")!;
    expect(entering.style.opacity).not.toBe("0");
    await waitFor(() =>
      expect(copies().map((c) => c.textContent)).toEqual(["logged"])
    );
  });

  it("stays swapped after switching back", async () => {
    const { rerender } = render(<Words mode="left" />);
    rerender(<Words mode="logged" />);
    rerender(<Words mode="left" />);
    await waitFor(() =>
      expect(copies().map((c) => c.textContent)).toEqual(["left"])
    );
    expect(copies()[0].querySelector<HTMLElement>("p")!.dataset.swapped).toBe(
      "true"
    );
  });
});
