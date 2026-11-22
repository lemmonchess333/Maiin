/**
 * The drawings a Live Activity and the Home Screen widgets show (Wid2
 * calls 1 and 5), by the names the widget extension holds them under.
 *
 * A Live Activity plays no clip, so its card shows one pose of the hero's
 * flipbook and changes it on each update. `npm run art:live-activity`
 * (`scripts/art/live-activity-art.ts`) cuts these frames into
 * `ios/App/LiveActivities/Assets.xcassets`, and the card names a pose in
 * its data, so the plugin draws it with no Swift of ours. The Today widget
 * draws the same images from the same catalog.
 *
 * This is the one list of them: the script reads it to cut the images and
 * `liveActivityArt.test.ts` checks that every name the app can send is in
 * the catalog at a size ActivityKit accepts.
 */
import { HERO_MOTION } from "./heroMotion.data";

/**
 * Which frames of each flipbook are poses, in the order they are shown.
 *
 * The runner's four are a quarter of its 36-frame stride apart. A lift's
 * three are a rep's set up, its middle and its end ("set up, lifting,
 * standing", Wid2 call 1): each of the 24 lead lifts' flipbooks is one
 * 34-frame rep that starts and ends on the same frame, with the other end
 * of the movement at frame 17, so a lift whose clip starts at the top (a
 * press locked out, a row pulled in) is read from 17 round to 0. Which end
 * a clip starts on was read off the frames by eye.
 */
export const LIVE_ACTIVITY_POSES = {
  "run-easy": [0, 9, 18, 27],
  "arnold-press": [17, 25, 0],
  "barbell-row": [17, 25, 0],
  "bench-press": [17, 25, 0],
  "bulgarian-split": [0, 8, 17],
  "chest-press-machine": [0, 8, 17],
  "chest-supported-db-row": [17, 25, 0],
  "db-bench": [17, 25, 0],
  "db-rdl": [0, 8, 17],
  "db-row": [17, 25, 0],
  "db-shoulder-press": [0, 8, 17],
  deadlift: [0, 8, 17],
  "glute-bridge": [17, 25, 0],
  "goblet-squat": [0, 8, 17],
  "hip-thrust": [17, 25, 0],
  "incline-db-press": [17, 25, 0],
  "inverted-row": [0, 8, 17],
  "kettlebell-swing": [17, 25, 0],
  "landmine-press": [17, 25, 0],
  "overhead-press": [17, 25, 0],
  "pull-ups": [0, 8, 17],
  "romanian-deadlift": [0, 8, 17],
  "shoulder-press-machine": [17, 25, 0],
  squat: [0, 8, 17],
  "trap-bar-deadlift": [0, 8, 17],
} as const satisfies Record<string, readonly number[]>;

export type LiveActivityArtId = keyof typeof LIVE_ACTIVITY_POSES;

/** The lead lifts with a drawing outside the app: every one but the runner. */
export type LiftArtId = Exclude<LiveActivityArtId, "run-easy">;

/** A lift's three poses, by what each shows (Wid2 call 1). */
export const LIFT_POSE = { setUp: 0, lifting: 1, standing: 2 } as const;

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

/** A drawing's width at `height` points, from its flipbook's frame. */
export function poseWidthPt(id: LiveActivityArtId, height: number): number {
  const sheet = HERO_MOTION[`form-art/${id}.webp`];
  return Math.round((height * sheet.frameWidth) / sheet.frameHeight);
}

/** The widest a drawing stands beside the card's words, in points: a lift
 *  done lying down (a glute bridge is nearly twice as wide as it is tall)
 *  is drawn shorter rather than crowding the figure. A Tropos heuristic:
 *  the card's 371 pt less its margins, this and the gap leave about 200 pt
 *  for "100 kg × 5" at 30 pt. */
export const POSE_MAX_WIDTH_PT = 120;

/** The box a drawing is drawn in, `height` tall at most: the plugin draws
 *  an image in the box the layout gives it, so the box takes the frame's
 *  own shape. */
export function poseBoxPt(
  id: LiveActivityArtId,
  height: number
): { width: number; height: number } {
  const width = poseWidthPt(id, height);
  if (width <= POSE_MAX_WIDTH_PT) return { width, height };
  return {
    width: POSE_MAX_WIDTH_PT,
    height: Math.round((height * POSE_MAX_WIDTH_PT) / width),
  };
}

/**
 * The drawing outside the app for a lift whose still cut-out is `still`
 * (`sessionLeadArt`'s `cutout.src`, "form-art/deadlift.webp"): the lift
 * whose flipbook Home's hero plays, when it is one of the 24. Null for a
 * lead lift with no flipbook, which shows no drawing rather than another
 * lift's.
 */
export function liftArtFor(still: string | null | undefined): LiftArtId | null {
  if (!still) return null;
  const sheet = HERO_MOTION[still.replace(/^\//, "")];
  const id = sheet?.src.match(/^form-art\/motion\/([a-z0-9-]+)\.webp$/)?.[1];
  return id && id !== "run-easy" && id in LIVE_ACTIVITY_POSES
    ? (id as LiftArtId)
    : null;
}
