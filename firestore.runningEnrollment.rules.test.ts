import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  throw Error(
    "FIRESTORE_EMULATOR_HOST required; enrollment rules did not run."
  );
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
  throw Error("Local emulator required.");
const suite = host ? describe : describe.skip;
suite("enrollment canonical and historical isolation", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    const [hostname, port] = host!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-running-enrollment-rules",
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
  it("old owner writes stay legal but cannot change snapshot, authority or rollout", async () => {
    const canonical = {
      revision: 0,
      holds: ["enrollment_review_required"],
      plan: { sessions: [] },
    };
    const history = {
      manualCompletions: { old: true },
      runDays: [{ id: "old", completed: true }],
    };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "users/runner/runningState/current"),
        canonical
      );
      await setDoc(
        doc(ctx.firestore(), "users/runner/runningState/legacySnapshot"),
        history
      );
    });
    const owner = env.authenticatedContext("runner").firestore();
    await assertSucceeds(
      setDoc(doc(owner, "users/runner/programState/current"), {
        runPlan: { phase: "training" },
        runDays: [{ id: "unsafe" }],
      })
    );
    await assertFails(
      updateDoc(doc(owner, "users/runner/runningState/current"), { holds: [] })
    );
    await assertFails(
      setDoc(doc(owner, "users/runner/runningState/legacySnapshot"), {
        runDays: [],
      })
    );
    await assertFails(
      deleteDoc(doc(owner, "users/runner/runningState/legacySnapshot"))
    );
    await assertFails(
      setDoc(doc(owner, "system/runningAuthority"), {
        protocolVersion: 1,
        enrollmentEnabled: true,
      })
    );
    expect(
      (await getDoc(doc(owner, "users/runner/runningState/current"))).data()
    ).toEqual(canonical);
    expect(
      (
        await getDoc(doc(owner, "users/runner/runningState/legacySnapshot"))
      ).data()
    ).toEqual(history);
    await assertFails(
      getDoc(
        doc(
          env.authenticatedContext("other").firestore(),
          "users/runner/runningState/legacySnapshot"
        )
      )
    );
  });
});
