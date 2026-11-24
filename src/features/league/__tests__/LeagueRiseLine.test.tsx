/**
 * LeagueRiseLine (Run30 call 2): the finish's one league row, "Up to 3rd
 * of 10", opening the league; nothing for someone who has not joined or a
 * restricted account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));
const auth = vi.hoisted(() => ({
  uid: "me",
  profile: { leagueOptIn: true } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: auth.uid }, profile: auth.profile }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import LeagueRiseLine from "../LeagueRiseLine";
import type { FinishStage } from "../useLeagueRise";
import {
  flushSnapshots,
  readLog,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const T0 = Date.UTC(2026, 10, 23, 9);

function seedGroup(uid: string) {
  const rows: Record<string, number> = {
    a: 100,
    b: 75,
    c: 50,
    d: 40,
    [uid]: 25,
    e: 20,
    f: 0,
    g: 0,
    h: 0,
    i: 0,
  };
  const tree: Record<string, Record<string, unknown>> = {
    [`leagueMembers/${uid}`]: {
      uid,
      tier: "gold",
      groupId: "g1",
      weekKey: "2026-11-23",
    },
  };
  Object.entries(rows).forEach(([id, points], i) => {
    tree[`leagueGroups/g1/standings/${id}`] = {
      uid: id,
      points,
      reachedAt: new Date(T0 - 100 + i),
    };
  });
  seedFirestore(tree);
}

function finish(stage: FinishStage) {
  return (
    <MemoryRouter>
      <LeagueRiseLine stage={stage} />
    </MemoryRouter>
  );
}

/** Before the save, then saved, then the server's recompute to 60. */
async function saveAndRecompute(uid: string) {
  const view = render(finish("before"));
  await waitFor(() =>
    expect(
      readLog().some(
        (r) => r.op === "getDocs" && r.path === "leagueGroups/g1/standings"
      )
    ).toBe(true)
  );
  await flushSnapshots();
  view.rerender(finish("onServer"));
  await flushSnapshots();
  seedFirestore({
    [`leagueGroups/g1/standings/${uid}`]: {
      uid,
      points: 60,
      reachedAt: new Date(T0 + 1),
    },
  });
  await flushSnapshots();
  return view;
}

beforeEach(() => {
  resetFirestore();
  auth.profile = { leagueOptIn: true };
});

describe("LeagueRiseLine", () => {
  it("says the place a session raised you to, and opens the league", async () => {
    auth.uid = "riser";
    seedGroup("riser");
    await saveAndRecompute("riser");
    const link = await screen.findByRole("link", {
      name: "Gold league: Up to 3rd of 10. See the league",
    });
    expect(link).toHaveAttribute("href", "/league");
    expect(link).toHaveTextContent("Up to 3rd of 10");
  });

  it("reads and shows nothing for someone who has not joined", async () => {
    auth.uid = "notJoined";
    auth.profile = { leagueOptIn: false };
    seedGroup("notJoined");
    const view = render(finish("before"));
    await flushSnapshots();
    view.rerender(finish("onServer"));
    await flushSnapshots();
    expect(readLog()).toEqual([]);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("shows nothing for a restricted account", async () => {
    auth.uid = "restricted";
    seedGroup("restricted");
    seedFirestore({
      "globalRestrictedUids/restricted": { restrictedAt: new Date(T0) },
    });
    const view = await saveAndRecompute("restricted");
    await flushSnapshots();
    expect(screen.queryByRole("link")).toBeNull();
    expect(view.container).toBeEmptyDOMElement();
    // Anchor: the rise was found, and the restriction alone hid it.
    await deleteDoc(doc(db, "globalRestrictedUids", "restricted"));
    expect(
      await screen.findByRole("link", { name: /Up to 3rd of 10/ })
    ).toBeInTheDocument();
  });
});
