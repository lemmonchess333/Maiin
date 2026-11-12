/**
 * The drawings a Live Activity shows (Wid2 call 1), by the names the
 * widget extension holds them under.
 *
 * A Live Activity plays no clip, so its card shows one pose of the hero's
 * flipbook and changes it on each update. `npm run art:live-activity`
 * (`scripts/art/live-activity-art.ts`) cuts these frames into
 * `ios/App/LiveActivities/Assets.xcassets`, and the card names a pose in
 * its data, so the plugin draws it with no Swift of ours.
 *
 * This is the one list of them: the script reads it to cut the images and
 * `liveActivityArt.test.ts` checks that every name the app can send is in
 * the catalog at a size ActivityKit accepts.
 */

/** Which frames of each flipbook are poses, in the order they are shown.
 *  The runner's four are a quarter of its 36-frame stride apart. */
export const LIVE_ACTIVITY_POSES = {
  "run-easy": [0, 9, 18, 27],
} as const satisfies Record<string, readonly number[]>;

export type LiveActivityArtId = keyof typeof LIVE_ACTIVITY_POSES;

/** A pose's height on the card, in points. ActivityKit refuses a card
 *  whose image is larger than the card, and the Lock Screen card is at
 *  most 160 pt tall with 14 pt margins. */
export const POSE_HEIGHT_PT = 96;

/** The asset's name in the extension's catalog. */
export function poseAssetName(id: LiveActivityArtId, pose: number): string {
  return `${id}-pose-${pose + 1}`;
}

/** The name of the pose `step` updates in, going round the drawing's poses. */
export function poseAt(id: LiveActivityArtId, step: number): string {
  const count = LIVE_ACTIVITY_POSES[id].length;
  return poseAssetName(id, ((step % count) + count) % count);
}
