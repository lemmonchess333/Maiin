/**
 * RunTemplateIcon draws the glyph `runTemplateIcon` names, from the same
 * table, for the cards that render it themselves (Home's run card, the
 * run launch card). The two must not drift apart.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import RunTemplateIcon from "../RunTemplateIcon";
import { RUN_TEMPLATE_ICONS, runTemplateIcon } from "../runTemplateIcons";

afterEach(cleanup);

/** Lucide stamps each glyph's name on its svg: `lucide-footprints`. */
function drawn(icon?: string | null) {
  const { container } = render(<RunTemplateIcon icon={icon} />);
  const svg = container.querySelector("svg");
  return [...(svg?.classList ?? [])].find(
    (c) => c.startsWith("lucide-") && c !== "lucide-icon"
  );
}

function named(icon?: string | null) {
  const { container } = render(
    (() => {
      const Glyph = runTemplateIcon(icon);
      return <Glyph />;
    })()
  );
  const svg = container.querySelector("svg");
  return [...(svg?.classList ?? [])].find(
    (c) => c.startsWith("lucide-") && c !== "lucide-icon"
  );
}

describe("RunTemplateIcon", () => {
  it("draws every template's glyph exactly as runTemplateIcon names it", () => {
    for (const key of Object.keys(RUN_TEMPLATE_ICONS)) {
      const glyph = drawn(key);
      expect(glyph, key).toBeTruthy();
      expect(glyph).toBe(named(key));
      cleanup();
    }
  });

  it("falls back to a plain run's footprints for a missing or unknown key", () => {
    expect(drawn(undefined)).toBe("lucide-footprints");
    cleanup();
    expect(drawn("no-such-icon")).toBe("lucide-footprints");
  });

  it("passes its props to the glyph", () => {
    const { container } = render(
      <RunTemplateIcon icon="flag" className="size-6" aria-hidden="true" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("size-6");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
