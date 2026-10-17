import type { FormBeat } from "./formGuides";

/**
 * The running form guide: a runner coming straight toward the viewer, one
 * step and then the other. From the front, the second drawing is the first
 * mirrored, so the six frames alternate the two steps while the cues work
 * through the form points. Train's run card opens it from its runner
 * (`RunFormSheet`). Sources and provenance: docs/exercise-art/run-form.
 */
export const RUN_FORM_BEATS: readonly FormBeat[] = [
  {
    t: 0,
    label: "Land",
    cue: "Land under your hips, not out front.",
    image: "run-form/1.webp",
  },
  {
    t: 0.5,
    label: "Arms",
    cue: "Swing arms front to back, not across.",
    image: "run-form/2.webp",
  },
  {
    t: 0,
    label: "Tall",
    cue: "Run tall with a slight forward lean.",
    image: "run-form/3.webp",
  },
  {
    t: 0.5,
    label: "Relax",
    cue: "Relax your shoulders, hands and jaw.",
    image: "run-form/4.webp",
  },
  {
    t: 0,
    label: "Quick feet",
    cue: "Take quick, light steps.",
    image: "run-form/5.webp",
  },
  {
    t: 0.5,
    label: "Breathe",
    cue: "Keep your breathing steady and relaxed.",
    image: "run-form/6.webp",
  },
];
