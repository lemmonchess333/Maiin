# Inverted Row redraw candidate

Six 1672×941 PNG frames depict a fixed rack/bar and a heel-supported plank. The final source order is hang, pull, chest near bar, hold, lower, extend. Frames 1=6, 2=5, and 3=4 are byte-identical, so the loop has no reset seam.

The original top pose stopped short of the bar. Frame 3/4 now uses an imagegen edit of the top frame with the sternum visibly near the bar and the elbows pulled behind the ribs. The prior near-top candidates are retained in `rejected/`. The edited source was generated at 1671×941, then a second imagegen edit preserved the pose and produced the exact 1672×941 canvas; no bitmap geometry was altered by code.

Read-only native QA (threshold >40 RGB) found the bar-cap top-left at (111,22–23), rear rack top-left at (512,23), and left rack-foot left edge at x87 in all frames. The left rack foot spans 210–211 px and rear upright top-to-base spans 718–720 px, each within 1%. The white shoe sole bottom is y896–897. Both hands stay on the fixed bar.

Independent QA found repeated white rectangle artifacts across the first edited top pose's purple side/back, so a further imagegen edit cleaned the muscle shading. That second edit kept the chest-to-bar pose but the front rack-foot bottom is y903 versus y901 in frame 1 (2 px native drift). Another imagegen attempt to lock the rack and shoes made the drift worse. The cleaned top pose is kept as a draft only; **do not release it** until the fixed contact/scene pixels are repaired and remeasured. The tiled and earlier short-range top poses remain in `rejected/`.
