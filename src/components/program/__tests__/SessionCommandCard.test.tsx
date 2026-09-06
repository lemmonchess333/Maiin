/**
 * SessionCommandCard — command-surface contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SessionCommandCard from "../SessionCommandCard";

afterEach(cleanup);

function renderCard(
  props: Partial<React.ComponentProps<typeof SessionCommandCard>> = {}
) {
  return render(
    <SessionCommandCard
      sport="run"
      eyebrow="Up next"
      title="Long 15K"
      description="15km steady state"
      meta={["15 km", "Long"]}
      primaryActionLabel="Start run"
      onPrimaryAction={() => {}}
      onManage={() => {}}
      {...props}
    />
  );
}

describe("SessionCommandCard", () => {
  it("uses a temporal eyebrow (Up next), never the old 'Next · Pending' row", () => {
    renderCard();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.queryByText(/Next ·/)).not.toBeInTheDocument();
  });

  it("renders the title, description and ONE metadata line — not pills", () => {
    const { container } = renderCard();
    expect(
      screen.getByRole("heading", { name: "Long 15K" })
    ).toBeInTheDocument();
    expect(screen.getByRole("region")).toHaveTextContent("15km steady state");
    // Static facts read as one quiet line, "15 km · Long", with real spaces
    // (so a screen reader hears two items, not "15 kmLong").
    const card = screen.getByRole("region", { name: /Up next — Long 15K/ });
    expect(card).toHaveTextContent("15 km · Long");
    // No enclosed pill chrome around metadata: a pill is a selection or a
    // state, and these are neither.
    expect(container.querySelector(".rounded-full.px-2\\.5")).toBeNull();
    // Numerals take the numeral font; words stay in the text font.
    expect(
      screen
        .getAllByText("15")
        .every((element) => element.className.includes("font-mono"))
    ).toBe(true);
    expect(screen.getByText("km").className).not.toContain("font-mono");
  });

  it("fires onPrimaryAction from the Start button (not the whole card)", () => {
    const onPrimaryAction = vi.fn();
    renderCard({ onPrimaryAction });
    fireEvent.click(screen.getByRole("button", { name: /Start run/i }));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it("fires onManage from the overflow button", () => {
    const onManage = vi.fn();
    renderCard({ onManage });
    fireEvent.click(screen.getByRole("button", { name: /Manage session/i }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it("hides the overflow button when onManage is omitted", () => {
    renderCard({ onManage: undefined });
    expect(
      screen.queryByRole("button", { name: /Manage session/i })
    ).not.toBeInTheDocument();
  });

  it("sport-codes the primary action: coral for run, purple for lift", () => {
    const { rerender } = render(
      <SessionCommandCard
        sport="run"
        eyebrow="Up next"
        title="Easy 30"
        meta={[]}
        primaryActionLabel="Start run"
        onPrimaryAction={() => {}}
      />
    );
    // Run → coral `sport` Button variant (DS1b --running token class).
    const runBtn = screen.getByRole("button", { name: /Start run/i });
    expect(runBtn.className).toContain("bg-running");

    rerender(
      <SessionCommandCard
        sport="lift"
        eyebrow="Up next"
        title="Push"
        meta={[]}
        primaryActionLabel="Start lift"
        onPrimaryAction={() => {}}
      />
    );
    // Lift → brand-purple `primary` Button variant (Tailwind class, no
    // inline coral background).
    const liftBtn = screen.getByRole("button", { name: /Start lift/i });
    expect(liftBtn.className).toContain("bg-primary-strong");
  });
});
