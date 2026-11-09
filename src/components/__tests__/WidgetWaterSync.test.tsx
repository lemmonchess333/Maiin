/**
 * The food widget's water follows today's water log wherever the app is
 * (Wid1): a drink logged on any screen, or saved from the widget's own
 * queue or the Watch, changes the water the widget draws, with Home never
 * drawn.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeWidgetSections } from "@/lib/homeWidgetContract";

const H = vi.hoisted(() => ({
  water: {
    day: "2026-11-11",
    ml: 750,
    target: 2000,
    servingMl: 250,
    drinks: [{ id: "d1", ml: 750 }],
    loading: false,
  },
  sections: [] as HomeWidgetSections[],
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }));
vi.mock("@/hooks/useWaterLog", () => ({ useWaterLog: () => H.water }));
vi.mock("@/lib/homeWidgets", () => ({
  writeHomeWidgetSections: vi.fn(async (sections: HomeWidgetSections) => {
    H.sections.push(sections);
    return true;
  }),
}));

import WidgetWaterSync from "../WidgetWaterSync";
import { widgetAccount } from "@/lib/homeWidgetContract";

beforeEach(() => {
  H.sections = [];
  H.water = { ...H.water, ml: 750, drinks: [{ id: "d1", ml: 750 }] };
});
afterEach(cleanup);

describe("the widgets' water writer", () => {
  it("writes today's water, and again when a drink is logged anywhere", async () => {
    const view = render(<WidgetWaterSync />);
    await waitFor(() => expect(H.sections).toHaveLength(1));
    expect(H.sections[0]).toMatchObject({
      account: widgetAccount("u1"),
      water: {
        date: "2026-11-11",
        ml: 750,
        targetMl: 2000,
        servingMl: 250,
        servingLabel: "Glass",
        drinkIds: ["d1"],
      },
    });
    expect(H.sections[0].food).toBeUndefined();

    H.water = {
      ...H.water,
      ml: 1000,
      drinks: [...H.water.drinks, { id: "d2", ml: 250 }],
    };
    view.rerender(<WidgetWaterSync />);
    await waitFor(() => expect(H.sections).toHaveLength(2));
    expect(H.sections[1].water).toMatchObject({
      ml: 1000,
      drinkIds: ["d1", "d2"],
    });
  });

  it("writes nothing while the day's water is still being read", async () => {
    H.water = { ...H.water, loading: true };
    render(<WidgetWaterSync />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(H.sections).toEqual([]);
  });

  it("renders nothing", () => {
    const { container } = render(<WidgetWaterSync />);
    expect(container.innerHTML).toBe("");
  });
});
