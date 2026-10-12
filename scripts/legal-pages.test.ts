/**
 * The public copies of the Privacy Policy and the Terms must say exactly
 * what the in-app pages say. Apple's reviewer reads the public copies;
 * the app's users read the pages. Why they are generated:
 * `scripts/legal-pages/staticPage.ts`. To fix a failure here, run
 * `npm run legal:sync`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import PrivacyPolicy from "../src/pages/PrivacyPolicy";
import TermsOfService from "../src/pages/TermsOfService";
import {
  readable,
  rebuildPage,
  renderStaticBody,
} from "./legal-pages/staticPage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe.each([
  { file: "public/legal/privacy.html", page: PrivacyPolicy },
  { file: "public/legal/terms.html", page: TermsOfService },
])("$file", ({ file, page }) => {
  const committed = readFileSync(resolve(root, file), "utf8");
  const fresh = rebuildPage(committed, renderStaticBody(page));

  it("says what the in-app page says", () => {
    expect(
      readable(committed).words,
      `${file} is out of date: run npm run legal:sync`
    ).toBe(readable(fresh).words);
  });

  it("links where the in-app page links", () => {
    expect(readable(committed).links).toEqual(readable(fresh).links);
  });

  it("points in-app links at the other static pages", () => {
    // A "/terms" left in the static copy would resolve against the
    // host's root, which is not where the copies are served from.
    for (const href of readable(fresh).links) {
      expect(href).not.toMatch(/^\/(privacy|terms|support)$/);
    }
  });
});
