# Close Grip Bench Press: contact revision

Six 1536×1024 illustrated PNGs. Frames 4, 5 and 6 are byte-identical to 3, 2 and 1 respectively. The bench is flat, the grip stays inside shoulder width, both hands hold one rigid bar, and the shoes remain planted.

The previous bottom frame left the bar 14–29 native pixels above the chest. In this revision, the underside of the bar and the highlighted lower pec have 0–1 pixel separation at native x=715–795. The bar lowers into contact without crossing the neck or passing through the torso. Bench-base and shoe foreground bounds remain within one pixel of frame 1. The foreground remains clear of every canvas border; the union bounds are x=190–1401, y=36–976.

Reviewed all six poses at a 360 px dark stage with a common 1.14× camera: `/tmp/redraw-bench-phone-qa/close-grip-bench-sheet.png`. The common camera leaves about 18 px horizontal and 54 px vertical margin around the union. Actual app-player and light-theme QA still belong to release integration.
