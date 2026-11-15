/**
 * Run27 call 11 — each refusal the server's renameGoalSpace gives reads in
 * words (renameRejection.ts), never the fallback, and the word filter's is
 * the display name's sentence the app says when it catches the name first.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { describeRenameRejection } from "../renameRejection";
import { OBJECTIONABLE_NAME_MESSAGE } from "@/lib/objectionableMessages";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/goalSpaceMembership.js");
const {
  memoryFirestore,
} = require("../../../../functions/__tests__/helpers/memoryFirestore.cjs");

const circle = (active = true) =>
  memoryFirestore({
    "goalSpaces/c1": { ownerId: "owner", active, title: "Spring half" },
    "goalSpaces/c1/members/owner": { uid: "owner" },
  });

async function refusal(args: Record<string, unknown>): Promise<unknown> {
  try {
    await server.renameGoalSpace({
      firestore: circle(),
      uid: "owner",
      spaceId: "c1",
      title: "Autumn 10K",
      ...args,
    });
  } catch (err) {
    return err;
  }
  throw new Error("expected a refusal");
}

describe("a rename's refusals, in words", () => {
  it("says each one, never the fallback", async () => {
    const said = await Promise.all(
      [
        { uid: "maya" },
        { firestore: circle(false) },
        { firestore: memoryFirestore() },
        { title: "   " },
      ].map(async (args) => describeRenameRejection(await refusal(args)))
    );
    expect(said).toEqual([
      "Only the circle’s owner can rename it.",
      "This circle has ended.",
      "This circle has ended.",
      "Give the circle a name.",
    ]);
  });

  it("says the word filter's refusal as the app does", async () => {
    expect(
      describeRenameRejection(await refusal({ title: "shit runners" }))
    ).toBe(OBJECTIONABLE_NAME_MESSAGE);
  });
});
