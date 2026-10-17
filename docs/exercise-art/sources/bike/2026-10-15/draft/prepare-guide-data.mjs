// Read actual catalogue data with UTF8 preserved; writes outside repo only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "../../Maiin-burpees");
const { EXERCISES } = await import(
  pathToFileURL(path.join(repo, "src/lib/exercises.ts")).href
);
const catalogue = EXERCISES.find((entry) => entry.id === "bike");
if (!catalogue || catalogue.name !== "Stationary Bike")
  throw new Error("Actual Bike catalogue missing");
const save = (name, value) =>
  fs.writeFileSync(
    path.join(root, name),
    JSON.stringify(value, null, 2) + "\n",
    "utf8"
  );
save("catalogue.json", catalogue);
const beats = [
  { t: 0, label: "Lower Pedal", cue: "Keep a slight bend at the bottom." },
  { t: 0, label: "Posture", cue: "Sit tall; keep hips supported and level." },
  { t: 0.5, label: "Opposed Legs", cue: "Let the other leg take its turn." },
  {
    t: 0.5,
    label: "Relaxed Grip",
    cue: "Keep your grip relaxed and shoulders down.",
  },
  {
    t: 0,
    label: "Cadence",
    cue: "Pedal steadily without yanking on the upstroke.",
  },
  {
    t: 0,
    label: "Resistance",
    cue: "Adjust resistance to match your target effort.",
  },
];
if (beats.some((beat) => beat.cue.split(/\s+/).length > 7))
  throw new Error("Cue read budget exceeded");
save("draft-beats.json", beats);
save("plan.json", {
  exerciseId: "bike",
  name: catalogue.name,
  status:
    "Outside-repository two-opposed-position candidate; native/equipment/independent/mobile/card/release checks pending",
  canonicalReference: path.join(
    repo,
    "docs/exercise-art/identity/athlete-anatomy-v3.png"
  ),
  canonicalSha256:
    "fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b",
  ownerAuthorization:
    "Root applies the owner's earlier slight relaxation to an honest two-position guide, preserving model/equipment/contact standards. No new request or retry of the blocked front phase.",
  physicalPoses: 2,
  separateBeatPaths: 6,
  sourcePoseOrder: [1, 1, 2, 2, 1, 1],
  positionCoordinates: [0, 0, 0.5, 0.5, 0, 0],
  positionCoordinateMeaning:
    "Two representative opposed positions, not calibrated crank angles or evidence of a sampled forward trajectory. Display stepping uses original images; no in-between human pose is synthesized.",
  authoredSetupInstructions: catalogue.instructions.slice(0, 2),
  retainedCatalogueInstructions: catalogue.instructions,
  primary: ["Quads"],
  secondary: ["Hamstrings"],
  muscleMapping:
    "Catalogue Cardio is an activity category, not a colourable anatomical region. Its listed Quads/Hamstrings are mapped as working quadriceps primary and hamstrings secondary. Unlisted existing calf colour is neutralized only inside existing source fields.",
  scope:
    "Two opposed seated pedalling positions repeated for cue reading. Intermediate crank travel is not shown. This is not claimed a smooth sampled revolution or six unique physical drawings.",
  limitations: [
    "Upper far trainer/strap/pedal are naturally hidden by the original opaque housing; do not claim independent visible validation.",
    "Small source head/torso contour variation and whole-scene registration tolerance are disclosed, not pixel-identical cross-pose anatomy.",
    "No forward-trajectory/direction/continuous-revolution mechanics claim follows from two images.",
    "First coarse-mask colour draft is held and preserved; corrected colour draft requires native and independent review.",
  ],
  anatomyTransforms: false,
  scale: 1,
  wholeSceneOffsets: [
    [0, 0],
    [-1, 16],
  ],
  commonCrop: [48, 32, 977, 1464],
  productionRegistered: false,
  newImageRequests: 0,
  completionCredit: false,
});
process.stdout.write(
  JSON.stringify({
    catalogue: catalogue.id,
    setupInstructions: catalogue.instructions.slice(0, 2),
    physicalPoses: 2,
    sourcePoseOrder: [1, 1, 2, 2, 1, 1],
    completionCredit: false,
  })
);
