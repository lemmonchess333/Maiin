/**
 * A circuit's post on the feed card (Circ1 (11)): its rounds, minutes and
 * moves, with no exercise rows to compare or save as a routine; and a lift
 * post drawn as it always was beside it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";
import { builtInCircuit } from "@/features/circuit/builtInCircuits";
import { savedCircuitFrom } from "@/features/circuit/savedCircuit";
import { circuitPost } from "@/lib/circuitPost";
import { getFormArtCutout } from "@/lib/formArtCutouts";

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer" }, profile: null }),
}));
vi.mock("../../../lib/socialApi", () => ({
  giveHighFive: vi.fn(),
  getKudosList: vi.fn(async () => []),
  blockUser: vi.fn(),
}));
vi.mock("../../../hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("../../../hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blocked: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

const circuit = builtInCircuit({ kit: "minimal", minutes: 20 });
const POST = circuitPost(
  { uid: "author", displayName: "Test Author" },
  {
    title: circuit.name,
    circuit: savedCircuitFrom(circuit, {
      intervalsDone: 20,
      roundsDone: 4,
      workSecondsDone: 800,
      activeSeconds: 1180,
      finished: true,
    }),
  },
  { visibility: "followers" }
);

function feedItem(activity: Record<string, unknown>): FeedItem {
  return {
    id: "a1",
    activityId: "a1",
    authorId: "author",
    authorName: "Test Author",
    type: "workout",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity,
  } as unknown as FeedItem;
}

const renderCard = (item: FeedItem, allExercises = false) =>
  render(
    <MemoryRouter>
      <ActivityCard feedItem={item} allExercises={allExercises} />
    </MemoryRouter>
  ).container;

describe("a circuit's post (Circ1 (11))", () => {
  it("draws its rounds, minutes and moves", () => {
    const card = renderCard(feedItem({ ...POST }));
    expect(screen.getByText("20-minute circuit")).toBeInTheDocument();
    expect(screen.getByText("rounds").previousElementSibling).toHaveTextContent(
      "4"
    );
    expect(screen.getByText("min").previousElementSibling).toHaveTextContent(
      "20"
    );
    expect(card.textContent).toContain("40 s on, 20 s off");
    // The first three moves, then the rest on the post's page.
    for (const move of circuit.moves.slice(0, 3))
      expect(screen.getByText(move.name)).toBeInTheDocument();
    expect(screen.queryByText(circuit.moves[3].name)).toBeNull();
    expect(screen.getByRole("link", { name: "+2 more moves" })).toBeVisible();
    // Nothing a lift's rows offer: no volume, no compare, no routine.
    expect(screen.queryByText(/volume/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Compare your/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /routine/i })).toBeNull();
    // The hero is the first move's drawing.
    const lead = circuit.moves.find((move) =>
      getFormArtCutout(move.exerciseId)
    );
    expect(
      card.querySelector("img[data-lead-drawing]")?.getAttribute("src")
    ).toContain(`/${lead!.exerciseId}.`);
  });

  it("leads with its minutes when no whole round was done, said once", () => {
    // Ended at 8 minutes, inside a round: never "0 rounds" as the figure.
    const card = renderCard(
      feedItem({
        ...POST,
        duration: 480,
        circuit: { ...POST.circuit, rounds: 0 },
      })
    );
    expect(screen.queryByText("rounds")).toBeNull();
    expect(screen.getAllByText("min")).toHaveLength(1);
    const lead = screen.getByText("min").previousElementSibling;
    expect(lead).toHaveTextContent("8");
    expect(lead).toHaveClass("text-2xl", "text-lifting");
    expect(card.textContent).toContain("40 s on, 20 s off");
  });

  it("calls one round a round", () => {
    renderCard(feedItem({ ...POST, circuit: { ...POST.circuit, rounds: 1 } }));
    expect(screen.getByText("round").previousElementSibling).toHaveTextContent(
      "1"
    );
  });

  it("lists every move on the post's own page", () => {
    renderCard(feedItem({ ...POST }), true);
    for (const move of circuit.moves)
      expect(screen.getByText(move.name)).toBeInTheDocument();
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it("names moves from the catalogue only: an id it does not know is left out", () => {
    renderCard(
      feedItem({
        ...POST,
        circuit: { ...POST.circuit, moves: ["plank", "Buy followers now"] },
      }),
      true
    );
    expect(screen.getByText("Plank")).toBeInTheDocument();
    expect(screen.queryByText("Buy followers now")).toBeNull();
  });

  it("reads, as an app from before circuits would, as a workout with its count and minutes", () => {
    const { circuit: _circuit, ...older } = POST;
    renderCard(feedItem(older));
    expect(screen.getByText("20-minute circuit")).toBeInTheDocument();
    expect(
      screen.getByText("exercises").previousElementSibling
    ).toHaveTextContent("5");
    expect(screen.getByText("min").previousElementSibling).toHaveTextContent(
      "20"
    );
    expect(screen.queryByText("rounds")).toBeNull();
  });
});

describe("a lift's post beside it", () => {
  it("is drawn as before: its rows, volume and compare", () => {
    const card = renderCard(
      feedItem({
        authorId: "author",
        type: "workout",
        workoutName: "Push",
        activityTitle: "Push",
        totalVolume: 1440,
        exerciseCount: 1,
        duration: 2700,
        exercises: [
          {
            name: "Bench Press",
            exerciseId: "bench-press",
            summary: "3×8×60 kg",
            setCount: 3,
            targetReps: 8,
            targetWeightKg: 60,
          },
        ],
      })
    );
    expect(screen.getByText("3×8×60 kg")).toBeInTheDocument();
    expect(screen.getByText("kg volume")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Compare your Bench Press" })
    ).toBeInTheDocument();
    expect(screen.queryByText("rounds")).toBeNull();
    expect(card.textContent).not.toContain("s on,");
  });
});
