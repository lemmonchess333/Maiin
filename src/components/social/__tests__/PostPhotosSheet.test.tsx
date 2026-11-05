/**
 * PostPhotosSheet — the photos on one of your shared sessions (Soc15
 * call 2): add up to four, take any off.
 *
 * What a person depends on:
 *   - a post holds four at most: picking more adds the first that fit and
 *     says so, and a full post offers no Add;
 *   - taking one off sends that photo's id and shows the shorter list;
 *   - offline, Add and remove are off, and the sheet says why;
 *   - a refused photo gets the screen's sentence, any other failure a plain
 *     one and Try again, which sends the failed photos again;
 *   - a restricted account adds to its private post only.
 *
 * The uploader is mocked at its module (postPhotoUpload.test.ts holds what
 * it does); this suite is what the sheet does with its answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const h = vi.hoisted(() => ({
  restricted: false,
  needsVerification: false,
}));

vi.mock("@/lib/firebase", () => ({ db: {}, storage: {}, functions: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "maya", emailVerified: true } }),
  useUid: () => "maya",
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: h.restricted, loading: false }),
}));
vi.mock("@/hooks/useEmailVerificationGate", () => ({
  useEmailVerificationGate: () => ({
    needsVerification: h.needsVerification,
    recheck: vi.fn(async () => false),
  }),
}));
vi.mock("@/lib/postPhotoUpload", () => ({
  addPostPhotos: vi.fn(),
  removePostPhoto: vi.fn(),
}));

import PostPhotosSheet from "../PostPhotosSheet";
import { POST_PHOTOS_COPY } from "../postPhotosCopy";
import { addPostPhotos, removePostPhoto } from "@/lib/postPhotoUpload";
import { PHOTO_REFUSED_MESSAGE } from "@/lib/photoScreen";
import type { PostPhoto } from "@/lib/postPhotos";

const photo = (n: number): PostPhoto => ({
  id: `Photo0000${n}`,
  url: `https://firebasestorage.googleapis.com/v0/b/b/o/post-photos%2Fmaya%2Fpost-1%2FPhoto0000${n}.jpg`,
  w: 1600,
  h: 1200,
});
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(i + 1));
const file = (name: string) =>
  new File([new Uint8Array(4)], name, { type: "image/jpeg" });

let online: ReturnType<typeof vi.spyOn>;

function renderSheet({
  current = [] as PostPhoto[],
  visibility = "public",
  onPhotosChange = vi.fn(),
} = {}) {
  render(
    <PostPhotosSheet
      open
      onOpenChange={() => {}}
      activityId="post-1"
      photos={current}
      onPhotosChange={onPhotosChange}
      visibility={visibility}
    />
  );
  return { onPhotosChange };
}

const input = () => screen.getByTestId("post-photos-input") as HTMLInputElement;
const pick = (files: File[]) =>
  act(async () => {
    fireEvent.change(input(), { target: { files } });
  });

beforeEach(() => {
  h.restricted = false;
  h.needsVerification = false;
  vi.mocked(addPostPhotos).mockReset();
  vi.mocked(removePostPhoto).mockReset();
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  online.mockRestore();
});

describe("PostPhotosSheet", () => {
  it("adds what was picked, in order, and shows the post's new list", async () => {
    const next = [photo(1), photo(2), photo(3)];
    vi.mocked(addPostPhotos).mockResolvedValue({
      photos: next,
      added: 2,
      refused: 0,
      failed: [],
    });
    const { onPhotosChange } = renderSheet({ current: [photo(1)] });
    expect(input()).toHaveAttribute("accept", "image/*");
    expect(input()).toHaveAttribute("multiple");
    const a = file("a.jpg");
    const b = file("b.jpg");
    await pick([a, b]);
    expect(addPostPhotos).toHaveBeenCalledWith({
      uid: "maya",
      activityId: "post-1",
      current: [photo(1)],
      files: [a, b],
    });
    await waitFor(() => expect(onPhotosChange).toHaveBeenCalledWith(next));
    expect(screen.getByRole("status")).toHaveTextContent("Added 2 photos.");
  });

  it("adds no more than four: the first that fit, and it says so", async () => {
    vi.mocked(addPostPhotos).mockResolvedValue({
      photos: photos(4),
      added: 1,
      refused: 0,
      failed: [],
    });
    renderSheet({ current: photos(3) });
    const first = file("first.jpg");
    await pick([first, file("second.jpg"), file("third.jpg")]);
    expect(vi.mocked(addPostPhotos).mock.calls[0][0].files).toEqual([first]);
    expect(
      await screen.findByText(
        "A post holds up to 4 photos, so 2 photos you picked weren't added."
      )
    ).toBeInTheDocument();
  });

  it("offers no Add on a post with four, and says why", () => {
    renderSheet({ current: photos(4) });
    expect(
      screen.queryByRole("button", { name: POST_PHOTOS_COPY.add })
    ).toBeNull();
    expect(screen.getByText(POST_PHOTOS_COPY.full)).toBeInTheDocument();
    // Each photo can still be taken off.
    expect(
      screen.getAllByRole("button", { name: /^Remove photo/ })
    ).toHaveLength(4);
  });

  it("takes a photo off by its id and shows the shorter list", async () => {
    vi.mocked(removePostPhoto).mockResolvedValue([photo(1), photo(3)]);
    const { onPhotosChange } = renderSheet({ current: photos(3) });
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 2" }));
    await waitFor(() =>
      expect(onPhotosChange).toHaveBeenCalledWith([photo(1), photo(3)])
    );
    expect(removePostPhoto).toHaveBeenCalledWith({
      uid: "maya",
      activityId: "post-1",
      current: photos(3),
      photoId: "Photo00002",
    });
  });

  it("offline, Add and remove are off, and it says why", () => {
    online.mockReturnValue(false);
    renderSheet({ current: photos(2) });
    expect(
      screen.getByRole("button", { name: POST_PHOTOS_COPY.add })
    ).toBeDisabled();
    expect(screen.getByText(POST_PHOTOS_COPY.offline)).toBeInTheDocument();
    for (const remove of screen.getAllByRole("button", {
      name: /^Remove photo/,
    }))
      expect(remove).toBeDisabled();
  });

  it("goes back on when the connection does", async () => {
    online.mockReturnValue(false);
    renderSheet();
    const add = screen.getByRole("button", { name: POST_PHOTOS_COPY.add });
    expect(add).toBeDisabled();
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(add).toBeEnabled();
    expect(screen.queryByText(POST_PHOTOS_COPY.offline)).toBeNull();
  });

  it("says a refused photo can't be used, and keeps the ones that passed", async () => {
    vi.mocked(addPostPhotos).mockResolvedValue({
      photos: [photo(1)],
      added: 1,
      refused: 1,
      failed: [],
    });
    const { onPhotosChange } = renderSheet();
    await pick([file("good.jpg"), file("refused.jpg")]);
    expect(await screen.findByText(PHOTO_REFUSED_MESSAGE)).toBeInTheDocument();
    expect(onPhotosChange).toHaveBeenCalledWith([photo(1)]);
    // A refused photo is not offered again.
    expect(
      screen.queryByRole("button", { name: POST_PHOTOS_COPY.retry })
    ).toBeNull();
  });

  it("says plainly when a photo could not be added, and Try again sends it again", async () => {
    const dropped = file("dropped.jpg");
    vi.mocked(addPostPhotos)
      .mockResolvedValueOnce({
        photos: [photo(1)],
        added: 1,
        refused: 0,
        failed: [dropped],
      })
      .mockResolvedValueOnce({
        photos: [photo(1), photo(2)],
        added: 1,
        refused: 0,
        failed: [],
      });
    const { onPhotosChange } = renderSheet();
    await pick([file("good.jpg"), dropped]);
    expect(
      await screen.findByText(
        "Couldn't add 1 photo. Check your connection and try again."
      )
    ).toBeInTheDocument();
    expect(onPhotosChange).toHaveBeenCalledWith([photo(1)]);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: POST_PHOTOS_COPY.retry })
      );
    });
    expect(vi.mocked(addPostPhotos).mock.calls[1][0].files).toEqual([dropped]);
  });

  it("a restricted account adds to its private post only, and can still take photos off", () => {
    h.restricted = true;
    renderSheet({ current: photos(1), visibility: "public" });
    expect(
      screen.queryByRole("button", { name: POST_PHOTOS_COPY.add })
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Contact support" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove photo 1" })
    ).toBeEnabled();
    cleanup();
    renderSheet({ current: photos(1), visibility: "private" });
    expect(
      screen.getByRole("button", { name: POST_PHOTOS_COPY.add })
    ).toBeEnabled();
  });

  it("an account that must verify its email adds none", () => {
    h.needsVerification = true;
    renderSheet();
    expect(
      screen.queryByRole("button", { name: POST_PHOTOS_COPY.add })
    ).toBeNull();
  });
});
