import { expect, type Page } from "@playwright/test";
import { emulatorActive, EXPECTED_AUTH_HOST } from "./emulator";

/** Complete the email the app actually sent, using only the local emulator.
 * Fresh-account fixtures must pass the same verification gate as new users.
 * This also exercises Firebase-mail fallback when Functions is not running.
 */
export async function verifySignupEmail(page: Page, email: string) {
  if (!emulatorActive)
    throw new Error("Signup verification requires local emulators");
  await expect(
    page.getByRole("heading", { name: "Verify your email", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /build muscle/i })
  ).not.toBeVisible();

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
          body.oobCodes?.findLast(
            (item) =>
              item.email === email && item.requestType === "VERIFY_EMAIL"
          )?.oobCode ?? "";
        return code;
      },
      {
        timeout: 20_000,
        message: "App must send the signup verification email",
      }
    )
    .not.toBe("");

  const response = await page.request.post(
    `http://${EXPECTED_AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=emulator-dummy-key`,
    { data: { oobCode: code } }
  );
  expect(response.ok(), "Verification link must be accepted").toBe(true);
  await page
    .getByRole("button", { name: "I've verified my email", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /build muscle/i })).toBeVisible(
    { timeout: 20_000 }
  );
}
