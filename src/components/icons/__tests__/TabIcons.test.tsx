/**
 * The tab bar's own icons (DS3): drawn as one set, each with an outline
 * and a filled form for the open tab, the same size in both.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  AnalyticsTabIcon,
  FoodTabIcon,
  HomeTabIcon,
  SocialTabIcon,
  TrainTabIcon,
} from "../TabIcons";
import BottomNavigation from "@/components/BottomNavigation";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/preloadTab", () => ({ preloadTab: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

afterEach(cleanup);

const ICONS = {
  Home: HomeTabIcon,
  Train: TrainTabIcon,
  Food: FoodTabIcon,
  Social: SocialTabIcon,
  Analytics: AnalyticsTabIcon,
};

function svgOf(Icon: (typeof ICONS)[keyof typeof ICONS], active: boolean) {
  const { container } = render(<Icon active={active} />);
  return container.querySelector("svg")!;
}

describe("tab icons", () => {
  for (const [name, Icon] of Object.entries(ICONS)) {
    it(`${name}: decorative, with an outline and a filled form of one size`, () => {
      const outline = svgOf(Icon, false);
      expect(outline).toHaveAttribute("aria-hidden", "true");
      expect(outline).toHaveAttribute("data-tab-icon", "outline");
      expect(outline.querySelector('[fill="currentColor"]')).toBeNull();
      cleanup();

      const filled = svgOf(Icon, true);
      expect(filled).toHaveAttribute("data-tab-icon", "filled");
      expect(filled.querySelector('[fill="currentColor"]')).not.toBeNull();
      // Same box and the same stroke, so opening a tab does not resize it.
      expect(filled.getAttribute("viewBox")).toBe(
        outline.getAttribute("viewBox")
      );
      expect(filled.getAttribute("stroke-width")).toBe(
        outline.getAttribute("stroke-width")
      );
    });
  }
});

describe("the tab bar draws them", () => {
  it("fills the open tab's icon and outlines the rest", () => {
    render(
      <MemoryRouter initialEntries={["/food"]}>
        <BottomNavigation
          tabs={[
            { to: "/", icon: HomeTabIcon, label: "Home" },
            { to: "/program", icon: TrainTabIcon, label: "Train" },
            { to: "/food", icon: FoodTabIcon, label: "Food" },
            { to: "/social", icon: SocialTabIcon, label: "Social" },
            { to: "/history", icon: AnalyticsTabIcon, label: "Analytics" },
          ]}
          pathname="/food"
          unreadCount={0}
          onSocialVisit={() => {}}
        />
      </MemoryRouter>
    );
    const form = (label: string) =>
      screen
        .getByRole("link", { name: label })
        .querySelector("svg")!
        .getAttribute("data-tab-icon");
    expect(form("Food")).toBe("filled");
    for (const label of ["Home", "Train", "Social", "Analytics"])
      expect(form(label)).toBe("outline");
  });
});
