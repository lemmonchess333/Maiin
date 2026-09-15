import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import {
  requestEmailChange,
  resendVerificationErrorMessage,
  sendVerificationEmail,
  sendInitialVerificationEmail,
} from "@/lib/accountSecurity";
import { friendlyAuthError } from "@/lib/authErrors";

export default function VerifySignupEmail({
  user,
  recheck,
}: {
  user: User;
  recheck: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Sending your verification email…");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const flight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void sendInitialVerificationEmail(user.uid)
      .then(() => {
        if (mounted.current) {
          setMessage(
            "Verification email sent. Check your inbox and spam folder."
          );
          setSentAt(Date.now());
          setClock(Date.now());
        }
      })
      .catch((err) => {
        if (mounted.current) {
          setMessage("");
          setError(resendVerificationErrorMessage(err));
        }
      });
    return () => {
      mounted.current = false;
    };
  }, [user.uid]);
  useEffect(() => {
    if (!sentAt) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= sentAt + 60000) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sentAt]);
  const remaining = Math.max(0, Math.ceil((sentAt + 60000 - clock) / 1000));

  async function run(action: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      if (mounted.current) {
        const code = String((err as { code?: string })?.code || "");
        const friendly = friendlyAuthError(code);
        setError(
          friendly && friendly !== code
            ? friendly
            : "Couldn't check your account. Try again, or open Account to sign in again."
        );
      }
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <main
      className="min-h-dvh bg-background text-foreground flex flex-col justify-center px-6 py-8 max-w-md mx-auto"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="space-y-5">
        <p className="text-sm font-medium text-muted-foreground">
          Finish creating your account
        </p>
        <h1 className="text-2xl font-bold">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          Open the link sent to{" "}
          <strong className="text-foreground break-all">
            {pendingEmail || user.email}
          </strong>
          , then return to Tropos. This confirms your address once, before you
          start.
        </p>
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-strong">
            {error}
          </p>
        )}
        <Button
          fullWidth
          loading={busy}
          onClick={() =>
            void run(async () => {
              if (!(await recheck()) && mounted.current)
                setMessage(
                  "Your email isn't verified yet. Open the link in the email, then check again."
                );
            })
          }
        >
          I've verified my email
        </Button>
        {!pendingEmail && (
          <Button
            variant="outline"
            fullWidth
            disabled={busy || remaining > 0}
            onClick={() =>
              void run(async () => {
                try {
                  await sendVerificationEmail();
                  if (mounted.current) {
                    setSentAt(Date.now());
                    setClock(Date.now());
                    setMessage("A new verification email has been sent.");
                  }
                } catch (err) {
                  if (mounted.current)
                    setError(resendVerificationErrorMessage(err));
                }
              })
            }
          >
            {remaining > 0 ? `Resend in ${remaining}s` : "Resend email"}
          </Button>
        )}
        <Button
          variant="ghost"
          fullWidth
          disabled={busy}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Cancel email change" : "Use a different email"}
        </Button>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await requestEmailChange(user, password, email);
                if (!mounted.current) return;
                setPendingEmail(email.trim());
                setPassword("");
                setEditing(false);
                setMessage(
                  "Open the confirmation link at your new address. If you're asked to sign in again, use the new address."
                );
              });
            }}
          >
            <label className="block text-sm font-medium">
              New email
              <input
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base"
                aria-label="New email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="block text-sm font-medium">
              Current password
              <input
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base"
                aria-label="Current password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </label>
            <Button variant="outline" fullWidth type="submit" loading={busy}>
              Send confirmation to new email
            </Button>
          </form>
        )}
        <div className="flex justify-center gap-4 text-sm">
          <Link
            className="min-h-11 inline-flex items-center underline"
            to="/settings/account"
          >
            Account
          </Link>
          <Link
            className="min-h-11 inline-flex items-center underline"
            to="/support"
          >
            Get help
          </Link>
          <Link
            className="min-h-11 inline-flex items-center underline"
            to="/privacy"
          >
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}
