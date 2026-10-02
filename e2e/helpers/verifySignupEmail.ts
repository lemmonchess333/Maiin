import { expect, type Page, type Response } from "@playwright/test";
import { emulatorActive, EXPECTED_AUTH_HOST } from "./emulator";

/** Verify a fresh account's email the way a person does, using only the
 * local emulator.
 *
 * Email sign-ups go straight to onboarding: verification comes after the
 * plan, so this first proves there is no wall. It then finds the link the
 * app sent at sign-up (Firebase's own mail when the Functions emulator is
 * not running), applies it, and has the app notice it as a return from Mail
 * does: the App-level gate rechecks on focus, reloads the user and
 * refreshes the token. Specs that post publicly need that
 * fresh token, so this waits for the refresh rather than for anything on
 * screen, which shows nothing while onboarding is open.
 */
export async function verifySignupEmail(page: Page, email: string) {
  if (!emulatorActive)
    throw new Error("Signup verification requires local emulators");
  await expect(page.getByRole("button", { name: /build muscle/i })).toBeVisible(
    { timeout: 20_000 }
  );

  let code = "";
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `http://${EXPECTED_AUTH_HOST}/emulator/v1/projects/demo-tropos/oobCodes`
        );
        expect(response.ok()).toBe(true);
        const body = (await response.json()) as {
          oobCodes?: { email: string; requestType: string; oobCode: string }[];
        };
        code =
          body.oobCodes
            ?.slice()
            .reverse()
            .find(
              (item) =>
                item.email === email && item.requestType === "VERIFY_EMAIL"
            )?.oobCode ?? "";
        return code;
      },
      {
        timeout: 20_000,
        message: "App must send the verification email at sign-up",
      }
    )
    .not.toBe("");

  const response = await page.request.post(
    `http://${EXPECTED_AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=emulator-dummy-key`,
    { data: { oobCode: code } }
  );
  expect(response.ok(), "Verification link must be accepted").toBe(true);

  // A return to the app is a focus event. Repeat it until the token is
  // refreshed: one dispatched while the gate's first check is still in
  // flight is ignored, by design.
  let refreshed = false;
  const onResponse = (r: Response) => {
    if (r.url().includes("securetoken.googleapis.com/v1/token") && r.ok())
      refreshed = true;
  };
  page.on("response", onResponse);
  try {
    await expect
      .poll(
        async () => {
          if (!refreshed)
            await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          return refreshed;
        },
        {
          timeout: 20_000,
          intervals: [250, 500, 1000, 2000],
          message: "App must refresh its token once the email is verified",
        }
      )
      .toBe(true);
  } finally {
    page.off("response", onResponse);
  }
}
