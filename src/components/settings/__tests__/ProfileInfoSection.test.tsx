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
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach } from "vitest";
import { useState } from "react";
import ProfileInfoSection from "../ProfileInfoSection";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/profanityFilter";
import { DISPLAY_NAME_LENGTH_MESSAGE } from "@/lib/displayName";
import { localDateString } from "@/lib/dateHelpers";

afterEach(() => cleanup());

const { queueWeightEntry, flushQueuedWeights } = vi.hoisted(() => ({
  queueWeightEntry: vi.fn(),
  flushQueuedWeights: vi.fn(async () => {}),
}));
vi.mock("@/lib/weightQueue", () => ({ queueWeightEntry, flushQueuedWeights }));
beforeEach(() => {
  queueWeightEntry.mockClear();
  flushQueuedWeights.mockClear();
});

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

function pendingProfileSave() {
  let resolve!: (result: UpdateProfileResult) => void;
  const promise = new Promise<UpdateProfileResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderSection(
  profile: UserProfile,
  refreshProfile?: () => Promise<void>
) {
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
      refreshProfile={refreshProfile}
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

  it.each([true, false])(
    "keeps a newer why draft when the pending save finishes with ok=%s",
    async (ok) => {
      const { updateProfile } = renderSection(
        makeProfile({ trainingWhy: "Feel stronger" })
      );
      const pending = pendingProfileSave();
      updateProfile.mockReturnValueOnce(pending.promise);
      const input = screen.getByLabelText("Why you train");
      fireEvent.change(input, { target: { value: "  More energy  " } });
      fireEvent.blur(input);
      expect(updateProfile).toHaveBeenCalledWith({
        trainingWhy: "More energy",
      });
      fireEvent.change(input, { target: { value: "  Run a marathon  " } });

      await act(async () => {
        pending.resolve(
          ok ? { ok: true } : { ok: false, error: new Error("offline") }
        );
        await pending.promise;
      });
      expect(input).toHaveValue("  Run a marathon  ");

      // The text kept on screen is also what the next blur persists.
      await act(async () => fireEvent.blur(input));
      expect(updateProfile).toHaveBeenLastCalledWith({
        trainingWhy: "Run a marathon",
      });
      expect(input).toHaveValue("Run a marathon");
    }
  );

  it("still restores the saved why when a failed save has no newer edit", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ trainingWhy: "Feel stronger" })
    );
    const pending = pendingProfileSave();
    updateProfile.mockReturnValueOnce(pending.promise);
    const input = screen.getByLabelText("Why you train");
    fireEvent.change(input, { target: { value: "More energy" } });
    fireEvent.blur(input);
    await act(async () => {
      pending.resolve({ ok: false, error: new Error("offline") });
      await pending.promise;
    });
    expect(input).toHaveValue("Feel stronger");
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenCalledOnce();
  });

  it("persists a return to the original why while another save is pending", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ trainingWhy: "Feel stronger" })
    );
    const first = pendingProfileSave();
    const second = pendingProfileSave();
    updateProfile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const input = screen.getByLabelText("Why you train");
    fireEvent.change(input, { target: { value: "More energy" } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "Feel stronger" } });
    fireEvent.blur(input);
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(updateProfile).toHaveBeenNthCalledWith(2, {
      trainingWhy: "Feel stronger",
    });
    expect(input).toHaveValue("Feel stronger");
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
    expect(queueWeightEntry).not.toHaveBeenCalled();
    expect(input.value).toBe("75"); // profile.weightKg
  });

  it("rejects an implausible weight (>350), restores previous", async () => {
    const { updateProfile } = renderSection(makeProfile());
    const input = type(/weight/i, "999");
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(queueWeightEntry).not.toHaveBeenCalled();
    expect(input.value).toBe("75");
  });

  it("logs a plausible changed weight as today's weigh-in", async () => {
    const { updateProfile } = renderSection(makeProfile());
    type(/weight/i, "82");
    await Promise.resolve();
    // Through the weigh-in queue, which writes the log row and the
    // profile's weight and macros together, as a weigh-in from Home does.
    expect(queueWeightEntry).toHaveBeenCalledWith("u-1", localDateString(), 82);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("putting a mistaken weight back saves it: it compares against what was just saved", async () => {
    // The queue writes the profile on the server, not the one this screen
    // holds, which still says 75: putting 82 back to 75 matched it and
    // saved nothing, leaving 82 stored and 75 on screen.
    renderSection(makeProfile());
    type(/weight/i, "82");
    type(/weight/i, "75");
    await Promise.resolve();
    expect(queueWeightEntry).toHaveBeenNthCalledWith(
      2,
      "u-1",
      localDateString(),
      75
    );
  });

  it("re-reads the profile once the weight is written", async () => {
    const refreshProfile = vi.fn(async () => {});
    renderSection(makeProfile(), refreshProfile);
    type(/weight/i, "82");
    await vi.waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(flushQueuedWeights).toHaveBeenCalledWith("u-1");
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

  it("keeps a newer centimetre draft when an earlier height save fails", async () => {
    const { updateProfile } = renderSection(makeProfile());
    const pending = pendingProfileSave();
    updateProfile.mockReturnValueOnce(pending.promise);
    const input = type("Height (cm)", "180");
    expect(updateProfile).toHaveBeenCalledWith({ heightCm: 180 });
    fireEvent.change(input, { target: { value: "181" } });
    await act(async () => {
      pending.resolve({ ok: false, error: new Error("offline") });
      await pending.promise;
    });
    expect(input).toHaveValue(181);
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenLastCalledWith({ heightCm: 181 });
  });

  it("still restores the saved height after failure without a newer edit", async () => {
    const { updateProfile } = renderSection(makeProfile());
    const pending = pendingProfileSave();
    updateProfile.mockReturnValueOnce(pending.promise);
    const input = type("Height (cm)", "180");
    await act(async () => {
      pending.resolve({ ok: false, error: new Error("offline") });
      await pending.promise;
    });
    expect(input).toHaveValue(175);
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenCalledOnce();
  });

  it("persists a return to the original centimetres while a save is pending", async () => {
    const { updateProfile } = renderSection(makeProfile());
    const first = pendingProfileSave();
    const second = pendingProfileSave();
    updateProfile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const input = type("Height (cm)", "180");
    fireEvent.change(input, { target: { value: "175" } });
    fireEvent.blur(input);
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(updateProfile).toHaveBeenNthCalledWith(2, { heightCm: 175 });
    expect(input).toHaveValue(175);
  });

  it("writes nothing when a field is left as it was", async () => {
    const { updateProfile } = renderSection(makeProfile());
    fireEvent.blur(screen.getByLabelText(/weight/i));
    fireEvent.blur(screen.getByLabelText(/height/i));
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(queueWeightEntry).not.toHaveBeenCalled();
  });
});

/**
 * Body metrics are stored in kg and cm and shown in the unit chosen under
 * Units & appearance. These fields showed kg and cm whatever was chosen, so
 * someone who weighs themselves in pounds read a number they did not know.
 */
describe("ProfileInfoSection — weight and height in the chosen units", () => {
  it("shows pounds, and saves what is typed in pounds as kg", async () => {
    renderSection(makeProfile({ preferredWeightUnit: "lbs", weightKg: 75 }));
    const input = screen.getByLabelText("Weight (lb)") as HTMLInputElement;
    expect(input.value).toBe("165.3");
    fireEvent.change(input, { target: { value: "160" } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(queueWeightEntry.mock.calls[0][2]).toBeCloseTo(72.57, 2);
  });

  it("does not write back a rounded conversion when pounds are left alone", async () => {
    // 75 kg shows as 165.3 lb; reading that back would store 74.98 kg.
    const { updateProfile } = renderSection(
      makeProfile({ preferredWeightUnit: "lbs", weightKg: 75 })
    );
    fireEvent.blur(screen.getByLabelText("Weight (lb)"));
    await Promise.resolve();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(queueWeightEntry).not.toHaveBeenCalled();
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
    expect(queueWeightEntry).not.toHaveBeenCalled();
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

  it("treats feet and inches as one draft while a height save is pending", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ preferredHeightUnit: "ft", heightCm: 175 })
    );
    const pending = pendingProfileSave();
    updateProfile.mockReturnValueOnce(pending.promise);
    const feet = screen.getByLabelText("Height, feet");
    const inches = screen.getByLabelText("Height, inches");
    fireEvent.change(feet, { target: { value: "6" } });
    fireEvent.change(inches, { target: { value: "0" } });
    fireEvent.blur(inches);
    expect(updateProfile).toHaveBeenCalledWith({ heightCm: 182.9 });
    fireEvent.change(inches, { target: { value: "2" } });
    await act(async () => {
      pending.resolve({ ok: false, error: new Error("offline") });
      await pending.promise;
    });
    expect(feet).toHaveValue(6);
    expect(inches).toHaveValue(2);
    await act(async () => fireEvent.blur(inches));
    expect(updateProfile).toHaveBeenLastCalledWith({ heightCm: 188 });
  });

  it("persists a return to the original feet and inches while a save is pending", async () => {
    const { updateProfile } = renderSection(
      makeProfile({ preferredHeightUnit: "ft", heightCm: 175 })
    );
    const first = pendingProfileSave();
    const second = pendingProfileSave();
    updateProfile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const inches = screen.getByLabelText("Height, inches");
    fireEvent.change(inches, { target: { value: "10" } });
    fireEvent.blur(inches);
    fireEvent.change(inches, { target: { value: "9" } });
    fireEvent.blur(inches);
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
      second.resolve({ ok: true });
      await second.promise;
    });
    // Returning to the original display must retain its precise stored cm,
    // rather than writing the rounded feet/inches conversion back.
    expect(updateProfile).toHaveBeenNthCalledWith(2, { heightCm: 175 });
    expect(inches).toHaveValue(9);
  });
});

/* The name is public and this field writes the profile directly, so it
   meets Onboarding's rules here: 2 to 50 characters, and nothing the word
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

  it("keeps a newer name draft when the previous save fails", async () => {
    const { updateProfile, input } = renderName();
    const pending = pendingProfileSave();
    updateProfile.mockReturnValueOnce(pending.promise);
    fireEvent.change(input, { target: { value: "Sam Kerr" } });
    fireEvent.blur(input);
    expect(updateProfile).toHaveBeenCalledWith({ displayName: "Sam Kerr" });
    fireEvent.change(input, { target: { value: "Alex Smith" } });
    await act(async () => {
      pending.resolve({ ok: false, error: new Error("offline") });
      await pending.promise;
    });
    expect(input).toHaveValue("Alex Smith");
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenLastCalledWith({
      displayName: "Alex Smith",
    });
  });

  it("still restores the saved name after failure without a newer edit", async () => {
    const { updateProfile, input } = renderName();
    const pending = pendingProfileSave();
    updateProfile.mockReturnValueOnce(pending.promise);
    fireEvent.change(input, { target: { value: "Sam Kerr" } });
    fireEvent.blur(input);
    await act(async () => {
      pending.resolve({ ok: false, error: new Error("offline") });
      await pending.promise;
    });
    expect(input).toHaveValue("Test");
    await act(async () => fireEvent.blur(input));
    expect(updateProfile).toHaveBeenCalledOnce();
  });

  it("persists a return to the original name while another save is pending", async () => {
    const { updateProfile, input } = renderName();
    const first = pendingProfileSave();
    const second = pendingProfileSave();
    updateProfile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    fireEvent.change(input, { target: { value: "Sam Kerr" } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.blur(input);
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(updateProfile).toHaveBeenNthCalledWith(2, { displayName: "Test" });
    expect(input).toHaveValue("Test");
  });

  it("does not call the parent name setter after the form unmounts", async () => {
    const pending = pendingProfileSave();
    const updateProfile = vi.fn(() => pending.promise);
    const setName = vi.fn();
    const { unmount } = render(
      <ProfileInfoSection
        profile={makeProfile()}
        name="Sam Kerr"
        setName={setName}
        updateProfile={updateProfile}
        inline
      />
    );
    fireEvent.blur(screen.getByLabelText("Name"));
    expect(updateProfile).toHaveBeenCalledWith({ displayName: "Sam Kerr" });
    unmount();
    setName.mockClear();
    await act(async () => {
      pending.resolve({ ok: false, error: new Error("offline") });
      await pending.promise;
    });
    expect(setName).not.toHaveBeenCalled();
  });
});
