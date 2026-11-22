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
 *
 * A connection that reports online but answers nothing is treated the
 * same way after AGREE_WRITE_WAIT_MS: the write's promise would never
 * settle, and I agree would spin with Not now held. The agreement is on
 * the device by then, so the gate's re-read finds it, as it does offline.
 */
import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import { settleWrite, type WriteOutcome } from "@/lib/settleWrite";
import { HEALTH_DATA_CONSENT_VERSION } from "@/lib/healthConsent";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

/** The sentence for an agreement made offline that the server refused once
 *  it was sent. */
export const HEALTH_CONSENT_LATE_REFUSAL =
  "Couldn’t save that you agreed. Tropos will ask again next time you open it.";

/** How long I agree waits for the server before it counts the agreement
 *  as made on the device. */
export const AGREE_WRITE_WAIT_MS = 8000;

export function agreeToHealthData(uid: string): Promise<WriteOutcome> {
  const lateFailure = (err: unknown) => {
    logger.warn("[healthConsent.agree] refused once it was sent", err);
    toast.error(HEALTH_CONSENT_LATE_REFUSAL);
  };
  const settled = settleWrite(
    updateDocGuarded(doc(db, "users", uid), {
      healthDataConsent: {
        at: serverTimestamp(),
        version: HEALTH_DATA_CONSENT_VERSION,
      },
    }),
    { label: "healthConsent.agree", onLateFailure: lateFailure }
  );
  return new Promise<WriteOutcome>((resolve, reject) => {
    let answered = false;
    const waited = setTimeout(() => {
      answered = true;
      resolve("queued");
    }, AGREE_WRITE_WAIT_MS);
    settled.then(
      (outcome) => {
        clearTimeout(waited);
        if (answered) return;
        answered = true;
        resolve(outcome);
      },
      (err: unknown) => {
        clearTimeout(waited);
        // Past the wait the person has gone on: say it once it is known.
        if (answered) lateFailure(err);
        else {
          answered = true;
          reject(err);
        }
      }
    );
  });
}
