/**
 * "Why this run", "Why this session" and a race plan's "The weeks ahead"
 * are one control. It opens closed, and with nothing to say it is not there
 * at all: an empty "Why this run" is a promise with nothing behind it, and
 * Home's day details hand it a run's reason that is null for a free runner.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PurposeDisclosure from "../PurposeDisclosure";
import RunPurpose from "@/components/run/RunPurpose";

describe("PurposeDisclosure", () => {
  it.each([null, undefined, "", false])(
    "renders nothing when given %s",
    (children) => {
      const { container } = render(
        <PurposeDisclosure label="Why this session">
          {children}
        </PurposeDisclosure>
      );
      expect(container).toBeEmptyDOMElement();
      const run = render(<RunPurpose>{children}</RunPurpose>);
      expect(run.container).toBeEmptyDOMElement();
    }
  );

  it("names itself and opens closed", () => {
    render(
      <PurposeDisclosure label="Why this session">
        A lighter week.
      </PurposeDisclosure>
    );
    const why = screen.getByText("Why this session").closest("details")!;
    expect(why).not.toHaveAttribute("open");
    expect(why).toHaveTextContent("A lighter week.");
  });

  it("tells its owner when it opens and closes", async () => {
    // The race plan's weeks ahead are worked out only once asked for.
    const onToggle = vi.fn();
    render(
      <PurposeDisclosure label="The weeks ahead" onToggle={onToggle}>
        Two weeks.
      </PurposeDisclosure>
    );
    fireEvent.click(screen.getByText("The weeks ahead"));
    await waitFor(() => expect(onToggle).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByText("The weeks ahead"));
    await waitFor(() => expect(onToggle).toHaveBeenLastCalledWith(false));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("keeps the run's own name", () => {
    render(<RunPurpose>Easy day.</RunPurpose>);
    expect(
      screen.getByText("Why this run").closest("details")
    ).toHaveTextContent("Easy day.");
  });
});
