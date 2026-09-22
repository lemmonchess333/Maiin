/**
 * ProDemoVideo — the recording plays only when it is the right thing to
 * play, and the drawn frames hold the surface every other time.
 *
 * Pins the four fallbacks (empty manifest, reduced motion, data saver,
 * every source failed), the poster-until-first-frame handoff, the
 * one-loop rule (the fallback unmounts once video plays), the autoplay
 * attributes mobile Safari requires, and that every manifest entry is a
 * file on disk — a listed file that is missing would be absorbed by the
 * load-failure fallback and nobody would notice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";
import ProDemoVideo from "../ProDemoVideo";
import { PRO_DEMO_SOURCES, publicUrl } from "../proDemoVideoManifest";

const SOURCES = [
  { path: "pro-demo/scan.mp4", type: "video/mp4" as const },
  { path: "pro-demo/scan.webm", type: "video/webm" as const },
];
const LABEL = "Sample: Pro reading a plate";

function renderDemo(sources = SOURCES) {
  return render(
    <ProDemoVideo
      sources={sources}
      label={LABEL}
      fallback={<p data-testid="poster">the drawn frames</p>}
    />
  );
}

function setSaveData(on: boolean | undefined) {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: on === undefined ? undefined : { saveData: on },
  });
}

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
  setSaveData(undefined);
});
afterEach(cleanup);

describe("ProDemoVideo — when the recording is not the thing to play", () => {
  it("an empty manifest renders the drawn frames and no video", () => {
    renderDemo([]);
    expect(screen.getByTestId("poster")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("reduced motion renders the drawn frames and no video", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    renderDemo();
    expect(screen.getByTestId("poster")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("data saver renders the drawn frames and no video", () => {
    setSaveData(true);
    renderDemo();
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByTestId("poster")).toBeInTheDocument();
  });

  it("a connection without data saver still plays", () => {
    setSaveData(false);
    renderDemo();
    expect(document.querySelector("video")).not.toBeNull();
  });
});

describe("ProDemoVideo — playing", () => {
  it("holds the drawn frames as the poster until the first frame decodes, then plays alone", () => {
    const { container } = renderDemo();
    const video = document.querySelector("video")!;
    expect(screen.getByTestId("poster")).toBeInTheDocument();
    expect(container.firstElementChild!.getAttribute("data-demo-state")).toBe(
      "loading"
    );
    fireEvent.loadedData(video);
    // One ambient loop per surface: the scan frame's loop leaves when
    // the video's begins.
    expect(screen.queryByTestId("poster")).toBeNull();
    expect(container.firstElementChild!.getAttribute("data-demo-state")).toBe(
      "playing"
    );
    expect(screen.getByLabelText(LABEL)).toBe(video);
  });

  it("carries the attributes mobile Safari needs to autoplay, and no sound", () => {
    renderDemo();
    const video = document.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.hasAttribute("controls")).toBe(false);
  });

  it("offers every source in order, resolved against the app base", () => {
    renderDemo();
    const srcs = Array.from(document.querySelectorAll("source")).map((s) => [
      s.getAttribute("src"),
      s.getAttribute("type"),
    ]);
    expect(srcs).toEqual([
      [publicUrl("pro-demo/scan.mp4"), "video/mp4"],
      [publicUrl("pro-demo/scan.webm"), "video/webm"],
    ]);
  });

  it("when the last source fails, the drawn frames take the surface and the video goes", () => {
    renderDemo();
    const sources = document.querySelectorAll("source");
    // The first miss means "try the next one"; not a failure.
    fireEvent.error(sources[0]);
    expect(document.querySelector("video")).not.toBeNull();
    fireEvent.error(sources[1]);
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByTestId("poster")).toBeInTheDocument();
  });
});

describe("ProDemoVideo — the manifest", () => {
  it("every listed recording is a file under public/", () => {
    for (const s of PRO_DEMO_SOURCES) {
      const file = resolve(__dirname, "../../../../public", s.path);
      expect(existsSync(file), s.path).toBe(true);
      expect(s.path.startsWith("pro-demo/")).toBe(true);
    }
  });

  it("MP4 leads any WebM, so Safari never has to skip a source it cannot play", () => {
    const types = PRO_DEMO_SOURCES.map((s) => s.type);
    const webm = types.indexOf("video/webm");
    const mp4 = types.indexOf("video/mp4");
    if (webm !== -1) expect(mp4).toBeGreaterThanOrEqual(0);
    if (webm !== -1) expect(mp4).toBeLessThan(webm);
  });
});
