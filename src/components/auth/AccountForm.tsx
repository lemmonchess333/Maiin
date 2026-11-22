import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  friendlyAuthError,
  providerHint,
  duplicateEmailHint,
  isSignInCancelled,
} from "@/lib/authErrors";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import BootSteps from "@/components/BootSteps";
import { isNativePlatform } from "@/lib/platform";
import { readLastSignInMethod, type SignInMethod } from "@/lib/signInMethod";

/** The mark on the way in this phone last used (Polish2 call 3): with Hide
 *  My Email, signing in another way makes a second, empty account. */
function LastUsed() {
  return (
    <span className="ml-2 shrink-0 whitespace-nowrap rounded-full border border-current/30 px-2 py-0.5 text-xs font-semibold">
      Last used
    </span>
  );
}

// One LoadingAction value, so exactly one button shows the spinner and the
// others stay disabled (the Button primitive's loading state only fired on
// the email submit before this).
type LoadingAction = "email" | "google" | "apple" | "reset" | null;

/* A link inside the agreement sentence. Underlined, so it reads as a link
   without relying on colour; 44px tall for the thumb, with the negative
   margin keeping the sentence's own line height (the Sign up toggle below
   uses the same trick). */
const AGREEMENT_LINK =
  "inline-flex items-center align-middle min-h-[44px] -my-3 font-medium text-foreground underline underline-offset-2 hover:text-lifting-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm";

export type AccountFormMode = "signIn" | "signUp";

interface Props {
  /** Sign in to an account, or make one (Save your plan, A6). */
  mode: AccountFormMode;
  initialEmail?: string;
  /** Shown above every way in, before any error (an account just deleted). */
  banner?: ReactNode;
  /** A calm notice that stands until anything else has something to say
   *  (an email change that signed the phone out). */
  standingNotice?: string;
  /** A legal page is opening, with the email as typed (Login keeps it for
   *  the way back). */
  onLegalLink?: (email: string) => void;
  /** A way in is opening. */
  onStart?: () => void;
  /** It closed or failed, after `onStart`; the person is still signed out. */
  onStopped?: () => void;
}

/**
 * The ways in: Apple, then Google, then the email form (A1a), the one-tap
 * ways on screen before the keyboard can cover them, and the agreement to
 * the Terms under all of them. Sign-in (`Login`) and Save your plan (A6)
 * draw the same form, so a way in fixed on one is fixed on the other.
 */
export default function AccountForm({
  mode,
  initialEmail = "",
  banner,
  standingNotice,
  onLegalLink,
  onStart,
  onStopped,
}: Props) {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    signInWithApple,
    resetPassword,
    fetchSignInMethods,
  } = useAuth();
  const isSignUp = mode === "signUp";
  const [lastMethod] = useState<SignInMethod | null>(() =>
    readLastSignInMethod()
  );
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  // Neutral confirmation for the password-reset flow (shown in a calm banner,
  // not the destructive error one).
  const [notice, setNotice] = useState("");
  const shownNotice = notice || (!isSignUp && standingNotice) || "";
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const isLoading = loadingAction !== null;
  const legalLink = () => onLegalLink?.(email);
  // Switching between making an account and signing in starts the form's
  // messages afresh; the email stays.
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setError("");
    setNotice("");
  }

  const handleForgotPassword = async () => {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email above, then tap Forgot password");
      return;
    }
    setLoadingAction("reset");
    // Sends a set-password link regardless of how the account was created.
    // The server callable (sendPasswordResetLinkCallable) mints the link via
    // the Admin SDK, which works for OAuth-only accounts too — completing it
    // adds a password provider. This matches Spotify / MyFitnessPal: forgot-
    // password always emails a link.
    try {
      await resetPassword(email.trim());
    } catch (err: unknown) {
      // Swallow user-not-found so the flow can't enumerate registered
      // emails; any OTHER failure (network, bad email format) is worth
      // surfacing. The server's own "Too many" line is shown as written:
      // it says whether to wait minutes or until tomorrow, and a generic
      // "Try again" would send someone at the day's limit round in circles.
      const message = err instanceof Error ? err.message : "";
      if (
        !message.includes("user-not-found") &&
        !message.includes("invalid-credential")
      ) {
        setError(
          message.startsWith("Too many")
            ? message
            : friendlyAuthError(message, "Couldn’t send the link. Try again.")
        );
        setLoadingAction(null);
        return;
      }
    }
    // Same neutral message whether or not the account exists.
    setNotice(
      `If an account exists for ${email.trim()}, a reset link is on its way.`
    );
    setLoadingAction(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoadingAction("email");
    onStart?.();
    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err: unknown) {
      onStopped?.();
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      // On a failed password sign-in, a Google/Apple-only account is the most
      // confusing case: "Wrong email or password" implies a wrong password
      // when really there's NO password. If the email is OAuth-only, point to
      // the right button instead. (Skipped on sign-up — nothing to look up.)
      if (!isSignUp && /invalid-credential|wrong-password/.test(message)) {
        const hint = providerHint(await fetchSignInMethods(email));
        if (hint) {
          setError(hint);
          return;
        }
      }
      setError(
        friendlyAuthError(
          message,
          isSignUp
            ? "Couldn’t create your account. Try again."
            : "Couldn’t sign in. Try again."
        )
      );
    } finally {
      setLoadingAction(null);
    }
  };

  /* Shared error surface for the OAuth buttons. The high-value case is
     account-exists-with-different-credential — the duplicate-account trap
     (a friend with an Apple account tapped Google, hit a dead generic
     error, and created a second account). Firebase attaches the colliding
     email to the error; look up its real sign-in methods and steer to the
     right button by name. */
  const surfaceOAuthError = async (err: unknown) => {
    const message = err instanceof Error ? err.message : "Something went wrong";
    if (isSignInCancelled(err)) return;
    if (message.includes("account-exists-with-different-credential")) {
      const collidingEmail = (err as { customData?: { email?: string } })
        ?.customData?.email;
      if (collidingEmail) {
        const hint = duplicateEmailHint(
          await fetchSignInMethods(collidingEmail)
        );
        if (hint) {
          setError(hint);
          return;
        }
      }
    }
    setError(friendlyAuthError(message, "Couldn’t sign in. Try again."));
  };

  const handleOAuth = async (
    action: "google" | "apple",
    run: () => Promise<void>
  ) => {
    setError("");
    setNotice("");
    setLoadingAction(action);
    onStart?.();
    try {
      await run();
    } catch (err: unknown) {
      onStopped?.();
      await surfaceOAuthError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApple = () => void handleOAuth("apple", signInWithApple);
  const handleGoogle = () => void handleOAuth("google", signInWithGoogle);

  return (
    <>
      {/* Notices and errors sit above every way in, so one from the
          Apple or Google sheet is read where the eye already is. */}
      {banner}
      {error && (
        <div
          id="login-error"
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive-bg border border-destructive/15 text-destructive-strong text-sm font-medium"
        >
          <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {/* On the iPhone, what each sign-in step did and how long it took,
          for a failure nobody can inspect there (bootTrace.ts). */}
      {error && isNativePlatform() && (
        <details className="text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Details
          </summary>
          <div className="mt-2">
            <BootSteps />
          </div>
        </details>
      )}

      {shownNotice && (
        <div
          role="status"
          className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/8 border border-primary/15 text-foreground text-sm font-medium"
        >
          <Mail
            className="size-4 shrink-0 mt-0.5 text-primary"
            aria-hidden="true"
          />
          <span>{shownNotice}</span>
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={handleApple}
          loading={loadingAction === "apple"}
          disabled={isLoading && loadingAction !== "apple"}
          fullWidth
          // Apple brand styling: black-on-white in light mode,
          // white-on-black in dark mode. The foreground/background
          // token swap encodes that without a media query.
          className="bg-foreground text-background hover:bg-foreground/90"
          leftIcon={
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-1.55 4.3-3.74 4.25z" />
            </svg>
          }
        >
          Continue with Apple
          {lastMethod === "apple" && <LastUsed />}
        </Button>

        <Button
          onClick={handleGoogle}
          loading={loadingAction === "google"}
          disabled={isLoading && loadingAction !== "google"}
          fullWidth
          variant="outline"
        >
          Continue with Google
          {lastMethod === "google" && <LastUsed />}
        </Button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Form. When there's an error, the form is aria-describedby
          the error banner so screen-reader users hear the error
          associated with the form rather than as a free-floating
          alert. */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        aria-describedby={error ? "login-error" : undefined}
      >
        <div className="space-y-3">
          <div className="relative">
            <label htmlFor="login-email" className="sr-only">
              Email address
            </label>
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="login-email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="ds-input pl-10 pr-4 py-3"
            />
          </div>

          <div className="relative">
            <label htmlFor="login-password" className="sr-only">
              Password
            </label>
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="ds-input pl-10 pr-12 py-3"
            />
            {/* size="md" is the iOS HIG 44pt floor — the password
                toggle is a standalone control inside the input, so
                the IconButton docs' "sm acceptable only when the
                parent row provides extra tap area" caveat doesn't
                apply here. The input already has pr-12, so 44px
                fits without overlapping typed text. */}
            <IconButton
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              size="md"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
              icon={showPassword ? <EyeOff /> : <Eye />}
            />
          </div>

          {/* Forgot password — sign-in only. Sends a reset link to the
              address typed above; the flow shows a neutral "if an account
              exists…" message either way so it can't be used to
              enumerate emails. */}
          {!isSignUp && (
            <div className="text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="inline-flex items-center min-h-[44px] px-1 text-sm font-medium text-lifting-strong hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
              >
                {loadingAction === "reset"
                  ? "Sending reset link…"
                  : "Forgot password?"}
              </button>
            </div>
          )}
        </div>

        <Button
          type="submit"
          loading={loadingAction === "email"}
          disabled={isLoading && loadingAction !== "email"}
          fullWidth
          size="md"
        >
          {isSignUp ? "Create account" : "Sign in"}
          {!isSignUp && lastMethod === "password" && <LastUsed />}
        </Button>
      </form>

      {/* Agreeing to the Terms. App Review 1.2 wants the people who post in
          an app to have agreed to terms that rule out objectionable
          content and abusive users. Every button here can create an
          account: the email form when making one, and Apple and Google the
          first time they are used. So the line sits under all of them. The
          links are the signed-out /terms and /privacy routes. */}
      <p className="text-center text-xs text-muted-foreground">
        By continuing, you agree to the{" "}
        <Link to="/terms" onClick={legalLink} className={AGREEMENT_LINK}>
          Terms
        </Link>{" "}
        and{" "}
        <Link to="/privacy" onClick={legalLink} className={AGREEMENT_LINK}>
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}
