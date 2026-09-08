import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No network or Firebase: every fetch is intercepted before loading the
// resolver. A never-resolving fake models a stalled optional photo service.
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe("local form guides do not depend on remote reference photos", () => {
  it("returns authored instructions immediately when the caller has its own rig/frames", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { getExerciseDemo } = await import("../exerciseDemo");
    const resolved = vi.fn();
    void getExerciseDemo("Bench Press", { preferLocal: true }).then(resolved);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bench Press",
        instructions: expect.arrayContaining([expect.any(String)]),
        mediaKind: "none",
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps reviewed local media without waiting for an unused photo lookup", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { EXERCISES } = await import("../exercises");
    const exercise = EXERCISES.find((e) => e.id === "bench-press")!;
    const oldMedia = exercise.media;
    exercise.media = ["form-frames/test/1.webp"];
    try {
      const { getExerciseDemo } = await import("../exerciseDemo");
      const resolved = vi.fn();
      void getExerciseDemo("Bench Press").then(resolved);
      await Promise.resolve();
      expect(resolved).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Bench Press",
          mediaKind: "vetted-sequence",
          images: [expect.stringContaining("form-frames/test/1.webp")],
        })
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      exercise.media = oldMedia;
    }
  });

  it("preserves the remote reference-only fallback for an unknown local exercise", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [
        {
          name: "Remote Example",
          images: ["remote/0.jpg", "remote/1.jpg"],
          instructions: ["Reference instructions"],
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getExerciseDemo } = await import("../exerciseDemo");
    const result = await getExerciseDemo("Remote Example", {
      preferLocal: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.mediaKind).toBe("reference-photos");
  });
});
