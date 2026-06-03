#!/usr/bin/env node
/**
 * Default-crew seed script (issue #846).
 *
 * Provisions the four app-provided "system" crews into the `groups`
 * collection via the Admin SDK, which bypasses Firestore rules. This is the
 * ONLY correct place to create them: the `/groups` create rule requires
 * `createdBy == request.auth.uid`, so a `createdBy: "system"` crew can never be
 * written from a client. The old client-side seed in `useCrews` was therefore
 * permission-denied on every first `/social` load — flooding the console and
 * leaving the crew list empty. The client now only reads default crews; this
 * script creates them.
 *
 * Idempotent: existing default crews are matched by name and skipped, so
 * re-running never duplicates. Run it once per environment (and again only
 * when `DEFAULT_CREWS` gains a new entry).
 *
 * Operator setup — EMULATOR (safe, no creds):
 *   1. firebase emulators:start --only auth,firestore
 *   2. export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   3. npm run seed:default-crews
 *
 * Operator setup — PRODUCTION (requires the --prod guard + Admin creds):
 *   1. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   2. npm run seed:default-crews -- --prod
 *
 * Safety: when FIRESTORE_EMULATOR_HOST is unset the script refuses to write
 * unless `--prod` is passed, so a fat-finger can't accidentally mutate the
 * production crew list.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { DEFAULT_CREWS } from "../src/lib/defaultCrews";

const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const prodConfirmed = process.argv.includes("--prod");

if (!isEmulator && !prodConfirmed) {
  console.error(
    "[seed-default-crews] Refusing to run against production without --prod.\n" +
      "  Emulator: export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 then re-run.\n" +
      "  Production: export GOOGLE_APPLICATION_CREDENTIALS=... and pass --prod."
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || "adaptive-fitness-af8bb";

if (!getApps().length) {
  // Against the emulator, projectId alone is enough (admin honours
  // FIRESTORE_EMULATOR_HOST). Against production, Application Default
  // Credentials (GOOGLE_APPLICATION_CREDENTIALS) supply the auth.
  initializeApp({ projectId: PROJECT_ID });
}

const db = getFirestore();

async function main() {
  const target = isEmulator
    ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})`
    : `PRODUCTION (${PROJECT_ID})`;
  console.log(`[seed-default-crews] Target: ${target}`);

  // Idempotency: match existing default crews by name so re-runs are no-ops.
  const existing = await db
    .collection("groups")
    .where("type", "==", "default")
    .get();
  const existingNames = new Set(
    existing.docs.map((d) => d.data().name as string)
  );

  let created = 0;
  for (const crew of DEFAULT_CREWS) {
    if (existingNames.has(crew.name)) {
      console.log(`[seed-default-crews] Skip (exists): ${crew.name}`);
      continue;
    }
    await db.collection("groups").add({
      ...crew,
      memberCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    created += 1;
    console.log(`[seed-default-crews] Created: ${crew.name}`);
  }

  console.log(
    `[seed-default-crews] Done. ${created} created, ${
      DEFAULT_CREWS.length - created
    } already present.`
  );
}

main().catch((err) => {
  console.error("[seed-default-crews] Failed:", err);
  process.exit(1);
});
