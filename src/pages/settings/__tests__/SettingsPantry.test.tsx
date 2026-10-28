/**
 * My pantry (F2d's "Settings → My pantry", Mob2 call 1): the saved foods
 * by name, each opening a sheet to correct it or take it out.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { FoodFavourite } from "@/hooks/useFoodFavourites";

const api = vi.hoisted(() => ({
  favourites: [] as FoodFavourite[],
  loading: false,
  removeFavourite: vi.fn(),
  restoreFavourite: vi.fn(),
  updateFavourite: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: api.toast }));
vi.mock("@/hooks/useFoodFavourites", () => ({
  useFoodFavourites: () => ({
    favourites: api.favourites,
    loading: api.loading,
    removeFavourite: api.removeFavourite,
    restoreFavourite: api.restoreFavourite,
    updateFavourite: api.updateFavourite,
  }),
}));

import SettingsPantry from "../SettingsPantry";

function food(id: string, name: string, calories: number): FoodFavourite {
  return {
    id,
    name,
    calories,
    protein: 7,
    carbs: 10,
    fat: 6,
    servingSize: "1 cup",
    lastUsed: Timestamp.fromMillis(0),
    useCount: 3,
    timeOfDay: "any",
    source: "manual",
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPantry />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.loading = false;
  api.favourites = [
    food("mocha", "Mocha", 230),
    food("flat", "Flat white", 120),
  ];
  api.removeFavourite.mockResolvedValue(true);
  api.restoreFavourite.mockResolvedValue(true);
  api.updateFavourite.mockResolvedValue("saved");
});
afterEach(cleanup);

describe("SettingsPantry", () => {
  it("lists the saved foods by name, each with its serving and figures", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "My pantry" })
    ).toBeInTheDocument();
    const rows = screen
      .getAllByRole("button")
      .filter((b) => /^(Flat white|Mocha)/.test(b.textContent ?? ""));
    expect(rows.map((r) => r.textContent?.split("1 cup")[0])).toEqual([
      "Flat white",
      "Mocha",
    ]);
    expect(
      screen.getByText("1 cup · 120 kcal · P 7g · C 10g · F 6g")
    ).toBeInTheDocument();
  });

  it("saves a corrected figure through the hook", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Flat white/ }));
    fireEvent.change(screen.getByLabelText("Calories (kcal)"), {
      target: { value: "140" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateFavourite).toHaveBeenCalledOnce());
    const [target, changes] = api.updateFavourite.mock.calls[0];
    expect(target.id).toBe("flat");
    expect(changes).toEqual({
      name: "Flat white",
      servingSize: "1 cup",
      calories: 140,
      protein: 7,
      carbs: 10,
      fat: 6,
    });
    await waitFor(() =>
      expect(screen.queryByLabelText("Calories (kcal)")).toBeNull()
    );
  });

  it("keeps the sheet open when the new name is another food's", async () => {
    api.updateFavourite.mockResolvedValue("taken");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Flat white/ }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Mocha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.toast.error).toHaveBeenCalledWith(
        "Mocha is already in your pantry.",
        expect.anything()
      )
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("holds Save on a figure that is not a number", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Mocha/ }));
    fireEvent.change(screen.getByLabelText("Protein (g)"), {
      target: { value: "-3" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter 0 or more.");
  });

  it("removes a food with Undo", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Mocha/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from pantry" }));
    await waitFor(() =>
      expect(api.removeFavourite).toHaveBeenCalledWith("mocha")
    );
    expect(screen.queryByRole("button", { name: /^Mocha/ })).toBeNull();
    const [message, options] = api.toast.mock.calls[0];
    expect(message).toBe("Removed Mocha");
    await options.action.onClick();
    expect(api.restoreFavourite).toHaveBeenCalledWith(api.favourites[0]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Mocha/ })).toBeInTheDocument()
    );
  });

  it("says what the pantry is for when it is empty", () => {
    api.favourites = [];
    renderPage();
    expect(screen.getByText("Nothing in your pantry yet")).toBeInTheDocument();
  });
});
