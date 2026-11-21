import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import BrandMark from "@/components/ui/BrandMark";
import HealthConsentDeclineActions from "@/components/healthConsent/HealthConsentDeclineActions";
import HealthConsentPolicyLink from "@/components/healthConsent/HealthConsentPolicyLink";
import {
  DELETE_ACCOUNT_ANCHOR,
  HEALTH_CONSENT_COPY,
  HEALTH_CONSENT_DECLINED_COPY,
  HEALTH_CONSENT_SAVE_FAILED,
  SIGN_OUT_FAILED,
} from "@/lib/healthConsent";
import { agreeToHealthData } from "@/lib/healthConsentWrite";
import { logger } from "@/lib/logger";
import { toast } from "@/lib/toast";

/** What the gate shows: the agreement, the agreement being saved, or what
 *  Not now opened. Docs: docs/state-machines.md. */
export type HealthConsentGateView = "asking" | "saving" | "declined";

/**
 * The agreement to store health details (Priv1 call 1), for an account set
 * up before setup asked for it: one full screen before the app, on the
 * next open, once. Setup asks a new account the same question on its own
 * step (`Onboarding`).
 *
 * I agree writes the agreement (`agreeToHealthData`, which stops waiting
 * on a connection that answers nothing) and reads the account again
 * (`onAgreed`); the app opens once the account carries it, and if the
 * read still shows none the screen says so rather than asking again
 * without a word. Not now
 * says why Tropos cannot work without these details and offers every way
 * on: back to the agreement, deleting the account, or signing out.
 *
 * Nothing about the answer is sent to analytics.
 */
export default function HealthConsentGate({
  uid,
  onAgreed,
  onSignOut,
}: {
  uid: string;
  /** Read the account again once the agreement is written; true once a
   *  read shows it. */
  onAgreed: () => Promise<boolean>;
  onSignOut: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<HealthConsentGateView>("asking");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const live = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const declined = view === "declined";

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Not now and Go back change the whole screen: its heading takes focus,
  // so a screen reader reads the new screen from the top.
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (moved) headingRef.current?.focus({ preventScroll: true });
  }, [declined, moved]);

  const agree = async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setView("saving");
    try {
      await agreeToHealthData(uid);
      // Shown, the app takes this screen's place in the same render.
      if (!(await onAgreed()) && live.current)
        setError(HEALTH_CONSENT_SAVE_FAILED);
    } catch (err) {
      logger.warn("[HealthConsentGate] couldn't save the agreement", err);
      if (live.current) setError(HEALTH_CONSENT_SAVE_FAILED);
    } finally {
      busy.current = false;
      // Once the account carries the agreement the app takes this screen's
      // place; while it is still here, it asks again.
      if (live.current) setView("asking");
    }
  };

  const show = (next: HealthConsentGateView) => {
    setMoved(true);
    setError(null);
    setView(next);
  };

  return (
    <main
      className="min-h-dvh bg-background text-foreground flex flex-col px-4 max-w-lg mx-auto"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex-1 space-y-4 pt-4">
        <BrandMark className="h-6" />
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-h1 leading-tight tracking-tight font-extrabold focus:outline-none"
        >
          {declined
            ? HEALTH_CONSENT_DECLINED_COPY.title
            : HEALTH_CONSENT_COPY.title}
        </h1>
        {declined ? (
          <p className="text-base text-muted-foreground">
            {HEALTH_CONSENT_DECLINED_COPY.body}
          </p>
        ) : (
          <>
            <p className="text-base text-muted-foreground">
              {HEALTH_CONSENT_COPY.stored}
            </p>
            <p className="text-base">{HEALTH_CONSENT_COPY.use}</p>
            <p className="text-base">{HEALTH_CONSENT_COPY.withdraw}</p>
            <HealthConsentPolicyLink />
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-strong">
            {error}
          </p>
        )}
      </div>
      <div className="pt-6">
        {declined ? (
          <HealthConsentDeclineActions
            onBack={() => show("asking")}
            onDeleteAccount={() =>
              navigate(`/settings/account#${DELETE_ACCOUNT_ANCHOR}`)
            }
            onSignOut={() =>
              void onSignOut().catch((err: unknown) => {
                logger.warn("[HealthConsentGate] sign-out failed", err);
                toast.error(SIGN_OUT_FAILED);
              })
            }
          />
        ) : (
          <div className="space-y-3">
            <Button
              variant="neutral"
              size="lg"
              fullWidth
              loading={view === "saving"}
              onClick={() => void agree()}
            >
              {HEALTH_CONSENT_COPY.agree}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              fullWidth
              disabled={view === "saving"}
              onClick={() => show("declined")}
            >
              {HEALTH_CONSENT_COPY.decline}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
