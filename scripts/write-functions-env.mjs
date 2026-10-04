#!/usr/bin/env node
/**
 * Writes functions/.env from repository variables, before a functions deploy.
 *
 * The functions read a few plain settings from their environment: who the
 * moderators are, where report alerts go, the address email is sent from,
 * the sandbox purchase allow-list. They are not secrets, so they were never
 * put in Secret Manager, and the only way to set them was a functions/.env
 * on the owner's machine and a deploy from there. deploy-functions.yml runs
 * this with each repository variable of the same name in its environment
 * (GitHub → Settings → Secrets and variables → Actions → Variables), so the
 * settings live on GitHub and every deploy carries them.
 *
 * firebase-tools reads functions/.env as the whole set: a deploy with the
 * file replaces each function's plain variables with its contents, and a
 * deploy without one leaves them as they are (docs/iap/revenuecat-setup.md,
 * Part C). So nothing is written while none of these is set, which is how
 * deploys behaved before, and once any is set GitHub holds all of them: a
 * setting left unset there is removed from the functions by the next deploy.
 * That only holds if the list is every plain variable the functions read, so
 * write-functions-env.test.ts reads functions/ and fails when it is not.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FUNCTION_SETTINGS = [
  // Moderation (docs/LAUNCH_TODO.md, section 19).
  "ADMIN_UIDS",
  "MODERATION_ALERT_EMAIL",
  // Account and alert email.
  "RESEND_FROM",
  "PUBLIC_APP_BASE_URL",
  // In-app purchases (docs/iap/revenuecat-setup.md).
  "REVENUECAT_SANDBOX_UIDS",
  "ALLOW_SANDBOX_IAP",
  // Which origins and test plans the deployment allows (functions/helpers.js).
  "TROPOS_DEPLOY_ENV",
  // Stripe, dormant (Sub4).
  "STRIPE_PRICE_ID_MONTHLY",
  "STRIPE_PRICE_ID_YEARLY",
  "STRIPE_PRICE_ID_LIFETIME",
  "STRIPE_RETURN_URL_ORIGINS",
];

// firebase-tools' own escapes (formatUserEnvForWrite, in its functions env module).
const ESCAPES = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\v": "\\v",
  "\\": "\\\\",
  "'": "\\'",
  '"': '\\"',
};

/**
 * The file's text for the settings that are set, or null when none is.
 * Every value is double-quoted, so a space or a `#` (which starts a comment
 * in an unquoted value) reaches the function as written.
 */
export function formatFunctionsEnv(env) {
  const lines = [];
  for (const name of FUNCTION_SETTINGS) {
    const value = String(env[name] ?? "").trim();
    if (!value) continue;
    const escaped = value.replace(/[\n\r\t\v\\'"]/g, (c) => ESCAPES[c]);
    lines.push(`${name}="${escaped}"`);
  }
  return lines.length ? `${lines.join("\n")}\n` : null;
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === here) {
  const text = formatFunctionsEnv(process.env);
  if (!text) {
    console.log(
      "None of the function settings is set as a repository variable, so no functions/.env is written and each function keeps the variables it has."
    );
  } else {
    const target = resolve(dirname(here), "..", "functions", ".env");
    writeFileSync(target, text);
    const isSet = (name) => String(process.env[name] ?? "").trim() !== "";
    const set = FUNCTION_SETTINGS.filter(isSet);
    const unset = FUNCTION_SETTINGS.filter((name) => !isSet(name));
    console.log(`functions/.env written with ${set.join(", ")}.`);
    console.log(
      `Not set on GitHub, so unset on every function after this deploy: ${unset.join(", ") || "none"}.`
    );
  }
}
