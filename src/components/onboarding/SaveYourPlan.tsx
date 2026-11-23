import { useEffect, useState } from "react";
import AccountForm from "@/components/auth/AccountForm";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { hasSignedInOnThisDevice } from "@/lib/auth";
import { SAVE_PLAN_COPY } from "@/lib/setupSave";

interface Props {
  /** A way in is opening: mark the save, so the account takes the answers. */
  onStart: () => void;
  /** It closed or failed: nothing is waiting for an account. */
  onStopped: () => void;
}

/**
 * The end of setup before there is an account (A6 call 1): the answers
 * wait on the phone, and this makes the account with Apple first, then
 * Google, then email. Someone with an account signs in here instead; one
 * that has a plan keeps it (`keepExistingPlan`), and one that has none
 * takes these answers.
 *
 * The heading and the review's Back are setup's (`Onboarding`); this is
 * the screen's body.
 */
export default function SaveYourPlan({ onStart, onStopped }: Props) {
  const [mode, setMode] = useState<"signUp" | "signIn">("signUp");
  useEffect(() => {
    trackLifecycle("auth_screen_viewed", {
      screen: "save_plan",
      returningDevice: hasSignedInOnThisDevice(),
    });
  }, []);
  return (
    <div className="space-y-5">
      <AccountForm mode={mode} onStart={onStart} onStopped={onStopped} />
      <p className="text-center text-sm text-muted-foreground">
        {mode === "signUp"
          ? SAVE_PLAN_COPY.haveAccount
          : SAVE_PLAN_COPY.newAccount}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "signUp" ? "signIn" : "signUp")}
          aria-pressed={mode === "signIn"}
          className="inline-flex items-center align-middle min-h-[44px] px-2 -my-3 text-lifting-strong font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
        >
          {mode === "signUp" ? SAVE_PLAN_COPY.signIn : SAVE_PLAN_COPY.create}
        </button>
      </p>
    </div>
  );
}
