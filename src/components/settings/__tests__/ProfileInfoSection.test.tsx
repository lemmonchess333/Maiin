/**
 * Settings pills cohesion (Set-cohesion PR series). Pins that the Profile
 * Gender / Age-range pickers render through the shared SegmentedControl
 * primitive (radiogroup a11y) — NOT the old bespoke purple-outline pill
 * buttons — and that selecting an option writes the right profile field.
 *
 * These are render-level (jsdom) so they verify the migration without the
 * Firebase emulator.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import ProfileInfoSection from "../ProfileInfoSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

afterEach(() => cleanup());

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    gender: "male",
    ageRange: "25-34",
    weightKg: 75,
    heightCm: 175,
    ...overrides,
  } as UserProfile;
}

function renderSection(profile: UserProfile) {
  const updateProfile = vi.fn(
    async () => ({ ok: true }) as UpdateProfileResult
  );
  render(
    <ProfileInfoSection
      profile={profile}
      name={profile.displayName ?? ""}
      setName={vi.fn()}
      weightKg={75}
      setWeightKg={vi.fn()}
      heightCm={175}
      setHeightCm={vi.fn()}
      updateProfile={updateProfile}
      inline
    />
  );
  return { updateProfile };
}

describe("ProfileInfoSection — pills use SegmentedControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders Gender + Age range as labelled radiogroups", () => {
    renderSection(makeProfile());
    expect(screen.getByRole("radiogroup", { name: "Gender" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Age range" })).toBeTruthy();
  });

  it("Gender radios reflect the selected value via aria-checked", () => {
    renderSection(makeProfile({ gender: "female" }));
    const group = screen.getByRole("radiogroup", { name: "Gender" });
    const female = screen.getByRole("radio", { name: "Female" });
    expect(female.getAttribute("aria-checked")).toBe("true");
    // exactly one selected
    const checked = Array.from(group.querySelectorAll('[role="radio"]')).filter(
      (r) => r.getAttribute("aria-checked") === "true"
    );
    expect(checked).toHaveLength(1);
  });

  it("selecting a gender writes the gender field", () => {
    const { updateProfile } = renderSection(makeProfile({ gender: "male" }));
    fireEvent.click(screen.getByRole("radio", { name: "Female" }));
    expect(updateProfile).toHaveBeenCalledWith({ gender: "female" });
  });

  it("selecting an age range writes the ageRange field", () => {
    const { updateProfile } = renderSection(makeProfile());
    fireEvent.click(screen.getByRole("radio", { name: "45 – 54" }));
    expect(updateProfile).toHaveBeenCalledWith({ ageRange: "45-54" });
  });

  it("handles an unset gender (no radio checked) without crashing", () => {
    renderSection(makeProfile({ gender: undefined }));
    const group = screen.getByRole("radiogroup", { name: "Gender" });
    const checked = group.querySelectorAll(
      '[role="radio"][aria-checked="true"]'
    );
    expect(checked).toHaveLength(0);
  });
});
