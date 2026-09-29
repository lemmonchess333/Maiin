/**
 * The Performance Index's change on last week reads as words, not a pill
 * (owner call, 2026-09-29; DS3's STATUS lines). Home's row, the Analytics
 * overview card and the Performance page all draw this one component.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PerformanceChange from "../PerformanceChange";

describe("PerformanceChange", () => {
  it("says a rise as 'Up 3 on last week'", () => {
    const { container } = render(<PerformanceChange delta={3} />);
    expect(container.textContent).toBe("Up 3 on last week");
  });

  it("says a drop as 'Down 3 on last week', with no minus sign", () => {
    const { container } = render(<PerformanceChange delta={-3} />);
    expect(container.textContent).toBe("Down 3 on last week");
  });

  it("drops 'on last week' in the compact form Home uses", () => {
    const { container } = render(<PerformanceChange delta={-12} compact />);
    expect(container.textContent).toBe("Down 12");
  });

  it("is plain grey text, not a coloured pill", () => {
    const { container } = render(<PerformanceChange delta={-3} />);
    const change = container.firstElementChild as HTMLElement;
    expect(change.className).toContain("text-muted-foreground");
    expect(change.className).not.toMatch(/\bbg-|rounded|border|px-/);
    expect(change.getAttribute("style")).toBeNull();
    expect(change.querySelector("svg")).toBeNull();
  });

  it("sets the number in the numeral font", () => {
    const { container } = render(<PerformanceChange delta={7} />);
    const number = container.querySelector(".font-mono");
    expect(number?.textContent).toBe("7");
    expect(number?.className).toContain("tabular-nums");
  });
});
