import { getAuthoredBeats } from "./bodyRig";
import { EXERCISES } from "./exercises";
import { validateCableLadder, type CableMachineLadder } from "./formArtCable";

export interface FormArtScene {
  exerciseId: string;
  status: "draft" | "reviewed";
  reference: string;
  variation: string;
  camera: string;
  anchors: string;
  equipment: string;
  primary: string;
  secondary: string;
  stabilisers: string;
  techniqueSources: string[];
  states: { body: string; equipment: string; cableAndStack: string }[];
  loopBoundary: string;
  cable?: CableMachineLadder;
}

export const FORM_ART_STYLE = {
  version: "anatomy-v1",
  reference: "public/form-frames/barbell-row/1.webp",
  primary: "#7045F5",
  secondary: "#C5B5ED",
  stabilisers: "#E1D8F2",
} as const;

export function buildFormArtPrompt(id: string, scene: FormArtScene): string {
  const exercise = EXERCISES.find((item) => item.id === id);
  const beats = getAuthoredBeats(id);
  if (!exercise || scene.exerciseId !== id)
    throw new Error("An exact catalogue exercise ID is required.");
  if (scene.status !== "reviewed")
    throw new Error("Review the physical scene before generating art.");
  if (
    beats?.length !== 6 ||
    beats.some(
      (beat) =>
        !beat.label.trim() ||
        !beat.cue.trim() ||
        !Number.isFinite(beat.t) ||
        beat.t < 0 ||
        beat.t > 1
    )
  )
    throw new Error(
      "Author exactly six valid movement beats first; catalogue instructions are not a substitute."
    );
  for (const key of [
    "reference",
    "variation",
    "camera",
    "anchors",
    "equipment",
    "primary",
    "secondary",
    "stabilisers",
    "loopBoundary",
  ] as const)
    if (!scene[key]?.trim() || /\bTODO\b|\[[A-Z_ ]+\]/.test(scene[key]))
      throw new Error(`Complete scene ${key}.`);
  if (
    !scene.techniqueSources?.length ||
    scene.techniqueSources.some((source) => !/^https:\/\//.test(source))
  )
    throw new Error(
      "Record the technique sources used to review this variation."
    );
  if (
    scene.states?.length !== 6 ||
    scene.states.some(
      (state) =>
        !state ||
        [state.body, state.equipment, state.cableAndStack].some(
          (value) => !value?.trim()
        )
    )
  )
    throw new Error("Write six physical body and equipment states.");
  if (/cable/i.test(exercise.equipment) && !scene.cable)
    throw new Error(
      "Cable exercises require an explicit pulley and stack ladder."
    );
  if (scene.cable) {
    const errors = validateCableLadder(scene.cable);
    if (errors.length) throw new Error(errors.join("\n"));
  }
  return `MASTER EXERCISE IMAGE PROMPT — ${exercise.name}
Use case: scientific-educational. Asset: six separate anatomical exercise stills.
EXACT VARIATION: ${scene.variation}
CANONICAL STYLE REFERENCE: ${FORM_ART_STYLE.reference}
SCENE REFERENCE: ${scene.reference}
CAMERA: ${scene.camera}
FIXED ANCHORS: ${scene.anchors}
EQUIPMENT: ${scene.equipment}

LOCKED ATHLETE
Same bald, faceless, muscular anatomical male as the canonical reference.
White/light-grey body, crisp muscle separation, fine dark contours, polished 2D
anatomical illustration on black. Same white shoes, proportions, muscle density,
head, hands, feet, limb thickness, line weight and shading. No redesign, hair,
photorealistic skin, painterly texture or extra clothing. Purple never changes muscle size.

COLOUR HIERARCHY
Primary (${FORM_ART_STYLE.primary}): ${scene.primary}
Secondary (${FORM_ART_STYLE.secondary}): ${scene.secondary}
Stabilisers (${FORM_ART_STYLE.stabilisers}): ${scene.stabilisers}
Use stable qualitative contribution colours, not a claim of measured activation.
Keep anatomy visible and highlights consistent across the six frames. Do not
dim all muscles simply because the movement is returning; no unrelated highlights.

SIX SEPARATE FRAMES
Each full-quality image must share one canvas, crop, camera, scale, perspective,
lighting, floor and equipment geometry. Make one master, check it, then EDIT THE
NEAREST ACCEPTABLE FRAME. Move only the joints and equipment that must move.
Never make a contact sheet, collage or grid to crop/upscale. No blurred edges.
Keep bar length, plate count/diameter/thickness, grip width and machine dimensions.
Use a modest illustrative load: one identical plate on each barbell side unless
the authored variation below requires otherwise. No weight numbering.
Both hands must retain physical contact; no floating grip, disappearing cable,
bending rigid bar, changing attachments, or fixed machine parts moving.
${
  scene.cable
    ? `
CABLE CONTRACT
Routing: ${scene.cable.routing}
Payout per stack rise: ${scene.cable.payoutPerStackRise}:1.
Exactly ${scene.cable.selectedPlates} selected plates of ${scene.cable.totalPlates} total throughout.
Only selected plates rise; unselected plates stay on the base. Keep the cable taut.
Payout is cable travel through the route, not vertical screen displacement.
${scene.cable.states.map((state, i) => `Frame ${i + 1}: payout ${state.payoutMm} mm; stack gap ${state.stackLiftMm} mm.`).join("\n")}
`
    : ""
}
MOVEMENT AND EQUIPMENT LADDER
${beats
  .map(
    (beat, i) => `FRAME ${i + 1} — ${beat.label.toUpperCase()} ${i + 1}/6
Body: ${scene.states[i].body}
Equipment: ${scene.states[i].equipment}
Cable/stack: ${scene.states[i].cableAndStack}
App cue: ${beat.cue}`
  )
  .join("\n\n")}

LOOP BOUNDARY: ${scene.loopBoundary}
The sixth frame is normally controlled return; do not invent reverse playback.

CAPTIONS
The app renders the caption and cue as accessible text. App image masters contain
no text, UI, legend, border or instruction. If standalone captioned exports are
requested, use exactly one bold white uppercase centred bottom caption with the
frame name and N/6, at the same position in each separate image.

REJECT BEFORE RELEASE
Compare all six stills AND their sequential playback. Reject identity/scale/camera
drift, changing grip or plate dimensions, broken anatomy, shifted fixed anchors,
incorrect cable/stack relationships, unordered poses, jumping paths or colour drift.
Record measured invariant anchors and dimensions and review at mobile size in
light and dark. A failed frame stays draft; a prompt is not proof of correctness.

Technique references used for scene review:
${scene.techniqueSources.join("\n")}
Deliver IMAGE 1 through IMAGE 6 as six separate full-resolution files.`;
}
