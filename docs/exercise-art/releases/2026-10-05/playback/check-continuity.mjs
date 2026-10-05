// Read-only video input. Writes one evidence report; never changes video or UI.
// Usage: node check-continuity.mjs <video.webm> <declared-range.json> <report.json>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

assert(
  process.argv.length === 5,
  "Usage: node check-continuity.mjs <video.webm> <declared-range.json> <report.json>"
);
const [videoPath, rangePath, reportPath] = process.argv
  .slice(2)
  .map((p) => resolve(p));
const self = fileURLToPath(import.meta.url),
  here = dirname(self);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pin = (path) => {
  const bytes = readFileSync(path);
  return { name: basename(path), sha256: hash(bytes), bytes: bytes.length };
};
assert(
  ![videoPath, rangePath, self, resolve(here, "profile.json")].includes(
    reportPath
  ),
  "Output must not overwrite an input"
);
const profilePath = resolve(here, "profile.json"),
  profile = JSON.parse(readFileSync(profilePath));
const range = JSON.parse(readFileSync(rangePath));
const videoPin = pin(videoPath),
  rangePin = pin(rangePath),
  profilePin = pin(profilePath),
  helperPin = pin(self);
assert.equal(
  range.videoSha256,
  videoPin.sha256,
  "Declared range belongs to a different video"
);
assert.equal(
  range.profileSha256,
  profilePin.sha256,
  "Declared range must pin the same fixed profile before and after"
);
assert(
  Number.isFinite(range.startSeconds) && Number.isFinite(range.endSeconds)
);
assert(
  range.startSeconds >= 0 &&
    range.endSeconds - range.startSeconds >=
      profile.minimumDeclaredReviewDurationSeconds,
  "Declare at least one nominal7.2s cycle, excluding page load"
);
assert(
  typeof range.reason === "string" && range.reason.trim().length > 30,
  "Document manual range selection and its complete-cycle evidence"
);
assert.equal(range.pageLoadExcluded, true);
const command = (tool, args, maxBuffer = 32 * 1024 * 1024) => {
  const result = spawnSync(tool, args, { maxBuffer });
  assert(!result.error, `${tool}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${tool}: ${result.stderr?.toString()}`);
  return result.stdout;
};
const probeArgs = [
  "-v",
  "error",
  "-select_streams",
  "v:0",
  "-show_streams",
  "-show_format",
  "-show_frames",
  "-show_entries",
  "frame=best_effort_timestamp,best_effort_timestamp_time,pkt_duration,pkt_duration_time,key_frame,pict_type",
  "-of",
  "json",
  videoPath,
];
const probeBytes = command("ffprobe", probeArgs),
  probe = JSON.parse(probeBytes);
assert.equal(probe.streams.length, 1);
const stream = probe.streams[0];
assert.deepEqual(
  [stream.width, stream.height],
  profile.encodedDimensions,
  "Unsupported video geometry; no automatic ROI relocation"
);
assert.equal(
  stream.sample_aspect_ratio,
  "1:1",
  "Unsupported non-square video pixels"
);
const duration = Number(probe.format.duration);
assert(
  Number.isFinite(duration) && range.endSeconds <= duration + 0.000001,
  "Declared range leaves the video"
);
const [left, top, width, height] = profile.roi;
assert(
  profile.roi.every(Number.isInteger) &&
    left >= 0 &&
    top >= 0 &&
    width > 0 &&
    height > 0 &&
    left + width <= stream.width &&
    top + height <= stream.height
);
const frameMetadata = probe.frames.map((frame, index) => ({
  index,
  pts: Number(frame.best_effort_timestamp),
  ptsSeconds: Number(frame.best_effort_timestamp_time),
  packetDurationSeconds: Number(frame.pkt_duration_time),
  keyFrame: frame.key_frame,
  pictureType: frame.pict_type,
}));
assert(frameMetadata.length > 0);
for (const [index, frame] of frameMetadata.entries()) {
  assert(Number.isFinite(frame.ptsSeconds));
  if (index)
    assert(
      frame.ptsSeconds > frameMetadata[index - 1].ptsSeconds,
      "PTS must be strictly increasing"
    );
}
assert(
  range.startSeconds >= frameMetadata[0].ptsSeconds,
  "Review begins before the first encoded frame"
);
// Format before crop avoids chroma alignment changing an odd-sized ROI.
const decodeArgs = [
  "-v",
  "error",
  "-i",
  videoPath,
  "-map",
  "0:v:0",
  "-an",
  "-sn",
  "-dn",
  "-vf",
  `format=rgb24,crop=${width}:${height}:${left}:${top}`,
  "-vsync",
  "0",
  "-pix_fmt",
  "rgb24",
  "-f",
  "rawvideo",
  "pipe:1",
];
const frameBytes = width * height * 3;
const raw = command(
  "ffmpeg",
  decodeArgs,
  frameBytes * (frameMetadata.length + 2)
);
assert.equal(
  raw.length,
  frameBytes * frameMetadata.length,
  "Decoder/probe frame count mismatch; no skipping or frame resampling permitted"
);
const frames = frameMetadata.map((frame, index) => {
  const endSeconds =
    index + 1 < frameMetadata.length
      ? frameMetadata[index + 1].ptsSeconds
      : Math.min(
          duration,
          frame.ptsSeconds +
            (Number.isFinite(frame.packetDurationSeconds) &&
            frame.packetDurationSeconds > 0
              ? frame.packetDurationSeconds
              : 0)
        );
  assert(endSeconds > frame.ptsSeconds, "Missing final-frame duration");
  const rgb = raw.subarray(index * frameBytes, (index + 1) * frameBytes);
  let brightPixels = 0,
    sum = 0,
    maximumChannelValue = 0;
  for (let p = 0; p < rgb.length; p += 3) {
    const channelSum = rgb[p] + rgb[p + 1] + rgb[p + 2];
    if (channelSum >= profile.brightPixelChannelSumMinimum) brightPixels++;
    sum += channelSum;
    maximumChannelValue = Math.max(
      maximumChannelValue,
      rgb[p],
      rgb[p + 1],
      rgb[p + 2]
    );
  }
  const brightFraction = brightPixels / (width * height);
  const intervalSeconds = endSeconds - frame.ptsSeconds;
  const reviewed =
    frame.ptsSeconds < range.endSeconds && endSeconds > range.startSeconds;
  const failureReasons = [];
  if (brightFraction < profile.minimumBrightFraction)
    failureReasons.push("low-stage-content");
  if (brightFraction > profile.maximumBrightFraction)
    failureReasons.push("unexpected-overbright-stage");
  if (intervalSeconds > profile.maximumEncodedFrameIntervalSeconds + 0.000001)
    failureReasons.push("encoded-coverage-gap");
  return {
    ...frame,
    endSeconds,
    intervalSeconds,
    reviewed,
    roiRgbSha256: hash(rgb),
    brightPixels,
    brightFraction,
    meanChannelValue: sum / rgb.length,
    maximumChannelValue,
    failureReasons,
  };
});
const reviewed = frames.filter((frame) => frame.reviewed);
assert(reviewed.length > 0);
assert(
  reviewed[0].ptsSeconds <= range.startSeconds &&
    reviewed.at(-1).endSeconds >= range.endSeconds - 0.000001,
  "Encoded frames do not cover declared range"
);
const failures = reviewed.filter((frame) => frame.failureReasons.length);
const summary = {
  encodedFrameCount: frames.length,
  reviewedFrameCount: reviewed.length,
  skippedEncodedFramesDuringDecode: 0,
  firstReviewedPtsSeconds: reviewed[0].ptsSeconds,
  lastReviewedPtsSeconds: reviewed.at(-1).ptsSeconds,
  declaredDurationSeconds: range.endSeconds - range.startSeconds,
  flaggedFrames: failures.length,
  flaggedFrameIndices: failures.map((frame) => frame.index),
  flaggedPtsSeconds: failures.map((frame) => frame.ptsSeconds),
  lowestReviewedBrightPixelCount: Math.min(
    ...reviewed.map((frame) => frame.brightPixels)
  ),
  highestReviewedBrightPixelCount: Math.max(
    ...reviewed.map((frame) => frame.brightPixels)
  ),
  maximumReviewedEncodedIntervalSeconds: Math.max(
    ...reviewed.map((frame) => frame.intervalSeconds)
  ),
};
// Detect concurrent replacement of any input before saving a result.
for (const [path, expected] of [
  [videoPath, videoPin],
  [rangePath, rangePin],
  [profilePath, profilePin],
  [self, helperPin],
])
  assert.equal(
    pin(path).sha256,
    expected.sha256,
    `Input changed during analysis: ${basename(path)}`
  );
const portableArgs = (args) =>
  args.map((arg) => (arg === videoPath ? "<input-video>" : arg));
const report = {
  schemaVersion: 1,
  status: failures.length
    ? "fail-encoded-stage-continuity"
    : "pass-encoded-stage-continuity-in-declared-range",
  releaseApproved: false,
  nativeVisualReviewRequired: true,
  video: videoPin,
  helper: helperPin,
  profile: { ...profilePin, settings: profile },
  declaredRange: { ...rangePin, declaration: range },
  codec: {
    name: stream.codec_name,
    longName: stream.codec_long_name,
    pixelFormat: stream.pix_fmt,
    encodedDimensions: [stream.width, stream.height],
    timeBase: stream.time_base,
    nominalFrameRate: stream.r_frame_rate,
    averageFrameRate: stream.avg_frame_rate,
    durationSeconds: duration,
  },
  tools: {
    ffmpeg: command("ffmpeg", ["-version"]).toString().split("\n")[0],
    ffprobe: command("ffprobe", ["-version"]).toString().split("\n")[0],
  },
  commands: {
    probe: ["ffprobe", ...portableArgs(probeArgs)],
    decode: ["ffmpeg", ...portableArgs(decodeArgs)],
  },
  decode: {
    format: "RGB24",
    unscaled: true,
    roiOnly: true,
    allEncodedFrames: true,
    resampling: false,
    roiBytesPerFrame: frameBytes,
    totalDecodedBytes: raw.length,
    concatenatedRoiRgbSha256: hash(raw),
  },
  summary,
  failedFrames: failures,
  perEncodedFrame: frames,
  limitations: profile.limitations,
};
const formatted = await format(JSON.stringify(report), {
  ...(await resolveConfig(self)),
  parser: "json",
});
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, formatted);
console.log(
  JSON.stringify(
    {
      report: reportPath,
      sha256: hash(formatted),
      status: report.status,
      ...summary,
    },
    null,
    2
  )
);
process.exitCode = failures.length ? 1 : 0;
