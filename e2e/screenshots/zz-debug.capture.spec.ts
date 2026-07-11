/**
 * TEMPORARY diagnostic — why do TrainingBlockCard / FoodConsistencyCard
 * render null in the capture rig? Pipes the page console (logger.* land
 * there) and probes the DOM. Not for CI; deleted after diagnosis.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

test.use({
  viewport: { width: 393, height: 852 },
  // Local sandbox: the project pins a different Playwright build than the
  // pre-installed /opt/pw-browsers chromium — point at it directly.
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
});

test.describe("debug invisible cards", () => {
  test.skip(!emulatorActive, "needs the Firebase emulator");

  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        /trainingBlock|nutritionConsistency|momentumCheckin|permission|denied|error/i.test(
          text
        )
      ) {
        console.log(`[page:${msg.type()}] ${text.slice(0, 400)}`);
      }
    });
    page.on("pageerror", (err) =>
      console.log(`[pageerror] ${String(err).slice(0, 400)}`)
    );
    await signInAsTestUser(page);
  });

  async function probe(page: Page, label: string, needle: RegExp) {
    const found = await page
      .getByText(needle)
      .first()
      .isVisible()
      .catch(() => false);
    console.log(`[probe] ${label}: ${found ? "VISIBLE" : "ABSENT"}`);
  }

  test("program — training block row", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("program");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(6000);
    await probe(page, "trainingBlockRow", /start a training block/i);
    await probe(page, "sessionHero", /begin workout/i);
  });

  test("food — consistency card", async ({ page }) => {
    test.setTimeout(120_000);

    // Emulator ground truth (Bearer owner bypasses rules): does a
    // nutritionCommitments doc exist by the time this test runs?
    const base =
      "http://127.0.0.1:8080/v1/projects/demo-tropos/databases/(default)/documents";
    const usersRes = await fetch(`${base}/users`, {
      headers: { Authorization: "Bearer owner" },
    });
    const users = (await usersRes.json()) as {
      documents?: Array<{ name: string }>;
    };
    for (const u of users.documents ?? []) {
      const uid = u.name.split("/").pop()!;
      const commitsRes = await fetch(
        `${base}/users/${uid}/nutritionCommitments`,
        { headers: { Authorization: "Bearer owner" } }
      );
      const commits = (await commitsRes.json()) as {
        documents?: Array<{ name: string; fields?: unknown }>;
      };
      console.log(
        `[emulator] uid=${uid} commitments=${JSON.stringify(
          (commits.documents ?? []).map((d) => d.name.split("/").pop())
        )}`
      );
    }

    // Firestore RPC trace — which read (if any) never gets an answer.
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(":8080")) {
        console.log(
          `[net→] ${url.slice(url.indexOf(":8080") + 5, url.indexOf(":8080") + 95)}`
        );
      }
    });
    page.on("response", (res) => {
      const url = res.url();
      if (url.includes(":8080")) {
        console.log(
          `[net←] ${res.status()} ${url.slice(url.indexOf(":8080") + 5, url.indexOf(":8080") + 95)}`
        );
      }
    });
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (url.includes(":8080")) {
        console.log(
          `[net✗] ${req.failure()?.errorText} ${url.slice(url.indexOf(":8080") + 5, url.indexOf(":8080") + 95)}`
        );
      }
    });

    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(6000);
    await probe(page, "foodFocusRow", /set a weekly logging focus/i);
    await probe(page, "progressState", /·\s*\d+\/\d+/);
    await probe(page, "timeline", /food log/i);
  });
});
