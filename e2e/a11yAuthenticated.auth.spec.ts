/**
 * The a11y invariants, on the pages a signed-in user actually uses.
 *
 * `accessibility.spec.ts` checks unnamed buttons, `role="button"` on
 * non-buttons, images without alt text and the heading contract — all on
 * the LOGIN page, because that is the only page the unauthenticated rig
 * can reach. Its own comment says so: "other pages need their own auth
 * fixture to test similarly." The fixture has existed since PR P; nothing
 * had used it for this.
 *
 * So every authenticated surface — Home, Food, Train, Social, Analytics,
 * and eight Settings pages — has been running these rules on trust. This
 * sweeps sixteen routes through them.
 *
 * ONE RULE IS DELIBERATELY WEAKER HERE, and the reason is the finding.
 * The login test bans `[role="button"]:not(button)` outright. Run that
 * ban against the authenticated app (with meals seeded) and it flags
 * `FoodRow`'s swipe row — a `motion.div` that carries `drag="x"`,
 * `tabIndex={0}`, an `aria-label`, and an explicit Enter/Space keydown
 * handler, and whose reduced-motion branch renders the same row as a real
 * `<button>`. That is a considered construct, not the backdrop the ban was
 * written for ("a phantom Tab-stop with no native keyboard handling").
 *
 * The ban was a proxy for two properties that ARE observable in the DOM:
 * the element is reachable by keyboard, and it has a name. This asserts
 * those instead. A `<div role="button">` with no `tabIndex` — the actual
 * anti-pattern — still fails, and so does a named-but-unfocusable one.
 *
 * SCOPE, stated so it is not mistaken for more. This walks ROUTES and
 * checks the chrome each one renders. It does not open sheets, and the
 * CI seed chain for this job (`seed:e2e`) leaves the food diary empty, so
 * content rows appear only under the richer local chain. Measured both
 * ways on 2026-09-18: zero offenders under `seed:e2e`, and under
 * `seed:e2e + seed:rich` the only hit across all sixteen routes was the
 * FoodRow construct above.
 */
import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

/** Every tab, plus the Settings pages a user reaches from the index. */
const ROUTES = [
  "",
  "food",
  "history",
  "program",
  "social",
  "review",
  "upgrade",
  "settings",
  "settings/profile",
  "settings/account",
  "settings/nutrition",
  "settings/training",
  "settings/run-plan",
  "settings/privacy",
  "settings/units-appearance",
  "settings/subscription",
] as const;

interface Offence {
  route: string;
  kind: string;
  detail: string;
}

test.describe("authenticated a11y invariants", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );
  // Sixteen route loads at ~1.5s of settle each, plus sign-in.
  test.setTimeout(180_000);

  test("every authenticated route holds the login page's invariants", async ({
    page,
  }) => {
    await suppressCoachmarks(page);
    await signInAsTestUser(page);

    const offences: Offence[] = [];
    for (const route of ROUTES) {
      await page.goto(route || "./");
      // Deliberately not `networkidle`: Firestore holds a long-poll open,
      // so it never fires and the whole sweep times out.
      await page.waitForTimeout(1500);

      const found = await page.evaluate(() => {
        const out: { kind: string; detail: string }[] = [];
        const describe = (el: Element) => {
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
          const aria = (el.getAttribute("aria-label") ?? "").trim();
          return `<${el.tagName.toLowerCase()}> text=${JSON.stringify(
            text.slice(0, 40)
          )} aria=${JSON.stringify(aria)}`;
        };

        for (const button of Array.from(document.querySelectorAll("button"))) {
          const named =
            (button.textContent ?? "").trim() ||
            (button.getAttribute("aria-label") ?? "").trim() ||
            (button.getAttribute("title") ?? "").trim();
          if (!named)
            out.push({
              kind: "button with no accessible name",
              detail: describe(button),
            });
        }

        /* The weakened rule (see the header): a non-button acting as one
           must be keyboard-reachable and named. */
        for (const fake of Array.from(
          document.querySelectorAll('[role="button"]:not(button)')
        )) {
          const tabbable = fake.getAttribute("tabindex");
          const named =
            (fake.getAttribute("aria-label") ?? "").trim() ||
            (fake.textContent ?? "").trim();
          if (tabbable === null || Number(tabbable) < 0)
            out.push({
              kind: 'role="button" that Tab cannot reach',
              detail: describe(fake),
            });
          if (!named)
            out.push({
              kind: 'role="button" with no accessible name',
              detail: describe(fake),
            });
        }

        for (const img of Array.from(
          document.querySelectorAll("img:not([alt])")
        )) {
          out.push({
            kind: "img with no alt attribute",
            detail: (img as HTMLImageElement).src.slice(-60),
          });
        }

        for (const link of Array.from(document.querySelectorAll("a"))) {
          const named =
            (link.textContent ?? "").trim() ||
            (link.getAttribute("aria-label") ?? "").trim();
          if (!named)
            out.push({
              kind: "link with no accessible name",
              detail: `href=${link.getAttribute("href")}`,
            });
        }

        const h1s = document.querySelectorAll("h1").length;
        if (h1s !== 1)
          out.push({ kind: "heading contract", detail: `${h1s} h1 elements` });

        return out;
      });

      for (const f of found) offences.push({ route: route || "/", ...f });
    }

    expect(
      offences.map((o) => `${o.route}: ${o.kind} — ${o.detail}`),
      "Authenticated surfaces must hold the same a11y invariants the login " +
        "page does. An icon-only control needs an aria-label (use the " +
        "IconButton primitive, which requires one at compile time); a " +
        'non-button acting as a button needs tabIndex="0" and a name; every ' +
        "page renders exactly one h1."
    ).toEqual([]);
  });

  test("the checks would fire on the shapes they look for", async ({
    page,
  }) => {
    /* Positive control. Sixteen routes reporting nothing is the same
       output a broken selector produces, which is the failure this file
       exists to prevent — so prove the probe catches each shape first. */
    await page.goto("./");
    const caught = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = `
        <button></button>
        <div role="button" aria-label="No tabindex"></div>
        <div role="button" tabindex="0"></div>
        <img src="x.png">
        <a href="/x"></a>
        <button aria-label="Fine"></button>
        <div role="button" tabindex="0" aria-label="Fine too"></div>
        <img src="y.png" alt="Fine">
        <a href="/y">Fine</a>`;
      document.body.appendChild(host);
      const named = (el: Element) =>
        (el.textContent ?? "").trim() ||
        (el.getAttribute("aria-label") ?? "").trim() ||
        (el.getAttribute("title") ?? "").trim();
      const kinds: string[] = [];
      for (const b of Array.from(host.querySelectorAll("button")))
        if (!named(b)) kinds.push("unnamed-button");
      for (const f of Array.from(
        host.querySelectorAll('[role="button"]:not(button)')
      )) {
        const t = f.getAttribute("tabindex");
        if (t === null || Number(t) < 0) kinds.push("unreachable-role-button");
        if (!named(f)) kinds.push("unnamed-role-button");
      }
      for (const _img of Array.from(host.querySelectorAll("img:not([alt])")))
        kinds.push("img-no-alt");
      for (const a of Array.from(host.querySelectorAll("a")))
        if (!named(a)) kinds.push("unnamed-link");
      host.remove();
      return kinds;
    });
    expect(caught.sort()).toEqual(
      [
        "img-no-alt",
        "unnamed-button",
        "unnamed-link",
        "unnamed-role-button",
        "unreachable-role-button",
      ].sort()
    );
  });
});
