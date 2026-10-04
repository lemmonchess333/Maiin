#!/usr/bin/env node
/**
 * Rebuilds the public copies of the Privacy Policy and the Terms from the
 * in-app pages, then formats them the way the pre-commit hook would:
 *
 *   npm run legal:sync
 *
 * Run it whenever `src/pages/PrivacyPolicy.tsx` or
 * `src/pages/TermsOfService.tsx` changes; `scripts/legal-pages.test.ts`
 * fails until you do. Why the copies exist and why they are generated:
 * `scripts/legal-pages/staticPage.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import PrivacyPolicy from "../src/pages/PrivacyPolicy";
import TermsOfService from "../src/pages/TermsOfService";
import { rebuildPage, renderStaticBody } from "./legal-pages/staticPage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PAGES = [
  { file: "public/legal/privacy.html", page: PrivacyPolicy },
  { file: "public/legal/terms.html", page: TermsOfService },
];

for (const { file, page } of PAGES) {
  const path = resolve(root, file);
  const rebuilt = rebuildPage(
    readFileSync(path, "utf8"),
    renderStaticBody(page)
  );
  const formatted = await prettier.format(rebuilt, {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  });
  writeFileSync(path, formatted);
  console.log(`wrote ${file}`);
}
