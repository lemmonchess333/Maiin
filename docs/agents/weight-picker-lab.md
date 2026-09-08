# Weight scale dial

The owner selected a spinning weighing-scale dial on 7 September 2026: a shallow curved arc, moving markings and a fixed pointer. This replaces the earlier ruler-versus-column-wheel proposal and its selection gate. Both old prototypes have been removed; `/dev/weight-picker` now renders the production dial without logging side effects.

The Home weight sheet uses the same dial. Drag left to bring larger values beneath the pointer, right for smaller values. Slow motion adjusts tenths; a fast release coasts briefly then settles to a detent. Reduced motion disables the coast. Typing, unit changes, another pointer interaction, losing focus or leaving the page interrupts motion. Only Log weight commits an entry; existing date selection, durable offline acceptance and Undo are retained.

Kilograms use 0.1 kg detents; pounds and stone use 0.1 lb. Stone markings show pounds within the stone, with each stone boundary labelled. Native range semantics provide keyboard and assistive-technology adjustment alongside the visual drag surface. Full canonical precision survives unit switches until the user changes the weight.

Validation is recorded in the implementing PR with automated interaction tests and phone-width light/dark captures. Physical iPhone touch physics, haptics and VoiceOver have not been tested in this environment; no participant study or measured preference is claimed.
