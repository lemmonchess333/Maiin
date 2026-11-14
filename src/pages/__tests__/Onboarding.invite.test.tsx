/**
 * Setup's optional "Invited by a friend?" (Soc15 call 4): a code an invite
 * link left on this device fills it in, a code can be typed instead, and
 * the code is used only once the plan is made, so the inviter's notice can
 * name the person and nothing about it can stop setup finishing.
 */
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  complete: vi.fn(),
  redeem: vi.fn(),
  refresh: vi.fn(),
  order: [] as string[],
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "invite-setup", email: "test@example.com" },
    refreshProfile: h.refresh,
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) =>
    name === "redeemInvite" ? h.redeem : h.complete,
}));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: h.toast }));

import Onboarding from "../Onboarding";
import {
  saveOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboardingDraft";
import { readPendingInvite, savePendingInvite } from "@/lib/pendingInvite";
import { NOT_A_CODE } from "@/lib/invites";

/** A lifter at the review. */
const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "strength",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 2,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  birthYearText: "1995",
  heightCm: 175,
  weightKg: 81.5,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
  goalConfirmed: true,
  runConfirmed: true,
  trainingActivity: "lifting",
  displayName: "Test athlete",
};

const open = () =>
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>
  );
const codeField = () => screen.getByLabelText("Their invite code");
const goToToday = async () => {
  const start = screen.getByRole("button", { name: "Start my plan" });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.click(start);
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.order = [];
  h.complete.mockImplementation(async () => {
    h.order.push("plan");
    return { data: {} };
  });
  h.redeem.mockImplementation(async () => {
    h.order.push("invite");
    return { data: { inviterName: "Maya Patel", alreadyJoined: false } };
  });
  h.refresh.mockResolvedValue(undefined);
  saveOnboardingDraft("invite-setup", draft);
});
afterEach(cleanup);

describe("setup's invite field", () => {
  it.each(["", "MAYA"])(
    "forgets a linked code when the person finishes with replacement %s",
    async (replacement) => {
      savePendingInvite("K7P49M2H");
      open();
      fireEvent.change(codeField(), { target: { value: replacement } });
      await goToToday();
      await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(readPendingInvite()).toBeNull());
      expect(h.redeem).not.toHaveBeenCalled();
    }
  );
  it("opens filled in with a code a link left, and uses it once the plan is made", async () => {
    savePendingInvite("K7P49M2H");
    open();
    expect(codeField()).toHaveValue("K7P4-9M2H");
    expect(
      screen.getByText("They’ll follow you once your plan is made.")
    ).toBeInTheDocument();

    await goToToday();
    await waitFor(() => expect(h.redeem).toHaveBeenCalledTimes(1));
    expect(h.redeem).toHaveBeenCalledWith({ code: "K7P49M2H" });
    expect(h.order).toEqual(["plan", "invite"]);
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "You and Maya Patel now follow each other"
      )
    );
    expect(readPendingInvite()).toBeNull();
  });

  it("is closed and sends nothing when there is no code", async () => {
    open();
    expect(
      screen.getByText("Invited by a friend?").closest("details")
    ).not.toHaveAttribute("open");
    await goToToday();
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    // Anchor: the plan was made, so a use of the code would have followed.
    await waitFor(() => expect(h.order).toEqual(["plan"]));
    expect(h.redeem).not.toHaveBeenCalled();
  });

  it("uses a code typed in setup", async () => {
    open();
    fireEvent.change(codeField(), { target: { value: "a2b3 c4d5" } });
    await goToToday();
    await waitFor(() =>
      expect(h.redeem).toHaveBeenCalledWith({ code: "A2B3C4D5" })
    );
  });

  it("says a typed code cannot be one, and sends nothing", async () => {
    open();
    fireEvent.change(codeField(), { target: { value: "MAYA" } });
    fireEvent.blur(codeField());
    expect(screen.getByText(NOT_A_CODE)).toBeInTheDocument();
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    await goToToday();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "That invite code didn’t look right. You can enter it again in Social, under Find people."
      )
    );
    expect(h.redeem).not.toHaveBeenCalled();
  });
});

it("opens and updates the invite field when a link arrives during setup", async () => {
  open();
  expect(codeField().closest("details")).not.toHaveAttribute("open");
  act(() => {
    savePendingInvite("K7P49M2H");
  });
  expect(codeField()).toHaveValue("K7P4-9M2H");
  expect(codeField().closest("details")).toHaveAttribute("open");
  act(() => {
    savePendingInvite("A2B3C4D5");
  });
  expect(codeField()).toHaveValue("A2B3-C4D5");
  await goToToday();
  await waitFor(() =>
    expect(h.redeem).toHaveBeenCalledExactlyOnceWith({ code: "A2B3C4D5" })
  );
});

it("reopens a dismissed field when the same invite is delivered again", () => {
  savePendingInvite("K7P49M2H");
  open();
  const details = codeField().closest("details")!;
  act(() => {
    details.open = false;
    fireEvent(details, new Event("toggle"));
  });
  expect(details).not.toHaveAttribute("open");
  act(() => {
    savePendingInvite("K7P49M2H");
  });
  expect(details).toHaveAttribute("open");
  expect(codeField()).toHaveValue("K7P4-9M2H");
});

it.each(["plan", "refresh"])(
  "keeps a link opened while %s is pending for confirmation instead of redeeming the old code",
  async (phase) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (phase === "plan")
      h.complete.mockImplementationOnce(async () => {
        await held;
        return { data: {} };
      });
    else h.refresh.mockReturnValueOnce(held);
    savePendingInvite("K7P49M2H");
    open();
    await goToToday();
    await waitFor(() =>
      expect(phase === "plan" ? h.complete : h.refresh).toHaveBeenCalledTimes(1)
    );
    expect(codeField()).toBeDisabled();
    act(() => {
      savePendingInvite("A2B3C4D5");
    });
    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "Your latest invite is saved. Open Social, then Find people to use it."
      )
    );
    expect(h.redeem).not.toHaveBeenCalled();
    expect(readPendingInvite()).toBe("A2B3C4D5");
  }
);
