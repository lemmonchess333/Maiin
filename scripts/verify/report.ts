/**
 * The verify run's verdict and its report. Pure: `report.test.ts` holds the
 * rules (a not-run feature is never a pass; a feature whose verdict moved
 * between rounds is flaky, and flaky fails the run).
 */
import type { FeatureResult } from "./drive";

export type RunVerdict = "pass" | "fail" | "incomplete";

export interface RunSummary {
  verdict: RunVerdict;
  /** 0 pass, 1 fail, 2 incomplete (something could not run). */
  exitCode: 0 | 1 | 2;
  rounds: number;
  passed: string[];
  failed: string[];
  notRun: string[];
  /** Features whose verdict differed between rounds. */
  flaky: string[];
  /** Page errors and console errors that are not environment noise. */
  problems: number;
}

export function summarise(results: readonly FeatureResult[]): RunSummary {
  const byId = new Map<string, FeatureResult[]>();
  for (const r of results) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
  const passed: string[] = [];
  const failed: string[] = [];
  const notRun: string[] = [];
  const flaky: string[] = [];
  for (const [id, rs] of byId) {
    const verdicts = new Set(rs.map((r) => r.verdict));
    if (verdicts.size > 1) flaky.push(id);
    if (verdicts.has("fail")) failed.push(id);
    else if (verdicts.has("not-run")) notRun.push(id);
    else passed.push(id);
  }
  const problems = results.reduce(
    (n, r) => n + r.problems.filter((p) => !p.noise).length,
    0
  );
  const verdict: RunVerdict =
    failed.length || flaky.length
      ? "fail"
      : notRun.length || byId.size === 0
        ? "incomplete"
        : "pass";
  return {
    verdict,
    exitCode: verdict === "pass" ? 0 : verdict === "fail" ? 1 : 2,
    rounds: Math.max(0, ...results.map((r) => r.round)),
    passed,
    failed,
    notRun,
    flaky,
    problems,
  };
}

export interface RunMeta {
  base: string;
  build: string;
  firestore: boolean;
  diagnosis?: string;
  /** Milliseconds per phase: preflight, emulators, seed, build, preview,
   *  sign-in, drive. */
  timings: Record<string, number>;
  because?: Record<string, string[]>;
  unmapped?: string[];
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function renderReport(
  results: readonly FeatureResult[],
  summary: RunSummary,
  meta: RunMeta
): string {
  const out: string[] = [];
  out.push(`# Verify: ${summary.verdict.toUpperCase()}`, "");
  out.push(
    `${summary.passed.length} passed, ${summary.failed.length} failed, ` +
      `${summary.notRun.length} not run, ${summary.flaky.length} flaky, over ` +
      `${summary.rounds} round${summary.rounds === 1 ? "" : "s"}. ` +
      `${summary.problems} page or console error${summary.problems === 1 ? "" : "s"} ` +
      "outside environment noise.",
    ""
  );
  if (summary.verdict === "incomplete")
    out.push(
      "**Incomplete is not a pass.** Some features could not run here; " +
        "verify them where they can (see below).",
      ""
    );
  if (meta.diagnosis)
    out.push(`> ${meta.diagnosis.replace(/\n/g, "\n> ")}`, "");
  out.push(
    `- App: ${meta.base} (build ${meta.build})`,
    `- Firestore emulator: ${meta.firestore ? "yes" : "no"}`,
    `- Timings: ${Object.entries(meta.timings)
      .map(([k, v]) => `${k} ${secs(v)}`)
      .join(", ")}`,
    ""
  );
  if (summary.flaky.length)
    out.push(
      `**Flaky:** ${summary.flaky.join(", ")}. A verdict that moves between ` +
        "rounds is a defect in the app, the map or the driver; find it, do " +
        "not re-run until green.",
      ""
    );
  if (meta.unmapped?.length)
    out.push(
      "**Unmapped app files** (the smoke set ran for them; add them to a " +
        "feature's sources in `scripts/verify/featureMap.ts`):",
      ...meta.unmapped.map((f) => `- \`${f}\``),
      ""
    );

  out.push("| Feature | Verdict | Time | Errors | Last screenshot |");
  out.push("| --- | --- | --- | --- | --- |");
  for (const r of results) {
    const last = [...r.steps].reverse().find((s) => s.screenshot)?.screenshot;
    const errs = r.problems.filter((p) => !p.noise).length;
    out.push(
      `| ${r.round > 1 ? `${r.id} (round ${r.round})` : r.id} | ${r.verdict} | ` +
        `${secs(r.ms)} | ${errs} | ${last ? `[${last}](${last})` : ""} |`
    );
  }
  out.push("");

  const firstRound = results.filter((r) => r.round === 1);
  out.push("## Rubric", "");
  out.push(
    "Hold each feature's last screenshot against what it should show.",
    ""
  );
  for (const r of firstRound) {
    out.push(`### ${r.id}: ${r.title}`, "");
    out.push(`Expected: ${r.expected}`, "");
    if (meta.because?.[r.id])
      out.push(
        `Chosen for: ${meta.because[r.id].map((f) => `\`${f}\``).join(", ")}`,
        ""
      );
    if (r.reason) out.push(`**${r.verdict}:** ${r.reason}`, "");
    for (const s of r.steps)
      out.push(
        `${s.n}. ${s.ok ? "ok" : "FAILED"} ${s.action} ${s.target ?? ""} ` +
          `(${s.ms} ms, at ${s.url})${s.screenshot ? ` [shot](${s.screenshot})` : ""}`
      );
    const real = r.problems.filter((p) => !p.noise);
    if (real.length) {
      out.push("", "Errors:");
      for (const p of real)
        out.push(
          `- ${p.kind}: ${p.text.split("\n")[0]}${p.source ? ` (${p.source})` : ""}`
        );
    }
    out.push("");
  }
  return out.join("\n");
}
