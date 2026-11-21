/**
 * The two panes the iPhone Duo's inner display gets (DESIGN_GUIDE §14r).
 * What has to hold on a phone is that nothing changes: the wrapper and
 * its panes add only the page's own rhythm there, and every other class
 * waits for `split`. What has to hold through a fold is that both panes
 * stay mounted. And each page that uses them puts its content in exactly
 * two, which Layout widens its column for, and so do their placeholders.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import TwoPanes, { Pane } from "../TwoPanes";
import { PageContentSkeleton } from "../../LoadingSkeleton";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(src, path), "utf8");

/** The classes a phone sees: none of them waits for a wider screen. */
function phoneClasses(el: Element): string[] {
  return [...el.classList].filter((c) => !c.startsWith("split:"));
}

describe("TwoPanes", () => {
  it("adds nothing on a phone but the page's own rhythm", () => {
    render(
      <TwoPanes>
        <Pane>first</Pane>
        <Pane>second</Pane>
      </TwoPanes>
    );
    const first = screen.getByText("first");
    const wrapper = first.parentElement!;
    expect(phoneClasses(wrapper)).toEqual(["space-y-4"]);
    for (const pane of wrapper.children) {
      expect(phoneClasses(pane)).toEqual(["space-y-4", "min-w-0"]);
    }
    // Every wide class is keyed to the marker Layout widens for.
    for (const c of wrapper.classList) {
      if (c.startsWith("split:")) expect(c).toMatch(/^split:data-two-panes:/);
    }
  });

  it("marks the page for two panes, or not, keeping both panes mounted", () => {
    const { rerender } = render(
      <TwoPanes>
        <Pane>first</Pane>
        <Pane>second</Pane>
      </TwoPanes>
    );
    const first = screen.getByText("first");
    const wrapper = first.parentElement!;
    expect(wrapper).toHaveAttribute("data-two-panes");
    rerender(
      <TwoPanes panes={false}>
        <Pane>first</Pane>
        <Pane>second</Pane>
      </TwoPanes>
    );
    expect(wrapper).not.toHaveAttribute("data-two-panes");
    // The same nodes, not new ones.
    expect(screen.getByText("first")).toBe(first);
  });

  it("takes a page's own rhythm in place of PageShell's", () => {
    render(
      <TwoPanes className="space-y-6">
        <Pane className="space-y-6">first</Pane>
        <Pane className="space-y-6">second</Pane>
      </TwoPanes>
    );
    const wrapper = screen.getByText("first").parentElement!;
    expect(phoneClasses(wrapper)).toEqual(["space-y-6"]);
    for (const pane of wrapper.children)
      expect(phoneClasses(pane).sort()).toEqual(["min-w-0", "space-y-6"]);
  });
});

describe("the pages in two panes", () => {
  const pages = {
    Home: read("pages/Home.tsx"),
    Food: read("pages/Food.tsx"),
    History: read("pages/History.tsx"),
  };

  for (const [name, text] of Object.entries(pages)) {
    it(`${name} puts its content in exactly two panes`, () => {
      expect(text.match(/<TwoPanes[\s>]/g)?.length).toBe(1);
      expect(text.match(/<Pane>/g)?.length).toBe(2);
      expect(text.match(/<\/Pane>/g)?.length).toBe(2);
    });
  }

  it("Progress splits its overview only, never a page or the PRs", () => {
    const at = pages.History.indexOf("<TwoPanes");
    const before = pages.History.slice(at - 120, at);
    expect(before).toMatch(
      /filter === "analytics" && view === "overview" && \(\s*$/
    );
  });

  it("Progress holds the score's place in the first pane while it loads", () => {
    const first = pages.History.slice(
      pages.History.indexOf("<Pane>"),
      pages.History.indexOf("</Pane>")
    );
    expect(first).toMatch(
      /dataLoading && isAnalyticsColdStart && \(\s*<div className="hidden split:in-data-two-panes:block">\s*<ScoreSectionSkeleton \/>/
    );
  });

  /** The width a column widens to for two panes, on the element that sets
   *  the phone's: Layout's and the app-root loader's, which stands where
   *  Layout's column will. */
  const widens =
    /className="[^"]*\bmax-w-md\b[^"]*\bsplit:has-\[\[data-two-panes\]\]:max-w-\[60rem\]/;

  it("Layout and the app's loader widen their column only for two panes", () => {
    expect(read("components/Layout.tsx")).toMatch(widens);
    expect(read("App.tsx")).toMatch(widens);
  });

  it("their placeholders are in the same two panes, where the page is", () => {
    const panesFor = (pathname: string, search = "") => {
      const { container, unmount } = render(
        <PageContentSkeleton pathname={pathname} search={search} />
      );
      const wrapper = container.querySelector("[data-two-panes]");
      const found = wrapper ? wrapper.children.length : 0;
      unmount();
      return found;
    };
    expect(panesFor("/")).toBe(2);
    expect(panesFor("/food")).toBe(2);
    expect(panesFor("/history")).toBe(2);
    expect(panesFor("/history", "?view=overview&range=3m")).toBe(2);
    // The pages of Progress that keep the phone's column.
    expect(panesFor("/history", "?view=running")).toBe(0);
    expect(panesFor("/history", "?tab=prs")).toBe(0);
    expect(panesFor("/history/sessions")).toBe(0);
    expect(panesFor("/program")).toBe(0);
  });
});
