/**
 * Screenshot visual diff — the report half of the design-review capture
 * channel (Tier 3, "turn your eyeballs into a gate").
 *
 * app-screenshots.yml captures the key surfaces light+dark and commits
 * the PNGs to the `app-screenshots` branch. Until now, "what changed
 * since the last capture?" meant eyeballing pairs of frames. This
 * compares the fresh capture against the previous branch content and
 * writes DIFF_REPORT.md + a per-pair diff PNG for every changed frame,
 * committed alongside the screenshots — so every capture run
 * self-reports its visual delta.
 *
 * A REPORT, not a gate, deliberately. Most visual change on this channel
 * is intentional (that's why the capture ran), and a required check that
 * fails on intended change trains people to ignore it. The exit code is
 * always 0; the report is the artifact reviewers cite in PRs (the D15
 * rule: no visual churn without screenshots — now with the delta
 * pre-computed).
 *
 * Classification per pair, by percentage of pixels past pixelmatch's
 * perceptual threshold:
 *   unchanged  < 0.05%  (antialiasing jitter — suppressed from the report
 *                        body so real change stands out)
 *   minor      < 1%     (small copy/value drift)
 *   changed    ≥ 1%     (layout / theme / content movement)
 *   resized             (dimensions differ — always significant: a
 *                        viewport or page-height change)
 *   added/removed       (frame exists on only one side)
 *
 * Exported as functions + a `main` so the classification maths is
 * unit-testable (scripts that only run in CI rot unnoticed).
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/** Pixelmatch perceptual threshold (0-1). 0.1 is the library default —
 *  strict enough to catch a token drift, loose enough to ignore
 *  antialiasing differences between runner kernels. */
const PIXEL_THRESHOLD = 0.1;
const UNCHANGED_PCT = 0.05;
const MINOR_PCT = 1;

/**
 * Compare two decoded PNGs. Returns {status, pct, diff} where `diff` is
 * a PNG instance (only for comparable pairs) the caller may write.
 */
export function comparePngs(baseline, current) {
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      status: "resized",
      pct: null,
      diff: null,
      note: `${baseline.width}×${baseline.height} → ${current.width}×${current.height}`,
    };
  }
  const { width, height } = current;
  const diff = new PNG({ width, height });
  const changed = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    width,
    height,
    { threshold: PIXEL_THRESHOLD }
  );
  const pct = (changed / (width * height)) * 100;
  const status =
    pct < UNCHANGED_PCT ? "unchanged" : pct < MINOR_PCT ? "minor" : "changed";
  return { status, pct, diff, note: null };
}

/**
 * Diff every PNG in `currentDir` against its same-named counterpart in
 * `baselineDir`. Writes diff PNGs for minor/changed pairs into
 * `outDir/diffs/` and returns the row list for the report.
 */
export function diffDirectories(baselineDir, currentDir, outDir) {
  const pngsIn = (dir) =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith(".png"))
          .sort()
      : [];
  const baselineFiles = new Set(pngsIn(baselineDir));
  const currentFiles = pngsIn(currentDir);
  const rows = [];

  for (const file of currentFiles) {
    if (!baselineFiles.has(file)) {
      rows.push({ file, status: "added", pct: null, note: null });
      continue;
    }
    baselineFiles.delete(file);
    let baseline, current;
    try {
      baseline = PNG.sync.read(readFileSync(join(baselineDir, file)));
      current = PNG.sync.read(readFileSync(join(currentDir, file)));
    } catch (err) {
      rows.push({ file, status: "unreadable", pct: null, note: err.message });
      continue;
    }
    const result = comparePngs(baseline, current);
    if (result.diff && result.status !== "unchanged") {
      const diffsDir = join(outDir, "diffs");
      mkdirSync(diffsDir, { recursive: true });
      writeFileSync(join(diffsDir, file), PNG.sync.write(result.diff));
    }
    rows.push({
      file,
      status: result.status,
      pct: result.pct,
      note: result.note,
    });
  }

  // Anything left in the baseline set has no current counterpart.
  for (const file of [...baselineFiles].sort()) {
    rows.push({ file, status: "removed", pct: null, note: null });
  }
  return rows;
}

/** Render the Markdown report. Unchanged frames collapse into one line. */
export function renderReport(rows) {
  const interesting = rows.filter((r) => r.status !== "unchanged");
  const unchangedCount = rows.length - interesting.length;
  const lines = [
    "# Screenshot diff vs previous capture",
    "",
    `${rows.length} frames compared — ${interesting.length} with visible change, ${unchangedCount} unchanged.`,
    "",
  ];
  if (interesting.length > 0) {
    lines.push(
      "| Frame | Status | Changed pixels | Note |",
      "| --- | --- | --- | --- |"
    );
    const order = {
      resized: 0,
      changed: 1,
      added: 2,
      removed: 3,
      unreadable: 4,
      minor: 5,
    };
    for (const r of [...interesting].sort(
      (a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
        (b.pct ?? 0) - (a.pct ?? 0)
    )) {
      const pct = r.pct === null ? "—" : `${r.pct.toFixed(2)}%`;
      const note =
        r.note ??
        (r.status === "minor" || r.status === "changed"
          ? `diffs/${r.file}`
          : "—");
      lines.push(`| ${basename(r.file)} | ${r.status} | ${pct} | ${note} |`);
    }
  } else {
    lines.push("No visible changes.");
  }
  lines.push(
    "",
    "_Changed-pixel highlights are in `diffs/`. Report, not gate: intended_",
    "_changes are normal here — cite the relevant frames in the PR._",
    ""
  );
  return lines.join("\n");
}

export function main(baselineDir, currentDir, outDir) {
  const rows = diffDirectories(baselineDir, currentDir, outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "DIFF_REPORT.md"), renderReport(rows));
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  console.log("screenshot diff:", JSON.stringify(counts));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baselineDir, currentDir, outDir] = process.argv.slice(2);
  if (!baselineDir || !currentDir || !outDir) {
    console.error(
      "usage: node scripts/diff-screenshots.mjs <baselineDir> <currentDir> <outDir>"
    );
    process.exit(1);
  }
  main(baselineDir, currentDir, outDir);
}
