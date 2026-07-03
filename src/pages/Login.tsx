import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { friendlyAuthError, providerHint } from "@/lib/authErrors";
import { AlertCircle, Dumbbell, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

// Pre-recovery this page tracked a single `loading: boolean` shared
// across the email submit, the Apple button, and the Google button.
// The Button primitive's loading state only fired on the email
// submit; Apple/Google merely went disabled with no spinner. That's
// a polish gap on a conversion-critical surface — we use a single
// LoadingAction value here so exactly one button shows the spinner
// and the others stay disabled.
type LoadingAction = "email" | "google" | "apple" | "reset" | null;

export default function Login() {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    signInWithApple,
    resetPassword,
    fetchSignInMethods,
  } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  // Neutral confirmation for the password-reset flow (shown in a calm banner,
  // not the destructive error one).
  const [notice, setNotice] = useState("");
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  const isLoading = loadingAction !== null;

  const handleForgotPassword = async () => {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email above, then tap Forgot password");
      return;
    }
    setLoadingAction("reset");
    // A Google/Apple-only account has no password to reset — sending one is a
    // dead end (Firebase quietly sends nothing). Steer to the right button
    // instead. Degrades to a normal reset when the provider is unknown
    // (Email-Enumeration-Protection returns []).
    const hint = providerHint(await fetchSignInMethods(email.trim()));
    if (hint) {
      setError(hint);
      setLoadingAction(null);
      return;
    }
    try {
      await resetPassword(email.trim());
    } catch (err: unknown) {
      // Swallow user-not-found so the flow can't enumerate registered
      // emails; any OTHER failure (network, bad email format) is worth
      // surfacing.
      const message = err instanceof Error ? err.message : "";
      if (
        !message.includes("user-not-found") &&
        !message.includes("invalid-credential")
      ) {
        setError(friendlyAuthError(message));
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
    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      // On a failed password sign-in, a Google/Apple-only account is the most
      // confusing case: "Invalid email or password" implies a wrong password
      // when really there's NO password. If the email is OAuth-only, point to
      // the right button instead. (Skipped on sign-up — nothing to look up.)
      if (!isSignUp && /invalid-credential|wrong-password/.test(message)) {
        const hint = providerHint(await fetchSignInMethods(email));
        if (hint) {
          setError(hint);
          return;
        }
      }
      setError(friendlyAuthError(message));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setNotice("");
    setLoadingAction("google");
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      /* popup-closed = user cancelled. Silent, no error toast. */
      if (!message.includes("popup-closed")) {
        setError(friendlyAuthError(message));
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApple = async () => {
    setError("");
    setNotice("");
    setLoadingAction("apple");
    try {
      await signInWithApple();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      if (!message.includes("popup-closed")) {
        setError(friendlyAuthError(message));
      }
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="ds-auth-shell">
      <div className="ds-auth-card ds-page-stack">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="ds-auth-logo mx-auto">
            <Dumbbell className="size-8" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">
              Tropos
            </p>
            <h1 className="text-h2 font-extrabold text-foreground mt-1">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track food, lifting, running, and progress in one place.
            </p>
          </div>
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
          {error && (
            <div
              id="login-error"
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive-bg border border-destructive/15 text-destructive text-sm font-medium"
            >
              <AlertCircle
                className="size-4 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/8 border border-primary/15 text-foreground text-sm font-medium"
            >
              <Mail
                className="size-4 shrink-0 mt-0.5 text-primary"
                aria-hidden="true"
              />
              <span>{notice}</span>
            </div>
          )}

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

            {/* Forgot password — sign-in mode only. Sends a Firebase reset
                email to the address typed above; the auth flow shows a
                neutral "if an account exists…" message either way so it
                can't be used to enumerate emails. */}
            {!isSignUp && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                  className="inline-flex items-center min-h-[44px] px-1 text-sm font-medium text-primary hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
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
            {isSignUp ? "Create Account" : "Sign In"}
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Social Sign In */}
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
          </Button>

          <Button
            onClick={handleGoogle}
            loading={loadingAction === "google"}
            disabled={isLoading && loadingAction !== "google"}
            fullWidth
            variant="outline"
          >
            Continue with Google
          </Button>
        </div>

        {/* Toggle */}
        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            aria-pressed={isSignUp}
            className="inline-flex items-center align-middle min-h-[44px] px-2 -my-3 text-primary font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>

        {/* Legal links */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <Link
            to="/privacy"
            className="inline-flex items-center min-h-[44px] px-1 hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to="/terms"
            className="inline-flex items-center min-h-[44px] px-1 hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
