import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Shoe } from "@/hooks/useShoes";

const mocks = vi.hoisted(() => ({
  shoes: [] as Shoe[],
  loading: false,
  assignRunShoe: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/useShoes", () => ({
  useShoes: () => ({
    shoes: mocks.shoes,
    activeShoes: mocks.shoes.filter((s) => !s.retired),
    defaultShoe: mocks.shoes.find((s) => !s.retired && s.isDefault) ?? null,
    loading: mocks.loading,
  }),
}));
vi.mock("@/lib/runShoe", () => ({
  assignRunShoe: (...args: unknown[]) => mocks.assignRunShoe(...args),
}));
vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RunDetailShoeCard from "../RunDetailShoeCard";

function makeShoe(overrides: Partial<Shoe> & { id: string }): Shoe {
  return {
    name: "Pegasus 41",
    brand: "Nike",
    totalKm: 120,
    maxKm: 600,
    isDefault: true,
    retired: false,
    addedAt: new Date("2026-01-01T00:00:00Z"),
    alert85Shown: false,
    alert100Shown: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.shoes = [];
  mocks.loading = false;
  vi.clearAllMocks();
});

describe("RunDetailShoeCard", () => {
  it("renders nothing when the runner has no shoes", () => {
    const { container } = render(
      <RunDetailShoeCard
        uid="u1"
        runId="r1"
        storedShoeId={null}
        distanceMeters={5000}
        volumeEligible
        unit="km"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("lets the runner assign an active shoe to an unassigned run", async () => {
    mocks.shoes = [
      makeShoe({ id: "s1", name: "Pegasus 41", totalKm: 120 }),
      makeShoe({ id: "s2", name: "Vaporfly", totalKm: 45, isDefault: false }),
    ];
    mocks.assignRunShoe.mockResolvedValue(null);

    render(
      <RunDetailShoeCard
        uid="u1"
        runId="r1"
        storedShoeId={null}
        distanceMeters={8000}
        volumeEligible
        unit="km"
      />
    );

    const select = screen.getByLabelText("Shoe") as HTMLSelectElement;
    expect(select.value).toBe("");

    fireEvent.change(select, { target: { value: "s2" } });

    await waitFor(() =>
      expect(mocks.assignRunShoe).toHaveBeenCalledWith("u1", "r1", {
        previousShoeId: null,
        nextShoeId: "s2",
        distanceMeters: 8000,
        volumeEligible: true,
        shoes: mocks.shoes,
      })
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Shoe updated");
    expect(select.value).toBe("s2");
  });

  it("shows a retired shoe option when the run was logged in it and reverts on error", async () => {
    mocks.shoes = [
      makeShoe({ id: "s-old", name: "Old Kinvara", retired: true }),
      makeShoe({ id: "s-new", name: "Endorphin Speed", retired: false }),
    ];
    mocks.assignRunShoe.mockRejectedValue(new Error("permission-denied"));

    render(
      <RunDetailShoeCard
        uid="u1"
        runId="r1"
        storedShoeId="s-old"
        distanceMeters={5000}
        volumeEligible
        unit="km"
      />
    );

    const select = screen.getByLabelText("Shoe") as HTMLSelectElement;
    expect(select.value).toBe("s-old");
    expect(screen.getByText("Old Kinvara (retired)")).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "s-new" } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Couldn’t update shoe. Try again."
      )
    );
    expect(select.value).toBe("s-old");
  });
});
