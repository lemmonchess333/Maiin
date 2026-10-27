import { FORM_ARTWORK } from "./formArtwork";

/** Exact cues for released artwork. See docs/exercise-art/releases. */
const placard = (
  id: string,
  primary: string[],
  secondary: string[],
  rows: [number, string, string][],
  authoredSetupInstructions?: string[],
  advice?: { tip: string; commonMistakes: string[] }
) => ({
  authoredSetupInstructions,
  advice,
  beats: rows.map(([t, label, cue], i) => ({
    t,
    label,
    cue,
    image: FORM_ARTWORK[id]?.frames[i] ?? `form-frames/${id}/${i + 1}.webp`,
  })),
  key: { primary, secondary, secondaryFill: "solid" as const },
});

export const RELEASED_FORM_PLACARDS = {
  "skull-crushers": placard(
    "skull-crushers",
    ["Triceps"],
    ["Chest", "Front deltoids"],
    [
      [0, "Start", "Hold bar high; upper arms angled back."],
      [0.3, "Initiate lower", "Unlock elbows slowly; keep upper arms raised."],
      [0.8, "Mid lower", "Fold forearms back; keep elbows raised."],
      [1, "Bottom", "Keep the bar clear of your head."],
      [0.8, "Extend", "Extend elbows; keep upper arms steady."],
      [
        0,
        "Return to lockout",
        "Finish with straight elbows and controlled load.",
      ],
    ],
    [
      "Lie supported on a flat bench with both feet planted.",
      "Use a narrow overhand grip and angle your upper arms slightly toward your head.",
      "Bend your elbows to lower the bar past your forehead toward the top of your skull; extend to return.",
    ]
  ),
  dips: placard(
    "dips",
    ["Pectorals"],
    ["Triceps", "Anterior deltoids"],
    [
      [0, "Top", "Straight arms; keep shoulders down."],
      [0.5, "Lower", "Bend elbows; maintain a slight forward lean."],
      [0.5, "Hold", "Hold this depth; keep both hands fixed."],
      [1, "Bottom", "Stop around upper arms parallel to floor."],
      [0.5, "Press", "Push through the bars; keep chest inclined."],
      [0, "Finish", "Straighten arms without shrugging your shoulders."],
    ],
    [
      "Hold the parallel bars and support your body on straight arms.",
      "Lean slightly forward and keep your shoes clear of the floor.",
    ]
  ),
  "barbell-row": placard(
    "barbell-row",
    ["Lats"],
    ["Rhomboids", "Rear deltoids", "Biceps"],
    [
      [0, "Hang", "Hinge steady; arms hang below shoulders."],
      [0.25, "Initiate pull", "Bend elbows; keep both wrists straight."],
      [0.72, "Continue pull", "Drive elbows back beside the torso."],
      [1, "Top contraction", "Bring the bar to lower ribs."],
      [0.72, "Lower", "Lower smoothly; maintain the hip hinge."],
      [0, "Full stretch", "Arms extend; plates stay off floor."],
    ],
    [
      "Hinge at the hips with soft knees and a neutral back.",
      "Hold the bar overhand outside the knees, with plates clear of the floor.",
    ]
  ),
  "bench-press": placard(
    "bench-press",
    ["Pectorals"],
    ["Triceps", "Anterior deltoids"],
    [
      [1, "Set", "Shoulder blades set; feet stay planted."],
      [0.88, "Lower", "Bend elbows; keep wrists over elbows."],
      [0, "Continue down", "Lower smoothly toward the mid-chest."],
      [0, "Chest touch", "Touch lightly; keep the neck clear."],
      [0.88, "Drive", "Press upward and back toward shoulders."],
      [1, "Lockout", "Straight arms; hips remain on bench."],
    ],
    [
      "Lie on the bench with both feet planted and shoulder blades set.",
      "Grip the bar just outside shoulders and unrack before the shown cycle.",
    ]
  ),
  "overhead-press": placard(
    "overhead-press",
    ["Anterior deltoids"],
    ["Triceps", "Upper chest", "Core"],
    [
      [0, "Set", "Rest bar high; keep elbows underneath."],
      [0, "Brace", "Brace the core; keep ribs down."],
      [0.55, "Press", "Press upward; keep wrists over elbows."],
      [1, "Overhead", "Finish with the bar centred overhead."],
      [1, "Hold", "Straight arms; keep the trunk braced."],
      [0.55, "Lower", "Lower the bar slowly toward shoulders."],
    ],
    [
      "Stand with feet planted and the bar on the front shoulders.",
      "Grip just outside shoulder width, brace and press without leg drive.",
    ]
  ),
  "rope-tricep-pushdown": placard(
    "rope-tricep-pushdown",
    ["Triceps"],
    ["Forearms"],
    [
      [0, "Set", "Elbows beside ribs; brace the trunk."],
      [0.1, "Initiate", "Extend elbows; keep the shoulders still."],
      [0.4, "Push down", "Press the rope toward your thighs."],
      [0.7, "Continue", "Keep wrists straight and elbows tucked."],
      [1, "Extend", "Straighten arms; separate the rope ends."],
      [0, "Return", "Bend elbows slowly; keep upper arms still."],
    ],
    [
      "Stand facing the high pulley and hold both rope ends.",
      "Set elbows beside ribs and keep the trunk braced.",
    ]
  ),
  "incline-db-curl": placard(
    "incline-db-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Let the near arm hang beside you."],
      [0, "Brace", "Keep your upper arm beside the bench."],
      [1, "Curl", "Curl toward your shoulder; keep wrist straight."],
      [1, "Squeeze", "Pause without swinging your upper arm."],
      [0, "Lower", "Lower the weight under control."],
      [0, "Alternate", "Repeat with the opposite arm."],
    ],
    [
      "Lie back on a low incline bench with both feet planted.",
      "Hold one dumbbell in each hand and curl one arm at a time.",
      "The near arm is demonstrated; repeat the same controlled curl on the other side.",
    ],
    {
      tip: "Keep the working upper arm beside the bench and lower the dumbbell slowly before changing sides.",
      commonMistakes: [
        "Swinging the upper arm to lift the weight.",
        "Bending the wrist back.",
        "Lifting the shoulder away from the bench.",
      ],
    }
  ),
  "leg-press": placard(
    "leg-press",
    ["Quads"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Bend", "Set both feet flat on the plate."],
      [0, "Brace", "Brace; keep your back against the pad."],
      [1, "Press", "Push the plate away through both feet."],
      [1, "Finish", "Keep knees soft at the finish."],
      [0, "Return", "Bend hips and knees under control."],
      [0, "Reset", "Keep your heels down before pressing again."],
    ],
    [
      "Sit against the back pad and hold the side handles.",
      "Place both feet on the plate; keep heels supported.",
      "Control the return and stop before your back rounds.",
    ],
    {
      tip: "Keep your back supported and press through both feet without snapping your knees straight.",
      commonMistakes: [
        "Rounding the lower back off the pad.",
        "Lifting the heels off the plate.",
        "Snapping the knees straight.",
      ],
    }
  ),
  "handstand-push-ups": placard(
    "handstand-push-ups",
    ["Shoulders"],
    ["Triceps", "Core"],
    [
      [0, "Stack", "Straight arms; keep heels against the wall."],
      [0, "Brace", "Brace your torso; keep legs together."],
      [1, "Lower", "Bend elbows; lower under control."],
      [1, "Touch lightly", "Touch lightly; keep support through your palms."],
      [0, "Press", "Press through both palms to straight arms."],
      [0, "Reset", "Reset with head neutral and heels supported."],
    ],
    [
      "Establish a stable wall-supported handstand before starting.",
      "Place both palms firmly on the floor and keep heels supported.",
      "Keep your neck neutral and control the descent.",
    ],
    {
      tip: "Press through both palms; keep control as your crown approaches the floor.",
      commonMistakes: [
        "Dropping onto your head.",
        "Losing torso control or kicking to press.",
        "Letting the hands slide.",
      ],
    }
  ),
  "straight-arm-pulldown": placard(
    "straight-arm-pulldown",
    ["Lats"],
    ["Triceps", "Core"],
    [
      [0, "Reach", "Start with handles around shoulder height."],
      [0, "Brace", "Brace your torso; keep elbows softly fixed."],
      [1, "Pull to thighs", "Sweep your upper arms toward your sides."],
      [1, "Squeeze", "Finish near thighs without leaning back."],
      [0, "Control return", "Let the handles rise under control."],
      [0, "Reset", "Keep your stance steady before repeating."],
    ],
    [
      "Use two high cable handles; start with a light load.",
      "Stand tall with feet planted and handles around shoulder height.",
      "Keep a small, steady bend in both elbows.",
    ],
    {
      tip: "Pull through your upper arms while keeping your torso steady.",
      commonMistakes: [
        "Turning the movement into an elbow-bending pulldown.",
        "Leaning back or swinging to move the load.",
        "Letting the weight stacks drop on the return.",
      ],
    }
  ),
  "front-squat": placard(
    "front-squat",
    ["Quads"],
    ["Glutes", "Core"],
    [
      [0, "Stand", "Stand tall; keep the harness supported."],
      [0, "Brace", "Brace; keep both feet firmly planted."],
      [1, "Squat", "Bend hips and knees; keep heels grounded."],
      [1, "Control", "Keep chest lifted and knees tracking outward."],
      [0, "Rise", "Push through your whole feet to stand."],
      [0, "Reset", "Stay braced with both hands stabilising."],
    ],
    [
      "Shoulder-harness variation: use a fitted harness and start light.",
      "Set both shoulder pads and bar catches before lifting from a rack.",
      "Keep feet planted; brace before each squat.",
    ],
    {
      tip: "Keep the harness supported on both shoulders and the bar secure in its catches.",
      commonMistakes: [
        "Letting the harness tip or lose shoulder contact.",
        "Lifting your heels or letting knees collapse inward.",
        "Losing your brace or leaning far forward.",
      ],
    }
  ),
  "seated-row": placard(
    "seated-row",
    ["Upper back"],
    ["Biceps"],
    [
      [0, "Reach", "Reach forward; keep both feet braced."],
      [0, "Set", "Keep knees soft and wrists straight."],
      [1, "Row", "Draw elbows back; bring chest upright."],
      [1, "Squeeze", "Bring the handle toward your lower ribs."],
      [0, "Return", "Extend arms; hinge forward under control."],
      [0, "Reset", "Keep feet braced; avoid bouncing."],
    ],
    [
      "Controlled torso-hinge variation: start light and move smoothly.",
      "Sit on the fixed bench; brace both feet with knees slightly bent.",
    ],
    {
      tip: "Use a small, comfortable torso hinge. Avoid bouncing or leaning far back to move the load.",
      commonMistakes: [
        "Jerking the handle or using excessive momentum.",
        "Straightening the knees to drive the movement.",
        "Pulling high toward the shoulders instead of the lower ribs.",
      ],
    }
  ),
  "spin-bike": placard(
    "spin-bike",
    ["Quads"],
    ["Core", "Calves", "Hamstrings"],
    [
      [0, "Seated drive", "Stay seated; pedal with controlled resistance."],
      [0.5, "Seated recovery", "Keep your knees tracking over your feet."],
      [0.5, "Hold seated", "Keep a relaxed hold on the bars."],
      [1, "Standing drive", "Rise from the saddle; keep pedalling controlled."],
      [1, "Hold standing", "Support yourself through the pedals and bars."],
      [0, "Return seated", "Sit back onto the saddle smoothly."],
    ],
    [
      "Dial in seat and bar height — seat level with the bars for most.",
      "Clip or strap in, grip the bars with a firm but relaxed hold.",
    ]
  ),
  elliptical: placard(
    "elliptical",
    ["Quads", "Glutes"],
    ["Front Delts", "Upper Back", "Hamstrings"],
    [
      [0, "Stride A", "Stand tall; keep both feet on pedals."],
      [0, "Hold A", "Keep both feet planted in the pedals."],
      [1, "Stride B", "Coordinate your push and pull with legs."],
      [1, "Hold B", "Hold both grips; keep your chest tall."],
      [0, "Return A", "Return smoothly to the first shown stride."],
      [0, "Reset", "Keep your torso tall without leaning forward."],
    ],
    [
      "Step on the pedals with feet evenly placed, grip the moving handles.",
      "Start with a smooth easy pace to find the stride rhythm.",
    ]
  ),
  "rowing-machine": placard(
    "rowing-machine",
    ["Quads", "Upper back"],
    ["Hamstrings", "Biceps"],
    [
      [0, "Catch", "Compress with straight arms and vertical shins."],
      [0.5, "Drive", "Push with your legs; keep arms straight."],
      [1, "Finish", "Lean back slightly; draw handle below ribs."],
      [1, "Relax", "Stay supported; keep wrists and shoulders relaxed."],
      [0.5, "Recover", "Arms away, then hinge forward before sliding."],
      [0, "Reset", "Recover twice as slowly as you drive."],
    ],
    ["Strap in, grip the handle, start compressed with shins vertical."]
  ),
  "pendlay-row": placard(
    "pendlay-row",
    ["Lats"],
    ["Rhomboids", "Rear Delts", "Biceps", "Core"],
    [
      [0, "Set", "Brace flat-backed with the bar over midfoot."],
      [0, "Brace", "Keep your torso low and feet planted."],
      [1, "Row", "Row the bar toward your lower chest."],
      [1, "Squeeze", "Draw elbows back; squeeze your shoulder blades."],
      [0, "Lower", "Lower under control to a dead stop."],
      [0, "Reset", "Keep feet planted; brace before each row."],
    ],
    [
      "Set up with torso parallel to the floor, bar on the ground over midfoot.",
      "Grip just outside your knees, back flat, core braced hard.",
    ]
  ),
  "leg-extension": placard(
    "leg-extension",
    ["Quads"],
    ["Hip Flexors"],
    [
      [0, "Set", "Keep your back supported and hips seated."],
      [0, "Brace", "Brace your torso and grip the handles."],
      [1, "Squeeze", "Straighten your legs and squeeze your quads."],
      [1, "Hold", "Keep your hips down and hands gripping."],
      [0, "Return", "Bend your knees slowly; control the resistance."],
      [0, "Reset", "Return to bent knees without losing control."],
    ],
    [
      "Sit in the machine, adjust the pad so it sits on your shins, just above the ankle.",
    ]
  ),
  "single-leg-calf-raise": placard(
    "single-leg-calf-raise",
    ["Calves"],
    ["Soleus"],
    [
      [0, "Low", "Lower heel slightly below the step."],
      [0, "Brace", "Keep your knee straight; balance lightly."],
      [1, "Top", "Rise onto your toes without pulling."],
      [1, "Hold", "Pause tall; squeeze your working calf."],
      [0, "Lower", "Lower slowly through the shown range."],
      [0, "Reset", "Reset below step; keep forefoot planted."],
    ],
    [
      "Stand on one foot on a step's edge, ball of the foot planted, heel hanging free.",
      "Hold a wall or rail for balance only — don't pull yourself up with it.",
    ]
  ),
  "side-plank": placard(
    "side-plank",
    ["Obliques"],
    ["Core", "Shoulders"],
    [
      [1, "Support", "Keep your elbow beneath your shoulder."],
      [1, "Stack", "Keep your feet stacked and steady."],
      [1, "Align", "Keep head, hips and feet aligned."],
      [1, "Brace", "Keep your hips raised and core braced."],
      [1, "Breathe", "Breathe normally without dropping your hips."],
      [1, "Time", "Hold for time; then repeat opposite side."],
    ],
    [
      "Lie on your side with your forearm on the floor, elbow under your shoulder.",
      "Stack your feet (or stagger for easier) and brace your core.",
      "Lift your hips off the floor into a straight line from head to feet.",
    ]
  ),
  "overhead-extension": placard(
    "overhead-extension",
    ["Triceps"],
    ["Front Delts"],
    [
      [0, "Top", "Hold the dumbbell overhead with both hands."],
      [0, "Brace", "Keep your core braced and elbows up."],
      [1, "Lower", "Bend elbows; lower the dumbbell behind head."],
      [1, "Bottom", "Keep your upper arms beside your head."],
      [0, "Extend", "Straighten your elbows and squeeze your triceps."],
      [0, "Reset", "Keep the dumbbell steady at full extension."],
    ],
    [
      "Stand or sit, hold one dumbbell with both hands straight overhead.",
      "Keep elbows close to your ears and pointed at the ceiling.",
    ]
  ),
  "face-pulls": placard(
    "face-pulls",
    ["Rear Delts"],
    ["Rhomboids", "Traps", "Rotator Cuff"],
    [
      [0, "Reach", "Extend arms toward pulley, palms down."],
      [0, "Brace", "Stay steady; set your shoulder blades."],
      [1, "Rotate", "Pull toward face, separating grips past ears."],
      [1, "Squeeze", "Keep elbows high and knuckles up."],
      [0, "Return", "Return slowly with your elbows high."],
      [0, "Reset", "Straighten arms; keep cable tension."],
    ],
    [
      "Set a rope at or slightly above face height and grip the ends with palms down.",
      "Step back for tension, arms extended straight toward the pulley.",
    ]
  ),
  "t-bar-row": placard(
    "t-bar-row",
    ["Mid Back"],
    ["Lats", "Rhomboids", "Biceps"],
    [
      [0, "Stretch", "Let your arms reach full extension."],
      [0, "Hinge", "Keep your back flat and hips still."],
      [1, "Top", "Draw the handle toward your lower chest."],
      [1, "Squeeze", "Keep elbows back and both grips closed."],
      [0, "Return", "Return to straight arms without rounding."],
      [0, "Reset", "Stay hinged; keep both feet planted."],
    ],
    [
      "Straddle the loaded bar or landmine and grip the handles at your shins.",
      "Hinge forward to about 45\u00b0, chest up, back flat, core braced.",
    ]
  ),
  bike: placard(
    "bike",
    ["Quads"],
    ["Hamstrings"],
    [
      [0, "Lower Pedal", "Keep a slight bend at the bottom."],
      [0, "Posture", "Sit tall; keep hips supported and level."],
      [0.5, "Opposed Legs", "Let the other leg take its turn."],
      [0.5, "Relaxed Grip", "Keep your grip relaxed and shoulders down."],
      [0, "Cadence", "Pedal steadily without yanking on the upstroke."],
      [0, "Resistance", "Adjust resistance to match your target effort."],
    ],
    [
      "Adjust the seat so your leg has a slight bend at the bottom of the pedal.",
      "Sit with a neutral spine, grip the bars loosely.",
    ]
  ),
  "pull-ups": placard(
    "pull-ups",
    ["Lats"],
    ["Biceps", "Rear Delts", "Core"],
    [
      [0, "Hang", "Start from a full dead hang."],
      [0, "Grip", "Grip overhand, slightly wider than shoulders."],
      [1, "Top", "Your chin clears the bar."],
      [1, "Hold", "Keep legs straight; avoid swinging."],
      [0, "Return", "Return to full elbow extension."],
      [0, "Reset", "Finish still in a full hang."],
    ],
    ["Hang from the bar with an overhand grip slightly wider than shoulders."]
  ),
  "ab-wheel": placard(
    "ab-wheel",
    ["Core"],
    ["Lats", "Shoulders"],
    [
      [0, "Brace", "Brace core; tuck pelvis; keep back neutral."],
      [0.5, "Roll", "Roll forward with straight arms; knees planted."],
      [1, "Reach", "Reach only while your back stays neutral."],
      [1, "Hold", "Hold your brace without sagging."],
      [0.5, "Return", "Pull back with abs; keep elbows straight."],
      [0, "Reset", "Reset under shoulders without sitting on heels."],
    ],
    [
      "Kneel on a pad holding the ab wheel with both hands under your shoulders.",
    ]
  ),
  "kettlebell-swing": placard(
    "kettlebell-swing",
    ["Glutes", "Hamstrings"],
    ["Core", "Lower Back"],
    [
      [0, "Hike", "Hinge back; guide bell between your legs."],
      [0.5, "Drive", "Drive through your feet and extend hips."],
      [1, "Float", "Let the bell float to chest height."],
      [1, "Brace", "Brace your abs without leaning back."],
      [0.5, "Return", "Let the bell fall; keep arms relaxed."],
      [0, "Reset", "Hinge back as bell passes your legs."],
    ],
    [
      "Stand with feet shoulder-width, bell on the floor a foot in front of you.",
      "Hinge at the hips and grip the handle with both hands, back flat.",
    ]
  ),
  "rear-delt-machine-fly": placard(
    "rear-delt-machine-fly",
    ["Rear Delts"],
    ["Rhomboids", "Traps"],
    [
      [0, "Reach", "Keep your chest against the pad."],
      [0.5, "Open", "Open both arms with elbows softly bent."],
      [1, "Squeeze", "Spread the handles; keep your shoulders down."],
      [1, "Hold", "Hold wide without arching or shrugging."],
      [0.5, "Return", "Return slowly; keep your elbows softly bent."],
      [0, "Reset", "Keep tension as the handles return."],
    ]
  ),
  deadlift: placard(
    "deadlift",
    ["Glutes", "Hamstrings"],
    ["Erectors", "Traps"],
    [
      [1, "Set", "Bar over midfoot; grip outside your shins."],
      [1, "Brace", "Brace your trunk; keep both arms straight."],
      [0.3, "Clear knees", "Drive up; keep the bar close."],
      [0, "Stand", "Stand tall; avoid leaning back or shrugging."],
      [0, "Control", "Hold your grip; control the return."],
      [0.3, "Lower", "Hinge back; guide the bar along legs."],
    ]
  ),
  "seated-calf-raise": placard(
    "seated-calf-raise",
    ["Calves"],
    [],
    [
      [0, "Stretch", "Lower your heels under control."],
      [0.875, "Rise", "Press through the balls of your feet."],
      [1, "Squeeze", "Raise your heels; keep knees under pads."],
      [1, "Hold", "Keep the contraction controlled."],
      [0.875, "Lower", "Ease your heels down from the top."],
      [0, "Reset", "Return to the lower heel position."],
    ]
  ),
  "jm-press": placard(
    "jm-press",
    ["Triceps"],
    ["Chest", "Front Delts"],
    [
      [0, "Set", "Hold a shoulder-width grip above your chest."],
      [0.3, "Lower", "Bend elbows; lower toward your upper chin."],
      [1, "Bottom", "Keep the bar above your throat."],
      [1, "Hold", "Stay supported; keep the bar controlled."],
      [0.3, "Extend", "Drive your elbows forward and up."],
      [0, "Finish", "Finish with both arms naturally extended."],
    ]
  ),
  "smith-bench-press": placard(
    "smith-bench-press",
    ["Chest"],
    ["Triceps", "Front Delts"],
    [
      [0, "Set", "Hold the unracked bar above your chest."],
      [0.12, "Lower", "Lower toward your chest with wrists stacked."],
      [1, "Bottom", "Touch your mid-chest without bouncing."],
      [1, "Hold", "Keep head, back and feet supported."],
      [0.12, "Press", "Press upward along the guides."],
      [0, "Finish", "Extend both elbows; keep your shoulders supported."],
    ]
  ),
  "close-grip-bench": placard(
    "close-grip-bench",
    ["Triceps"],
    ["Chest", "Front Delts"],
    [
      [0, "Set", "Keep head supported; grip inside shoulder-width."],
      [0.5, "Lower", "Lower with elbows tucked and wrists straight."],
      [1, "Bottom", "Touch the lower chest without bouncing."],
      [1, "Hold", "Pause briefly; keep your upper back firm."],
      [0.5, "Press", "Press upward with both arms together."],
      [0, "Finish", "Extend both elbows; keep your feet planted."],
    ]
  ),
  "barbell-step-ups": placard(
    "barbell-step-ups",
    ["Quads"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Set", "Keep leading foot fully on the box."],
      [0.5, "Drive", "Drive through the leading heel; rise steadily."],
      [1, "Stand", "Bring the trailing foot onto the box."],
      [1, "Hold", "Stand tall; keep the bar steady."],
      [0.5, "Lower", "Step back down with control."],
      [0, "Return", "Set the trailing foot down quietly."],
    ]
  ),
  "hack-squat": placard(
    "hack-squat",
    ["Quads"],
    ["Glutes"],
    [
      [0, "Set", "Back supported; keep both heels planted."],
      [0.5, "Lower", "Bend knees; lower the carriage under control."],
      [1, "Bottom", "Keep heels flat and knees tracking toes."],
      [1, "Hold", "Pause briefly without bouncing."],
      [0.5, "Rise", "Press through your feet; follow the rails."],
      [0, "Stand", "Finish tall without locking knees hard."],
    ]
  ),
  "seated-leg-curl": placard(
    "seated-leg-curl",
    ["Hamstrings"],
    ["Calves"],
    [
      [0, "Extend", "Keep back supported; hold both handles."],
      [0.5, "Curl", "Curl the pad down and back."],
      [1, "Squeeze", "Squeeze hamstrings; keep thighs under restraint."],
      [1, "Hold", "Hold briefly without lifting your hips."],
      [0.5, "Return", "Let the pad rise under control."],
      [0, "Reset", "Maintain tension; keep knees softly extended."],
    ]
  ),
  "hip-abduction-machine": placard(
    "hip-abduction-machine",
    ["Glutes"],
    ["Hip flexors"],
    [
      [0, "Set", "Keep back supported; grip both handles."],
      [0.5, "Open", "Press both knees outward under control."],
      [1, "Wide", "Squeeze outer glutes; keep hips seated."],
      [1, "Hold", "Hold open; keep your torso still."],
      [0.5, "Return", "Bring your knees together slowly."],
      [0, "Reset", "Maintain tension before the next repetition."],
    ]
  ),
  "trap-bar-deadlift": placard(
    "trap-bar-deadlift",
    ["Glutes"],
    ["Quads", "Hamstrings", "Core", "Traps"],
    [
      [0, "Set", "Brace inside the frame; grip both handles."],
      [0.5, "Drive", "Push the floor away; keep arms straight."],
      [1, "Stand", "Stand tall with hips and knees extended."],
      [1, "Hold", "Keep shoulders stacked; avoid leaning back."],
      [0.5, "Lower", "Hinge back, then bend both knees."],
      [0, "Reset", "Set the plates down under control."],
    ]
  ),
  "inverted-row": placard(
    "inverted-row",
    ["Upper back", "Lats"],
    ["Biceps", "Core"],
    [
      [0, "Hang", "Arms straight; brace from shoulders to heels."],
      [0.5, "Pull", "Drive elbows back; keep your body straight."],
      [1, "Chest", "Bring your chest to the fixed bar."],
      [1, "Squeeze", "Squeeze shoulder blades; keep heels supported."],
      [0.5, "Lower", "Lower slowly without dropping your hips."],
      [0, "Extend", "Return to straight arms; keep your plank."],
    ]
  ),
  "hip-thrust": placard(
    "hip-thrust",
    ["Glutes"],
    ["Hamstrings", "Core"],
    [
      [0, "Set", "Brace; keep upper back against the bench."],
      [0.5, "Rise", "Drive through your heels; raise your hips."],
      [1, "Extend", "Squeeze glutes without arching your lower back."],
      [1, "Hold", "Keep ribs down and the bar steady."],
      [0.5, "Lower", "Lower your hips with control."],
      [0, "Return", "Keep feet planted; prepare the next repetition."],
    ]
  ),
  "walking-dumbbell-lunges": placard(
    "walking-dumbbell-lunges",
    ["Quads"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Lower", "Front heel down; rear knee hovers."],
      [0, "Hold", "Stay upright; keep dumbbells at sides."],
      [0.25, "Step through", "Drive forward; bring your rear leg through."],
      [0.5, "Alternate", "Lunge forward onto the opposite leg."],
      [0.5, "Steady", "Front foot flat; rear heel raised."],
      [0.75, "Advance", "Rise forward and begin the next stride."],
    ]
  ),
  lunges: placard(
    "lunges",
    ["Quads"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Ready", "Stand tall; hold dumbbells at sides."],
      [0.3, "Step", "Step forward; keep your torso upright."],
      [1, "Lower", "Bend both knees; rear knee hovers."],
      [1, "Hold", "Keep front heel down and torso upright."],
      [0.3, "Return", "Push back through the front foot."],
      [0, "Reset", "Stand tall; alternate legs next repetition."],
    ]
  ),
  "bodyweight-lunge": placard(
    "bodyweight-lunge",
    ["Quads"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Ready", "Stand tall with hands on hips."],
      [0.3, "Step", "Step forward; keep your torso upright."],
      [1, "Lower", "Bend both knees; rear knee hovers."],
      [1, "Hold", "Keep front heel down and torso upright."],
      [0.3, "Return", "Push back through the front foot."],
      [0, "Reset", "Stand tall; alternate legs next repetition."],
    ]
  ),
  "reverse-pec-deck": placard(
    "reverse-pec-deck",
    ["Rear delts"],
    ["Traps", "Rhomboids"],
    [
      [0, "Reach", "Keep chest supported; reach forward."],
      [0.6, "Open", "Sweep handles wide with elbows softly bent."],
      [1, "Squeeze", "Open arms; keep shoulders down."],
      [1, "Hold", "Hold briefly with chest against pad."],
      [0.6, "Return", "Control the handles inward."],
      [0, "Reset", "Return forward while maintaining tension."],
    ]
  ),
  "sissy-squat": placard(
    "sissy-squat",
    ["Quads"],
    ["Hip flexors"],
    [
      [0, "Stand", "Hold the support and stand tall."],
      [0.4, "Begin", "Raise heels; bend knees forward."],
      [1, "Lean", "Lean back with hips extended."],
      [1, "Hold", "Keep shoulders, hips and knees aligned."],
      [0.4, "Rise", "Push through toes; straighten your knees."],
      [0, "Return", "Lower heels and stand tall."],
    ]
  ),
  "muscle-ups": placard(
    "muscle-ups",
    ["Upper back"],
    ["Chest", "Triceps", "Core"],
    [
      [0, "Hang", "Hang with straight arms and false grip."],
      [0.4, "Pull", "Lean back; pull bar toward lower chest."],
      [0.8, "Turn", "Roll wrists; bring chest over the bar."],
      [1, "Support", "Press down until both elbows straighten."],
      [0.8, "Lower", "Bend elbows; keep both hands connected."],
      [0.4, "Return", "Lower through the pull into your hang."],
    ]
  ),
  "bulgarian-split": placard(
    "bulgarian-split",
    ["Quads"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Set", "Plant front foot; rest rear instep."],
      [0.5, "Lower", "Bend front knee; keep torso braced."],
      [1, "Bottom", "Keep front heel down, knee aligned."],
      [1, "Control", "Keep both weights still at sides."],
      [0.5, "Drive", "Push through your front foot."],
      [0, "Stand", "Stand tall before repeating this side."],
    ]
  ),
  "glute-ham-raise": placard(
    "glute-ham-raise",
    ["Hamstrings"],
    ["Glutes", "Calves"],
    [
      [0, "Set", "Brace your body; keep hips extended."],
      [0.4, "Lower", "Lower from knees; keep hips straight."],
      [0.75, "Extend", "Extend knees while keeping thighs supported."],
      [1, "Long", "Keep ankles secured and hips extended."],
      [0.75, "Curl", "Curl upward using your hamstrings."],
      [0.4, "Rise", "Return tall without bending at waist."],
    ]
  ),
  "sumo-deadlift": placard(
    "sumo-deadlift",
    ["Glutes"],
    ["Quads", "Hamstrings", "Adductors", "Core", "Traps"],
    [
      [0, "Set", "Set wide; grip inside your knees."],
      [0.5, "Drive", "Drive through feet; keep arms straight."],
      [1, "Stand", "Stand tall without leaning back."],
      [1, "Control", "Tighten glutes; keep the bar close."],
      [0.5, "Lower", "Hinge back; guide knees over toes."],
      [0, "Return", "Return the plates to the floor."],
    ]
  ),
  "ski-erg": placard(
    "ski-erg",
    ["Upper back / lats"],
    ["Core", "Triceps"],
    [
      [0, "Catch", "Start tall with both handles high."],
      [0.25, "Crunch", "Begin the pull with your core."],
      [0.6, "Drive", "Hinge forward; pull both handles down."],
      [1, "Finish", "Finish with handles beside your thighs."],
      [0.6, "Recover", "Rise smoothly as both handles return."],
      [0.25, "Reach", "Return to the high handle position."],
    ]
  ),
  "tricep-dips": placard(
    "tricep-dips",
    ["Triceps"],
    ["Chest", "Front deltoids"],
    [
      [0, "Top", "Support yourself with arms straight."],
      [0.5, "Lower", "Bend elbows back; keep chest upright."],
      [1, "Bottom", "Lower until upper arms reach horizontal."],
      [1, "Control", "Keep shoulders steady and feet suspended."],
      [0.5, "Press", "Press down through both fixed grips."],
      [0, "Reset", "Finish tall with arms straight."],
    ]
  ),
  "rack-pull": placard(
    "rack-pull",
    ["Hamstrings", "Glutes", "Lower back"],
    ["Traps"],
    [
      [0, "Set", "Brace with the bar on pins."],
      [0.5, "Rise", "Push through feet; keep arms straight."],
      [1, "Stand", "Stand tall without leaning back."],
      [1, "Hold", "Keep the bar close to thighs."],
      [0.5, "Lower", "Hinge back and lower under control."],
      [0, "Reset", "Settle the bar onto both pins."],
    ]
  ),
  "landmine-press": placard(
    "landmine-press",
    ["Front deltoids"],
    ["Chest", "Triceps"],
    [
      [0, "Set", "Hold the bar beside your shoulder."],
      [0.5, "Press", "Press up and forward; keep feet planted."],
      [1, "Reach", "Extend your arm without leaning back."],
      [1, "Control", "Keep the bar steady at full reach."],
      [0.5, "Lower", "Bend your elbow to lower slowly."],
      [0, "Reset", "Return the bar beside your shoulder."],
    ]
  ),
  "overhead-cable-tricep-extension": placard(
    "overhead-cable-tricep-extension",
    ["Triceps"],
    ["Shoulders"],
    [
      [0, "Stretch", "Bend elbows with upper arms raised."],
      [0.2, "Extend", "Extend elbows while keeping your torso still."],
      [1, "Finish", "Straighten arms without locking elbows forcefully."],
      [1, "Control", "Keep the rope steady above your head."],
      [0.2, "Return", "Bend elbows slowly against the cable tension."],
      [0, "Reset", "Return to your controlled overhead stretch."],
    ]
  ),
  "cable-fly": placard(
    "cable-fly",
    ["Chest"],
    ["Front delts"],
    [
      [0, "Open", "Keep a soft bend in both elbows."],
      [0.35, "Sweep", "Sweep your arms inward without pressing."],
      [0.75, "Close", "Bring the handles toward your chest midline."],
      [1, "Squeeze", "Bring hands together while keeping elbows soft."],
      [0.75, "Return", "Open your arms slowly against cable tension."],
      [0.35, "Reset", "Return wide without changing your stance."],
    ]
  ),
  "lat-pulldown": placard(
    "lat-pulldown",
    ["Lats"],
    ["Biceps", "Rear delts"],
    [
      [0, "Stretch", "Keep thighs pinned and reach overhead."],
      [0.16, "Initiate", "Draw elbows down without rocking your torso."],
      [0.57, "Pull", "Pull the bar in front of you."],
      [1, "Chest", "Bring the bar to your upper chest."],
      [0.57, "Return", "Let the bar rise under control."],
      [0.16, "Extend", "Extend your arms while keeping shoulders controlled."],
    ]
  ),
  "romanian-deadlift": placard(
    "romanian-deadlift",
    ["Hamstrings"],
    ["Glutes", "Lower Back"],
    [
      [0, "Set", "Stand tall with the bar close."],
      [0.65, "Lower", "Keep the bar close as hips retreat."],
      [1, "Stretch", "Stop at your controlled hamstring stretch."],
      [1, "Hold", "Keep your spine steady at the bottom."],
      [0.65, "Rise", "Drive hips forward while keeping arms long."],
      [0, "Stand", "Finish tall without leaning back."],
    ]
  ),
  "reverse-grip-cable-pushdown": placard(
    "reverse-grip-cable-pushdown",
    ["Triceps"],
    ["Forearms"],
    [
      [0, "Set", "Keep elbows tucked and palms facing up."],
      [0.3, "Press", "Press down while keeping upper arms still."],
      [0.72, "Extend", "Continue extending with straight wrists."],
      [1, "Finish", "Finish with arms extended and shoulders steady."],
      [0.72, "Lower", "Let the bar rise under control."],
      [0.3, "Return", "Return toward the start with elbows tucked."],
    ]
  ),
  "db-shoulder-press": placard(
    "db-shoulder-press",
    ["Deltoids"],
    ["Triceps", "Upper Chest"],
    [
      [0, "Set", "Brace with dumbbells at shoulder height."],
      [0.2, "Press", "Press upward with wrists over elbows."],
      [0.65, "Raise", "Continue upward without arching your back."],
      [1, "Extend", "Finish overhead with controlled elbow extension."],
      [0.63, "Lower", "Lower under control with your back supported."],
      [0.35, "Return", "Lower toward shoulder height with planted feet."],
    ]
  ),
  "nordic-hamstring-curl": placard(
    "nordic-hamstring-curl",
    ["Hamstrings"],
    ["Calves"],
    [
      [0, "Upright", "Brace with your knees and ankles secured."],
      [0.6, "Lean", "Lean forward while keeping your hips extended."],
      [0.8, "Lower", "Lower your straight body under control."],
      [1, "Control", "Control the lowest position without folding hips."],
      [0.65, "Rise", "Pull your straight body upward through hamstrings."],
      [0.2, "Return", "Continue upward while keeping your hips extended."],
    ]
  ),
  "jump-rope": placard(
    "jump-rope",
    ["Calves"],
    ["Shoulders"],
    [
      [0, "Overhead", "Turn the rope overhead with relaxed wrists."],
      [0.3333333333333333, "Take off", "Begin a low hop with feet close."],
      [0.5, "Clear", "Let the rope clear beneath both shoes."],
      [0.625, "Descend", "Keep knees soft as your body descends."],
      [0.7777777777777778, "Land", "Land softly through your forefeet."],
      [
        0.9027777777777778,
        "Rebound",
        "Extend gently into the next low bounce.",
      ],
    ]
  ),
  "reverse-flyes": placard(
    "reverse-flyes",
    ["Rear Delts"],
    ["Traps", "Rhomboids"],
    [
      [0, "Hang", "Hinge; hang weights beneath your shoulders."],
      [0.35, "Initiate", "Open both arms with softly bent elbows."],
      [0.75, "Spread", "Continue outward; keep your torso still."],
      [1, "Open", "Reach shoulder height; keep your neck neutral."],
      [0.8, "Lower", "Lower both weights under control."],
      [0.4, "Return", "Return the weights toward the hanging start."],
    ]
  ),
  "weighted-plank": placard(
    "weighted-plank",
    ["Core"],
    ["Shoulders", "Glutes"],
    [
      [0, "Set", "Place elbows under shoulders and brace."],
      [1, "Load", "Partner places plate over your shoulder blades."],
      [1, "Brace", "Tighten your core and glutes."],
      [1, "Hold", "Keep your body straight and still."],
      [1, "Breathe", "Breathe shallowly while maintaining your brace."],
      [0, "Finish", "Have your partner remove the plate."],
    ]
  ),
  "cable-glute-kickback": placard(
    "cable-glute-kickback",
    ["Glutes"],
    ["Hamstrings"],
    [
      [0, "Set", "Brace and grip the frame for balance."],
      [0.6, "Drive", "Move your working leg straight back."],
      [1, "Extend", "Squeeze your glute without arching your back."],
      [1, "Squeeze", "Keep your pelvis still at full extension."],
      [0.6, "Return", "Bring your leg forward under control."],
      [0, "Reset", "Keep cable tension before the next repetition."],
    ]
  ),
  "hip-adduction-machine": placard(
    "hip-adduction-machine",
    ["Adductors"],
    ["Glutes"],
    [
      [0, "Wide", "Keep your back against the pad."],
      [0.6, "Close", "Squeeze your knees inward under control."],
      [1, "Squeeze", "Bring the pads together without bouncing."],
      [1, "Hold", "Hold the squeeze with your core braced."],
      [0.6, "Open", "Return slowly to the wide position."],
      [0, "Reset", "Keep tension before the next repetition."],
    ]
  ),
  "db-rdl": placard(
    "db-rdl",
    ["Hamstrings"],
    ["Glutes", "Lower Back", "Traps"],
    [
      [0, "Set", "Stand tall with softly bent knees."],
      [0.6, "Hinge", "Push your hips back with straight arms."],
      [1, "Stretch", "Lower the dumbbells close to your shins."],
      [1, "Hold", "Keep your back straight and heels planted."],
      [0.6, "Rise", "Drive your hips forward to rise."],
      [0, "Stand", "Stand tall without leaning back."],
    ]
  ),
  "smith-machine-squat": placard(
    "smith-machine-squat",
    ["Quads"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Set", "Rest the bar across your upper traps."],
      [0.6, "Lower", "Bend your knees with heels planted."],
      [1, "Bottom", "Lower until your thighs reach parallel."],
      [1, "Hold", "Stay braced with knees tracking your toes."],
      [0.6, "Rise", "Drive upward through your whole foot."],
      [0, "Stand", "Stand tall without locking your knees."],
    ]
  ),
  "single-arm-cable-pushdown": placard(
    "single-arm-cable-pushdown",
    ["Triceps"],
    ["Forearms"],
    [
      [0, "Set", "Pin your elbow beside your ribs."],
      [0.6, "Press", "Push down with a straight wrist."],
      [1, "Lockout", "Straighten your arm without moving your elbow."],
      [1, "Hold", "Keep your shoulder and torso still."],
      [0.6, "Return", "Return slowly, keeping the cable taut."],
      [0, "Reset", "Bend your elbow under control."],
    ]
  ),
  "bayesian-cable-curl": placard(
    "bayesian-cable-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Stagger your stance; face away from pulley."],
      [0.6, "Curl", "Curl with your elbow behind your torso."],
      [1, "Top", "Bring your hand toward your shoulder."],
      [1, "Hold", "Hold briefly without leaning or shrugging."],
      [0.6, "Lower", "Lower slowly, keeping your upper arm still."],
      [0, "Return", "Return with the cable still taut."],
    ]
  ),
  "cable-curl": placard(
    "cable-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Grip underhand; keep tension in the cable."],
      [0.6, "Curl", "Curl upward with elbows at your sides."],
      [1, "Top", "Bring the bar toward your shoulders."],
      [1, "Hold", "Hold briefly without leaning or shrugging."],
      [0.6, "Lower", "Lower slowly, keeping your elbows still."],
      [0, "Return", "Return with the cable still taut."],
    ]
  ),
  "preacher-curl": placard(
    "preacher-curl",
    ["Biceps"],
    ["Forearms"],
    [
      [0, "Set", "Support upper arms; keep your elbows soft."],
      [0.6, "Curl", "Curl upward with upper arms against pad."],
      [1, "Top", "Bring bar toward shoulders without shrugging."],
      [1, "Hold", "Hold briefly with wrists straight."],
      [0.6, "Lower", "Lower slowly, keeping upper arms supported."],
      [0, "Return", "Stop just short of locking your elbows."],
    ]
  ),
  "cuban-press": placard(
    "cuban-press",
    ["Shoulders"],
    ["Rotator Cuff", "Traps"],
    [
      [0, "Set", "Hold light dumbbells beside your thighs."],
      [
        0.3333333333333333,
        "Row",
        "Lead with elbows, keeping weights below them.",
      ],
      [
        0.6666666666666666,
        "Rotate",
        "Rotate upward, keeping elbows at shoulder height.",
      ],
      [1, "Press", "Press overhead without arching your back."],
      [
        0.6666666666666666,
        "Lower",
        "Lower slowly until your forearms are upright.",
      ],
      [
        0.3333333333333333,
        "Reverse",
        "Rotate down, then lower toward your thighs.",
      ],
    ]
  ),
  "smith-shoulder-press": placard(
    "smith-shoulder-press",
    ["Deltoids"],
    ["Triceps", "Upper Chest"],
    [
      [0, "Set", "Brace with the bar near your collarbone."],
      [
        0.3333333333333333,
        "Initiate",
        "Press upward with your back supported.",
      ],
      [0.6666666666666666, "Press", "Keep both wrists above your elbows."],
      [1, "Extend", "Straighten your arms without shrugging."],
      [0.6666666666666666, "Lower", "Lower the bar slowly under control."],
      [
        0.3333333333333333,
        "Return",
        "Return toward your collarbone without bouncing.",
      ],
    ]
  ),
  "shoulder-press-machine": placard(
    "shoulder-press-machine",
    ["Deltoids"],
    ["Triceps"],
    [
      [0, "Set", "Brace with your back against the pad."],
      [0.3333333333333333, "Initiate", "Press both handles upward together."],
      [
        0.6666666666666666,
        "Press",
        "Keep your wrists stacked over your elbows.",
      ],
      [1, "Extend", "Extend your arms without shrugging."],
      [0.6666666666666666, "Lower", "Bend your elbows slowly under control."],
      [
        0.3333333333333333,
        "Return",
        "Lower toward shoulder height without bouncing.",
      ],
    ]
  ),
  "cable-lateral-raise": placard(
    "cable-lateral-raise",
    ["Side Delts"],
    ["Traps"],
    [
      [0, "Tension", "Stand tall with the cable taut."],
      [
        0.3333333333333333,
        "Initiate",
        "Raise your arm without bending your elbow.",
      ],
      [0.6666666666666666, "Raise", "Keep your torso still as you lift."],
      [1, "Shoulder height", "Stop at shoulder height without shrugging."],
      [
        0.6666666666666666,
        "Lower",
        "Lower slowly with your elbow angle fixed.",
      ],
      [0.3333333333333333, "Control", "Maintain tension as your arm returns."],
    ]
  ),
  "single-arm-lat-pulldown": placard(
    "single-arm-lat-pulldown",
    ["Lats"],
    ["Biceps", "Rear Delts"],
    [
      [0, "Stretch", "Reach overhead without twisting your torso."],
      [
        0.3333333333333333,
        "Initiate",
        "Pull your elbow down toward your side.",
      ],
      [0.6666666666666666, "Pull", "Keep your wrist above your elbow."],
      [1, "Contract", "Bring your elbow down beside your waist."],
      [0.6666666666666666, "Return", "Let your arm rise under control."],
      [0.3333333333333333, "Extend", "Continue upward toward a full stretch."],
    ]
  ),
  "chin-ups": placard(
    "chin-ups",
    ["Lats"],
    ["Biceps", "Core"],
    [
      [0, "Hang", "Hang tall with an underhand grip."],
      [0.3333333333333333, "Initiate", "Keep shoulders down as you rise."],
      [0.6666666666666666, "Pull", "Pull your elbows toward your ribs."],
      [1, "Clear", "Bring your chin above the bar."],
      [0.6666666666666666, "Lower", "Lower slowly without swinging."],
      [0.3333333333333333, "Extend", "Continue down toward a full hang."],
    ]
  ),
  "chest-supported-db-row": placard(
    "chest-supported-db-row",
    ["Mid Back"],
    ["Rhomboids", "Rear Delts", "Biceps"],
    [
      [0, "Stretch", "Let both dumbbells hang below your shoulders."],
      [0.5, "Row", "Pull with your chest on the pad."],
      [1, "Hips", "Row both dumbbells toward your hips."],
      [1, "Squeeze", "Briefly squeeze your shoulder blades together."],
      [0.5, "Lower", "Lower both weights under control."],
      [0, "Return", "Fully extend; keep your chest supported."],
    ]
  ),
  "db-row": placard(
    "db-row",
    ["Lats"],
    ["Rhomboids", "Rear Delts", "Biceps"],
    [
      [0, "Stretch", "Keep your back long and level."],
      [
        0.3333333333333333,
        "Start Row",
        "Draw your elbow back along your ribs.",
      ],
      [
        0.6666666666666666,
        "Continue",
        "Keep your supporting hand and knee still.",
      ],
      [1, "Hip", "Bring the dumbbell toward your hip."],
      [0.6666666666666666, "Lower", "Lower slowly without twisting."],
      [0.3333333333333333, "Return", "Finish with a controlled full stretch."],
    ]
  ),
  "incline-db-press": placard(
    "incline-db-press",
    ["Upper Chest"],
    ["Front Delts", "Triceps"],
    [
      [0, "Stretch", "Keep your shoulder blades set."],
      [0.3333333333333333, "Begin Press", "Press upward with straight wrists."],
      [0.6666666666666666, "Continue", "Bring the weights slightly inward."],
      [1, "Top", "Finish over your upper chest."],
      [0.6666666666666666, "Lower", "Lower both weights under control."],
      [0.3333333333333333, "Return", "Return slowly to your upper chest."],
    ]
  ),
  "incline-treadmill-walk": placard(
    "incline-treadmill-walk",
    ["Glutes", "Calves"],
    ["Quads", "Hamstrings"],
    [
      [0, "Contact", "Walk uphill; keep your hands free."],
      [
        0.16666666666666666,
        "Load",
        "Transfer weight smoothly onto your front foot.",
      ],
      [
        0.3333333333333333,
        "Swing",
        "Swing your opposite leg forward without rushing.",
      ],
      [0.5, "Switch", "Land softly; lean slightly from your ankles."],
      [
        0.6666666666666666,
        "Transfer",
        "Let your arms counter your leg movement.",
      ],
      [
        0.8333333333333334,
        "Return",
        "Keep walking with an even, comfortable stride.",
      ],
    ]
  ),
  treadmill: placard(
    "treadmill",
    ["Quads", "Calves"],
    ["Glutes", "Hamstrings"],
    [
      [0, "Contact", "Step naturally; keep your hands off rails."],
      [
        0.16666666666666666,
        "Load",
        "Transfer weight smoothly onto your front foot.",
      ],
      [
        0.3333333333333333,
        "Swing",
        "Swing your opposite leg forward without rushing.",
      ],
      [0.5, "Switch", "Land the other heel; stay upright."],
      [
        0.6666666666666666,
        "Transfer",
        "Let your arms counter your leg movement.",
      ],
      [
        0.8333333333333334,
        "Return",
        "Keep walking with an even, comfortable stride.",
      ],
    ]
  ),
  "box-jumps": placard(
    "box-jumps",
    ["Quads", "Glutes"],
    ["Calves"],
    [
      [0, "Setup", "Face the box; keep your knees soft."],
      [0.2, "Load", "Dip slightly; swing both arms behind you."],
      [0.4, "Jump", "Drive upward; bring both feet forward."],
      [0.6, "Land", "Land softly with both feet together."],
      [0.8, "Stand", "Stand fully upright on the box."],
      [1, "Step Down", "Step down backward; lower one foot first."],
    ]
  ),
  "battle-ropes": placard(
    "battle-ropes",
    ["Front deltoids"],
    ["Abs", "Forearms"],
    [
      [0, "Wave A", "Lift one hand; lower the other."],
      [0.2, "Alternate", "Alternate arms; keep your knees softly bent."],
      [0.4, "Switch", "Keep your torso still as hands switch."],
      [0.6, "Wave B", "Lift the opposite hand; drive waves forward."],
      [0.8, "Return", "Reverse arm positions without rocking your torso."],
      [0, "Repeat", "Keep alternating; send waves toward the anchor."],
    ]
  ),
  "man-maker": placard(
    "man-maker",
    ["Chest", "Upper back", "Shoulders"],
    ["Quadriceps", "Abs"],
    [
      [0, "Push-Up", "Lower your chest between the dumbbells."],
      [0.2, "Row One", "Row one weight; keep your hips square."],
      [0.4, "Row Two", "Switch arms; resist twisting your torso."],
      [0.6, "Clean", "Jump forward; clean both weights to shoulders."],
      [0.8, "Press", "Stand tall; press both weights overhead."],
      [1, "Reset", "Lower weights; return to a braced plank."],
    ]
  ),
  "zercher-squat": placard(
    "zercher-squat",
    ["Quadriceps"],
    ["Glutes", "Abs", "Upper back"],
    [
      [0, "Setup", "Cradle the bar in your elbow creases."],
      [0.5, "Lower", "Brace firmly; bend your hips and knees."],
      [1, "Depth", "Keep elbows inside knees; chest stays tall."],
      [0.5, "Drive", "Push through your feet without rolling forward."],
      [0, "Stand", "Stand tall; keep the bar close."],
      [0, "Reset", "Brace again before the next controlled squat."],
    ]
  ),
  "landmine-squat": placard(
    "landmine-squat",
    ["Quadriceps"],
    ["Glutes", "Abs"],
    [
      [0, "Setup", "Hold the bar at chest; brace firmly."],
      [0.5, "Lower", "Bend knees and hips; keep heels grounded."],
      [1, "Depth", "Squat to parallel; keep your chest tall."],
      [0.5, "Drive", "Push through your feet; keep elbows tucked."],
      [0, "Stand", "Stand tall without leaning back."],
      [0, "Reset", "Keep the bar close; brace before repeating."],
    ]
  ),
  "sled-push-pull": placard(
    "sled-push-pull",
    ["Quadriceps", "Glutes"],
    ["Calves", "Abs"],
    [
      [0, "Push setup", "Grip low handles; lean forward and brace."],
      [0.2, "Drive", "Push through your feet with short strides."],
      [0.4, "Alternate", "Drive the other leg; keep arms long."],
      [0.6, "Rope setup", "Switch to rope; brace with soft knees."],
      [0.8, "Pull", "Pull hand over hand toward your ribs."],
      [0, "Alternate/reset", "Alternate hands; reset before pushing again."],
    ]
  ),
  "farmers-carry": placard(
    "farmers-carry",
    ["Forearms"],
    ["Trapezius", "Abs", "Quadriceps"],
    [
      [0, "Lead step", "Take short steps; keep weights steady."],
      [0.2, "Support", "Stand tall over your supporting foot."],
      [0.4, "Opposite step", "Step through without swinging the weights."],
      [0.6, "Transfer", "Keep shoulders packed and core braced."],
      [0.8, "Next step", "Bring the other foot through smoothly."],
      [0, "Continue", "Continue walking with short controlled steps."],
    ]
  ),
  thrusters: placard(
    "thrusters",
    ["Quadriceps", "Front deltoids"],
    ["Glutes", "Triceps"],
    [
      [0.5, "Rack", "Stand tall; bar rests on front shoulders."],
      [0, "Squat", "Squat to parallel; keep elbows high."],
      [0.25, "Drive", "Drive through feet; keep the bar racked."],
      [0.75, "Press", "Use leg drive to press overhead."],
      [1, "Overhead", "Extend arms overhead; keep your ribs braced."],
      [0.5, "Return", "Lower to front rack; squat again smoothly."],
    ]
  ),
  burpees: placard(
    "burpees",
    ["Chest", "Quadriceps"],
    ["Abs", "Front deltoids"],
    [
      [0, "Squat", "Squat down; plant palms ahead of feet."],
      [0.25, "Plank", "Jump feet back into a straight plank."],
      [0.5, "Lower", "Bend elbows; lower chest to the floor."],
      [0.25, "Press", "Press back up without sagging your hips."],
      [0, "Tuck", "Jump feet toward hands; prepare to rise."],
      [1, "Jump", "Jump upward; land softly into your squat."],
    ]
  ),
  "pistol-squat": placard(
    "pistol-squat",
    ["Quadriceps"],
    ["Glutes", "Hamstrings", "Core"],
    [
      [0, "Balance on one leg", "Stand on one leg; extend the other."],
      [0.5, "Sit back and down", "Bend your standing knee; keep heel planted."],
      [
        1,
        "Reach controlled depth",
        "Lower near your heel without losing balance.",
      ],
      [1, "Keep your position", "Keep free leg lifted and knee aligned."],
      [0.5, "Drive upward", "Push through your planted foot to stand."],
      [0, "Finish before switching", "Stand tall, then repeat the other side."],
    ]
  ),
  "calf-raise": placard(
    "calf-raise",
    ["Gastrocnemius"],
    ["Soleus"],
    [
      [0, "Set your stretch", "Stand tall; lower heels below the step."],
      [
        0.5,
        "Raise your heels",
        "Push through forefeet; keep knees softly straight.",
      ],
      [1, "Squeeze your calves", "Lift heels high and squeeze your calves."],
      [1, "Hold the top", "Pause briefly; keep your torso upright."],
      [0.5, "Lower slowly", "Lower your heels slowly without bouncing."],
      [0, "Return to stretch", "Let heels sink below the step gently."],
    ]
  ),
  "standing-calf-raise": placard(
    "standing-calf-raise",
    ["Gastrocnemius"],
    ["Soleus"],
    [
      [0, "Set your stretch", "Stand tall; lower heels below the step."],
      [
        0.5,
        "Raise your heels",
        "Push through forefeet; keep knees softly straight.",
      ],
      [1, "Squeeze your calves", "Lift heels high and squeeze your calves."],
      [1, "Hold the top", "Pause briefly; keep your torso upright."],
      [0.5, "Lower slowly", "Lower your heels slowly without bouncing."],
      [0, "Return to stretch", "Let heels sink below the step gently."],
    ]
  ),

  "donkey-calf-raise": placard(
    "donkey-calf-raise",
    ["Gastrocnemius"],
    ["Soleus"],
    [
      [0, "Set your stretch", "Brace forward; let heels lower below platform."],
      [
        0.5,
        "Rise through your toes",
        "Lift heels while keeping knees softly straight.",
      ],
      [1, "Reach the top", "Rise onto toes and squeeze your calves."],
      [
        1,
        "Control the top",
        "Pause briefly without bouncing or bending knees.",
      ],
      [0.5, "Lower slowly", "Lower heels slowly against the resistance."],
      [0, "Return to stretch", "Let heels sink below the platform gently."],
    ]
  ),
  shrugs: placard(
    "shrugs",
    ["Upper trapezius"],
    [],
    [
      [0, "Set your stance", "Stand tall; hold dumbbells beside your thighs."],
      [0.5, "Begin shrug", "Raise your shoulders straight toward your ears."],
      [1, "Reach the top", "Keep your elbows straight and neck neutral."],
      [
        1,
        "Pause briefly",
        "Squeeze your traps without rolling your shoulders.",
      ],
      [0.5, "Lower slowly", "Lower shoulders slowly; keep your arms straight."],
      [0, "Return to start", "Settle shoulders; keep your stance and grip."],
    ]
  ),
  crunches: placard(
    "crunches",
    ["Rectus abdominis"],
    ["Obliques"],
    [
      [0, "Set and brace", "Plant feet; rest hands lightly behind head."],
      [0.5, "Begin curl", "Curl your shoulders up using your abs."],
      [1, "Lift shoulders", "Lift shoulder blades; keep lower back down."],
      [1, "Pause briefly", "Pause without pulling on your neck."],
      [0.5, "Lower slowly", "Lower your shoulders slowly with control."],
      [0, "Return to floor", "Rest shoulders; keep your feet planted."],
    ]
  ),
  plank: placard(
    "plank",
    ["Rectus abdominis", "Obliques"],
    ["Glutes", "Anterior deltoids"],
    [
      [0, "Set forearms", "Place elbows beneath shoulders; rest your knees."],
      [0, "Brace first", "Brace your abs before lifting your knees."],
      [1, "Extend and lift", "Extend legs; lift knees from the floor."],
      [1, "Find your line", "Keep head, hips and heels aligned."],
      [1, "Hold and breathe", "Hold for time while breathing normally."],
      [0, "Lower knees", "Finish your hold; lower your knees gently."],
    ]
  ),
  "leg-raise": placard(
    "leg-raise",
    ["Rectus abdominis"],
    ["Obliques"],
    [
      [0, "Hang and brace", "Hang with straight arms; brace without swinging."],
      [0.5, "Begin raise", "Raise both straight legs without kicking."],
      [1, "Reach parallel", "Bring your legs level with your hips."],
      [1, "Hold control", "Pause briefly; keep your torso steady."],
      [0.5, "Lower slowly", "Lower both legs together under control."],
      [0, "Return to hang", "Return below your hips without swinging back."],
    ]
  ),
  "clean-and-press": placard(
    "clean-and-press",
    ["Glutes", "Hamstrings", "Front Delts"],
    ["Quads", "Triceps", "Core stabilisers"],
    [
      [0, "Set up", "Feet hip-width; grip bar with flat back."],
      [0.25, "Pull", "Push through floor; keep the bar close."],
      [0.45, "Catch", "Extend hips; catch bar on front delts."],
      [0.6, "Dip", "Dip shallowly with an upright, braced torso."],
      [1, "Drive", "Drive overhead; finish with straight arms."],
      [0.45, "Lower", "Lower to shoulders, then toward the floor."],
    ]
  ),
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
    ["Biceps", "Forearms"],
    [],
    [
      [0, "Palms forward", "Start with palms forward and elbows soft."],
      [0.5, "Curl palms up", "Curl with your palms facing upward."],
      [1, "Top palms up", "Finish the curl without lifting your elbows."],
      [1, "Rotate grip", "Turn palms away while keeping wrists straight."],
      [0.5, "Lower palms down", "Lower slowly with your palms facing down."],
      [0, "Bottom pronated", "Finish lowering, then turn palms forward."],
    ]
  ),
  "lu-raise": placard(
    "lu-raise",
    ["Deltoids"],
    ["Traps"],
    [
      [0, "Start", "Stand tall, weights at your sides."],
      [0.25, "Raise laterally", "Raise outward; keep elbows softly fixed."],
      [0.5, "Shoulder height", "Pass shoulder height with thumbs up."],
      [1, "Reach overhead", "Reach overhead without leaning back."],
      [0.5, "Lower laterally", "Lower out to shoulder height under control."],
      [0.25, "Lower", "Lower steadily; continue to your sides."],
    ],
    [
      "Stand tall with light dumbbells at your sides and palms facing in.",
      "Keep a slight elbow bend and raise outward in a comfortable plane just in front of your shoulders.",
      "Allow natural arm and shoulder-blade rotation as you continue overhead; lower along the same arc.",
    ],
    {
      tip: "Use light weights, stay tall and control the full outward arc.",
      commonMistakes: [
        "Bending the elbows to press the weights overhead.",
        "Leaning backward or swinging the hips to lift.",
      ],
    }
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
      [0, "Top", "Hold weights apart above your chest."],
      [0.25, "Lower", "Bend elbows while keeping wrists stacked."],
      [
        0.75,
        "Approach chest",
        "Lower with control, keeping shoulders supported.",
      ],
      [1, "Bottom", "Keep forearms upright beside your chest."],
      [0.65, "Press", "Press upward without bending your wrists."],
      [0.25, "Late press", "Continue upward, keeping the weights apart."],
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
  "russian-twist": placard(
    "russian-twist",
    ["Obliques"],
    ["Abs", "Hip flexors"],
    [
      [0, "Set", "Recline with a long spine; plant feet."],
      [0.5, "Turn A", "Begin turning ribs and clasped hands together."],
      [1, "Twist A", "Rotate toward near hip; keep chest tall."],
      [0, "Center", "Return to center without sitting upright."],
      [1, "Twist B", "Turn ribs toward the opposite hip."],
      [0, "Reset", "Center your torso; keep both feet planted."],
    ]
  ),
  "mountain-climbers": placard(
    "mountain-climbers",
    ["Core"],
    ["Shoulders", "Hip flexors", "Quads"],
    [
      [0.5, "Drive A", "Draw near knee forward; keep hips level."],
      [1, "Knee A", "Bring near knee closer without lifting hips."],
      [0, "Plank", "Extend back to plank before switching legs."],
      [0.5, "Drive B", "Draw far knee forward; keep shoulders steady."],
      [1, "Knee B", "Bring far knee closer without rounding back."],
      [0, "Reset", "Return to plank, then alternate again."],
    ]
  ),
  "cable-crunch": placard(
    "cable-crunch",
    ["Abs"],
    ["Obliques"],
    [
      [0, "Set", "Hold rope at temples; brace your abs."],
      [0.5, "Curl", "Curl ribs down while keeping hips still."],
      [1, "Crunch", "Bring ribs toward pelvis; elbows approach knees."],
      [1, "Hold", "Hold the crunch without pulling your arms."],
      [0.5, "Return", "Uncurl slowly while keeping hips still."],
      [0, "Reset", "Return upright with rope at your temples."],
    ]
  ),
  "cable-woodchopper": placard(
    "cable-woodchopper",
    ["Obliques"],
    ["Core", "Shoulders"],
    [
      [0, "Set", "Grip high; soften knees and brace core."],
      [0.5, "Rotate", "Rotate torso; guide handle across your body."],
      [1, "Chop", "Finish low across your opposite hip."],
      [1, "Hold", "Hold briefly with shoulders away from ears."],
      [0.5, "Return", "Return along the same diagonal path."],
      [0, "Reset", "Reset high; finish reps before switching sides."],
    ]
  ),
  "pallof-press": placard(
    "pallof-press",
    ["Core"],
    ["Obliques"],
    [
      [0, "Set", "Hold handle at chest; brace your core."],
      [0.5, "Press", "Press forward without turning shoulders or hips."],
      [1, "Extend", "Extend arms while keeping your torso still."],
      [1, "Hold", "Hold steady against the sideways cable pull."],
      [0.5, "Return", "Bend elbows; return slowly toward your chest."],
      [0, "Reset", "Reset at chest before your next press."],
    ]
  ),
  "dragon-flag": placard(
    "dragon-flag",
    ["Core"],
    ["Hip Flexors", "Lower Back"],
    [
      [0, "Brace", "Grip behind head; brace a straight body."],
      [0.5, "Lower", "Lower shoulders, hips, and legs together."],
      [1, "Hover", "Hover above bench without bending your hips."],
      [1, "Hold", "Keep your body rigid; maintain both grips."],
      [0.5, "Raise", "Raise your straight body with controlled tension."],
      [0, "Reset", "Reset high; keep weight off your neck."],
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
  "turkish-get-up": {
    ...placard(
      "turkish-get-up",
      ["Shoulders", "Core"],
      ["Triceps", "Upper Back", "Glutes", "Quads"],
      [
        [0, "Press", "Press the bell up; eyes on it."],
        [0.2, "Elbow", "Roll onto your free elbow, arm locked."],
        [0.4, "Hand", "Push up onto your free hand."],
        [0.6, "Bridge", "Lift your hips high off the floor."],
        [0.8, "Kneel", "Sweep your leg back into a half-kneel."],
        [1, "Stand", "Stand tall, then reverse each step down."],
      ],
      [
        "Use clear, non-slip floor space or a mat; start on your back.",
        "Press it up with both hands to a locked arm, then free one hand.",
      ]
    ),
    playback: "sequence" as const,
  },
  "assault-bike": placard(
    "assault-bike",
    ["Quads", "Glutes"],
    ["Chest", "Front Delts", "Biceps", "Calves"],
    [
      [0, "Drive", "Drive down through your whole foot."],
      [0, "Arms", "Push and pull the handles while pedalling."],
      [1, "Switch", "Keep both legs turning; no dead spots."],
      [1, "Tall", "Sit tall; keep your hips seated."],
      [0, "Breathe", "Breathe in rhythm; never hold your breath."],
      [0, "Steady", "Hold a pace you can sustain."],
    ],
    [
      "Set the seat so your leg is almost straight at the bottom.",
      "Hold the moving handles and put both feet on the pedals.",
    ]
  ),
  swimming: {
    ...placard(
      "swimming",
      ["Lats", "Shoulders", "Triceps"],
      ["Core", "Glutes", "Quads"],
      [
        [0, "Catch", "Reach long and catch the water."],
        [1 / 6, "Pull", "Pull under your body, elbow high."],
        [2 / 6, "Breathe", "Turn with your body; breathe sideways."],
        [3 / 6, "Switch", "Face down; catch with the other arm."],
        [4 / 6, "Drive", "Pull through; keep your hips high."],
        [5 / 6, "Enter", "Enter fingertips first; kick small and steady."],
      ],
      [
        "Swim front crawl with a long, level body line.",
        "Turn to the side to inhale; exhale underwater and keep the kick small.",
      ]
    ),
    playback: "sequence" as const,
  },
  stairmaster: placard(
    "stairmaster",
    ["Glutes"],
    ["Hamstrings", "Calves"],
    [
      [0, "Step", "Stand tall; shoulders stacked over hips."],
      [0, "Drive", "Drive the whole foot down each step."],
      [0.7, "Knee up", "Bring the other knee through to climb."],
      [1, "Grip", "Keep a light grip on the rails."],
      [1, "Land", "Land the whole foot on the step."],
      [0, "Steady", "Hold a pace you can sustain."],
    ],
    [
      "Step on and start at a slow, steady pace.",
      "Rest your hands lightly on the side rails.",
    ]
  ),
};
