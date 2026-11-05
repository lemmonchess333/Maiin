/**
 * A post's photos on its card, and full screen (Soc15 call 2).
 *
 * The card lays out one to four by how many there are, each in a box of a
 * fixed ratio so nothing moves as it loads, under the session's own
 * numbers and before its moments, on a run's card and a lift's. A tap
 * opens the viewer at that photo: the photo whole, "2 of 3", a close
 * button that has focus, the arrow keys and a swipe between photos,
 * Escape to close with focus back on the photo that opened it, and each
 * photo named for a screen reader.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";
import type { PostPhoto } from "@/lib/postPhotos";
import { useActivityMedia } from "@/hooks/useActivityMedia";

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

const BUCKET =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/";
const photo = (n: number): PostPhoto => ({
  id: `Photo0000${n}`,
  url: `${BUCKET}post-photos%2Fauthor%2Fp1%2FPhoto0000${n}.jpg?alt=media&token=t`,
  w: n % 2 ? 1600 : 1200,
  h: n % 2 ? 1200 : 1600,
});
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(i + 1));

function post(
  activity: Record<string, unknown>,
  type: "run" | "workout" = "run"
): FeedItem {
  return {
    id: "p1",
    activityId: "p1",
    authorId: "author",
    authorName: "Maya Chen",
    type,
    summary: "Loop",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Maya Chen",
      type,
      distance: 8240,
      duration: 2621,
      avgPace: 318,
      ...activity,
    },
  } as FeedItem;
}

function renderCard(
  activity: Record<string, unknown>,
  type: "run" | "workout" = "run"
) {
  return render(
    <MemoryRouter>
      <ActivityCard feedItem={post(activity, type)} />
    </MemoryRouter>
  );
}

const grid = (container: HTMLElement) =>
  container.querySelector("[data-post-photos]") as HTMLElement | null;
const tiles = (container: HTMLElement) =>
  Array.from(grid(container)!.querySelectorAll("button"));

afterEach(() => {
  document.body.style.overflow = "";
});

describe("a post's photos on its card", () => {
  it("draws none when the post has none, or none of a photo's shape", () => {
    expect(grid(renderCard({}).container)).toBeNull();
    expect(
      grid(renderCard({ photos: [{ id: "x", url: "javascript:1" }] }).container)
    ).toBeNull();
  });

  it.each([
    [1, "grid-cols-1", ["aspect-[4/3]"]],
    [2, "grid-cols-2", ["aspect-square", "aspect-square"]],
    [3, "grid-cols-[2fr_1fr]", ["row-span-2", "", ""]],
    [
      4,
      "grid-cols-2",
      ["aspect-square", "aspect-square", "aspect-square", "aspect-square"],
    ],
  ])(
    "lays out %i photo(s) in its own grid, each box a fixed ratio",
    (count, gridClass, tileClasses) => {
      const { container } = renderCard({ photos: photos(count) });
      const box = grid(container)!;
      expect(box.dataset.postPhotos).toBe(String(count));
      expect(box.className).toContain(gridClass);
      expect(box.className).toMatch(/rounded-xl/);
      // Three take the 4:3 of one, so the card is the same height.
      if (count === 3) expect(box.className).toContain("aspect-[4/3]");
      const buttons = tiles(container);
      expect(buttons).toHaveLength(count);
      buttons.forEach((tile, i) => {
        for (const cls of tileClasses[i].split(" ").filter(Boolean))
          expect(tile.className).toContain(cls);
        const img = tile.querySelector("img")!;
        expect(img).toHaveAttribute("loading", "lazy");
        expect(img).toHaveAttribute("decoding", "async");
        expect(img.className).toMatch(/object-cover/);
        expect(img).toHaveAttribute("width", String(photos(count)[i].w));
        expect(img).toHaveAttribute("height", String(photos(count)[i].h));
        expect(img).toHaveAttribute(
          "alt",
          `Photo ${i + 1} of ${count} from Maya Chen's run`
        );
      });
    }
  );

  it("sits under the session's numbers and before its moments, on a lift's card too", () => {
    const { container } = renderCard(
      {
        photos: photos(2),
        totalVolume: 4200,
        moments: [{ kind: "firstSession" }],
      },
      "workout"
    );
    const box = grid(container)!;
    const volume = screen.getByText(/volume/i);
    expect(
      volume.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const moment = container.querySelector("[data-moment-tone]")!;
    expect(moment).not.toBeNull();
    expect(
      box.compareDocumentPosition(moment) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(box).getAllByRole("img")[0]).toHaveAttribute(
      "alt",
      "Photo 1 of 2 from Maya Chen's workout"
    );
  });

  it("leaves a quiet tile, not a broken image, when a photo fails to load", () => {
    const { container } = renderCard({ photos: photos(2) });
    const img = tiles(container)[1].querySelector("img")!;
    fireEvent.error(img);
    expect(tiles(container)[1].querySelector("img")).toBeNull();
    expect(tiles(container)[1]).toHaveAccessibleName(
      "Photo 2 of 2 from Maya Chen's run"
    );
  });

  it("keeps a photo tile named when the gateway provides no image", () => {
    vi.mocked(useActivityMedia).mockReturnValueOnce(undefined);
    const { container } = renderCard({ photos: photos(1) });
    const tile = tiles(container)[0];
    expect(tile.querySelector("img")).toBeNull();
    expect(tile).toHaveAccessibleName("Photo 1 of 1 from Maya Chen's run");
  });
});

describe("the full-screen viewer", () => {
  const open = (index: number, count = 3) => {
    const view = renderCard({ photos: photos(count) });
    const tile = tiles(view.container)[index];
    tile.focus();
    fireEvent.click(tile);
    return { ...view, tile };
  };
  const viewer = () =>
    screen.getByRole("dialog", { name: "Photos from Maya Chen's run" });
  const shown = () => within(viewer()).getByRole("img");

  it("opens at the photo tapped, whole, with its count and its name", () => {
    open(1);
    expect(viewer()).toHaveAttribute("aria-modal", "true");
    expect(within(viewer()).getByText("2 of 3")).toBeInTheDocument();
    expect(shown()).toHaveAttribute("alt", "Photo 2 of 3 from Maya Chen's run");
    expect(shown()).toHaveAttribute("src", `blob:${photo(2).url}`);
    expect(shown().className).toMatch(/object-contain/);
    // Over everything, on the dark stage, below the status bar.
    expect(viewer().className).toMatch(/fixed inset-0/);
    expect(viewer().className).toMatch(/bg-stage/);
    expect(viewer().className).toMatch(/--safe-top/);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("puts focus on Close, and keeps it inside", () => {
    open(0);
    const close = within(viewer()).getByRole("button", {
      name: "Close photos",
    });
    expect(document.activeElement).toBe(close);
    expect(close.className).toMatch(/size-11/);
  });

  it("moves between photos with the arrow keys and the buttons, and stops at the ends", () => {
    open(0);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(viewer()).getByText("2 of 3")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(viewer()).getByText("3 of 3")).toBeInTheDocument();
    expect(shown()).toHaveAttribute("alt", "Photo 3 of 3 from Maya Chen's run");
    const next = within(viewer()).getByRole("button", { name: "Next photo" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.click(next);
    expect(within(viewer()).getByText("3 of 3")).toBeInTheDocument();
    fireEvent.click(
      within(viewer()).getByRole("button", { name: "Previous photo" })
    );
    expect(within(viewer()).getByText("2 of 3")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(within(viewer()).getByText("1 of 3")).toBeInTheDocument();
  });

  it("moves with a swipe, and not with a short or upward drag", () => {
    open(0);
    const stage = shown().parentElement!;
    const drag = (fromX: number, toX: number, toY = 300) => {
      fireEvent.pointerDown(stage, { clientX: fromX, clientY: 300 });
      fireEvent.pointerUp(stage, { clientX: toX, clientY: toY });
    };
    drag(300, 200);
    expect(within(viewer()).getByText("2 of 3")).toBeInTheDocument();
    drag(300, 280);
    expect(within(viewer()).getByText("2 of 3")).toBeInTheDocument();
    drag(300, 240, 100);
    expect(within(viewer()).getByText("2 of 3")).toBeInTheDocument();
    drag(100, 300);
    expect(within(viewer()).getByText("1 of 3")).toBeInTheDocument();
  });

  it("closes on Escape and on Close, with focus back on the photo that opened it", () => {
    const { tile } = open(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(tile);
    expect(document.body.style.overflow).toBe("");

    act(() => {
      tile.focus();
      fireEvent.click(tile);
    });
    fireEvent.click(
      within(viewer()).getByRole("button", { name: "Close photos" })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has no arrows for a single photo", () => {
    open(0, 1);
    expect(within(viewer()).getByText("1 of 1")).toBeInTheDocument();
    expect(
      within(viewer()).queryByRole("button", { name: "Next photo" })
    ).toBeNull();
  });
});

vi.mock("@/hooks/useActivityMedia", () => ({
  useActivityMedia: vi.fn((url: string) => (url ? `blob:${url}` : undefined)),
}));
