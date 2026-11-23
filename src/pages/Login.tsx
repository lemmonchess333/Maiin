import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  readSessionJson,
  removeSessionKey,
  writeSessionJson,
} from "@/lib/sessionStore";
import { readString, remove } from "@/lib/localStore";
import { cancelSetupSave } from "@/lib/setupSave";
import { pendingEmailChange } from "@/lib/emailChangeNote";
import { hasSignedInOnThisDevice } from "@/lib/auth";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import InviteNote from "@/components/onboarding/InviteNote";
import AuthLockup from "@/components/auth/AuthLockup";
import WelcomePhotos from "@/components/auth/WelcomePhotos";
import SignInFigure from "@/components/auth/SignInFigure";
import AccountForm from "@/components/auth/AccountForm";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { trackWelcomeViewed } from "@/lib/firstRunEvents";

/** Signed out, the app opens on the welcome screen, whoever used the phone
 *  before, as Strava's and Nike's do (DS9 STATUS): "Sign in" under Get
 *  started is the way back in. A screen with a message to give opens where
 *  the message belongs, on sign-in: an account just deleted, an address
 *  just changed. Get started opens setup, which makes the account at its
 *  end, on Save your plan (A6). */
type View = "welcome" | "signIn";

/** Where Get started goes: setup, before there is an account (A6). */
export const SETUP_PATH = "/setup";

/* The form, kept while the person reads the Terms or the Privacy Policy:
   those are pages of their own, so opening one leaves this screen, and
   Back would otherwise bring an empty form. The screen and the email come
   back once; a password is never written down, so it is typed again. */
const LOGIN_FORM_KEY = "tropos.login.form";

function takeLoginForm(): { view: View; email: string } | null {
  const form = readSessionJson<{ view?: unknown; email?: unknown }>(
    LOGIN_FORM_KEY
  );
  removeSessionKey(LOGIN_FORM_KEY);
  if (!form) return null;
  const view =
    form.view === "welcome" || form.view === "signIn" ? form.view : null;
  if (!view) return null;
  return { view, email: typeof form.email === "string" ? form.email : "" };
}

export default function Login() {
  const navigate = useNavigate();
  /* An email change, once confirmed, signs this phone out; say so, and
     offer the new address (emailChangeNote.ts). */
  const [changedEmail] = useState(() => pendingEmailChange());
  const [returning] = useState(takeLoginForm);
  /* Post-deletion confirmation (deletion QA 2026-07-27): the success toast
     fires in the same breath as signOut and is easy to miss during the
     auth-state transition — the observed failure mode was the user signing
     back INTO the deleted account to check, and reading "Invalid email or
     password" as their de-facto confirmation. Read-once flag set by
     AccountSection just before signOut; cleared immediately so it shows
     exactly one time. */
  const [accountDeleted] = useState<boolean>(() => {
    if (readString("tropos.account_deleted") !== "1") return false;
    remove("tropos.account_deleted");
    return true;
  });
  const [view, setView] = useState<View>(
    () =>
      returning?.view ?? (changedEmail || accountDeleted ? "signIn" : "welcome")
  );
  // Whether this device has had an account, read once: the welcome opens
  // for both, and the funnel's first rung tells them apart.
  const [returningDevice] = useState(hasSignedInOnThisDevice);
  // The first rungs of the funnel: who sees the welcome screen, and who
  // goes on to sign in (lifecycleAnalytics' header has the order).
  useEffect(() => {
    trackLifecycle("auth_screen_viewed", {
      screen: view === "signIn" ? "sign_in" : "welcome",
      returningDevice,
    });
    if (view === "welcome") trackWelcomeViewed(returningDevice);
  }, [view, returningDevice]);
  // Opening a legal page keeps the form for the way back.
  const keepForm = (email = "") => {
    writeSessionJson(LOGIN_FORM_KEY, { view, email });
  };
  const startSetup = () => navigate(SETUP_PATH);

  if (view === "welcome") {
    return (
      // The welcome is drawn on its photographs, so its words are the
      // stage's (light on a dark ground) in either theme, as every welcome
      // built on a photograph is (Strava, Nike, Tonal).
      <div className="ds-auth-shell welcome-shell">
        {/* The screen's picture (owner, 2026-11-12): athletes, filling the
            screen and fading from one to the next. */}
        <WelcomePhotos />
        <div className="ds-auth-page welcome-page">
          <AuthLockup className="text-stage-foreground" />
          <div className="welcome-copy">
            <div>
              <h1 className="text-h2 font-extrabold leading-[1.12] tracking-tight text-stage-foreground text-balance">
                Your training and food, planned together
              </h1>
              <p className="mt-1.5 text-sm text-stage-foreground/80">
                Answer a few questions and get a week of training and a daily
                calorie target that fit you.
              </p>
            </div>
            {/* Soc15: arrived from a friend's invite link. */}
            <InviteNote />
            {/* The brand's filled button, as Create account, Sign In and
                setup's Continue are: one colour for the way in, from here
                to the plan. Under it, one quiet way back in for an
                account, as Strava's and Nike's welcomes have. */}
            <div className="flex flex-col items-center gap-1">
              <Button fullWidth size="md" onClick={startSetup}>
                Get started
              </Button>
              <Button
                size="md"
                variant="ghost"
                className="text-stage-foreground hover:bg-white/10"
                onClick={() => setView("signIn")}
              >
                Sign in
              </Button>
            </div>
            <div className="flex items-center justify-center gap-3 text-xs text-stage-muted">
              <Link
                to="/privacy"
                onClick={() => keepForm()}
                className="inline-flex items-center min-h-[44px] px-1 hover:text-stage-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <span aria-hidden="true">·</span>
              <Link
                to="/terms"
                onClick={() => keepForm()}
                className="inline-flex items-center min-h-[44px] px-1 hover:text-stage-foreground transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-auth-shell">
      <div className="ds-auth-page ds-page-stack">
        {/* The lockup, then the heading at the foot of the lifter. */}
        <div className="signin-head">
          <div className="signin-row">
            <AuthLockup />
            <SignInFigure />
            <h1 className="signin-heading text-h1 font-extrabold leading-[1.1] tracking-tight text-foreground text-balance">
              Welcome back
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Track food, lifting, running, and progress in one place.
          </p>
        </div>

        <AccountForm
          mode="signIn"
          initialEmail={returning?.email || changedEmail || ""}
          standingNotice={
            changedEmail
              ? `Changing your email signs you out once the change is confirmed. Sign in with ${changedEmail}.`
              : undefined
          }
          banner={
            accountDeleted && (
              <div
                role="status"
                className="flex items-start gap-2 p-3 rounded-xl bg-muted text-foreground text-sm font-medium chip-edge"
              >
                <CheckCircle2
                  className="size-4 mt-0.5 shrink-0 text-success-strong"
                  aria-hidden="true"
                />
                Your account and all data have been deleted.
              </div>
            )
          }
          onLegalLink={keepForm}
          // A sign-in from here is not Save your plan's, so a mark left by
          // one that never came back must not hand its answers to this
          // account.
          onStart={cancelSetupSave}
        />

        {/* No account yet: setup comes first, and makes one at its end
            (A6). */}
        <p className="text-center text-sm text-muted-foreground">
          Don’t have an account?{" "}
          <button
            type="button"
            onClick={startSetup}
            className="inline-flex items-center align-middle min-h-[44px] px-2 -my-3 font-semibold link-inline hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
          >
            Get started
          </button>
        </p>
      </div>
    </div>
  );
}
