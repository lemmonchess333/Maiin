/**
 * SessionCommandCard — command-surface contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SessionCommandCard from "../SessionCommandCard";
import MiniMuscleFigure from "@/components/social/MiniMuscleFigure";

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

describe("SessionCommandCard — the picture at the right (DS3)", () => {
  it("draws a run's type in a tile after the title, as Home's run card does", async () => {
    const { runTemplateIcon } =
      await import("@/components/run/runTemplateIcons");
    const { container } = renderCard({ icon: runTemplateIcon("zap") });
    const heading = screen.getByRole("heading", { name: "Long 15K" });
    const tile = container.querySelector("svg.lucide-zap")!;
    expect(tile).not.toBeNull();
    // After the title in reading order: the words lead, the picture follows.
    expect(
      heading.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("lets a figure take the tile's place", () => {
    const { container } = renderCard({
      sport: "lift",
      figure: <span data-testid="muscles" />,
    });
    expect(screen.getByTestId("muscles")).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-dumbbell")).toBeNull();
  });

  it("sets the description and dose beside the picture, under the title", () => {
    /* Below the picture, a lift day's figure (taller than two lines of
       heading) left an empty band between the title and "~57 min". */
    renderCard({
      sport: "lift",
      figure: <span data-testid="muscles" />,
      meta: ["~57 min"],
    });
    const column = screen.getByRole("heading", {
      name: "Long 15K",
    }).parentElement!;
    // MetaLine sets the numeral in its own span, so read the text.
    expect(column.textContent).toContain("~57 min");
    expect(column.textContent).toContain("15km steady state");
    expect(column).not.toContainElement(screen.getByTestId("muscles"));
  });

  it("keeps the figure from screen readers, as it does the tile", () => {
    // Train's lift card passes the day's muscles, whose own label says
    // "Muscles trained this session": untrue of a day not yet done. The
    // title names the day, so the picture beside it adds nothing to hear.
    const { container } = renderCard({
      sport: "lift",
      eyebrow: "Pull · Up next",
      title: "Lat focus",
      figure: <MiniMuscleFigure categories={["vertical_pull"]} />,
    });
    // Anchored: the figure is drawn, and the card is named by its day.
    expect(container.querySelector("svg polygon")).not.toBeNull();
    expect(
      screen.getByRole("region", { name: "Pull · Up next — Lat focus" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("runTemplateIcon", () => {
  it("maps a template's icon key and falls back to footprints", async () => {
    const { runTemplateIcon } =
      await import("@/components/run/runTemplateIcons");
    const { Flag, Footprints } = await import("lucide-react");
    expect(runTemplateIcon("flag")).toBe(Flag);
    expect(runTemplateIcon("no-such-icon")).toBe(Footprints);
    expect(runTemplateIcon(undefined)).toBe(Footprints);
  });
});
