import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Footprints } from "lucide-react";
import SectionEmptyCTA from "../SectionEmptyCTA";

/* Pins the extracted first-run row's contract: the copy renders, the CTA
 * is a real navigation <a> (not a button — middle-click/cmd-click must
 * work), it wears the requested buttonClasses variant, and it keeps the
 * 44px touch-target floor the inline copies satisfied via `md` size. */

function renderRow() {
  return render(
    <MemoryRouter>
      <SectionEmptyCTA
        icon={<Footprints data-testid="row-icon" className="size-5" />}
        text="Complete your first run to see running analytics here"
        to="/run"
        ctaLabel="Start Run"
        variant="sport"
      />
    </MemoryRouter>
  );
}

describe("SectionEmptyCTA", () => {
  it("renders the prompt copy and the caller's icon", () => {
    renderRow();
    expect(
      screen.getByText("Complete your first run to see running analytics here")
    ).toBeInTheDocument();
    expect(screen.getByTestId("row-icon")).toBeInTheDocument();
  });

  it("the CTA is a link to the target route", () => {
    renderRow();
    const link = screen.getByRole("link", { name: "Start Run" });
    expect(link).toHaveAttribute("href", "/run");
  });

  it("the CTA wears the requested variant + the 44px md floor", () => {
    renderRow();
    const link = screen.getByRole("link", { name: "Start Run" });
    expect(link).toHaveClass("bg-running"); // sport variant fill
    expect(link).toHaveClass("min-h-[44px]"); // touch-target floor
    expect(link).toHaveClass("shrink-0"); // never squashed by long copy
  });
});
