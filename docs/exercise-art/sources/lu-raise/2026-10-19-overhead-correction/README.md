# Lu Raise overhead correction

The current catalogue and artwork incorrectly taught a forward sweep at shoulder height. Catalyst Athletics' authored Overhead Lateral Raise (AKA Lu Raise) describes a lateral arc up overhead, followed by a controlled return: https://www.catalystathletics.com/exercise/865/Overhead-Lateral-Raise/ .

The candidate keeps the current athlete and existing five lateral/return drawings. All use the same integer canvas extension/crop without resampling anatomy. One new native overhead image replaces the forward sweep. Existing deltoid chroma is mapped to primary #7B72E9 with the original light and shade. No anatomy warping, fitting, mirroring or head/shoe grafts.

Two built-in imagegen calls were made. The first accepted the pose but returned a1254 square image scaled from a1536 square target; it is preserved as rejected-wrong-scale-overhead.png and is never enlarged or shipped. The method changed to a native1254 square input with common crop/padding; the second output has that exact native canvas and visually stable body scale. This is one corrected pose, not repeated blanket generations.

Run `python build.py --output fresh-output` from this folder using Python with Pillow and NumPy. Exact input PNGs, both original generated outputs, prompts, canonical identity, pixel proof, six source PNGs, six lossless WebPs, palette layers and six two-layer OpenRaster files are retained in the portable archive. The review sheet is display-only. Source geometry is never derived from that sheet.

Native drawings remain illustrative discrete positions. No new strict11-check certificate is asserted; the new record uses the authorized owner-release-with-findings route and supersedes the previous exact strict record without modifying it.
