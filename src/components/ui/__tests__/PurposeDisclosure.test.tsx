/**
 * "Why this run" and "Why this session" are one control. It opens closed,
 * and with nothing to say it is not there at all: an empty "Why this run"
 * is a promise with nothing behind it, and Home's day details hand it a
 * run's reason that is null for a free runner.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("keeps the run's own name", () => {
    render(<RunPurpose>Easy day.</RunPurpose>);
    expect(
      screen.getByText("Why this run").closest("details")
    ).toHaveTextContent("Easy day.");
  });
});
