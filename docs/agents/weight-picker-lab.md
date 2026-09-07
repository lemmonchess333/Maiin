# Weight picker trial

Status: lab implemented; participant results pending. No winner has been selected. Neither prototype replaces the production weight sheet yet.

Open `/dev/weight-picker` in a development/test build. The route and its code are excluded from the production build, following the existing lab convention. For an iPhone trial, use a Capacitor build containing the test-mode web bundle; verify that the local trial page is reachable before handing over the device. Use the same viewport and starting value for both controls.

Each participant completes five target changes from 81.6 kg (−2.3, −0.4, +0.1, +1.7, +6.0) and a switch to lb without changing the selected weight. Start resets the control. Confirm target is enabled only at the requested value. Pointer gestures, keyboard actions and separated wheel gestures on the control are counted; harness Start/Confirm buttons are excluded. Time includes selection through target confirmation. Overshoots count crossings past the target. The final question asks whether the participant felt in control, from 1 to 5. Export records the trials, platform and ratings, without account data or a weigh-in write.

Recruit 3–5 people. Each person tries both controls on web and a physical iPhone. Alternate control order, note device/OS/browser and accessibility settings alongside the exported JSON, and reload between participants. Check reduced motion, typing/keyboard access and the centre markers separately from the timed tasks.

| Evidence | Status |
| --- | --- |
| Automated web rendering/capture | Pending |
| Human web trials | Pending |
| Physical iPhone touch physics/haptics | Pending |
| Winner | Undecided |

Decide from median time and gestures, overshoot corrections and control ratings, reviewing web and iPhone separately. A control that is faster but repeatedly overshoots on iPhone is not a clear winner. Record the individual anonymised results and reasoning here. Then retain the winner, delete the losing prototype and finish the production picker integration. Do not substitute an automated run for participant evidence.

Implementation checkpoint: units, date bounds, recent water sizes and durable offline weight intents are wired independently of picker selection. The existing typed/stepper control remains until the trial establishes a winner. No participant results or physical iPhone testing are claimed.
