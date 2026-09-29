/** Exact cues for released artwork. See docs/exercise-art/releases. */
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
  "diamond-push-ups": placard(
    "diamond-push-ups",
    ["Triceps"],
    ["Chest", "Front Delts"],
    [
      [0, "Set", "Form a diamond beneath your chest; brace."],
      [0.5, "Lower", "Bend your elbows back along your ribs."],
      [1, "Bottom", "Lower your chest close to your hands."],
      [1, "Control", "Keep shoulders, hips and ankles aligned."],
      [0.5, "Press", "Press through your hands with elbows tucked."],
      [0, "Reset", "Finish straightening your arms without sagging."],
    ]
  ),
  "tricep-kickback": placard(
    "tricep-kickback",
    ["Triceps"],
    ["Rear Delts", "Core stabilisers"],
    [
      [0, "Set", "Brace your hand and knee on bench."],
      [0.5, "Extend", "Extend your elbow with upper arm lifted."],
      [1, "Straighten", "Straighten your arm behind your torso."],
      [1, "Squeeze", "Squeeze your triceps; keep your wrist straight."],
      [0.5, "Return", "Bend your elbow slowly, keeping it lifted."],
      [0, "Reset", "Return your elbow to roughly ninety degrees."],
    ]
  ),
  "spider-db-curl": placard(
    "spider-db-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Keep your chest against the incline pad."],
      [0.5, "Curl", "Curl upward without moving your upper arms."],
      [1, "Top", "Bring the dumbbells toward your shoulders."],
      [1, "Hold", "Squeeze your biceps with straight wrists."],
      [0.5, "Lower", "Lower slowly while keeping your chest supported."],
      [0, "Reset", "Finish lowering with tension in your biceps."],
    ]
  ),
  "concentration-curl": placard(
    "concentration-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Brace your upper arm against inner thigh."],
      [0.5, "Curl", "Curl upward while keeping your elbow braced."],
      [1, "Top", "Squeeze your biceps without moving your torso."],
      [1, "Hold", "Keep your wrist straight at the top."],
      [0.5, "Lower", "Lower slowly with your upper arm braced."],
      [0, "Reset", "Finish lowering before starting the next rep."],
    ]
  ),
  "reverse-barbell-curl": placard(
    "reverse-barbell-curl",
    ["Biceps"],
    ["Brachioradialis", "Forearms"],
    [
      [0, "Set", "Use overhand grip; keep your wrists straight."],
      [0.65, "Curl", "Curl upward, keeping elbows beside your ribs."],
      [1, "Top", "Bring the bar toward your shoulders."],
      [1, "Hold", "Pause briefly without bending your wrists."],
      [0.65, "Lower", "Lower slowly with your overhand grip locked."],
      [0, "Return", "Return to thighs without swinging your torso."],
    ]
  ),
  "cross-body-hammer-curl": placard(
    "cross-body-hammer-curl",
    ["Biceps"],
    ["Brachioradialis", "Forearms"],
    [
      [0, "Start", "Stand tall with palms facing inward."],
      [0.5, "Curl across", "Curl one dumbbell across your body."],
      [
        1,
        "Opposite shoulder",
        "Bring the dumbbell toward your opposite shoulder.",
      ],
      [1, "Brief hold", "Pause with your elbow beside your ribs."],
      [0.5, "Lower", "Lower slowly along the same path."],
      [0, "Return", "Return to your side; alternate arms next."],
    ]
  ),
  "ez-bar-curl": placard(
    "ez-bar-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Grip angled sections; keep elbows beside ribs."],
      [0.5, "Curl", "Bend elbows, keeping your torso still."],
      [1, "Squeeze", "Curl toward shoulders without moving elbows forward."],
      [1, "Control", "Hold briefly with wrists aligned."],
      [0.5, "Lower", "Lower slowly, keeping elbows beside your ribs."],
      [0, "Return", "Extend arms under control; keep tension."],
    ]
  ),
  "decline-db-press": placard(
    "decline-db-press",
    ["Lower Chest"],
    ["Triceps", "Front Delts"],
    [
      [0, "Set", "Secure ankles; brace with weights beside chest."],
      [0.5, "Press", "Press upward, keeping wrists stacked over elbows."],
      [1, "Extend", "Extend arms, keeping the dumbbells slightly apart."],
      [1, "Control", "Hold steady with shoulders against the pad."],
      [0.5, "Lower", "Lower both weights along the same path."],
      [0, "Return", "Return beside your chest with control."],
    ]
  ),
  "meadows-row": placard(
    "meadows-row",
    ["Lats"],
    ["Rhomboids", "Rear Delts", "Biceps"],
    [
      [0, "Stretch", "Brace your thigh; extend the working arm."],
      [0.5, "Pull", "Draw your elbow back; keep hips steady."],
      [1, "Row", "Bring the loaded end toward your hip."],
      [1, "Control", "Keep your wrist aligned and torso steady."],
      [0.5, "Lower", "Lower along the same arc with control."],
      [0, "Return", "Return to a full arm stretch."],
    ]
  ),
  "decline-sit-up": placard(
    "decline-sit-up",
    ["Abs"],
    ["Hip Flexors"],
    [
      [0, "Set", "Secure your feet; cross your arms."],
      [0.5, "Curl", "Curl your torso off the bench."],
      [1, "Sit up", "Bring your chest toward your knees."],
      [1, "Control", "Keep your feet secured; avoid bouncing."],
      [0.5, "Lower", "Uncurl your torso slowly with control."],
      [0, "Reset", "Lie back gently without slamming."],
    ]
  ),
  "bench-dips": placard(
    "bench-dips",
    ["Triceps"],
    ["Chest", "Front delts"],
    [
      [0, "Start", "Grip the edge; keep your hips forward."],
      [0.5, "Lower", "Bend your elbows, tracking them back."],
      [1, "Bottom", "Lower until elbows reach about ninety degrees."],
      [1, "Control", "Keep shoulders down and hands firmly planted."],
      [0.5, "Press", "Press through your palms to rise."],
      [0, "Return", "Straighten your arms without shrugging."],
    ]
  ),
  "barbell-upright-row": placard(
    "barbell-upright-row",
    ["Traps"],
    ["Side delts", "Biceps"],
    [
      [0, "Start", "Stand tall; keep an overhand grip."],
      [0.5, "Lead with elbows", "Lead with elbows; keep the bar close."],
      [1, "Chest height", "Stop at chest height, elbows below shoulders."],
      [1, "Controlled top", "Hold briefly without lifting elbows higher."],
      [0.5, "Lower", "Lower the bar close to your body."],
      [0, "Return", "Return to thighs without bouncing."],
    ]
  ),
  "zottman-curl": placard(
    "zottman-curl",
    ["Biceps"],
    ["Brachioradialis", "Forearms"],
    [
      [0, "Set", "Stand tall with palms facing forward."],
      [0.5, "Curl", "Curl upward with your palms facing up."],
      [1, "Top", "Reach shoulder height without swinging your torso."],
      [1, "Rotate", "Turn palms down; keep your wrists straight."],
      [0.9, "Lower", "Begin lowering slowly with palms facing down."],
      [0, "Reset", "Finish lowering, then turn palms forward again."],
    ]
  ),
  "lu-raise": placard(
    "lu-raise",
    ["Deltoids"],
    ["Front delts", "Side delts"],
    [
      [0, "Start", "Stand tall, weights at your sides."],
      [0.25, "Raise laterally", "Raise both arms out to the sides."],
      [0.5, "Shoulder height", "Reach shoulder height with soft elbows."],
      [
        1,
        "Sweep forward",
        "Sweep forward, bringing the weights close together.",
      ],
      [0.5, "Open laterally", "Open back out at shoulder height."],
      [0.25, "Lower", "Lower steadily; continue to your sides."],
    ]
  ),
  "arnold-press": placard(
    "arnold-press",
    ["Deltoids"],
    ["Triceps", "Upper chest"],
    [
      [0, "Start tucked", "Start seated with palms facing you."],
      [0.5, "Rotate and press", "Press upward while rotating palms outward."],
      [1, "Extend overhead", "Extend overhead with palms facing forward."],
      [1, "Hold", "Keep the dumbbells separate above shoulders."],
      [0.5, "Lower smoothly", "Lower while reversing the rotation."],
      [0, "Return tucked", "Return palms inward at chest height."],
    ]
  ),
  "db-flyes": placard(
    "db-flyes",
    ["Pectorals"],
    ["Front deltoids"],
    [
      [0, "Set the soft bend", "Keep elbows softly bent above your chest."],
      [
        0.5,
        "Open in an arc",
        "Lower outward, maintaining the same elbow bend.",
      ],
      [
        1,
        "Controlled stretch",
        "Stop at chest level; keep shoulders supported.",
      ],
      [
        1,
        "Hold control",
        "Pause briefly without lowering beyond comfortable range.",
      ],
      [0.5, "Sweep inward", "Bring weights together along the same arc."],
      [
        0,
        "Reset above chest",
        "Finish above chest without clashing the weights.",
      ],
    ]
  ),
  "superman-hold": placard(
    "superman-hold",
    ["Lower Back"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Set", "Lie face-down; reach arms overhead."],
      [0.5, "Lift", "Lift arms, chest, and legs slightly."],
      [1, "Reach", "Reach long through fingers and toes."],
      [1, "Hold", "Hold briefly, keeping your gaze down."],
      [0.5, "Lower", "Lower your limbs slowly with control."],
      [0, "Reset", "Return gently to the mat."],
    ]
  ),
  "chest-press-machine": placard(
    "chest-press-machine",
    ["Pectorals"],
    ["Triceps", "Front deltoids"],
    [
      [0, "Set and brace", "Plant feet; keep your back against pad."],
      [0.5, "Press forward", "Press forward with wrists straight and stacked."],
      [1, "Finish the press", "Extend arms while keeping your back supported."],
      [1, "Hold control", "Hold briefly without lifting from the pad."],
      [0.5, "Return slowly", "Bend elbows slowly, keeping both grips secure."],
      [
        0,
        "Reset under tension",
        "Return under control; avoid dropping the stack.",
      ],
    ]
  ),
  "machine-chest-fly": placard(
    "machine-chest-fly",
    ["Pectorals"],
    ["Front deltoids"],
    [
      [0, "Set the soft bend", "Keep back supported; hold a soft bend."],
      [
        0.5,
        "Sweep inward",
        "Bring handles inward without bending elbows further.",
      ],
      [
        1,
        "Squeeze in front",
        "Bring handles together without leaning forward.",
      ],
      [1, "Hold the squeeze", "Pause with your back against the pad."],
      [0.5, "Open slowly", "Return slowly along the same wide arc."],
      [0, "Control the stretch", "Stop before forcing your arms behind you."],
    ]
  ),
  "pec-deck": placard(
    "pec-deck",
    ["Pectorals"],
    ["Front deltoids"],
    [
      [0, "Set up", "Keep back supported and feet planted."],
      [0.5, "Squeeze", "Press forearms into pads; bring arms inward."],
      [1, "Finish", "Squeeze chest without lifting shoulders."],
      [1, "Pause", "Hold tension; keep forearms against pads."],
      [0.5, "Return", "Open slowly with elbows bent."],
      [0, "Reset", "Keep chest lifted and feet planted."],
    ]
  ),
  "cable-crossover": placard(
    "cable-crossover",
    ["Pectorals"],
    ["Front deltoids"],
    [
      [0, "Wide start", "Plant feet; keep a soft elbow bend."],
      [0.35, "Sweep inward", "Sweep handles inward with elbows softly bent."],
      [1, "Squeeze", "Bring hands together in front of hips."],
      [1, "Pause", "Hold the squeeze without shrugging."],
      [0.35, "Open slowly", "Resist the cables along the return arc."],
      [0, "Reset", "Return wide while keeping cable tension."],
    ]
  ),
  "decline-bench": placard(
    "decline-bench",
    ["Pectorals"],
    ["Triceps", "Front deltoids"],
    [
      [
        0,
        "Set above shoulders",
        "Secure ankles; keep head and hips supported.",
      ],
      [
        0.5,
        "Lower under control",
        "Lower toward lower chest; keep wrists stacked.",
      ],
      [1, "Gentle chest touch", "Touch lower chest with shoulder blades set."],
      [
        1,
        "Pause without bouncing",
        "Pause gently; keep head and hips supported.",
      ],
      [0.5, "Press up and back", "Press up and back with ankles secured."],
      [
        0,
        "Complete the press",
        "Finish above shoulders with controlled elbow extension.",
      ],
    ]
  ),
  "weighted-chest-dip": placard(
    "weighted-chest-dip",
    ["Pectorals"],
    ["Triceps", "Front deltoids"],
    [
      [0, "Support", "Hold forward lean; keep the weight still."],
      [0.5, "Lower", "Bend elbows while maintaining your forward lean."],
      [1, "Controlled depth", "Stop when upper arms reach roughly parallel."],
      [1, "Pause", "Pause briefly with shoulders controlled and stable."],
      [0.5, "Press", "Press upward without swinging the hanging weight."],
      [0, "Reset", "Finish arms extended, keeping your forward lean."],
    ]
  ),
  "barbell-floor-press": placard(
    "barbell-floor-press",
    ["Pectorals"],
    ["Triceps", "Front deltoids"],
    [
      [0, "Set", "Hold bar over chest with arms extended."],
      [0.5, "Lower", "Lower under control, keeping wrists stacked."],
      [1, "Floor contact", "Let your upper arms meet the floor."],
      [1, "Pause", "Pause on the floor without bouncing."],
      [0.5, "Press", "Press upward while keeping your feet planted."],
      [0, "Reset", "Finish arms extended; prepare the next repetition."],
    ]
  ),
  "incline-bench": placard(
    "incline-bench",
    ["Pectorals"],
    ["Triceps", "Front deltoids"],
    [
      [0, "Set and brace", "Stay supported; hold bar above your shoulders."],
      [
        0.5,
        "Lower under control",
        "Lower toward upper chest; keep wrists stacked.",
      ],
      [1, "Upper chest touch", "Touch upper chest; keep your hips down."],
      [1, "Pause without bouncing", "Pause briefly; keep shoulder blades set."],
      [0.5, "Press up and back", "Press up and back; keep feet planted."],
      [
        0,
        "Finish the press",
        "Finish above shoulders with controlled elbow extension.",
      ],
    ]
  ),
  "weighted-push-ups": placard(
    "weighted-push-ups",
    ["Pectorals"],
    ["Triceps", "Front deltoids", "Core"],
    [
      [0, "Brace at the top", "Brace straight; plate centred on upper back."],
      [0.5, "Lower together", "Lower together; elbows angled back about 45°."],
      [1, "Pause above the floor", "Stop with your chest just above floor."],
      [1, "Hold control", "Keep your core tight and weight still."],
      [0.5, "Press up", "Press up without letting your hips sag."],
      [0, "Reset at the top", "Finish arms extended; keep the plate stable."],
    ]
  ),
  "db-curl": placard(
    "db-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Stand tall with palms facing forward."],
      [0.5, "Curl", "Bend your elbows without swinging your torso."],
      [1, "Top", "Curl toward shoulders, keeping wrists straight."],
      [1, "Control", "Keep upper arms close to your ribs."],
      [0.5, "Lower", "Lower both dumbbells slowly under control."],
      [0, "Reset", "Return near straight without snapping your elbows."],
    ]
  ),
  "hammer-curl": placard(
    "hammer-curl",
    ["Biceps"],
    ["Brachioradialis", "Forearms"],
    [
      [0, "Set", "Stand tall with palms facing inward."],
      [0.5, "Curl", "Bend your elbows without turning your palms."],
      [1, "Top", "Bring weights toward shoulders with wrists aligned."],
      [1, "Control", "Keep upper arms beside your ribs."],
      [0.5, "Lower", "Lower slowly with the same neutral grip."],
      [0, "Reset", "Return near straight without swinging your torso."],
    ]
  ),
  "front-raise": placard(
    "front-raise",
    ["Front Delts"],
    ["Upper Chest"],
    [
      [0, "Set", "Stand tall with weights before your thighs."],
      [0.5, "Raise", "Lift forward with a slight elbow bend."],
      [1, "Top", "Stop at shoulder height without shrugging."],
      [1, "Control", "Keep wrists straight and your torso still."],
      [0.5, "Lower", "Lower both weights slowly without swinging."],
      [0, "Reset", "Return weights to the front of thighs."],
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
    ["Pectorals"],
    ["Triceps", "Front Delts", "Core"],
    [
      [0, "Set", "Place hands slightly wider than your shoulders."],
      [0.5, "Lower", "Bend elbows back, keeping your body aligned."],
      [1, "Bottom", "Bring your chest close to the floor."],
      [1, "Control", "Keep hips and shoulders moving together."],
      [0.5, "Press", "Push the floor away without lifting hips."],
      [0, "Reset", "Finish with arms straight and core braced."],
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
    ["Chest"],
    ["Triceps", "Front Delts"],
    [
      [0, "Set", "Keep feet planted and shoulders supported."],
      [0.5, "Lower", "Bend elbows, keeping wrists above them."],
      [1, "Bottom", "Lower weights beside your chest with control."],
      [1, "Control", "Keep forearms upright and shoulders supported."],
      [0.5, "Press", "Press upward without letting your wrists bend."],
      [0, "Reset", "Finish above your chest without clashing weights."],
    ]
  ),
  "bodyweight-squat": placard(
    "bodyweight-squat",
    ["Quads"],
    ["Glutes", "Core"],
    [
      [0, "Set", "Stand shoulder-width with arms extended for balance."],
      [0.3, "Lower", "Bend hips and knees; keep heels planted."],
      [1, "Bottom", "Lower until your thighs reach roughly parallel."],
      [1, "Control", "Keep your knees tracking over your toes."],
      [0.3, "Rise", "Push through your whole feet to rise."],
      [0, "Reset", "Stand tall without leaning backward."],
    ]
  ),
  "barbell-shrug": placard(
    "barbell-shrug",
    ["upper trapezius"],
    ["forearm gripping muscles"],
    [
      [0, "Set", "Stand tall with arms straight."],
      [0.5, "Lift", "Lift shoulders straight toward your ears."],
      [1, "Top", "Keep elbows straight and neck neutral."],
      [1, "Hold", "Hold briefly without rolling your shoulders."],
      [0.5, "Lower", "Lower your shoulders slowly with control."],
      [0, "Reset", "Return shoulders fully, keeping feet planted."],
    ]
  ),
  "lateral-raise": placard(
    "lateral-raise",
    ["Side deltoids"],
    ["Traps"],
    [
      [0, "Set", "Stand tall with elbows slightly bent."],
      [0.5, "Raise", "Lift outward with steady elbow angles."],
      [1, "Top", "Stop with upper arms at shoulder height."],
      [1, "Hold", "Keep wrists neutral and shoulders relaxed."],
      [0.5, "Lower", "Lower slowly without swinging your torso."],
      [0, "Reset", "Return weights beside your thighs with control."],
    ]
  ),
  "glute-bridge": placard(
    "glute-bridge",
    ["Glutes"],
    ["Hamstrings"],
    [
      [0, "Set", "Lie back with knees bent, feet flat."],
      [0.5, "Lift", "Drive through heels and raise your hips."],
      [1, "Top", "Align shoulders, hips and knees; squeeze glutes."],
      [1, "Hold", "Keep ribs down without arching your back."],
      [0.5, "Lower", "Lower your hips slowly under control."],
      [0, "Reset", "Return hips gently to the mat."],
    ]
  ),
  "pike-push-up": placard(
    "pike-push-up",
    ["Deltoids"],
    ["Triceps", "Upper chest"],
    [
      [0, "Set", "Keep hips high with arms straight."],
      [0.5, "Lower", "Bend elbows while keeping hips piked."],
      [1, "Bottom", "Lower your crown toward the mat."],
      [1, "Pause", "Hover without resting on your head."],
      [0.5, "Press", "Push through palms, keeping hips high."],
      [0, "Reset", "Straighten arms and regain your high pike."],
    ]
  ),
  "toe-touches": placard(
    "toe-touches",
    ["Abs"],
    ["Hip flexors"],
    [
      [0, "Set", "Hold straight legs above your hips."],
      [0.5, "Curl", "Lift shoulders and reach upward."],
      [1, "Reach", "Reach toward toes; keep legs steady."],
      [1, "Pause", "Hold the curl without swinging."],
      [0.5, "Lower", "Lower your shoulders under control."],
      [0, "Reset", "Rest shoulders; keep legs raised."],
    ]
  ),
  "dead-bug": placard(
    "dead-bug",
    ["Core"],
    ["Hip flexors"],
    [
      [0, "Set", "Brace; hold arms up, knees in tabletop."],
      [1, "Extend A", "Reach opposite limbs without arching your back."],
      [0, "Return", "Return arm and leg to tabletop."],
      [1, "Extend B", "Extend far arm and opposite leg fully."],
      [0.5, "Lower B", "Bring the extended arm and leg back."],
      [0, "Reset", "Return to tabletop before changing sides."],
    ]
  ),
  "bicycle-crunch": placard(
    "bicycle-crunch",
    ["Obliques"],
    ["Abs"],
    [
      [0, "Set", "Brace with knees raised; support your head."],
      [1, "Twist A", "Rotate toward opposite knee; extend other leg."],
      [0, "Return", "Return to center with both knees bent."],
      [1, "Twist B", "Rotate toward the other knee; extend fully."],
      [0.5, "Return B", "Unwind slowly as the extended knee bends."],
      [0, "Reset", "Center your torso; keep both feet lifted."],
    ]
  ),
  "l-sit": placard(
    "l-sit",
    ["Core"],
    ["Hip Flexors", "Triceps", "Shoulders"],
    [
      [0, "Support", "Press down through straight arms; brace core."],
      [0.5, "Lift", "Raise straight legs without shrugging your shoulders."],
      [1, "Extend", "Hold legs horizontal; point your toes forward."],
      [1, "Hold", "Keep arms straight; breathe through the hold."],
      [0.5, "Lower", "Lower straight legs slowly; keep shoulders down."],
      [0, "Reset", "Return low while maintaining both hand supports."],
    ]
  ),
};
