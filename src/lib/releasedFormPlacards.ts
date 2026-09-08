/** Exact cues for the owner-authorized September release. See docs/exercise-art/releases. */
const placard = (
  id: string,
  primary: string[],
  secondary: string[],
  rows: [number, string, string][]
) => ({
  beats: rows.map(([t, label, cue], i) => ({
    t,
    label,
    cue,
    image: `form-frames/${id}/${i + 1}.webp`,
  })),
  key: { primary, secondary, secondaryFill: "solid" as const },
});

export const RELEASED_FORM_PLACARDS = {
  "db-curl": placard(
    "db-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0.0, "Set up", "Stand tall, palms forward, elbows by ribs."],
      [0.25, "Initiate curl", "Bend both elbows; keep your torso still."],
      [0.6, "Mid curl", "Upper arms still, wrists straight."],
      [1.0, "Top contraction", "Curl up without lifting your elbows."],
      [0.6, "Controlled lower", "Lower slowly along the same arc."],
      [0.15, "Finish return", "Return towards straight arms without bouncing."],
    ]
  ),
  "hammer-curl": placard(
    "hammer-curl",
    ["biceps", "brachialis"],
    ["brachioradialis"],
    [
      [0, "Start", "Stand tall; keep palms facing inward."],
      [0.25, "Initiate curl", "Curl without swinging your upper arms."],
      [0.6, "Mid curl", "Keep wrists straight and elbows beside ribs."],
      [1, "Top curl", "Finish the curl without lifting your elbows."],
      [0.6, "Controlled lower", "Lower slowly with your palms facing inward."],
      [0.25, "Return", "Return towards straight arms without bouncing."],
    ]
  ),
  "front-raise": placard(
    "front-raise",
    ["anterior deltoids"],
    ["upper pectorals"],
    [
      [0, "Start", "Stand tall with dumbbells before your thighs."],
      [0.25, "Initiate raise", "Raise both arms forward without swinging."],
      [0.6, "Continue raise", "Keep the same slight elbow bend."],
      [1, "Shoulder height", "Stop with your arms at shoulder height."],
      [0.6, "Controlled lower", "Lower slowly without leaning your torso."],
      [0.25, "Return", "Return towards your thighs under control."],
    ]
  ),
  "goblet-squat": placard(
    "goblet-squat",
    ["quadriceps"],
    ["gluteals"],
    [
      [0, "Stand tall", "Hold the dumbbell close to your chest."],
      [0.25, "Begin descent", "Bend hips and knees; keep heels grounded."],
      [0.6, "Lower", "Let knees follow the direction of toes."],
      [1, "Bottom", "Keep your chest lifted and feet planted."],
      [0.6, "Drive up", "Push through your whole feet to rise."],
      [0.25, "Finish rising", "Finish standing without leaning back."],
    ]
  ),
  "push-ups": placard(
    "push-ups",
    ["pectoralis major"],
    ["triceps", "anterior deltoids"],
    [
      [0, "High plank", "Brace your trunk in a high plank."],
      [0.25, "Begin lowering", "Bend elbows while keeping your body aligned."],
      [0.6, "Lower", "Lower your chest between your hands."],
      [1, "Bottom", "Keep hips aligned; avoid dropping your head."],
      [0.6, "Press up", "Press the floor away without sagging."],
      [
        0.25,
        "Finish pressing",
        "Finish pressing while keeping your trunk braced.",
      ],
    ]
  ),
  squat: placard(
    "squat",
    ["quadriceps"],
    ["gluteals"],
    [
      [0, "Set up", "Brace with the bar across upper traps."],
      [0.3, "Descend", "Bend hips and knees; keep heels grounded."],
      [0.7, "Continue descent", "Keep knees tracking with your toes."],
      [1, "Bottom", "Stay braced at your comfortable squat depth."],
      [0.45, "Drive", "Push through your whole feet to rise."],
      [0, "Stand", "Stand tall without leaning back."],
    ]
  ),
  "barbell-curl": placard(
    "barbell-curl",
    ["biceps"],
    ["brachialis", "brachioradialis"],
    [
      [0, "Start", "Hold the bar with an underhand grip."],
      [0.25, "Initiate curl", "Curl without swinging your upper arms."],
      [0.6, "Mid curl", "Keep elbows beside ribs and wrists straight."],
      [1, "Top curl", "Finish the curl without lifting your elbows."],
      [0.6, "Controlled lower", "Lower the bar slowly under control."],
      [0.25, "Return", "Return towards straight arms without bouncing."],
    ]
  ),
  "db-bench": placard(
    "db-bench",
    ["pectoralis major"],
    ["triceps", "anterior deltoids"],
    [
      [0, "Top", "Keep feet planted and shoulders supported."],
      [
        0.25,
        "Begin lowering",
        "Lower both dumbbells with your wrists straight.",
      ],
      [0.6, "Lower", "Keep wrists stacked over your elbows."],
      [1, "Bottom", "Lower beside your chest without bouncing."],
      [0.6, "Press up", "Press upward without lifting your shoulders."],
      [
        0.25,
        "Finish pressing",
        "Finish pressing without knocking the dumbbells together.",
      ],
    ]
  ),
  "bodyweight-squat": placard(
    "bodyweight-squat",
    ["quadriceps"],
    ["gluteals"],
    [
      [0, "Stand tall", "Stand tall with both arms held forward."],
      [0.25, "Begin descent", "Bend hips and knees; keep heels grounded."],
      [0.6, "Lower", "Keep knees following the direction of toes."],
      [1, "Bottom", "Stay braced with your whole feet planted."],
      [0.6, "Drive up", "Raise hips and chest together under control."],
      [0.25, "Finish rising", "Finish standing without leaning back."],
    ]
  ),
  "barbell-shrug": placard(
    "barbell-shrug",
    ["upper trapezius"],
    ["forearm gripping muscles"],
    [
      [0, "Start", "Stand tall with arms straight."],
      [
        0.3333333333333333,
        "Begin shrug",
        "Lift shoulders without bending elbows.",
      ],
      [
        0.6666666666666666,
        "Continue lift",
        "Raise shoulders straight up; avoid rolling.",
      ],
      [1, "Top", "Hold briefly with your neck neutral."],
      [
        0.6666666666666666,
        "Lower",
        "Lower shoulders slowly with straight arms.",
      ],
      [
        0.3333333333333333,
        "Finish lowering",
        "Finish lowering without rocking your torso.",
      ],
    ]
  ),
};
