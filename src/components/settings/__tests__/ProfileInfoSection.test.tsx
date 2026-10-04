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
import { useState } from "react";
import ProfileInfoSection from "../ProfileInfoSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/profanityFilter";
import { DISPLAY_NAME_LENGTH_MESSAGE } from "@/lib/displayName";

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
    async (_patch: Partial<UserProfile>) =>
      ({ ok: true }) as UpdateProfileResult
  );
  render(
    <ProfileInfoSection
      profile={profile}
      name={profile.displayName ?? ""}
      setName={vi.fn()}
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
    const input = screen.getByLabelText("Why you train") as HTMLInputElement;
    expect(input.value).toBe("Feel stronger");
  });

  it("persists a trimmed, capped why on blur", () => {
    const { updateProfile } = renderSection(makeProfile());
    const input = screen.getByLabelText("Why you train");
    fireEvent.change(input, { target: { value: "  More energy  " } });
    fireEvent.blur(input);
    expect(updateProfile).toHaveBeenCalledWith({ trainingWhy: "More energy" });
  });

  it("does not write when the value is unchanged", () => {
    const { updateProfile } = renderSection(
      makeProfile({ trainingWhy: "Longevity" })
    );
    fireEvent.blur(screen.getByLabelText("Why you train"));
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("clearing the field writes an empty string (removes the why)", () => {
    const { updateProfile } = renderSection(
      makeProfile({ trainingWhy: "Run a race" })
    );
    const input = screen.getByLabelText("Why you train");
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
  // silently rebases to 70kg. The blur now rejects out-of-range values
  // and restores the previous one instead of persisting garbage.
  function type(label: RegExp | string, value: string) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    return input;
  }

  it("rejects a cleared (0) weight: no write, value restored", async () => {
    const { updateProfile } = renderSection(makeProfile());
    const input = type(/weight/i, "0");
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(input.value).toBe("75"); // profile.weightKg
  });

  it("rejects an implausible weight (>350), restores previous", async () => {
    const { updateProfile } = renderSection(makeProfile());
    const input = type(/weight/i, "999");
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(input.value).toBe("75");
  });

  it("still writes a plausible changed weight", async () => {
    const { updateProfile } = renderSection(makeProfile());
    type(/weight/i, "82");
    await Promise.resolve();
    expect(updateProfile).toHaveBeenCalledWith({ weightKg: 82 });
  });

  it("rejects a cleared (0) height: no write, value restored", async () => {
    const { updateProfile } = renderSection(makeProfile());
    const input = type(/height/i, "0");
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(input.value).toBe("175"); // profile.heightCm
  });

  it("still writes a plausible changed height", async () => {
    const { updateProfile } = renderSection(makeProfile());
    type(/height/i, "180");
    await Promise.resolve();
    expect(updateProfile).toHaveBeenCalledWith({ heightCm: 180 });
  });

  it("writes nothing when a field is left as it was", async () => {
    const { updateProfile } = renderSection(makeProfile());
    fireEvent.blur(screen.getByLabelText(/weight/i));
    fireEvent.blur(screen.getByLabelText(/height/i));
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

/**
 * Body metrics are stored in kg and cm and shown in the unit chosen under
 * Units & appearance. These fields showed kg and cm whatever was chosen, so
 * someone who weighs themselves in pounds read a number they did not know.
 */
describe("ProfileInfoSection — weight and height in the chosen units", () => {
  it("shows pounds, and saves what is typed in pounds as kg", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ preferredWeightUnit: "lbs", weightKg: 75 })
    );
    const input = screen.getByLabelText("Weight (lb)") as HTMLInputElement;
    expect(input.value).toBe("165.3");
    fireEvent.change(input, { target: { value: "160" } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(updateProfile.mock.calls[0][0].weightKg).toBeCloseTo(72.57, 2);
  });

  it("does not write back a rounded conversion when pounds are left alone", async () => {
    // 75 kg shows as 165.3 lb; reading that back would store 74.98 kg.
    const { updateProfile } = renderSection(
      makeProfile({ preferredWeightUnit: "lbs", weightKg: 75 })
    );
    fireEvent.blur(screen.getByLabelText("Weight (lb)"));
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("applies the kg range to a weight typed in pounds", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ preferredWeightUnit: "lbs", weightKg: 75 })
    );
    const input = screen.getByLabelText("Weight (lb)") as HTMLInputElement;
    // 30 lb is 13.6 kg, under the 20 kg floor.
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(input.value).toBe("165.3");
  });

  it("shows feet and inches, and saves them as cm", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ preferredHeightUnit: "ft", heightCm: 175 })
    );
    const feet = screen.getByLabelText("Height, feet") as HTMLInputElement;
    const inches = screen.getByLabelText("Height, inches") as HTMLInputElement;
    expect([feet.value, inches.value]).toEqual(["5", "9"]);

    fireEvent.change(feet, { target: { value: "6" } });
    fireEvent.change(inches, { target: { value: "0" } });
    fireEvent.blur(inches);
    await Promise.resolve();
    expect(updateProfile).toHaveBeenCalledWith({ heightCm: 182.9 });
  });

  it("waits until focus leaves both boxes before saving a height", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ preferredHeightUnit: "ft", heightCm: 175 })
    );
    const feet = screen.getByLabelText("Height, feet");
    const inches = screen.getByLabelText("Height, inches");
    fireEvent.change(feet, { target: { value: "6" } });
    // Tabbing from feet to inches is still editing one height.
    fireEvent.blur(feet, { relatedTarget: inches });
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("refuses inches of 12 or more, and puts the height back", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ preferredHeightUnit: "ft", heightCm: 175 })
    );
    const inches = screen.getByLabelText("Height, inches") as HTMLInputElement;
    fireEvent.change(inches, { target: { value: "14" } });
    fireEvent.blur(inches);
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(inches.value).toBe("9");
  });
});

/* The name is public and this field writes the profile directly, so it
   meets Onboarding's rules here: 2 to 30 characters, and nothing the word
   filter flags (App Review 1.2). The name lives in the page's state, so
   the field is rendered with a real one. */
describe("ProfileInfoSection — the display name", () => {
  function NameHarness({
    profile,
    updateProfile,
  }: {
    profile: UserProfile;
    updateProfile: (p: Partial<UserProfile>) => Promise<UpdateProfileResult>;
  }) {
    const [name, setName] = useState(profile.displayName ?? "");
    return (
      <ProfileInfoSection
        profile={profile}
        name={name}
        setName={setName}
        updateProfile={updateProfile}
        inline
      />
    );
  }

  function renderName(profile = makeProfile({ displayName: "Test" })) {
    const updateProfile = vi.fn(
      async (_patch: Partial<UserProfile>) =>
        ({ ok: true }) as UpdateProfileResult
    );
    render(<NameHarness profile={profile} updateProfile={updateProfile} />);
    return { updateProfile, input: screen.getByLabelText("Name") };
  }

  it("saves a clean name, trimmed", async () => {
    const { updateProfile, input } = renderName();
    fireEvent.change(input, { target: { value: "  Sam Kerr  " } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(updateProfile).toHaveBeenCalledWith({ displayName: "Sam Kerr" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a name the word filter flags, says why, and saves nothing", async () => {
    const { updateProfile, input } = renderName();
    fireEvent.change(input, { target: { value: "shit head" } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(screen.getByRole("alert")).toHaveTextContent(
      OBJECTIONABLE_NAME_MESSAGE
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(updateProfile).not.toHaveBeenCalled();
    // The field keeps what was typed, so it can be corrected.
    expect((input as HTMLInputElement).value).toBe("shit head");
  });

  it("refuses a name shorter than two characters", async () => {
    const { updateProfile, input } = renderName();
    fireEvent.change(input, { target: { value: "S" } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(screen.getByRole("alert")).toHaveTextContent(
      DISPLAY_NAME_LENGTH_MESSAGE
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("drops the message once the name is edited again", async () => {
    const { input } = renderName();
    fireEvent.change(input, { target: { value: "shit head" } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Sam" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
