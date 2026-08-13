/**
 * A localStorage key holding per-ACCOUNT state must carry the uid.
 *
 * localStorage is per-DEVICE. Anything keyed without a uid is shared by every
 * account that signs in on that phone. CLAUDE.md names this a recurring
 * mistake — PR #820 fixed it for the offline and share queues — and
 * `useDismissOnce` took it over for dismissals, its header enumerating the
 * six call sites that had got it wrong.
 *
 * Five more were still writing raw `localStorage` with unscoped keys, all of
 * them recording a decision by one user:
 *
 *   - `tropos.dismiss.setRaceGoal` — a literal CONSTANT, so account B on a
 *     shared device never saw the "set a race goal" prompt at all
 *   - the race-elapsed and race-recent prompts, keyed by week and by A's
 *     race date
 *   - `tropos_stall_{exerciseName}` — exercise names are global, so A's
 *     3-week stall cooldown suppressed B's stall prompt for the same lift
 *   - `home-day-tap-seen` — the sibling of a hint already fixed on the same
 *     page
 *   - the Food celebration date
 *
 * WHAT THIS CHECKS. Raw `localStorage.getItem/setItem/removeItem` in `src/`
 * where the key expression shows no sign of a uid. It cannot know what a
 * variable holds, so a key built elsewhere is judged by NAME — which is why
 * the allow-list below exists and why every entry carries a reason rather
 * than just a path.
 *
 * The primitives (`useDismissOnce`, `useCoachMarks`) are the preferred fix;
 * `useUidForStorageKey()` is the escape hatch when the surface needs raw
 * access. Reaching for the allow-list should be rare, and only for state
 * that genuinely belongs to the DEVICE rather than the account.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stallCooldownKey } from "@/features/program/stallDetection";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Keys that are DEVICE state, not account state — each with the reason it
 * would be wrong to scope.
 */
const DEVICE_SCOPED: Record<string, string> = {
  "tropos-dark-mode":
    "theme is a property of this screen; scoping it would flash the wrong theme on sign-in",
  "bk-font-combo": "dev-only font bake-off switch (src/dev)",
  "tropos.account_deleted":
    "written precisely when there is no longer an account to scope to",
  "tropos.food.calorieRingMode":
    "FoodHeroCard display preference (left vs eaten) — a device choice, not a fact about an account",
  "tropos_fcm_device_tokens": "the push token IS the device identity",
  tropos_offline_queue:
    "ONE key holding uid-TAGGED entries, filtered per-uid on flush (#820)",
  "tropos.share.queue": "same uid-tagged-entries shape (#820)",
  "tropos.program.commandOutbox": "same uid-tagged-entries shape",
};

/**
 * Unscoped ON PURPOSE because the call DELETES a pre-uid key. Migrating the
 * value forward would re-introduce the very bleed the scoping fixed — a
 * shared browser cannot prove which account last wrote it — so both of these
 * purge instead. `removeItem` only; a `getItem` on one of these would be
 * reading another account's value and is not covered here.
 */
const LEGACY_PURGE = ["socialPreferenceKeys.ts", "shareComposer.ts", "runResumeStorage.ts", "useWorkoutDraft.ts", "pushNotifications.ts"];

/**
 * Keyed by an id only its owner holds. A Firestore run id is per-user and
 * unguessable, so a second account on the device cannot collide with it —
 * scoped in effect, just not by uid. Distinct from DEVICE_SCOPED, which is
 * the opposite claim.
 */
const OWNED_ID = /tropos:reconcileDismissed:/;

/**
 * Primitives that RECEIVE the key as a parameter. Scoping is the caller's
 * job by construction, so there is nothing to judge inside them — the
 * companion test below checks their call sites instead, which is what keeps
 * this from being a hand-wave.
 */
const KEY_IS_A_PARAMETER: Record<string, string> = {
  "useDismissOnce.ts": "the hook prefixes the uid itself; the inner reader takes the finished key",
  "usePersistedToggle.ts": "generic toggle — caller supplies the key",
  "useSnoozeDismiss.ts": "generic snooze — caller supplies the key",
  "useFeedSubTabFreshness.ts": "builds its key from the uid prop it is given",
  "useWorkoutDraft.ts": "read/write helpers take the finished key; the hook builds it with v1StorageKey(uid, …)",
};

/** Resolve `const NAME = <expr>` within the same file, one hop. */
function resolveConst(src: string, name: string): string | null {
  const m = new RegExp(
    "\\bconst\\s+" + name + "\\s*(?::[^=]+)?=\\s*([^;\\n]+)"
  ).exec(src);
  return m ? m[1].trim() : null;
}

/** Does this key expression show a uid? */
function looksScoped(key: string): boolean {
  if (/uid/i.test(key)) return true;
  if (/\bstallCooldownKey\(/.test(key)) return true;
  return false;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (s) => " ".repeat(s.length))
    .replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
}

interface Site {
  site: string;
  file: string;
  op: string;
  key: string;
  /** The key expression after resolving a same-file const, if any. */
  resolved: string;
}

function scan(): Site[] {
  const out: Site[] = [];
  for (const rel of globSync("src/**/*.{ts,tsx}", { cwd: repoRoot })) {
    if (rel.includes("__tests__") || rel.includes(".test.")) continue;
    const src = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
    const re = /localStorage\.(getItem|setItem|removeItem)\(\s*([^,)]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const key = m[2].trim();
      // One hop through a same-file const, and one more for a prefix it
      // interpolates — enough for every shape this repo uses, and it beats
      // judging an identifier by its NAME.
      let resolved = /^[A-Za-z_$][\w$]*$/.test(key)
        ? (resolveConst(src, key) ?? key)
        : key;
      for (const ident of resolved.match(/\$\{(\w+)\}/g) ?? []) {
        const name = ident.slice(2, -1);
        const inner = resolveConst(src, name);
        if (inner) resolved = resolved.replace(ident, inner);
      }
      out.push({
        site: `${rel}:${src.slice(0, m.index).split("\n").length}`,
        file: rel.split("/").pop() ?? rel,
        op: m[1],
        key,
        resolved,
      });
    }
  }
  return out;
}

const found = scan();

describe("localStorage keys are uid-scoped", () => {
  it("sees the call sites at all", () => {
    // Positive control: the regex is the whole gate, and a refactor to a
    // wrapper would make it match nothing while reporting a clean bill.
    expect(found.length).toBeGreaterThan(20);
  });

  it("resolves a key through a same-file const rather than guessing from its name", () => {
    /* Guards the guard, and this is the part that earned its keep: the
       first version judged a bare identifier by its NAME, so three keys
       that ARE uid-scoped (ProgrammeRunSection's dismissals) still read as
       offenders while a badly-named scoped key would have read as clean.
       Resolving the definition removes the guesswork. */
    const race = found.find((f) =>
      f.site.startsWith("src/components/program/ProgrammeRunSection.tsx")
    );
    expect(race, "expected ProgrammeRunSection to still use localStorage").toBeTruthy();
    /* Resolution chains: the key names `storageUid`, which is itself a const
       assigned from `useUidForStorageKey()`. Asserting on the CHAIN END is
       the stronger claim — it says the uid actually came from auth context,
       not merely that some variable is named as though it had. */
    expect(race!.resolved).toMatch(/useUidForStorageKey/);
    expect(looksScoped(race!.resolved)).toBe(true);
    // And the shapes it must still reject.
    expect(looksScoped('"tropos.dismiss.setRaceGoal"')).toBe(false);
    expect(looksScoped("`tropos_stall_${exercise.name}`")).toBe(false);
  });

  it("the helper `looksScoped` trusts really does scope", () => {
    /* `looksScoped` waves through any `stallCooldownKey(...)` call, because
       the key is built in another file. That trust is only sound if the
       helper scopes — and a mutation run proved the gap was real: reverting
       the helper to its unscoped form left every call site reading as clean.
       So assert the helper's OUTPUT here, where the bypass is granted. */
    expect(stallCooldownKey("u1", "Bench Press")).toContain("u1");
    expect(stallCooldownKey("u1", "Bench Press")).not.toBe(
      stallCooldownKey("u2", "Bench Press")
    );
  });

  it("no unscoped key holds per-account state", () => {
    const offenders = found
      .filter((f) => !looksScoped(f.resolved))
      .filter((f) => !OWNED_ID.test(f.resolved))
      // A legacy key is unscoped BY DESIGN when the call deletes it.
      .filter((f) => !(f.op === "removeItem" && LEGACY_PURGE.includes(f.file)))
      .filter((f) => !(f.file in KEY_IS_A_PARAMETER))
      .filter(
        (f) => !Object.keys(DEVICE_SCOPED).some((k) => f.resolved.includes(k))
      )
      .map((f) => `${f.site}  localStorage.${f.op}(${f.key})`);
    expect(
      offenders,
      `localStorage is per-DEVICE, so an unscoped key is shared by every ` +
        `account on the phone. Prefer useDismissOnce / useCoachMarks; use ` +
        `useUidForStorageKey() for raw access. If the state really belongs ` +
        `to the DEVICE, add it to DEVICE_SCOPED with the reason:\n  ` +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("every parameterised primitive is CALLED with a uid-bearing key", () => {
    /* The half that stops `KEY_IS_A_PARAMETER` being an escape hatch. A
       primitive whose key comes from its caller is only as scoped as its
       callers, so check them. */
    const bad: string[] = [];
    for (const file of Object.keys(KEY_IS_A_PARAMETER)) {
      const hook = file.replace(/\.ts$/, "");
      if (hook === "useDismissOnce") continue; // prefixes the uid itself
      let calls = 0;
      for (const rel of globSync("src/**/*.{ts,tsx}", { cwd: repoRoot })) {
        if (rel.includes("__tests__") || rel.includes(".test.")) continue;
        if (rel.endsWith(file)) continue;
        const src = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
        const re = new RegExp(hook + "\\(([^;]{0,200})", "g");
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          calls += 1;
          if (!/uid/i.test(m[1])) bad.push(`${rel}: ${hook}(${m[1].slice(0, 60)}…`);
        }
      }
      if (calls === 0) bad.push(`${hook}: no call sites found — detector blind`);
    }
    expect(bad, `these pass an unscoped key to a shared storage primitive`).toEqual([]);
  });

  it("the device-scoped list stays honest (no entry for a vanished key)", () => {
    const stale = Object.keys(DEVICE_SCOPED).filter(
      (k) => !found.some((f) => f.resolved.includes(k))
    );
    expect(stale, `DEVICE_SCOPED entries matching no call site`).toEqual([]);
  });
});
