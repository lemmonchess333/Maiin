import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The plan's More options sheet and an exercise's menu behave as a sheet
 * and a menu for someone on a keyboard or a screen reader.
 *
 * Both were hand-rolled: no name, no way to close but a tap outside, and
 * focus left behind on the page, so Tab walked the plan underneath while
 * the sheet was open (DESIGN_GUIDE §10). They now use the pieces the
 * shared Dialog is built from: useFocusTrap (focus in, kept in, returned
 * to the trigger), Escape, and the device's Back.
 *
 * Pinned at the source, for the reason the header of
 * `programExerciseList.test.ts` gives: nothing in the repo renders
 * Program.tsx in jsdom. useFocusTrap's own behaviour is tested with the
 * Dialog, which every other dialog uses.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8");
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

/** The JSX from `marker` to the end of its AnimatePresence. */
function block(marker: string): string {
  const at = code.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  return code.slice(at, code.indexOf("</AnimatePresence>", at));
}

describe("the More options sheet", () => {
  const sheet = block("{showOverflow && (");

  it("is named, and holds focus while open", () => {
    expect(code).toMatch(
      /const overflowRef = useFocusTrap<HTMLDivElement>\(showOverflow\)/
    );
    expect(sheet).toMatch(/ref=\{overflowRef\}/);
    expect(sheet).toMatch(/role="dialog"/);
    expect(sheet).toMatch(/aria-label="Plan options"/);
  });

  it("closes on Back", () => {
    expect(code).toMatch(
      /useBackDismiss\(showOverflow, \(\) => setShowOverflow\(false\)\)/
    );
  });
});

describe("an exercise's menu", () => {
  const menu = block("{contextMenu && (");

  it("is a named menu of menu items, holding focus while open", () => {
    expect(code).toMatch(
      /const contextMenuRef = useFocusTrap<HTMLDivElement>\(\s*contextMenu !== null\s*\)/
    );
    expect(menu).toMatch(/ref=\{contextMenuRef\}/);
    expect(menu).toMatch(/role="menu"/);
    expect(menu).toMatch(/aria-label=\{`Options for/);
    const buttons = menu.match(/<button\b/g) ?? [];
    const items = menu.match(/role="menuitem"/g) ?? [];
    expect(buttons.length).toBe(4);
    expect(items.length).toBe(buttons.length);
  });

  it("says it opens a menu, and whether it is open", () => {
    const trigger = code.slice(
      code.indexOf("aria-label={`More options for ${ex.name}`}"),
      code.indexOf("aria-label={`More options for ${ex.name}`}") + 300
    );
    expect(trigger).toMatch(/aria-haspopup="menu"/);
    expect(trigger).toMatch(/aria-expanded=/);
  });

  it("closes on Back", () => {
    expect(code).toMatch(
      /useBackDismiss\(contextMenu !== null, \(\) => setContextMenu\(null\)\)/
    );
  });
});

describe("Escape closes either", () => {
  it("listens for Escape while one is open, and closes both", () => {
    const at = code.indexOf(
      "if (!showOverflow && contextMenu === null) return;"
    );
    expect(at).toBeGreaterThan(-1);
    const effect = code.slice(
      at,
      code.indexOf("}, [showOverflow, contextMenu]);", at)
    );
    expect(effect).toMatch(/e\.key !== "Escape"/);
    expect(effect).toMatch(/setShowOverflow\(false\)/);
    expect(effect).toMatch(/setContextMenu\(null\)/);
  });
});
