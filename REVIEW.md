# REVIEW.md: what a change is checked for

A reliability checklist triggered by the diff. Each item has a trigger that
can be read from a diff, the check a reviewer makes, and the incidents and
pull requests behind it. A reviewer runs only the items whose triggers
match the change and says for each matched item what was checked and what
was found. How many match varies a lot: see "How many items a change
triggers" at the end. CODING_STANDARDS.md holds the
standing rules in prose; this file turns the ones a diff can reveal into
triggers.

**Read it from the base, never from the change.** A check that the change
under review can edit is a check that change can switch off, so the
reviewer reads this file, and the gate-file list, from the base commit:

```sh
node scripts/review-triggers.mjs --base <base sha>   # matched items, with the lines that matched
git show <base sha>:REVIEW.md                        # the whole list, as the base has it
```

Without `--base` it diffs against `git merge-base HEAD origin/main`. When
the base has no REVIEW.md or gate list it stops, unless `--allow-own-copy`
says this is the change that adds them. When a change edits REVIEW.md it
says so (the base's copy judges it); when it edits
`scripts/review-triggers.mjs` it gives the command that runs the base's
copy instead. The section "Who judges a change" at the end lists which of
the repo's other checks read from the change's own branch, and what is
done about each.

**How a trigger reads.** Keywords, each followed by backticked values:
`paths` globs a changed file must match (`**` spans folders, `{a,b}`
alternates), `not` globs that exclude, `added` and `removed` regexes
tried on the diff's added or removed lines of those files (JavaScript
syntax; `/source/i` for flags), and `deleted`, which matches a file the
change deletes or renames away. Two keywords name files from lists the
base keeps instead of globs: `mirrored`, a client module some
`.cross.test.ts` imports (a rule with a server copy), and `gate-files`, a
file `.github/gate-files.txt` names. With no `added`, `removed` or
`deleted`, any change to a matching file triggers the item. An item may
have more than one Trigger line; any one matching triggers it. REVIEW.md
never triggers an item, and a malformed item heading is an error, so a
typo cannot drop an item quietly.

**Adding an item.** The pattern has appeared in at least two pull requests,
or one incident and a guard that keeps finding it, and it can be seen in a
diff. Cite pull request numbers and main's commits (squash commits on main
stay; branch commits do not). Prune an item when a check (a lint rule or a
guard test) has held its class for a while and nothing has slipped past;
pruned items keep their ids, listed under "Pruned" at the end.

## Data and Firestore

### R02. A new field on the profile

- **Trigger:** paths `src/lib/auth.tsx` `src/lib/types.ts`; added `^\s{2,4}[A-Za-z_]\w*\??:\s*[^=]+;\s*$`
- **Check:** A new profile field that `completeOnboarding` or `configurePlan` persists is on `functions/profileSanitizer.js`'s allow-list (or that write drops it without a word) and in `profileFieldParity.cross.test.ts`; the sanitizer governs those two write paths only, not every profile field (ADR-0005). Whatever is derived from it is written in the same write (R03).
- **Behind:** `5caad0636` (equipment, injuries, split not persisted), #861 (`50610468f`), #1311 (`e412b6f4b`, the `hideWeightNumber` drift).

### R03. A write to a field that has copies or derived fields

- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**` `src/test/**`; added `/(Guarded|\.set|\.update|setDoc|updateDoc|batch\.\w+|(tx|transaction)\.\w+)\s*\(.*\b(programState|raceGoal|runMode|nutritionPhase|goalWeight|weeklyRate)\b/` `/["'](program(State)?|raceGoal|runMode|nutritionPhase|goalWeight|weeklyRate)(\.[\w.]+)?["']\s*:/` `/^\s*(raceGoal|runMode|nutritionPhase|goalWeight|weeklyRate)\s*:\s*[^,;]+,?\s*$/`
- **Check:** List the readers of the field that read it from somewhere else, then write every copy in the same write: `programState` into `profile.program.*`, `raceGoal` with its `runMode`, a goal or rate change with the nutrition phase. Nothing is left stale for something else to reconcile later.
- **Behind:** `5caad0636`, `e1b029604` (the editor wrote `programState.goal`, macros read `profile.program.goal`), `3087ac5dc` (`raceGoal` without `runMode`), #925 (`4db6cb7cd`).

### R04. A rule that lives on both the client and the server

- **Trigger:** paths `functions/lib/**/*.js` `functions/*.js` `src/**/*.cross.test.ts`; mirrored; not `functions/__tests__/**`
- **Check:** If the rule has a copy on the other side, both changed, or a `.cross.test.ts` pins the copy that runs (ADR-0008); a green client suite does not prove the server. A mutation run to show a constant is unpinned covers both suites (`npm run test` and `functions/`) and greps the constant's name across `src/`.
- **Behind:** `62a9cfac7` (the server engine drifted from the tested client engine), #1733 (`f555daf21`, a pinned port nothing ran; ADR-0008), #2383 (`6dc4101d1`, two client and server constants nothing held), #2384 (`4e1e80684`, the sibling constant in the same file), CODING_STANDARDS.md's mutation-scope rule (2026-09-14).

### R05. A Firestore trigger or a server count

- **Trigger:** paths `functions/**/*.js`; not `functions/__tests__/**`; added `\.(onCreate|onWrite|onUpdate|onDelete)\(` `runTransaction\(` `FieldValue\.increment\(`
- **Check:** Triggers fire at least once and concurrently. A read-modify-write runs in a transaction and is guarded against re-delivery by a per-source marker. A count is recounted from an aggregation (followCounts, raceCohorts, spaceWeeks), or incremented once per source through a credit document (the community goal's and the pulse's credits); never a bare increment.
- **Behind:** `23369ef29` (lost update), `dc3e4a617` (double count on retry), CLAUDE.md's data model.

### R06. A query's order and its index

- **Trigger:** paths `src/**/*.{ts,tsx}` `functions/**/*.js`; not `**/__tests__/**`; added `orderBy\(` `where\([^)]*["'](==|!=|<=?|>=?|in|not-in|array-contains(-any)?)["']`
- **Check:** Every saved document carries the field the query orders by (Firestore leaves out documents without it, and so does the test fake), and the test seeds the fields the app really writes. A new composite query has its `firestore.indexes.json` entry.
- **Behind:** the runs query ordered by `createdAt`, which no saved run had, read nothing in production from May to October 2026 (#2555, `2b393f727`); #1084 (`7a8db8ec5`), #2018 (`5c61e4ded`), #2235 (`026e0c33b`).

### R07. Saved sessions or a week's count, read again

- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**` `src/lib/savedRuns.ts` `src/lib/savedWorkouts.ts` `src/lib/trainingWeek.ts` `src/hooks/useSavedSessions.ts`; added `collection\([^)]*["'](runs|workouts)["']` `/\b(sessionsThisWeek|weekDone|plannedThisWeek)\b/`
- **Check:** Saved runs and workouts are read through `savedRuns.ts` / `savedWorkouts.ts` / `useSavedSessions`, and every week count through `trainingWeek.ts`; a second reader drifts. `savedSessionsReaderGuard.test.ts` and `oneWeekCountGuard.test.ts` gained no exemption.
- **Behind:** #2367 (`ecb666963`, the summary rings scored everyone against five sessions), the `createdAt` runs query (R06), #2555 (`2b393f727`).

### R08. A meal photo, or how far back the diary reaches

- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**`; added `/photo(Url|URL|Path)|FOOD_TAP_BACK_DAYS|foodPhotoStore|RETENTION/`
- **Check:** No meal-photo field is written to Firestore (photos stay on the device, Food9). `FOOD_TAP_BACK_DAYS` and the photo retention move together. Eviction acts on positive evidence only, never on "not in the loaded page". Copy names Google as the processor and the device as the only store.
- **Behind:** F3d, reversed by accident in Food8 and reinstated by #2068 (`99413966a`, Food9, 2026-08-18); #3078 (`7002c69d9`, photos scoped to the account and the diary); CLAUDE.md's meal-photo section.

### R09. Who is signed in, and what is kept per account

- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**`; added `onAuthStateChanged\(` `/\b(localStorage|sessionStorage)\.(setItem|getItem)\(/` `indexedDB\.`
- **Check:** Work that should run once per sign-in waits out the settle (the listener fires several times), and anything stored, queued or cached is scoped by uid, so nothing crosses an account switch on a shared phone. `localStorageGuard.test.ts` gained no exemption.
- **Behind:** #859 (`9ae124767`), #820 (`ccf175370`, a merge), #1533 (`0ecf52b0b`), #1554 (`06a5e552c`), #1608 (`f7ec3bf6f`), #1677 (`138117af8`).

### R10. An answer that can arrive after a newer one

- **Trigger:** paths `src/hooks/**/*.{ts,tsx}` `src/components/**/*.tsx` `src/pages/**/*.tsx` `src/features/**/*.{ts,tsx}`; not `**/__tests__/**`; added `\bawait\s+(fetch|getDocs?|getDocFromServer|getCountFromServer|httpsCallable)\b` `\.then\(\s*\(?\s*\w*\s*\)?\s*=>\s*set[A-Z]`
- **Check:** A response for an older request, day or account cannot overwrite a newer one (a request id, a cancelled flag, a uid check), and a proposal is computed against the live document, not the render it was tapped on.
- **Behind:** #1504 (`a13b142b9`), #1608 (`f7ec3bf6f`), #2430 (`fb85223df`), #2446 (`4ff441c94`).

## Training and nutrition engines

### R39. A training or nutrition engine

- **Trigger:** paths `src/features/program/**/*.ts` `src/lib/performanceEngine.ts` `src/lib/adaptiveTdee.ts` `src/lib/phaseNutrition.ts` `src/lib/nutritionPhase.ts` `src/lib/taperNutrition.ts` `src/lib/scheduleUtils.ts` `src/lib/layOutWeek.ts`; not `**/__tests__/**`
- **Check:** Read `docs/training-programming-claude-handoff.md` and the ledger rows it points to, the plan file's locks for the arc, and the ADR the change touches (0002 runs dated and lifts ordered, 0010, 0011 the command boundary, 0013 bands judge a plan). Run the simulator suites (`src/features/program/__tests__/sim/`) and, for a change to what a week prescribes, the journeys (`npm run test:e2e:journeys`). Check the segments CLAUDE.md names (3-day lifters, light trainers, lapsed and returning, a race and its taper), not only the default plan. A module with a server copy changes with it (R04).
- **Behind:** #1514 (`4df0d0a94`, imminent-race bucketing), #1929 (`eebc07aca`, a lifting deload offered to runners tapering into a race), #1956 (`6ae1b5890`, training runs scheduled after race day), #3139 (`a8ae5ff64`, eight bugs from the 30 Oct to 3 Nov merges: race plans, the starter goal).

## Dates, words and numbers on screen

### R11. Local day against UTC

- **Trigger:** paths `src/**/*.{ts,tsx}` `functions/**/*.js`; not `**/__tests__/**`; added `toISOString\(\)\s*\.(slice|substring|split)\(` `\.getUTC(Date|Day|Hours|FullYear|Month)\(` `\.setUTC\w*\(` `Date\.UTC\(`
- **Check:** A day or week a person reads is bucketed with the local helpers (`localDayKey`, `localWeekKey`), the server pins its days to UTC on purpose, and one calculation never mixes the two.
- **Behind:** `5ad57949e`, #1509 (`e76d66313`), #1738 (`517aa5589`), #2054 (`dc3534c76`), #2344 (`709cbd06a`), #2372 (`2f76bf993`).

### R13. Words in the app

- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**` `src/lib/runCueCopy.ts`; added `toast\.(success|error|info|message)\(\s*["'][^"']*!["']` `["'][^"']*\.\.\.["']` `/\b(unlock|elevate|seamless|your journey)\b/i` `/^(?!\s*(\*|\/\/|\/\*)).*"[^"\n]*\w'\w[^"\n]*"/` `/^(?!\s*(\*|\/\/|\/\*)).*>[^<{\n]*\w'\w[^<{\n]*</`
- **Check:** The house voice (CODING_STANDARDS.md): no exclamation mark in chrome, "…" as one character, ’ for an apostrophe, sentence-case buttons of a verb and its object, no AI tells, one number and its comparison in a coach line. The content libraries and spoken run cues keep their register. `copyMechanics.test.ts` gained no exemption.
- **Behind:** the 2026-08-22 copy sweep, #2375 (`560f3258d`), #2397 (`cc66186de`), #3175 (`9faba46fb`).

### R14. A label over a number

- **Trigger:** paths `src/**/*.tsx`; not `**/__tests__/**`; added `["'>]\s*(Fastest|Best|Personal best|Record|PRs?|1RM|Max|Average|Avg|Total)\b[^"'<]*["'<]`
- **Check:** The label names what the number is (a pace is not a 5K time, a whole run's average is not a 1K record, total reps are not a 1RM). The right word is often already on the same screen; find that sibling first.
- **Behind:** #2335 (`870781658`), #2346 (`542aa79f9`), #2349 (`7a92bd672`), #2353 (`c4f227e04`), #2354 (`2aa9ad1ff`).

### R15. The design system's three drifts

- **Trigger:** paths `src/**/*.tsx` `src/**/*.css`; not `**/__tests__/**` `src/lib/theme.ts` `src/styles/tokens*.css`; added `["'\[]#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b` `:\s*#[0-9a-fA-F]{3,8}\b` `<button\b` `text-\[\d+px\]`
- **Check:** Colours are `THEME` values or tokens, never hex; every number shown is `font-mono tabular-nums`; every control is a `Button` / `IconButton` / `Toggle` that clears 44 px (DESIGN_GUIDE.md §0, §10). A visual change carries before-and-after captures.
- **Behind:** #863 (`f89d34b56`), #922 (`82b52660d`), #923 (`9ef01a192`), #932 (`2dec46792`), #933 (`97a783dd2`), #1199 (`e55aef0a9`), #2144 (`e03e1c09a`).

## Tests

### R17. A negative assertion inside waitFor

- **Trigger:** paths `**/*.test.{ts,tsx}`; added `waitFor\(\s*(async\s*)?\(\)\s*=>\s*\{?\s*expect\(.*\)\.(not\.(toBeInTheDocument|toHaveBeenCalled\w*|toContain\w*)\(|toBeNull\(|toBeFalsy\(|toBeUndefined\(|toHaveLength\(0\)|toBe\(0\)|toEqual\(\[\]\))`
- **Check:** The negative is anchored on a positive first (loading flips, the other account's value appears), or the read is held with `deferReads()` / `releaseRead()`. Mutate the code to go wrong after the read; the test must fail.
- **Behind:** #1772 (`eca53cffa`), #1773 (`d9711ef10`).

### R18. An absence assertion standing alone

- **Trigger:** paths `**/*.test.{ts,tsx}`; added `/(calls|Calls|writes|Writes|sentCommands|commands|log)\b.*\.(toHaveLength\(0\)|toBe\(0\)|toEqual\(\[\]\))/` `not\.toHaveBeenCalled\(\)`
- **Check:** An empty log or a never-called spy is a second assertion behind something positive, or it tests nothing once its mechanism stops being the one in use. Remove the guard and re-run: if the test still passes it never tested the guard.
- **Behind:** #2424 (`0539e96e3`), #2425 (`3c39e8bf7`), #1746 (`c9451ca0c`, a spy that was never wired).

### R19. A wholesale module mock, or a new import into its consumers

- **Trigger:** paths `**/*.test.{ts,tsx}`; added `vi\.mock\(\s*["'][^"']+["']\s*,\s*(async\s*)?\(\)\s*=>`
- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**` `src/test/**`; added `/^import\s*\{(?![\s,]*(?:(?:type\s+)?(?:useAuth|db|auth|functions|storage|haptic|toast|logger)[\s,]*)+\})[^}]*\}\s*from\s+["']@\/lib\/(firebase|auth|haptic|toast|logger|socialApi|platform|subscription|firestoreWrite|lifecycleAnalytics)["']/` `/^import\s*\{(?!\s*(use\w+)\s*,?\s*\}\s*from\s+["']@\/hooks\/\1["'])[^}]*\}\s*from\s+["']@\/hooks\/(useDistanceUnit|useReducedMotion|useRestrictedStatus|useBlockedUsers)["']/`
- **Check:** A `vi.mock(path, () => …)` factory makes every other export `undefined`; a component that gains an import from a module some suite mocks wholesale breaks that suite at the call site, not at the import. The trigger leaves out the names those mocks always provide (`useAuth`, `db`, `haptic`, `toast`, `logger`, a hook from its own module). Make the mock partial with `importOriginal`, and run the FULL unit suite, not the touched subset.
- **Behind:** #1936 (`0d335dd75`), #2455 (`1451815bc`), CLAUDE.md's Common Gotchas.

### R20. A fixture on a calendar date

- **Trigger:** paths `**/*.test.{ts,tsx}` `e2e/**/*.ts` `scripts/seed-*.ts`; added `new Date\(\s*["']\d{4}-\d{2}-\d{2}` `new Date\(\s*\d{4}\s*,` `Date\.parse\(\s*["']\d{4}`
- **Trigger:** paths `**/*.test.{ts,tsx}` `e2e/**/*.ts`; added `/\b(const|let)\s+\w*(today|yesterday|tomorrow|noon|midday|monday|sunday)\w*\s*=\s*new Date\(\)/i` `/new Date\(\)\.(setDate|setHours|getDay|getDate)\(/` `/Date\.now\(\)\s*[-+]\s*\d[\d_]*\s*\*\s*(24|86_?400|60\s*\*\s*60)/`
- **Check:** The date is derived from the clock or the clock is pinned; nothing relies on a window that some day stops containing it. A test that reads today from the wall clock pins it (`vi.setSystemTime` at noon) or derives every day from one read, so midnight and Monday cannot split it. CI also runs at +90 days and in Auckland across DST.
- **Behind:** #2294 (`29c494146`), #2379 (`85f1402dd`), #2447 (`8646c2857`), #2690 (`0e9dd4a57`), #3347 (`85fcc357c`).

### R21. Fake timers and test order

- **Trigger:** paths `**/*.test.{ts,tsx}`; added `vi\.useFakeTimers\(` `vi\.useRealTimers\(`
- **Check:** The clock is restored with `restoreRealTimers()` from `src/test/fakeTimers.ts`, which settles framer's frame loop while the fake clock is still installed; no assertion counts something a `vi.mock` factory does once per file. `unit-shuffle` reorders the suite.
- **Behind:** #2391 (`2cc5ce559`) and #2411 (`4656ac6c2`, three tests that passed only from where they sat), #2393 (`10a808d16`, jsdom's animation-frame counter), #2421 (`98a5deae8`); CLAUDE.md's "Test ORDER is gated".

### R22. A grouped number in an assertion

- **Trigger:** paths `**/*.test.{ts,tsx}` `e2e/**/*.ts`; added `["'/][^"'/\n]*\d,\d{3}`
- **Check:** The separator is built with `src/test/localeGrouping.ts`, never spelled; `unit-locale` runs de-DE and fr-FR.
- **Behind:** 26 assertions that spelled a comma when `unit-locale` was added, `96b1769fb` (French grouping failed a fill step), `30654187d` (the steps offer's grouped numbers), `energyCaptureAnchor.test.tsx`.

### R23. A test or spec deleted or renamed

- **Trigger:** paths `**/*.test.{ts,tsx,js,mjs}` `e2e/**/*.spec.ts` `functions/__tests__/**`; deleted
- **Check:** `rg` the file's name across the repo and fix every line of prose that says something is "covered by" it; whatever it covered has a replacement.
- **Behind:** #1733 (deleted the completion tests a header still cited), #1834 (`b525af6f7`, a 70% distance gate compared metres to kilometres for months), #1835 (`051e77654`), #2392 (`2a5d2584c`).

## Browser, end-to-end and captures

### R24. Words or labels that specs find

- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**` `src/test/**`; removed `aria-label=` `>\s*[A-Z][A-Za-z’' ]{2,}\s*<` `["'][A-Z][a-z]+( [a-z]+){0,4}["']`
- **Check:** `rg` the old string over `e2e/` and `src/test/journeyScreens.ts` in the same commit, and rename it there. The capture specs select by what a person sees and are a PR gate.
- **Behind:** #2187 (`43dd1a0a6`, an aria-label a spec found by), #2076 (`f08592c3f`, a rotted selector meant a step never ran), `3c9a3e6a7`, three selectors on 2026-08-22 (docs/agents/capture-rig.md).

### R25. A capture or e2e measurement before the page settles

- **Trigger:** paths `e2e/**/*.ts`; added `scrollIntoView\(` `window\.scrollTo\(` `waitForTimeout\(` `fullPage:\s*true`
- **Check:** A scroll before a measurement is `behavior: "instant"` or `scrollIntoViewIfNeeded()`; raster art is decoded (`settleImages`); a frame waits on the data it shows, not on a height or a fixed sleep. Selectors that may miss have short explicit timeouts.
- **Behind:** #2371 (`450918e2d`, a capture spec raced the app's smooth scrolling), #2077 (`db1cf3cbb`, art not decoded, `settleImages`), `home-energy-default-after` (five heights until anchored on data; docs/agents/capture-rig.md).

### R26. A seed or an npm script

- **Trigger:** paths `package.json` `scripts/seed-*.ts`; added `"(seed|test|build|check|verify|review)[\w:-]*"\s*:`
- **Check:** The script's binary is in a fresh `npm ci` tree (`npmScripts.test.ts`). A seed the capture specs need is in BOTH `emulator-tests.yml` and `app-screenshots.yml` (`captureSeedChain.test.ts`).
- **Behind:** #1881 (`4a9069903`, `seed:fellbehind` ran a binary the repo never had, and the capture channel was dead), #2200 (`02be41740`, the two seed chains pinned together), `captureSeedChain.test.ts`.

## Native app and the web shell

### R27. A Capacitor plugin handed through a promise

- **Trigger:** paths `src/**/*.{ts,tsx}`; not `**/__tests__/**`; added `import\(\s*["'](@capacitor|@capacitor-firebase|@revenuecat|capacitor-)` `return\s+\w+\.[A-Z]\w+\s*;` `\.then\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.[A-Z]\w+\s*\)`
- **Check:** A plugin is a Proxy that answers `then` with a native call, so resolving a promise with it never settles. Hand back a holder (`{ plugin }`) as `haptic.ts`, `systemChrome.ts` and `revenuecat.ts` do, and mock it with `src/test/capacitorPlugin.ts`. A native-only path still has a web-visible path.
- **Behind:** #3093 (`2d33556da`, the first TestFlight builds hung: RevenueCat never set up, App Check never answered). One incident, kept because it hung every native build at once and nothing in a web run can show it; `src/test/capacitorPlugin.ts` makes the old shape hang a test, and CLAUDE.md's Common Gotchas sets the holder as the rule.

### R28. The web shell: CSP, service worker, headers

- **Trigger:** paths `index.html` `public/sw.js` `firebase.json` `src/lib/register-sw.ts` `src/lib/appCheck.ts` `scripts/stamp-sw.mjs`
- **Check:** The CSP allows every origin the app now calls, in the meta tag and in `firebase.json`'s header; `frame-ancestors` stays a header. The service worker is stamped per build and never serves a stale `index.html`. `hostingSecurityHeaders.test.ts` passes unchanged.
- **Behind:** #1057 (`07a0b1498`), #1273 (`cb4f980f3`), #1475 (`ff833d2b0`), #1543 (`5662cb846`), #2674 (`7405c908f`).

### R29. The bundle's shape

- **Trigger:** paths `vite.config.ts` `index.html` `src/lib/preloadTab.ts` `src/lib/lazyRetry.ts` `scripts/check-dist-size.mjs`
- **Check:** `npx vite build && node scripts/check-dist-size.mjs` passes without the baseline moving up; no lazy chunk joins the chunks `index.html` preloads; pages stay behind `lazyRetry()`; the login screen's critical path stays free of Firestore.
- **Behind:** #1072 (`2f39b59f1`, reverted #1071), #1233 (`e268c978b`), #2205 (`0b7056138`), `3c9a3e6a7`.

### R30. A new route

- **Trigger:** paths `src/App.tsx`; added `\bpath=` `lazyRetry\(`
- **Check:** CLAUDE.md's Pages table has the row (`claudeMdFreshness.test.ts` pins both ways), the page sits in the right route set (signed out, onboarding, signed in), and it renders on the web and is wired for iOS.
- **Behind:** `937c1cd41` (a row for a deleted page), #2143 (`a14b8eefa`, the freshness gate widened to what it missed), #2385 (`af06d4ec4`), CLAUDE.md's "Build for the iOS app" rules.

## Cloud Functions

### R31. A Cloud Function export, its caps and its imports

- **Trigger:** paths `functions/**/*.js`; not `functions/__tests__/**`; added `require\(\s*["']firebase-functions["']\s*\)` `require\(\s*["']firebase-admin["']\s*\)` `\.runWith\(` `^exports\.\w+\s*=`
- **Check:** 1st-gen code imports `firebase-functions/v1`; the Admin SDK comes through `functions/lib/adminSdk.js`; every HTTP and trigger function has a `maxInstances` tier. Read docs/agents/functions-deploy.md first.
- **Behind:** #1334 (`315c30243`), the firebase-functions v7 migration and the `adminSdk` incident (docs/agents/functions-deploy.md).

### R32. A new secret or environment variable for Functions

- **Trigger:** paths `functions/**/*.js`; not `functions/__tests__/**`; added `defineSecret\(` `process\.env\.[A-Z][A-Z0-9_]+`
- **Check:** A bound secret has its accessor grant before the first CI deploy that binds it (docs/iap/revenuecat-setup.md Part C) and is on `npm run secrets:check`'s list. A plain variable is on `scripts/write-functions-env.mjs`'s list and is a repository variable.
- **Behind:** #1017 (`49ef7bd93`), #1383 (`213d53f3e`), #2535 (`ee8f78552`), #2538 (`02de56db9`), run 36642140725.

### R33. A schedule

- **Trigger:** paths `functions/**/*.js`; not `functions/__tests__/**`; added `\.schedule\(` `\.timeZone\(` `/\bcron\b/i`
- **Check:** The schedule is in UTC (a Europe/London anchor moves an hour under BST) and `functionsScheduleUtcGuard.test.ts` holds.
- **Behind:** #815 (`1637e22e2`, a merge; a Europe/London anchor moved the rollups under BST), #1334 (`315c30243`), #2380 (`c427c4e77`).

### R34. A notification or a push

- **Trigger:** paths `src/lib/notificationPreferences.ts` `functions/**/*.js`; not `functions/__tests__/**`; added `createNotification\(` `/messaging\(\)\.(send|sendEach)/` `claimPushBudget|pushBudget`
- **Check:** A new notification type has its switch, or none on purpose, in `notificationPreferences` (pinned by `notificationPreferences.cross.test.ts`); a push not from a person passes the daily budget; none crosses a block, comes from a restricted sender or is sent for one's own act.
- **Behind:** S3, App1 Q18, `b35eef932` (one push a day, App1 Q60), `c6d6264cf`.

## Process

### R35. The plan file

- **Trigger:** paths `.claude/plans/programme-run-followups.md`
- **Check:** A lock row is on its own `claude/lock-<id>` branch with its own PR, never piggybacked. Rows are append-only: a removed line in an existing row is a rewrite; add a `STATUS YYYY-MM-DD` line instead.
- **Behind:** #720 (`55b816d9e`, Hist5 and PI5 orphaned on unrelated branches), #1847 (`807f9c5d4`).

### R36. A workflow

- **Trigger:** paths `.github/workflows/**`
- **Check:** Actions pinned to a commit with a `# v…` comment; a top-level `permissions` block; `timeout-minutes` on every job; firebase-tools at the one exact version; concurrency that never cancels main; a `pull_request_target` workflow never checks out the pull request. The change does not relax the job that judges it (see "Who judges a change").
- **Behind:** #2138 (`fa9da94cd`, every action pinned to a commit), #2414 (`01449b0df`, the queue full of runs for commits nobody would merge), #2900 (`eeb88c6dd`, a timeout on every job), #3168 (`a096f81c0`, a claude branch's emulator run through its pull request only).

### R37. A typecheck, lint or push command written down

- **Trigger:** paths `**/*.md` `.claude/**` `scripts/**` `.github/**` `.husky/**` `package.json`; added `tsc\s+--noEmit\s+-p` `tsc\s+-p\s+tsconfig\.json` `\|[^|&\n]*;\s*git push` `[^&]\s;\s*git push`
- **Check:** Typecheck with `tsc -b` (the `-p` form checks nothing on this repo); lint's verdict is the `✖ N problems` line or the exit code; a push is gated on its checks with `&&` and `set -o pipefail`, never `;`.
- **Behind:** #2159 (`caff64234`), #2337 (`85521cdd1`), the push of 28 failing Home tests on 2026-11-09 (CLAUDE.md, Common Gotchas).

### R38. A gate file

- **Trigger:** gate-files; not `package.json`; removed `/./`; added `^\s*["'][^"']+["'],?\s*(//.*)?$` `\.(skip|todo)\(` `/\b(allow|exempt|baseline|budget|max|limit)\w*\b/i`
- **Trigger:** paths `package.json`; added `/"(test|verify|lint|typecheck|build|check|prepare)[\w:-]*"\s*:/`; removed `/"(test|verify|lint|typecheck|build|check|prepare)[\w:-]*"\s*:/`
- **Check:** Did the change loosen a rule its own code relies on (an allowlist entry, a raised baseline, a narrowed pattern, a skipped case)? Read that hunk on its own, and read the `guards-from-base` job, which runs the base's copy of an edited rule test against the change. The files are `.github/gate-files.txt`'s, read from the base; in `package.json` only the scripts that run the checks count, not a dependency bump.
- **Behind:** #2331 (`d0b8611d6`, a guardrail that was off), #2392 (`2a5d2584c`, a test that ran nowhere), #2407 (`66891293b`, a11y invariants that only ran on the login page), the article's rule that a change must not edit the check that judges it.

## Who judges a change

Every check on a pull request reads from the pull request's own branch
unless something says otherwise. The findings, and what is done about
each, are in docs/agents/review.md. In short:

- **Fixed here:** this checklist and the gate-file list are read from the
  base by `scripts/review-triggers.mjs`, which also says when a change
  edits either or the script itself. R38's trigger is the gate list and
  R04's the base's cross tests, so neither keeps a second copy.
  `.github/workflows/guards-from-base.yml` judges a pull request's merge
  commit against its first parent, names every gate file it edits, and
  runs the base's copy of each edited rule test against its code, warning
  when one fails.
- **Advisory, not sound:** that workflow is itself read from the pull
  request, as every `pull_request` workflow is. Only the owner can make it
  sound: a required check bound to the base's copy, a ruleset, or
  CODEOWNERS on `.github/gate-files.txt`'s files.

## How many items a change triggers

Measured on 2026-11-21 over main's last 250 first-parent commits, with
this file and the gate list as they stand (`mirrored` read from each
commit's parent):

| Items matched | Commits |
| ------------- | ------- |
| 0             | 48      |
| 1             | 90      |
| 2             | 43      |
| 3 to 10       | 66      |
| more than 10  | 3       |

Leaving out the 51 commits that only touched the plan file, 130 of 199
matched fewer than 3. The three over 10 were large merges: #3337 (27,
thirty branches tested together), #3217 (12) and the meet-ups change (11).
The items that fire most are R04 (60, any change to a mirrored module),
R38 (52), R19 (50), R35 (50, the plan file), R39 (49), R24 (48) and R18
(40); 13 items fired three times or fewer.

## Pruned

Ids stay with the item, so a citation of one never points at another.

- **R01, a raw Firestore SDK write.** Held by `firestoreWriteGuard.test.ts`, which fails CI on any raw `setDoc` / `addDoc` / `updateDoc` / `deleteDoc` outside `src/lib/firestoreWrite.ts`; it matched no change in main's last 250. An exemption added to that guard is R38's.
- **R12, a date, a time of day or a unit shown to a person.** Held by `dateTreatment`, `timeTreatment` and `unitTreatment`, which fail CI on each form it named; an exemption is R38's.
- **R16, unit factors defined again.** One pull request behind it (#2152), and it matched no change in main's last 250.
