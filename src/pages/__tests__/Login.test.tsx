/**
 * The signed-out screen: a first visit opens on the welcome screen, a
 * device that has had an account opens on Sign in, and each screen shown
 * is the first rung of the sign-up funnel (auth_screen_viewed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

const h = vi.hoisted(() => ({
  signedInBefore: false,
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: h.signInWithGoogle,
    signInWithApple: h.signInWithApple,
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
  localStorage.clear();
});
afterEach(cleanup);

describe("Login — after an email change", () => {
  it("says why it signed out, and offers the new address", () => {
    // Set by requestEmailChange; confirming the change ends the session.
    localStorage.setItem(
      "tropos-email-change-pending",
      JSON.stringify({ email: "new@example.com", at: Date.now() })
    );
    show();
    // Before: the welcome screen, then "Welcome back" and an empty field
    // that refused the old address.
    expect(
      screen.getByText(
        "Changing your email signs you out once the change is confirmed. Sign in with new@example.com."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue("new@example.com");
  });
});

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

/* A1a: Apple first, then Google, then the email form under an "or", so
   the one-tap ways in are on screen before the keyboard comes up. */
describe("Login — Apple and Google come before the email form (A1)", () => {
  function expectOrder() {
    const order = [
      screen.getByRole("button", { name: /Continue with Apple/ }),
      screen.getByRole("button", { name: /Continue with Google/ }),
      screen.getByText("or"),
      screen.getByLabelText("Email address"),
      document.querySelector('button[type="submit"]')!,
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  }

  it("on Sign up", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expectOrder();
  });

  it("on Sign in", () => {
    h.signedInBefore = true;
    show();
    expectOrder();
  });
});

describe("Login — closing the Google or Apple sheet", () => {
  /* Only the web popup's code was silenced, so a cancel on the phone showed
     Google's or Apple's own sentence as an error. */
  const tap = async (name: string) => {
    h.signedInBefore = true;
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
  };

  it.each([
    [
      "Continue with Google",
      "web popup",
      Object.assign(new Error("Firebase: Error (auth/popup-closed-by-user)."), {
        code: "auth/popup-closed-by-user",
      }),
    ],
    [
      "Continue with Google",
      "native sheet",
      new Error("The user canceled the sign-in flow."),
    ],
    [
      "Continue with Apple",
      "Apple sheet",
      new Error(
        "The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)"
      ),
    ],
  ] as const)(
    "%s, cancelled in the %s, says nothing",
    async (name, _where, error) => {
      const signIn = name.includes("Google")
        ? h.signInWithGoogle
        : h.signInWithApple;
      signIn.mockRejectedValueOnce(error);
      await tap(name);
      expect(screen.queryByRole("alert")).toBeNull();
    }
  );

  it("a sign-in that fails for a reason still says so", async () => {
    h.signInWithGoogle.mockRejectedValueOnce(
      new Error("Firebase: Error (auth/network-request-failed).")
    );
    await tap("Continue with Google");
    expect(screen.getByRole("alert")).toHaveTextContent(/Network issue/);
  });
});

describe("Login — the way in this phone last used (Polish2 call 3)", () => {
  it("marks it, and only it", () => {
    h.signedInBefore = true;
    localStorage.setItem("tropos.last_sign_in_method", "apple");
    show();
    expect(
      screen.getByRole("button", { name: /Continue with Apple/ })
    ).toHaveTextContent("Last used");
    expect(
      screen.getByRole("button", { name: /Continue with Google/ })
    ).not.toHaveTextContent("Last used");
    expect(
      screen.getByRole("button", { name: /^Sign In/ })
    ).not.toHaveTextContent("Last used");
  });

  it("marks the email form for a password sign-in", () => {
    h.signedInBefore = true;
    localStorage.setItem("tropos.last_sign_in_method", "password");
    show();
    expect(screen.getByRole("button", { name: /^Sign In/ })).toHaveTextContent(
      "Last used"
    );
  });

  it("marks nothing on a phone that has none", () => {
    h.signedInBefore = true;
    show();
    expect(screen.queryByText("Last used")).toBeNull();
  });
});

/* The Terms and the Privacy Policy are pages of their own, so reading one
   leaves this screen; Back brings the form back as it was, except the
   password, which is never written down. */
describe("Login — reading the Terms and coming back", () => {
  beforeEach(() => sessionStorage.clear());

  function withLegalPages() {
    return render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<Login />} />
          <Route path="/terms" element={<BackLink />} />
          <Route path="/privacy" element={<BackLink />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("keeps the screen and the email, not the password", () => {
    withLegalPages();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "sam@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret-pass" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Terms" }));
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("secret-pass");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Create your account" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue("sam@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("brings the form back once, not on every later visit", () => {
    withLegalPages();
    fireEvent.click(screen.getByRole("button", { name: "I have an account" }));
    fireEvent.click(screen.getByRole("link", { name: "Privacy Policy" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Welcome back" })
    ).toBeInTheDocument();
    cleanup();
    show();
    expect(
      screen.getByRole("button", { name: "Get started" })
    ).toBeInTheDocument();
  });
});

function BackLink() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}
