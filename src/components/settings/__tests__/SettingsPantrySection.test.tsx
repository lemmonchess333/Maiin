/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t: any, prop: string) =>
        (props: any) => {
          const {
            initial: _i,
            animate: _a,
            exit: _e,
            transition: _tn,
            layout: _l,
            ...rest
          } = props;
          const Tag = prop === "create" ? "div" : prop;
          return <Tag {...rest} />;
        },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let mockFavourites: any[] = [];
const mockRemoveFavourite = vi.fn(async () => {});
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({
    favourites: mockFavourites,
    loading: false,
    removeFavourite: mockRemoveFavourite,
    addFavourite: vi.fn(),
    getTimeRelevant: () => [],
  }),
}));

import SettingsPantrySection from "../SettingsPantrySection";

function makeFav(over: Partial<{ id: string; name: string; useCount: number }> = {}) {
  return {
    id: over.id ?? "fav-1",
    name: over.name ?? "Boiled eggs",
    calories: 78,
    protein: 6,
    carbs: 1,
    fat: 5,
    servingSize: "1 large",
    lastUsed: { toMillis: () => Date.now() },
    useCount: over.useCount ?? 1,
    timeOfDay: "morning",
    source: "manual",
  };
}

describe("SettingsPantrySection", () => {
  beforeEach(() => {
    mockFavourites = [];
    mockRemoveFavourite.mockClear();
  });

  it("renders the empty state when there are no favourites", () => {
    mockFavourites = [];
    render(<SettingsPantrySection inline />);
    expect(
      screen.getByText(/Log a meal on the Food page/i),
    ).toBeInTheDocument();
  });

  it("renders each favourite with macros + use count", () => {
    mockFavourites = [
      makeFav({ id: "a", name: "Greek yoghurt", useCount: 3 }),
      makeFav({ id: "b", name: "Chicken thigh", useCount: 1 }),
    ];
    render(<SettingsPantrySection inline />);
    expect(screen.getByText("Greek yoghurt")).toBeInTheDocument();
    expect(screen.getByText("Chicken thigh")).toBeInTheDocument();
    // useCount > 1 surfaces the "used N×" suffix
    expect(screen.getByText(/used 3×/i)).toBeInTheDocument();
  });

  it("removeFavourite is called after the user confirms the dialog", async () => {
    mockFavourites = [makeFav({ id: "fav-1", name: "Toast" })];
    render(<SettingsPantrySection inline />);
    fireEvent.click(screen.getByLabelText(/Remove Toast from pantry/i));
    // Confirm dialog opens
    expect(screen.getByText(/Remove from pantry\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockRemoveFavourite).toHaveBeenCalledWith("fav-1");
  });

  it("removeFavourite is NOT called when the user cancels", () => {
    mockFavourites = [makeFav({ id: "fav-1", name: "Toast" })];
    render(<SettingsPantrySection inline />);
    fireEvent.click(screen.getByLabelText(/Remove Toast from pantry/i));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockRemoveFavourite).not.toHaveBeenCalled();
  });

  it("only renders the search input when there are 10+ items", () => {
    mockFavourites = Array.from({ length: 5 }, (_, i) =>
      makeFav({ id: `f-${i}`, name: `Food ${i}` }),
    );
    const { unmount } = render(<SettingsPantrySection inline />);
    expect(screen.queryByLabelText(/Search pantry/i)).toBeNull();
    unmount();

    mockFavourites = Array.from({ length: 12 }, (_, i) =>
      makeFav({ id: `f-${i}`, name: `Food ${i}` }),
    );
    render(<SettingsPantrySection inline />);
    expect(screen.getByLabelText(/Search pantry/i)).toBeInTheDocument();
  });

  it("filters the list by the search query (case-insensitive name match)", () => {
    mockFavourites = Array.from({ length: 12 }, (_, i) =>
      makeFav({ id: `f-${i}`, name: i === 3 ? "Greek YOGHURT" : `Food ${i}` }),
    );
    render(<SettingsPantrySection inline />);
    const search = screen.getByLabelText(/Search pantry/i);
    fireEvent.change(search, { target: { value: "yog" } });
    expect(screen.getByText("Greek YOGHURT")).toBeInTheDocument();
    expect(screen.queryByText("Food 4")).toBeNull();
  });
});
