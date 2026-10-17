export type FormFramePlayback = "loop" | "forward-and-reverse";

const LOOP = [0, 1, 2, 3, 4, 5] as const;
const FORWARD_AND_REVERSE = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1] as const;

/** Six authored checkpoints can show both ascent and controlled descent. */
export const getFormFrameOrder = (
  playback: FormFramePlayback = "loop"
): readonly number[] =>
  playback === "forward-and-reverse" ? FORWARD_AND_REVERSE : LOOP;
