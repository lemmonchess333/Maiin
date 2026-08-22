import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ShoeSelector from "../ShoeSelector";
import ShoeMileageSection from "../ShoeMileageSection";

/* Shoe mileage now reads the display unit, which resolves from the auth
   profile — and `useAuth` throws outside an AuthProvider, which this suite
   doesn't render. Mocking the one-export hook keeps the blast radius at one
   symbol; metric is the default, so these link assertions are unaffected. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));

/**
 * Both run-tab shoe surfaces deep-link to the FOCUSED shoes page
 * (/settings/shoes), not the generic Settings list — the "one tap to the
 * right place" pattern shared with the Food-card gear.
 */

const shoesMock = vi.fn();
vi.mock("@/hooks/useShoes", () => ({
  useShoes: () => shoesMock(),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

describe("shoe surfaces deep-link to /settings/shoes", () => {
  it("ShoeSelector empty-state CTA navigates to the shoes page", () => {
    shoesMock.mockReturnValue({
      activeShoes: [],
      defaultShoe: null,
      loading: false,
    });
    render(
      <MemoryRouter>
        <ShoeSelector selectedShoeId={null} onSelect={() => {}} />
      </MemoryRouter>
    );
    screen.getByText(/track your shoe mileage/i).click();
    expect(navigateMock).toHaveBeenCalledWith("/settings/shoes");
  });

  it("ShoeMileageSection card links to the shoes page", () => {
    shoesMock.mockReturnValue({
      activeShoes: [
        {
          id: "s1",
          name: "Pegasus",
          totalKm: 100,
          maxKm: 800,
          isDefault: true,
        },
      ],
      defaultShoe: null,
      loading: false,
    });
    render(
      <MemoryRouter>
        <ShoeMileageSection />
      </MemoryRouter>
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings/shoes");
  });
});
