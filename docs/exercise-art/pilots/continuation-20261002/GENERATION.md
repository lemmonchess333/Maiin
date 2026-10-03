# Generation provenance

Tool: `image_gen.imagegen`, 2 October 2026. The service did not expose an engine
version. The descriptions below summarize the submitted prompts; they are not
claimed to be verbatim prompt transcripts. Exact reference and output hashes
are recorded in each exercise's `provenance.json`.

## Hanging Leg Raise

1. **Master (`leg-raise/1.png`)** — canonical athlete reference only. Requested
   a 1024 × 1536 black-background, left-facing three-quarter braced hang, full
   closed overhand grips, rigid station, straight hanging legs, room to raise
   legs to the left, purple abs and pale obliques. Accepted as a scene master
   after visual inspection and copied to `masters/leg-raise/1.png`.
2. **Partial raise (`leg-raise/2.png`)** — canonical athlete plus that master.
   Requested fixed station/grips/upper body, both straight legs raised partway,
   unchanged proportions and shoes. The result is above the requested halfway
   angle; retained with qualitative wording rather than an unsupported angle.
3. **Hip-height endpoint (`leg-raise/3.png`)** — canonical athlete, master and
   partial raise. Requested horizontal straight legs at hip height, no torso
   swing or grip displacement, same proportions and highlighting. Inspected
   before selecting it. Frame 4 copies 3, frame 5 copies 2, frame 6 copies 1.

## Side Plank

1. **`rejected-foreshortened-support.png`** — canonical athlete reference only.
   Requested a low side-lying setup, right elbow under shoulder, full forearm
   on floor, straight stacked legs, hand on hip, purple obliques. Rejected as a
   master because the support forearm points into the camera and is unclear.
2. **Master (`side-plank/1.png`)** — canonical athlete and rejected setup.
   Requested a local support-arm correction with the full forearm visible
   along the floor, joined elbow/wrist/hand, and the unloaded top shoulder
   white-grey. Retained as a setup master; copied to `masters/side-plank/1.png`.
3. **`raised-contact-drift.png`** — canonical athlete plus corrected master.
   Requested a full straight side plank by raising hips, with fixed support
   forearm and lower shoe. The resulting contact shifts failed review.
4. **`rejected-contact-repair.png`** — canonical athlete, corrected master and
   raised candidate. Requested the master's exact forearm/shoe contacts with
   the raised torso retained and top shoulder unhighlighted. The lower shoe
   still moves up 12px. Rejected; the method was stopped before generating any
   middle or return poses.

All original candidates remain available. No image was repainted, cropped,
resized or composited after generation. The script in this folder only measures
source pixels; it does not repair them.
