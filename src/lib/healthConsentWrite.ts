/**
 * Agreeing to Tropos storing health details, from the gate an account set
 * up before setup asked meets on its next open (Priv1 call 1).
 *
 * One field on the person's own document, `healthDataConsent`, set to
 * `{ at: serverTimestamp(), version }`: firestore.rules allow exactly that
 * shape, the time being the server's (`request.time`). Setup's agreement
 * is not written here; `completeOnboarding` writes it with the plan.
 *
 * Offline the write is on the device at once and goes up on reconnect
 * (settleWrite.ts), so the gate does not wait on the connection; if the
 * server then refuses it, the person is told, and the next open asks
 * again, since the account still carries no agreement.
 */
import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import { settleWrite, type WriteOutcome } from "@/lib/settleWrite";
import { HEALTH_DATA_CONSENT_VERSION } from "@/lib/healthConsent";
import { toast } from "@/lib/toast";

/** The sentence for an agreement made offline that the server refused once
 *  it was sent. */
export const HEALTH_CONSENT_LATE_REFUSAL =
  "Couldn’t save that you agreed. Tropos will ask again next time you open it.";

export function agreeToHealthData(uid: string): Promise<WriteOutcome> {
  return settleWrite(
    updateDocGuarded(doc(db, "users", uid), {
      healthDataConsent: {
        at: serverTimestamp(),
        version: HEALTH_DATA_CONSENT_VERSION,
      },
    }),
    {
      label: "healthConsent.agree",
      onLateFailure: () => toast.error(HEALTH_CONSENT_LATE_REFUSAL),
    }
  );
}
