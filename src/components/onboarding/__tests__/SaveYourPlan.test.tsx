/**
 * Save your plan (A6 call 1): Apple first, then Google, then the email
 * form, the Terms agreed under every way in, and a way to sign in instead.
 * Pins the names the journeys find it by (`SAVE_PLAN`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    signIn: h.signIn,
    signUp: h.signUp,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    resetPassword: vi.fn(),
    fetchSignInMethods: vi.fn().mockResolvedValue([]),
  }),
  hasSignedInOnThisDevice: () => false,
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));

import SaveYourPlan from "../SaveYourPlan";
import { track } from "@/lib/lifecycleAnalytics";
import { SAVE_PLAN } from "@/test/journeyScreens";

const show = () =>
  render(
    <MemoryRouter>
      <SaveYourPlan onStart={vi.fn()} onStopped={vi.fn()} />
    </MemoryRouter>
  );

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

describe("Save your plan", () => {
  it("puts Apple first, then Google, then the email form", () => {
    show();
    const order = [
      screen.getByRole("button", { name: SAVE_PLAN.apple }),
      screen.getByRole("button", { name: SAVE_PLAN.google }),
      screen.getByLabelText(SAVE_PLAN.email),
      screen.getByLabelText(SAVE_PLAN.password),
      screen.getByRole("button", { name: SAVE_PLAN.create }),
    ];
    for (let i = 1; i < order.length; i++)
      expect(follows(order[i - 1], order[i])).toBe(true);
  });

  it("has the Terms agreed under every way in, each of which can make an account", () => {
    show();
    const line = screen.getByText(
      (_, el) =>
        el?.tagName === "P" &&
        /^By continuing, you agree to the Terms and Privacy Policy\.$/.test(
          el.textContent?.trim() ?? ""
        )
    );
    for (const name of [SAVE_PLAN.apple, SAVE_PLAN.google, SAVE_PLAN.create])
      expect(follows(screen.getByRole("button", { name }), line)).toBe(true);
  });

  it("signs in instead for someone who has an account, with no Forgot password lost", () => {
    show();
    fireEvent.click(
      screen.getByRole("button", { name: SAVE_PLAN.signInInstead })
    );
    expect(
      screen.getByRole("button", { name: "Forgot password?" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_PLAN.create })).toBeNull();
    fireEvent.change(screen.getByLabelText(SAVE_PLAN.email), {
      target: { value: "sam@example.com" },
    });
    fireEvent.change(screen.getByLabelText(SAVE_PLAN.password), {
      target: { value: "secret-pass" },
    });
    fireEvent.submit(screen.getByLabelText(SAVE_PLAN.email).closest("form")!);
    expect(h.signIn).toHaveBeenCalledWith("sam@example.com", "secret-pass");
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it("is counted as its own signed-out screen", () => {
    show();
    expect(track).toHaveBeenCalledWith("auth_screen_viewed", {
      screen: "save_plan",
      returningDevice: false,
    });
  });
});
