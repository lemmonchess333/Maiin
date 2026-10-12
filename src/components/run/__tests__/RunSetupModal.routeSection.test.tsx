/**
 * The setup screen opens on its own Back and title. The route actions
 * ("Plan a route", "Follow a route") sat above both and outside the
 * scroll, so they also stayed on screen while the page scrolled under
 * them. They are the modal's now, under its heading.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/weather", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/weather")>()),
  getCurrentWeather: vi.fn(async () => null),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "runner" }, profile: {} }),
}));
vi.mock("@/lib/savedRuns", () => ({
  fetchSavedRuns: vi.fn(async () => []),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/components/run/ShoeSelector", () => ({ default: () => null }));

import RunSetupModal from "../RunSetupModal";

afterEach(cleanup);

const follows = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("RunSetupModal — the route actions", () => {
  it("sit under the title, in the part of the screen that scrolls", () => {
    render(
      <RunSetupModal
        onStart={vi.fn()}
        onCancel={vi.fn()}
        routeSection={<button type="button">Plan a route</button>}
      />
    );
    const back = screen.getByRole("button", { name: "Back" });
    const title = screen.getByRole("heading", { name: "Ready to run?" });
    const route = screen.getByRole("button", { name: "Plan a route" });
    expect(follows(back, title)).toBe(true);
    expect(follows(title, route)).toBe(true);
    expect(route.closest("header")).toBeNull();
  });
});
