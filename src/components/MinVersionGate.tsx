import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { isNativePlatform } from "@/lib/platform";
import { upgradeRequired, type ClientConfig } from "@/lib/versionGate";
import { Button } from "@/components/ui/Button";
import { logger } from "@/lib/logger";

declare const __APP_VERSION__: string;

/**
 * Min-supported-version kill switch (see src/lib/versionGate.ts for the
 * policy + fail-open rationale). Reads `config/client` once on boot (the
 * existing world-readable kill-switch collection — same home as
 * `config/gemini`-style flags); when `minSupportedVersion` exceeds this
 * build, renders the blocking upgrade screen instead of the app.
 *
 * Firebase is loaded via dynamic import so this component adds nothing to
 * App.tsx's static graph — the check rides the same chunks the app loads
 * anyway, and a failed load simply fails open.
 */
export default function MinVersionGate({
  children,
}: {
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ db, auth }, { doc, getDoc }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);
        // config/{doc} rules require a signed-in reader; wait for the boot
        // auth restore or the read races it and permission-denieds (fail
        // open) even for signed-in users. Signed-out users stay ungated by
        // design — every gated surface is behind auth anyway.
        await auth.authStateReady();
        if (!auth.currentUser) return;
        const snap = await getDoc(doc(db, "config", "client"));
        const config = snap.exists()
          ? (snap.data() as ClientConfig)
          : undefined;
        const version =
          typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
        if (!cancelled && upgradeRequired(version, config)) {
          logger.warn(
            `[MinVersionGate] build ${version} below minSupportedVersion — blocking`
          );
          setBlocked(true);
        }
      } catch {
        // Missing doc / offline / rules hiccup — NEVER lock the user out.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!blocked) return <>{children}</>;

  const native = isNativePlatform();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-xs space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <RefreshCw className="size-5 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-extrabold text-foreground">
          Update required
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {native
            ? "This version of Tropos is out of date and can no longer connect safely. Update Tropos in the App Store, then reopen the app."
            : "This version of Tropos is out of date. Reload to get the latest version."}
        </p>
        {!native && (
          <Button
            className="w-full"
            onClick={() => window.location.reload()}
          >
            Reload Tropos
          </Button>
        )}
      </div>
    </div>
  );
}
