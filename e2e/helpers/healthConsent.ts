/**
 * The agreement to store health details (Priv1 call 1) that a seeded,
 * set-up account carries. An account set up without one meets the
 * agreement before the app on its next open, as an account from before
 * setup asked does; a spec that seeds a finished account and does not
 * walk setup gives it this, so it opens on the app it means to test.
 *
 * A spec that walks setup agrees on setup's own step (`setUpPlan`), and
 * `completeOnboarding` stores it.
 */
import { HEALTH_DATA_CONSENT_VERSION } from "../../src/lib/healthConsent";
import { EXPECTED_AUTH_HOST, EXPECTED_FIRESTORE_HOST } from "./emulator";

/** As the Admin SDK writes it: a Date is stored as a Timestamp. */
export function seededHealthConsent(at: Date = new Date()) {
  return { at, version: HEALTH_DATA_CONSENT_VERSION };
}

/** As the Firestore REST API writes the field, for a spec that patches a
 *  profile with `updateMask.fieldPaths=healthDataConsent`. */
export function restHealthConsent(at: Date = new Date()) {
  return {
    mapValue: {
      fields: {
        at: { timestampValue: at.toISOString() },
        version: { integerValue: String(HEALTH_DATA_CONSENT_VERSION) },
      },
    },
  };
}

/**
 * Makes a new account one set up before setup asked for the agreement: its
 * profile finished, through the emulator's rules-free REST surface, and no
 * agreement on it. The next open meets the gate. Signs nothing in or out.
 */
export async function finishSetupWithoutHealthConsent(
  email: string
): Promise<void> {
  const query = await fetch(
    `http://${EXPECTED_AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/demo-tropos/accounts:query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: "{}",
    }
  );
  const { userInfo } = (await query.json()) as {
    userInfo?: { localId: string; email?: string }[];
  };
  const uid = userInfo?.find((u) => u.email === email)?.localId;
  if (!uid) throw new Error(`user ${email} not found in the auth emulator`);
  const patched = await fetch(
    `http://${EXPECTED_FIRESTORE_HOST}/v1/projects/demo-tropos/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=onboardingComplete&updateMask.fieldPaths=displayName`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify({
        fields: {
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: "Set up before" },
        },
      }),
    }
  );
  if (!patched.ok)
    throw new Error(`firestore emulator patch failed: ${await patched.text()}`);
}
