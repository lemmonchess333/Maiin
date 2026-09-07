# Performance pass — measured, then acted on

Closes the "Performance work (4k)" owner call left open in
`app-improvement-pass-2026-09-05.md`. That row's instruction was _measure
first_, and its two named suspects — framer-motion's import breadth and
`ExercisePicker` rendering 152 rows unwindowed — both turned out to be
the wrong targets.

## Method

Production build for bundle facts; the emulator rig under Chrome DevTools
throttling for timings — **4x CPU slowdown, 1.6 Mbps down, 150 ms RTT**, a
mid-tier phone on 4G. That profile is the point: Tropos ships as a
Capacitor iOS app, and the numbers on a developer laptop over localhost
say nothing about the device the users are on. Unthrottled, first paint
measured 228 ms and the problem was invisible.

The eager chunk was attributed to source modules by parsing the build's
sourcemap, so the "who is in the shell" numbers are the compiler's, not
an estimate.

## What was wrong

A signed-out visitor downloaded the entire authenticated application
before the login form painted.

`App.tsx` statically imported two components that render `null` until
something happens. Static imports are unconditional, so both landed in
the eager `index` chunk regardless of the fact that neither shows
anything to a signed-out visitor:

| root                     | chain                                       | dragged in                                                                                |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DailyNutritionSnapshot` | → `useEffectiveTargets` → `trainingSignals` | `programEngine` (107 KB) → `exercises` (105 KB)                                           |
| ″                        | → `useEffectiveTargets` → `taperNutrition`  | `runScheduler` (66 KB)                                                                    |
| `ShareComposerSheet`     | → `profanityFilter`                         | `leo-profanity` and its three bundled word lists (~103 KB; the French one alone is 81 KB) |

The French profanity list is the one that makes the shape obvious: an
English-language fitness app was shipping 81 KB of French swear words on
the critical path of its login screen, because a share sheet that renders
nothing was mounted at the root.

## The change

Two lazy boundaries. Both components already rendered `null` when idle,
so there is no visual change and no new loading state:

- `ShareComposerSheet` — `lazyRetry`, inside its own `Suspense
fallback={null}` at the root.
- `DailyNutritionSnapshot` — `lazyRetry`, its own `Suspense
fallback={null}` inside the authenticated tree, so a pending chunk can
  never swap the whole app for the page loader.

Neither can miss work by arriving late, which is the thing worth checking
before deferring a subscriber. `DailyNutritionSnapshot` is a writer keyed
off the current day. `subscribeShareComposer` replays current state to a
new listener (`listener(state)` on subscribe), so a share opened before
the chunk lands is delivered the moment it mounts.

## Result

|                           | before                       | after                            |
| ------------------------- | ---------------------------- | -------------------------------- |
| eager `index` chunk       | 542 KB (210 modules)         | **203 KB (115 modules)**         |
| ″ gzipped                 | 163 KB                       | **66 KB**                        |
| JS+CSS before first paint | 1,619 KB                     | **1,277 KB**                     |
| FCP, throttled            | 3308 / 3324 / 3336 / 3352 ms | **2764 / 2636 / 2596 / 2796 ms** |

Roughly **630 ms off first paint, 19%**. Four samples each side, ranges
that do not overlap; the payload figures are deterministic. The FCP
numbers are from this sandbox and are useful as an A/B, not as an
absolute — a real device is its own measurement.

## What is next, with the case already made

**`firebase-db` — 369 KB, still blocking first paint.** Now the largest
single pre-FCP item. `src/lib/firebase.ts` is one eager module that
creates Auth, Firestore, Storage and Functions at import time, so
anything importing `auth` — as Login does — pulls the whole Firestore
SDK. The login screen never touches Firestore.

Deferring it is a real refactor, not a lazy boundary: `db` is a
module-scope export with **65 import sites**, so it would become a
`getDb()` accessor or similar. Worth roughly 0.5 s of the remaining FCP
by the same arithmetic as above. Deliberately not attempted here — it
wants its own PR and its own verification.

**Still eager and legitimately so:** `tailwind-merge` (100 KB, used by
`cn()` everywhere), `sonner` (64 KB), `auth.tsx` (57 KB),
`useStreaks.tsx` (46 KB). `index.css` at 119 KB blocks render by
definition and was not examined.

## The two suspects the prompt named, both wrong

- **framer-motion breadth.** 86 files import it, up from the 65 the
  earlier doc recorded — but it is already its own chunk and, at 132 KB,
  is a fifth of what the app's own eager code cost. Import _count_ was
  never the metric.
- **`ExercisePicker`'s 152 unwindowed rows.** Not reached: it is behind a
  route that a signed-out visitor never opens, and 152 rows is not a
  measured problem. Virtualising it would have been the "polish" the
  prompt warned against — work with no number behind it.

The lesson is the prompt's own: the named suspects were plausible and
both wrong, and the actual defect — a share sheet putting French
profanity on the login critical path — was not something anyone would
have guessed.

## The dist-size gate caught the trade-off, correctly

`check:dist-size` (in the `unit` CI job, not `npm run test` — which is why
a local run was green) failed this change, and it was right to. Splitting
the eager chunk creates new chunks and some duplication, so total dist
grew 5,034.6 → 5,106.3 kB, **+1.4% against its 5% tolerance**. The gate
does not fail on that total; it fails on new chunks at or above 20 kB,
which must be named deliberately.

They are the modules this change moved, and attributing them confirmed
the intent:

| new chunk                   | contents                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `exercises` 86.7 kB         | the exercise database, one module                                                                                           |
| `programEngine` 38.4 kB     | programme engine + volume/variation/overlap models                                                                          |
| `VerifyEmailNotice` 97.7 kB | Rollup named the shared profanity chunk after a member: french-badwords 80.9, leo-profanity 12.5, **russian-bad-words 9.7** |
| `BottomSheet` 61.1 kB       | `vaul` + radix, which left the eager chunk with ShareComposerSheet                                                          |
| `RunSummary` +2.3 kB        | splitting cost — it no longer gets a shared module free from the eager chunk                                                |

Two things worth recording. **leo-profanity bundles a third dictionary** —
Russian, 9.7 kB — so the eager cost was ~103 kB of word lists, not the
81 kB the French list alone suggested. And `vaul` at 77 kB left the eager
path too, which the index-chunk figure already counts but the chunk list
makes visible.

Baseline updated with `--update` in this PR, as the gate's own docstring
requires. Total bytes on disk up 1.4%; bytes before first paint down 21%.
That is the trade, made deliberately.

## The guard

`src/lib/__tests__/eagerGraph.test.ts` walks the static import graph from
`App.tsx` and fails when a listed heavy module becomes eagerly reachable,
printing the import chain that did it. It runs in milliseconds and needs
no build.

It is deliberately buildless: the regression this prevents arrives as a
one-line import in a root-level provider, which is invisible in review
and whose cost lands on every cold start. A bundle-size check would catch
it a build later, if at all.

Two things it gets right that a first attempt got wrong, both found by
running it: a whole-statement `import type` is erased by TypeScript and
must not count (it reported `runResumeStorage` dragging in the run
scheduler, which was false), and `import("x")` must be stripped before
matching or the very deferral being protected reads as a static import.
