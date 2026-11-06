import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { auth } from "@/lib/firebase";
import {
  activityLinkErrorCode,
  hasRegisteredActivity,
  linkCanonicalActivity,
  resetRejectedActivityLink,
} from "@/features/run/canonicalActivityLink";

export default function CanonicalActivityLink({
  uid,
  activityId,
  proof,
}: {
  uid: string;
  activityId: string;
  proof: unknown;
}) {
  const { isOnline } = useOnlineStatus();
  const [status, setStatus] = useState<"idle" | "pending" | "linked" | "error">(
    "idle"
  );
  const [error, setError] = useState<unknown>(null);
  const [resetFailed, setResetFailed] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (
    !hasRegisteredActivity(proof, uid, activityId) ||
    auth.currentUser?.uid !== uid
  )
    return null;
  const needsRefresh = activityLinkErrorCode(error) === "revision-conflict";
  async function link() {
    if (busy.current || !isOnline) return;
    busy.current = true;
    setResetFailed(false);
    setStatus("pending");
    setError(null);
    try {
      await linkCanonicalActivity(uid, activityId, proof);
      if (mounted.current && auth.currentUser?.uid === uid) setStatus("linked");
    } catch (failure) {
      if (mounted.current && auth.currentUser?.uid === uid) {
        setError(failure);
        setStatus("error");
      }
    } finally {
      busy.current = false;
    }
  }
  return (
    <section
      aria-label="Record activity against your running session"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      {status === "linked" ? (
        <p role="status" className="text-sm text-foreground">
          Activity recorded against this session. This is your reported
          activity, not verified interval completion or progression credit.
          Review your running capacity before another planned start.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Your run is saved separately. You can link its reported activity to
            this session. This does not confirm every interval, advance your
            plan, or remove a safety hold. Another planned start will require a
            fresh running review.
          </p>
          {!isOnline && (
            <p role="status" className="text-sm text-muted-foreground">
              Connect to the internet to confirm the run is saved on the server.
            </p>
          )}
          {status === "error" && (
            <p role="alert" className="text-sm text-muted-foreground">
              {resetFailed
                ? "The saved request changed or could not be read. Retry uses the preserved request; no request was deleted."
                : needsRefresh
                  ? "Your running plan changed. Review the latest plan before preparing a new linkage request."
                  : "Linkage confirmation is unavailable. Your saved run is kept. Retry checks the same request, including if it already succeeded."}
            </p>
          )}
          {needsRefresh ? (
            <Button
              variant="secondary"
              fullWidth
              onClick={async () => {
                if (await resetRejectedActivityLink(uid, activityId, error)) {
                  setError(null);
                  setStatus("idle");
                } else {
                  setError(null);
                  setResetFailed(true);
                  setStatus("error");
                }
              }}
            >
              Prepare a new linkage request
            </Button>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              loading={status === "pending"}
              disabled={!isOnline}
              onClick={() => void link()}
            >
              {status === "error"
                ? "Retry recording this activity"
                : "Record against this session"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
