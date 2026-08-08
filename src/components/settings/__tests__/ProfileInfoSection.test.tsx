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

describe("ProfileInfoSection — D16 training why", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds the Your why field from profile.trainingWhy", () => {
    renderSection(makeProfile({ trainingWhy: "Feel stronger" }));
    const input = screen.getByLabelText("Your why") as HTMLInputElement;
    expect(input.value).toBe("Feel stronger");
  });

  it("persists a trimmed, capped why on blur", () => {
    const { updateProfile } = renderSection(makeProfile());
    const input = screen.getByLabelText("Your why");
    fireEvent.change(input, { target: { value: "  More energy  " } });
    fireEvent.blur(input);
    expect(updateProfile).toHaveBeenCalledWith({ trainingWhy: "More energy" });
  });

  it("does not write when the value is unchanged", () => {
    const { updateProfile } = renderSection(
      makeProfile({ trainingWhy: "Longevity" })
    );
    fireEvent.blur(screen.getByLabelText("Your why"));
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("clearing the field writes an empty string (removes the why)", () => {
    const { updateProfile } = renderSection(
      makeProfile({ trainingWhy: "Run a race" })
    );
    const input = screen.getByLabelText("Your why");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(updateProfile).toHaveBeenCalledWith({ trainingWhy: "" });
  });
});

describe("ProfileInfoSection — cleared-field guards on weight/height blur", () => {
  // A cleared number input blurs as Number("") = 0, and 0 used to be
  // WRITTEN: firestore.rules bounds field names, not values, so the
  // profile carried weightKg: 0 and the nutrition pipeline split —
  // calculateTDEE stored a 0g protein target while getAdjustedTargets
  // silently rebased to 70kg. The blur now rejects out-of-range values
  // and restores the previous one instead of persisting garbage.
  function renderWithValues(weightKg: number, heightCm: number) {
    const updateProfile = vi.fn(
      async () => ({ ok: true }) as UpdateProfileResult
    );
    const setWeightKg = vi.fn();
    const setHeightCm = vi.fn();
    const profile = makeProfile();
    render(
      <ProfileInfoSection
        profile={profile}
        name="Test"
        setName={vi.fn()}
        weightKg={weightKg}
        setWeightKg={setWeightKg}
        heightCm={heightCm}
        setHeightCm={setHeightCm}
        updateProfile={updateProfile}
        inline
      />
    );
    return { updateProfile, setWeightKg, setHeightCm };
  }

  it("rejects a cleared (0) weight: no write, value restored", async () => {
    const { updateProfile, setWeightKg } = renderWithValues(0, 175);
    fireEvent.blur(screen.getByLabelText(/weight/i));
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(setWeightKg).toHaveBeenCalledWith(75); // profile.weightKg
  });

  it("rejects an implausible weight (>350), restores previous", async () => {
    const { updateProfile, setWeightKg } = renderWithValues(999, 175);
    fireEvent.blur(screen.getByLabelText(/weight/i));
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(setWeightKg).toHaveBeenCalledWith(75);
  });

  it("still writes a plausible changed weight", async () => {
    const { updateProfile } = renderWithValues(82, 175);
    fireEvent.blur(screen.getByLabelText(/weight/i));
    await Promise.resolve();
    expect(updateProfile).toHaveBeenCalledWith({ weightKg: 82 });
  });

  it("rejects a cleared (0) height: no write, value restored", async () => {
    const { updateProfile, setHeightCm } = renderWithValues(75, 0);
    fireEvent.blur(screen.getByLabelText(/height/i));
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(setHeightCm).toHaveBeenCalledWith(175); // profile.heightCm
  });

  it("still writes a plausible changed height", async () => {
    const { updateProfile } = renderWithValues(75, 180);
    fireEvent.blur(screen.getByLabelText(/height/i));
    await Promise.resolve();
    expect(updateProfile).toHaveBeenCalledWith({ heightCm: 180 });
  });
});
