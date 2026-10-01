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
