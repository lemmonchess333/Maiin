# Independent mountain-climbers still-image QA

Status: six-frame candidate, not release approved. Reviewed all six native frames and master visually against cues.json and catalogue mountain-climbers; no source images changed. This is still-image review, not timed playback or mobile review.

## Phase and cue agreement

| Frame | Observed state | Cue agreement |
|---|---|---|
| 1 | Near knee bent beneath torso, far leg extended | Near-side partial drive readable; already fairly deep flexion. |
| 2 | Near knee farther forward and higher than 1 | Further near knee drive agrees. |
| 3 | Both legs extended high plank | Return before switch agrees. |
| 4 | Far knee under torso, near leg extended | Far-side drive agrees. |
| 5 | Far knee slightly farther forward, heel tucked closer to thigh | Further drive is present but modest; more change comes from knee flexion than substantial forward thigh travel. |
| 6 | Both legs extended high plank | Return agrees; identical physical state to 3 is legitimate reuse. |

The ordering teaches alternating knees rather than repeating one leg. Frames3/6 reuse the master; there are five unique numeric images. The 6→1 transition is a physically plausible next near-knee drive. Actual playback timing remains unchecked.

## Findings

- **Open support-foot continuity issue:** the master/frames3/6 show two separated shoe contacts. In near-knee frames1/2, the extended far leg ends at the foreground/rightmost shoe contact that belonged to the near supporting leg in the master. Far-knee frames4/5 also retain that same foreground/rightmost supporting shoe. Near-versus-far knee silhouette changes correctly, but the support leg appears to inherit the other leg's contact position. This is a limb/contact continuity concern, not a rejection of the intended moving foot. A moving knee and airborne shoe should move; the opposite planted foot should remain traceable to its own contact point.
- Hands, mat perimeter, head and shoulder position remain visually stable. There is no obvious mat translation or camera zoom. Hip level stays consistent without a large pike. Small contour variation alone is not treated as anchor failure.
- Full legs, neutral pelvis and white trainers remain visible; one athlete throughout. Core remains strongest purple and shoulders/thighs pale lilac. No broad return-phase color disappearance observed.
- Far full-drive frame5 remains less pronounced than near full-drive frame2; some occlusion/perspective difference is expected, but loop review should check whether viewers read balanced alternating motion.

Disposition: preserve as complete candidate with support-foot ownership/contact continuity unresolved. Do not mark release approved from six-file presence or these still checks.

## Exact reviewed sources

- `mountain-climbers/masters/1.png` — (1536, 1024) — SHA256 `d5f1e7f60555a5971af1cfaab5c8c20fb91514206f4872be41c57ff70ab369f0`
- `mountain-climbers/frames/1.png` — (1536, 1024) — SHA256 `e615feb681aac4478503b2c471ecc463b501c5a7203ca19dde1084e20b68de36`
- `mountain-climbers/frames/2.png` — (1536, 1024) — SHA256 `d586d4f4c94dc1af31ce1c4786ed35db3ea62fea826be2f880043dc83ca179e2`
- `mountain-climbers/frames/3.png` — (1536, 1024) — SHA256 `d5f1e7f60555a5971af1cfaab5c8c20fb91514206f4872be41c57ff70ab369f0`
- `mountain-climbers/frames/4.png` — (1536, 1024) — SHA256 `78ac0fb98be2defd2dd014930237f7ba12130bdd905a1f9e081e9add224aeb19`
- `mountain-climbers/frames/5.png` — (1536, 1024) — SHA256 `50b91a4056ef47460648bb2c0cfd37e3c98ef2629ecabc14114f3867b6f746b0`
- `mountain-climbers/frames/6.png` — (1536, 1024) — SHA256 `d5f1e7f60555a5971af1cfaab5c8c20fb91514206f4872be41c57ff70ab369f0`
- `mountain-climbers/cues.json` — JSON — SHA256 `1b181e4221e1b73ebe98a88b097d0369f6b4162003c88f3c49fb1ecd85200c7e`
