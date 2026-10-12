/**
 * The signed-out screen: a first visit opens on the welcome screen, a
 * device that has had an account opens on Sign in, and each screen shown
 * is the first rung of the sign-up funnel (auth_screen_viewed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({ signedInBefore: false }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    resetPassword: vi.fn(),
    fetchSignInMethods: vi.fn(),
  }),
  hasSignedInOnThisDevice: () => h.signedInBefore,
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));

import Login from "../Login";
import { track } from "@/lib/lifecycleAnalytics";

const show = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
const screens = () =>
  vi
    .mocked(track)
    .mock.calls.filter(([event]) => event === "auth_screen_viewed")
    .map(([, meta]) => (meta as { screen: string }).screen);

beforeEach(() => {
  vi.clearAllMocks();
  h.signedInBefore = false;
});
afterEach(cleanup);

describe("Login — who sees which screen", () => {
  it("a first visit opens on the welcome screen, not on Welcome back", () => {
    show();
    expect(
      screen.getByRole("heading", {
        name: "Your training and food, planned together",
      })
    ).toBeInTheDocument();
    expect(screen.queryByText("Welcome back")).toBeNull();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screens()).toEqual(["welcome"]);
  });

  it("Get started opens the sign-up form", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(
      screen.getByRole("heading", { name: "Create your account" })
    ).toBeInTheDocument();
    expect(screens()).toEqual(["welcome", "sign_up"]);
  });

  it("I have an account opens the sign-in form", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "I have an account" }));
    expect(
      screen.getByRole("heading", { name: "Welcome back" })
    ).toBeInTheDocument();
    expect(screens()).toEqual(["welcome", "sign_in"]);
  });

  it("a device that has had an account opens straight on Sign in", () => {
    h.signedInBefore = true;
    show();
    expect(
      screen.getByRole("heading", { name: "Welcome back" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get started" })).toBeNull();
    expect(screens()).toEqual(["sign_in"]);
  });
});

/* App Review 1.2: whoever creates an account agrees to the Terms. Every
   button on the two forms can create one (the email form on Sign up;
   Apple and Google on either screen, the first time they are used). */
describe("Login — agreeing to the Terms", () => {
  const AGREEMENT =
    /^By continuing, you agree to the Terms and Privacy Policy\.$/;

  function expectAgreementUnderEveryButton(emailButton: string) {
    const line = screen.getByText(
      (_, el) =>
        el?.tagName === "P" && AGREEMENT.test(el.textContent?.trim() ?? "")
    );
    expect(
      screen.getByRole("link", { name: "Terms" }).getAttribute("href")
    ).toBe("/terms");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")
    ).toBe("/privacy");
    // Below the email form's submit, Apple and Google: under all of them.
    const submit = document.querySelector('button[type="submit"]');
    expect(submit).toHaveTextContent(emailButton);
    for (const button of [
      submit!,
      screen.getByRole("button", { name: "Continue with Apple" }),
      screen.getByRole("button", { name: "Continue with Google" }),
    ]) {
      expect(
        button.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  }

  it("is on the sign-up form", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expectAgreementUnderEveryButton("Create account");
  });

  it("is on the sign-in form, where Apple and Google can create an account too", () => {
    h.signedInBefore = true;
    show();
    expectAgreementUnderEveryButton("Sign In");
  });

  it("is not on the welcome screen, where no account can be made", () => {
    show();
    expect(
      screen.getByRole("button", { name: "Get started" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/By continuing, you agree/)).toBeNull();
    // The welcome screen keeps its own links to both documents.
    expect(
      screen.getByRole("link", { name: "Terms of Service" })
    ).toBeInTheDocument();
  });
});
