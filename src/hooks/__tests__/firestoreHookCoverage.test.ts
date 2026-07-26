/**
 * Coverage gate for Firestore-touching hooks (ADR-0009).
 *
 * The seam removes the reason these hooks went untested — before it, each
 * one needed ~50 lines of bespoke SDK stubbing, so "no test" was the path
 * of least resistance and the gap grew silently. A seam that only makes
 * testing *possible* doesn't close a gap; this gate is what converts the
 * possibility into a default.
 *
 * The rule: a hook that reads or writes Firestore has a sibling test, or
 * carries an `@untested:` marker naming why it doesn't. Both branches are
 * checked for honesty — a marker on a hook that HAS a test is as much a
 * lie as a missing test, and it's the direction that rots quietly (someone
 * writes the test, nobody removes the marker, the exemption list stops
 * describing reality).
 *
 * The exemption list below is DELETE-ONLY. Adding a name to it needs a
 * deliberate edit and shows up in review as exactly that.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const HOOKS = join(ROOT, "src/hooks");
const TESTS = join(HOOKS, "__tests__");

/**
 * Uses the Firestore SDK directly, or holds the `db` handle for a guarded
 * wrapper. A type-only import doesn't count: `useSocialFeed` imports
 * `DocumentSnapshot` for a cursor signature but does its reading through
 * `socialApi`, so it belongs to that module's tests, not this gate's.
 */
function touchesFirestore(source: string): boolean {
  const runtime = source.replace(/^import\s+type\s[^;]*;/gm, "");
  return (
    /from ["']firebase\/firestore["']/.test(runtime) ||
    /^import \{[^}]*\bdb\b[^}]*\} from ["'][^"']*lib\/firebase["']/m.test(
      runtime
    )
  );
}

const UNTESTED_RE = /@untested:\s*(\S.*)/;

interface HookFile {
  name: string;
  source: string;
  hasTest: boolean;
  exemption: string | null;
}

function firestoreHooks(): HookFile[] {
  return readdirSync(HOOKS)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({ file: f, source: readFileSync(join(HOOKS, f), "utf8") }))
    .filter(({ source }) => touchesFirestore(source))
    .map(({ file, source }) => {
      const name = file.replace(/\.tsx?$/, "");
      return {
        name,
        source,
        hasTest:
          existsSync(join(TESTS, `${name}.test.ts`)) ||
          existsSync(join(TESTS, `${name}.test.tsx`)),
        exemption: UNTESTED_RE.exec(source)?.[1]?.trim() ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Hooks with a known, named coverage gap. DELETE-ONLY: write the test,
 * remove the `@untested:` marker, remove the name here. Do not add.
 */
const EXEMPT = ["DailyLogsProvider", "useFirestore"];

/**
 * Suites where an inline SDK factory is CORRECT and permanent — not debt.
 *
 * These test the boundary adapter itself, so their contract IS the call
 * made to the SDK. `firestoreWrite` asserts that the guarded wrappers
 * strip `undefined` BEFORE handing off, forward merge options unchanged,
 * and omit the options argument entirely when none was given. That last
 * one is invisible through stored state — the fake records the RESULT of
 * a write, and "called with two arguments rather than three" leaves no
 * trace in it. A spy is the right instrument here, and migrating would
 * lose the assertion.
 *
 * Kept separate from the migration queue so that queue can actually reach
 * zero. A delete-only list containing something that must never be deleted
 * is a list that always reads as unfinished, and the next person to pick
 * it up pays to re-derive why.
 *
 * NOT an escape hatch. Splitting this out creates an obvious temptation —
 * a failing migration gets reclassified as "permanent" instead of done. An
 * entry earns a place here only if a SPY is the sole instrument that can
 * express its contract, which in practice means the unit under test is the
 * SDK boundary itself. "The fake was awkward" is a reason to extend the
 * fake, and "the assertions are shaped around the stub" is the definition
 * of the migration work, not an exemption from it.
 */
const PERMANENT_INLINE_MOCKS = ["src/lib/__tests__/firestoreWrite.test.ts"];

/**
 * Suites that predate the seam and still carry their own inline SDK factory.
 * DELETE-ONLY: migrate a suite to `seedFirestore`, remove its line. Do not add.
 *
 * Not all of these are the same size of job, and the difference is not
 * line count. Surveyed 2026-07-26 while migrating the first batch:
 *
 *   DEFERRED READS — `useRunningStats.accountSwitch`, `usePushSettings`,
 *     `authProviderAccountSwitch`, `useProgramWriters`. These hold reads
 *     open deliberately, because what they test is RACE ORDERING ("B's
 *     later data wins even when A resolves last"). The fake resolves
 *     immediately, so migrating them as-is would delete the very
 *     assertion they exist for. They need `deferNextRead()` in the fake
 *     FIRST — a real feature, not a test edit. Worth building: stale
 *     account-A data landing under account B is a privacy leak, and the
 *     fake would additionally make "A's rows" real per-uid documents
 *     rather than the synthetic ones these currently fabricate.
 *
 *     DONE for the first three: `deferReads`/`pendingReads`/`releaseRead`
 *     shipped, and `authProviderAccountSwitch` migrated 2026-07-26. That
 *     one also needed `rejectRead` — a held read that fails LATE, which
 *     `failNextFirestore` cannot express because it fires at issue time.
 *     Worth knowing before `useProgramWriters`: the surviving entry may
 *     need the same, and the capability now exists.
 *
 *   BROAD SDK SURFACE — `socialApi`, `useFoodFavourites`, `offlineQueue`.
 *     These reach for `writeBatch` / `increment` / `collectionGroup`.
 *     Check the fake covers each before starting; extend it if not.
 *
 *   The rest are ordinary migrations: seed by path, assert on state.
 *     Treat that as a starting guess, not a survey result:
 *     `useGoalSpaces.indexTrust` was filed here and is actually a
 *     DEFERRED-READS case (it holds `getDocs` open to force reload
 *     ordering), and `useNotifications.trust` needed the fake to LOG
 *     `onSnapshot` subscriptions before its re-subscribe assertion
 *     could be expressed. Check what a suite is actually doing before
 *     assuming it is mechanical.
 *
 * The trap in all of them is that a mechanical fixture rewrite can DELETE
 * coverage while staying green — an `export.test.ts` block silently
 * converted to an empty seed during this batch. Re-read the suite; a
 * green run after a fixture rewrite proves less than usual.
 */
const LEGACY_INLINE_MOCKS = [
  "src/components/social/__tests__/ProgressPhotos.test.tsx",
  "src/features/partnerStreak/__tests__/partnerStreakApi.test.ts",
  "src/features/program/__tests__/useProgramWriters.test.ts",
  "src/hooks/__tests__/useClaimMap.test.ts",
  "src/hooks/__tests__/useEffectiveTargets.test.ts",
  "src/hooks/__tests__/useFoodFavourites.test.ts",
  "src/hooks/__tests__/useHomeData.test.ts",
  "src/hooks/__tests__/useMeals.test.ts",
  "src/lib/__tests__/offlineQueue.test.ts",
  "src/lib/__tests__/pushNotifications.test.ts",
  "src/lib/__tests__/socialApi.test.ts",
];

describe("Firestore hook coverage", () => {
  it("finds the hooks (guards against a broken scan silently passing)", () => {
    const hooks = firestoreHooks();
    expect(hooks.length).toBeGreaterThan(20);
  });

  it("every Firestore-touching hook has a test or a named exemption", () => {
    const naked = firestoreHooks()
      .filter((h) => !h.hasTest && !h.exemption)
      .map((h) => h.name);
    expect(
      naked,
      `These hooks read/write Firestore with no test. Write one against the ` +
        `fake — see src/hooks/__tests__/useWorkouts.test.ts — or add an ` +
        `"@untested: <reason>" comment AND list the hook in EXEMPT here.`
    ).toEqual([]);
  });

  it("the exemption list matches the markers in the source", () => {
    const marked = firestoreHooks()
      .filter((h) => h.exemption && !h.hasTest)
      .map((h) => h.name);
    expect(marked).toEqual(EXEMPT);
  });

  it("no exemption survives on a hook that now has a test", () => {
    // The quiet rot: test lands, marker stays, the list stops being true.
    const stale = firestoreHooks()
      .filter((h) => h.hasTest && h.exemption)
      .map((h) => h.name);
    expect(
      stale,
      `These hooks have tests but still claim "@untested". Remove the marker.`
    ).toEqual([]);
  });

  it("every exemption gives a reason, not a bare marker", () => {
    const empty = firestoreHooks()
      .filter((h) => h.exemption !== null && h.exemption.length < 15)
      .map((h) => `${h.name}: "${h.exemption}"`);
    expect(empty).toEqual([]);
  });

  it("no NEW suite hand-rolls its own firebase/firestore mock", () => {
    // One fake, one behaviour. An inline factory alongside the fake means two
    // disagreeing Firestores, which is worse than one imperfect one.
    //
    // The list below is what existed before the seam — each is a suite whose
    // assertions are shaped around its own stub's quirks, so migrating them
    // is real work and belongs in its own PR. DELETE-ONLY, like EXEMPT: the
    // gate's job is to stop the pattern SPREADING while that work happens.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") walk(p);
        } else if (/\.test\.tsx?$/.test(entry.name)) {
          const src = readFileSync(p, "utf8");
          if (/vi\.mock\(\s*["']firebase\/firestore["']\s*,/.test(src)) {
            offenders.push(p.slice(ROOT.length + 1));
          }
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(
      offenders,
      `Use bare vi.mock("firebase/firestore") + seedFirestore() instead. If ` +
        `the fake lacks behaviour you need, extend src/test/firestoreFake.ts.`
    ).toEqual([...PERMANENT_INLINE_MOCKS, ...LEGACY_INLINE_MOCKS].sort());
  });
});
