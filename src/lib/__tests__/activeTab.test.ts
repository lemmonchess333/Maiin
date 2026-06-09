import { describe, it, expect } from "vitest";
import { activeTabForPath } from "../activeTab";

describe("activeTabForPath", () => {
  it("maps each tab's own route", () => {
    expect(activeTabForPath("/")).toBe("/");
    expect(activeTabForPath("/food")).toBe("/food");
    expect(activeTabForPath("/program")).toBe("/program");
    expect(activeTabForPath("/history")).toBe("/history");
    expect(activeTabForPath("/social")).toBe("/social");
  });

  it("maps subtree routes to their owning tab", () => {
    expect(activeTabForPath("/history/exercise/Bench%20Press")).toBe(
      "/history"
    );
    expect(activeTabForPath("/user/abc123")).toBe("/social");
    expect(activeTabForPath("/crew/xyz")).toBe("/social");
  });

  it("returns NO tab for routes outside every subtree (the bug)", () => {
    // The exact routes the audit flagged with a false Food highlight.
    expect(activeTabForPath("/upgrade")).toBeNull();
    expect(activeTabForPath("/run/abc123")).toBeNull();
    // …and the rest of the no-tab surfaces.
    expect(activeTabForPath("/run")).toBeNull();
    expect(activeTabForPath("/run-summary")).toBeNull();
    expect(activeTabForPath("/settings")).toBeNull();
    expect(activeTabForPath("/settings/training")).toBeNull();
    expect(activeTabForPath("/routine/r1")).toBeNull();
    expect(activeTabForPath("/diagnostics")).toBeNull();
    expect(activeTabForPath("/privacy")).toBeNull();
  });

  it("does not let a tab name as a path PREFIX leak (e.g. /foodie)", () => {
    expect(activeTabForPath("/foodie")).toBeNull();
    expect(activeTabForPath("/programme-x")).toBeNull();
    expect(activeTabForPath("/historyx")).toBeNull();
  });

  it("tolerates a trailing slash", () => {
    expect(activeTabForPath("/food/")).toBe("/food");
    expect(activeTabForPath("/upgrade/")).toBeNull();
    expect(activeTabForPath("/")).toBe("/");
  });
});
