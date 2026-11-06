/** Real rules tests. Dormant paths only, no migration or production access. */
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !host)
  throw new Error("FIRESTORE_EMULATOR_HOST required; rules did not run.");
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
  throw new Error("Local emulator required.");
const suite = host ? describe : describe.skip;
suite("dormant running authority rules", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    const [hostname, port] = host!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-running-authority-rules",
      firestore: {
        host: hostname,
        port: Number(port),
        rules: readFileSync("firestore.rules", "utf8"),
      },
    });
  });
  afterAll(async () => {
    await env?.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });
  for (const collection of [
    "runningState",
    "runningProposals",
    "runningReceipts",
    "runningReviewReceipts",
    "runningTrainingReports",
    "runningReportReceipts",
  ]) {
    it(`${collection}: owner reads but cannot create/update/delete; other accounts cannot read`, async () => {
      const path = `users/runner/${collection}/current`;
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), path), { revision: 8 });
      });
      const owner = env.authenticatedContext("runner").firestore();
      await assertSucceeds(getDoc(doc(owner, path)));
      await assertFails(
        setDoc(doc(owner, `users/runner/${collection}/forged`), { revision: 9 })
      );
      await assertFails(updateDoc(doc(owner, path), { revision: 9 }));
      await assertFails(deleteDoc(doc(owner, path)));
      await assertFails(
        getDoc(doc(env.authenticatedContext("other").firestore(), path))
      );
      await assertFails(
        getDoc(doc(env.unauthenticatedContext().firestore(), path))
      );
    });
  }
  it("leaves legacy lifting/history writes legal without granting canonical writes", async () => {
    const owner = env.authenticatedContext("runner").firestore();
    await assertSucceeds(
      setDoc(doc(owner, "users/runner/programState/current"), {
        fatigueScore: 2,
        runDays: Array.from({ length: 140 }, (_, index) => ({
          id: `old-${index}`,
          completed: true,
        })),
      })
    );
  });
});
