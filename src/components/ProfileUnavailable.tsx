import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * What a signed-in account sees when its profile could not be read and
 * this device holds no copy of it (`profileLoad === "failed"`, auth.tsx).
 *
 * It stands where setup would otherwise appear. Setup is for an account
 * with no profile; shown to someone whose profile only failed to load, it
 * reads as a lost account, and finishing it replaces their programme. So
 * this offers the read again, tries by itself when the connection returns,
 * and leaves a way out to another account.
 */
export default function ProfileUnavailable({
  onRetry,
  onSignOut,
}: {
  /** Read the profile again. Rejects while it still cannot be read. */
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [trying, setTrying] = useState(false);
  const [triedAgain, setTriedAgain] = useState(false);
  const busy = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const retry = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setTrying(true);
    try {
      await onRetry();
    } catch {
      // Still unreadable. The screen stays, and says it tried.
      if (live.current) setTriedAgain(true);
    } finally {
      busy.current = false;
      if (live.current) setTrying(false);
    }
  }, [onRetry]);

  useEffect(() => {
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);

  return (
    <main
      className="min-h-dvh bg-background text-foreground flex items-center justify-center px-4"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div role="alert" className="max-w-sm space-y-3 text-center">
        <p className="text-sm font-semibold">Couldn&apos;t load your account</p>
        <p className="text-xs text-muted-foreground">
          {triedAgain
            ? "Still no answer. Your account hasn't changed. Check your connection, then try again."
            : "Your account hasn't changed. Check your connection, then try again."}
        </p>
        <div className="flex flex-col items-center gap-2">
          <Button variant="secondary" loading={trying} onClick={retry}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
