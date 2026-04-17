# Diagnostic — Streak Logic, Notifications, and Streak UI

## 1. Streak logic (S1–S5)

**S1 — files and roles:**

- `src/features/streaks/useStreaks.ts` — the hook. Subscribes to workouts, runs, meals, and a `users/{uid}/streaks/data` doc; derives `currentStreak` + `totalActiveDays` from pure helpers; persists changes back. 441 lines, well-commented.
- `src/features/streaks/badges.ts` — `BADGE_DEFINITIONS` (30 badges across 5 categories: consistency, lifting, running, nutrition, hybrid) + `EarnedBadge` type.
- `src/features/streaks/BadgeGrid.tsx` + `BadgeEarnedModal.tsx` — UI for the badge collection.
- **Firestore:** single doc at `users/{uid}/streaks/data` holding `{ currentStreak, longestStreak, lastActiveDate, totalActiveDays, badges }`.

**S2 — active-day definition.** An "active" day is any date where **at least one of** {a workout, a run, a meal with ≥1 item} exists for that date. Weight, mood, water log, or app-open does **not** count. Meals with `items.length === 0` are explicitly excluded (guard against draft/empty docs). Quote from `useStreaks.ts:73-101`:

```
function computeActiveDateSet(workouts, runs, meals): Set<string> {
  const set = new Set<string>();
  for (const w of workouts) { if (typeof w.date === "string" && w.date) set.add(w.date); }
  for (const r of runs) {
    if (!r.completedAt) continue;
    try { set.add(format(r.completedAt.toDate(), "yyyy-MM-dd")); } catch {}
  }
  for (const m of meals) {
    if (!Array.isArray(m.items) || m.items.length === 0) continue;
    set.add(m.date);
  }
  return set;
}
```

**S3 — reset / grace behaviour.** No freeze / skip mechanic. But a **soft grace rule** is built in (`useStreaks.ts:104-133`): if *today* isn't active yet but *yesterday* is, the streak displays as ending on yesterday (at-risk but alive). The streak doesn't drop to zero at midnight — it drops only once *both* yesterday and today are missing. All date math uses `date-fns format(date, "yyyy-MM-dd")` in the **device's local timezone**. Timezone travel is explicitly acknowledged as out of scope in a code comment — crossing zones can shift date boundaries by a day. No UTC comparison anywhere. Quote:

```
// Today/yesterday rule — the streak does NOT drop to zero at midnight.
// - If today is active: streak ends on today (live).
// - Else if yesterday is active: streak ends on yesterday (at risk).
// - Else: streak = 0 (broken).
```

**S4 — award / increment logic.** Computed on every snapshot reflow via `useMemo` over `{workouts, runs, meals}`; derived, not imperatively incremented. Whenever the derived `currentStreak` differs from the last-written ref, a persistence `useEffect` writes the new value to `users/{uid}/streaks/data` with `{ merge: true }`. Loop-guarded (`lastWrittenStreakRef`) so write → re-read → write doesn't oscillate. Badge awards are separate — iterate `BADGE_DEFINITIONS`, award when `currentStreak >= threshold` and `earnedAt` is null. "Silent" mode on first load prevents reshowing badge modals for already-earned badges.

- **No visible race:** write is loop-guarded; fast sequential logs don't double-count because the set is deduped by date string.
- **Minor concern:** `useStreaks` is instantiated in *both* `Home.tsx` and `FoodHeroCard.tsx` (via `Food.tsx`) — 8 Firestore subscriptions per user when both pages are mounted. A TODO in the hook acknowledges this: "hoist this hook to a context provider. Currently Home and Food each create their own 4 subscriptions (8 total)."
- **Windowing:** streams are capped at 400 workouts, 400 runs, 500 meals. A user with a >400-day streak would miss older days. Acknowledged in a comment — "Acceptable for launch."

**S5 — longest streak / historical.** Yes: `longestStreak` is tracked and persisted. `longestStreak = Math.max(currentStreak, streakData.longestStreak)` on every compute. Also `totalActiveDays = activeDateSet.size` (windowed per the caps above). **Neither is currently surfaced in the UI** — only `currentStreak` renders. `longestStreak` + `totalActiveDays` are dead-ended in the data layer.

**Observed bugs:** none in logic. Two structural notes: (a) the double-subscription between Home and Food (noted as TODO); (b) `UserProfile.tsx:68` still reads a legacy `profile.currentStreak` field from the user document — that field is set by Onboarding to 0 but never updated after (the real streak lives in the subcollection). `UserProfile` is displaying stale zeroes for every user other than the viewer.

---

## 2. Notification infrastructure (N1–N5)

**N1 — Capacitor.** `@capacitor/local-notifications ^8.0.2` installed (`package.json:25`, `package-lock.json:1857`, `ios/App/CapApp-SPM/Package.swift:20`). **No** `@capacitor/push-notifications`. `src/lib/notifications.ts` wraps `LocalNotifications` with native/web dispatch: `requestNotificationPermission`, `hasNotificationPermission`, `scheduleNotification`, `cancelNotification`, `cancelAllNotifications`. `Info.plist` has **no** `NSUserNotificationsUsageDescription` — iOS doesn't require one for local notifications; the system dialog handles it via `LocalNotifications.requestPermissions()`.

**N2 — FCM.** Not wired. `firebase/messaging` is a transitive dependency of the `firebase` SDK but is **not imported anywhere** in `src/` or `functions/`. No FCM token registration, no server-side push in `functions/index.js`. Grep confirms: zero references to `messaging`, `fcm`, `pushNotification` in application code. **This app is local-notifications only.** All notifications are scheduled on-device; none come from a server. The distinction matters — streak-at-risk reminders can still work for active users (device wakes to fire a locally-scheduled reminder) but **can't nudge a user whose app has been force-quit for days without the OS re-scheduling**.

**N3 — permission flow.** Triggered reactively: when the user flips `mealReminders.enabled` or `workoutReminders.enabled` on in `NotificationsSection`, the hook calls `requestNotificationPermission()`. No onboarding-time permission ask, no first-food-log ask. Silently fails if permission is denied (`scheduleNotification` short-circuits at `hasNotificationPermission()`).

**N4 — scheduled notifications.** Two surfaces, both already wired:

- **Meal reminders** (`useMealReminders.ts`): 3 notifications — breakfast 08:00, lunch 12:30, dinner 18:30 (times configurable). IDs 1001–1003. "Time for breakfast / Quick log keeps your day accurate." Reschedule-next-occurrence model — each fire sets up tomorrow's. No multi-day scheduling.
- **Workout reminders** (`useWorkoutReminders.ts`): 1 notification, default 07:00. ID 2001. "Time to train / Your session is ready when you are." Skips rest days by looking up to 7 days forward until it finds a non-rest day via `profile.weekSchedule`.
- **No streak-specific notifications.** No motivational / milestone pushes. ID range 3000+ is reserved in a code comment for "event-driven notifications added in v1.2."

**N5 — settings surface.** `NotificationsSection.tsx` (inside `src/components/settings/`). Two top-level toggles (meal reminders / workout reminders), each with a per-item time picker when enabled. Shown under the main Settings accordion. Stored at `users/{uid}/settings/mealReminders` and `users/{uid}/settings/workoutReminders`.

---

## 3. Streak UI (U1–U4)

**U1 — where it renders.**

- `Home.tsx:60, 299-303` — `StreakFlame` in the header top-right, next to the settings icon.
- `Home.tsx:365-377` — at-risk nudge card when `streak >= 3 AND no activity logged today` (flame icon + "{N}-day streak at risk" + "Log a workout, run or meal to keep it alive").
- `FoodHeroCard.tsx:8, 335` — `StreakFlame` in the ring card's top-right (same component, with `celebrate` prop wired to the daily-macro-complete moment).
- `UserProfile.tsx:68` — reads `profile.currentStreak` from the Firestore user doc (**not** via `useStreaks`). Displays a stale number for other users (see Section 1 bugs).
- `History.tsx` — no streak display.
- `Onboarding.tsx:337` — initialises `currentStreak: 0` on the user doc; no streak onboarding copy.
- `StreakCounter.tsx` exists but is used nowhere — **dead component**.

**U2 — Home visual treatment.** `StreakFlame` on Home:

- Size: small pill, approx 60–75px wide × 28px tall.
- Icon: Lucide `Flame`, 16px (`w-4 h-4`), `text-orange-500`.
- Background: `rgba(251,146,60,0.06)` — 6% warm-orange tint; no border.
- Rounded: `rounded-full` (fully pill-shaped).
- Number: `text-sm font-semibold text-orange-600` (dark: `text-orange-400`). Uses `useCountUp` via the `display` prop so the number tweens on increment.
- Animations: flame icon pulses opacity 0.7→1→0.7 at 2s infinite; pill keys on `streak` value with a spring entrance; `bounce` prop triggers a `scale: 1.15` entrance on streak-change.

**U3 — states.**

- **Day 0 (never started):** Hidden. `StreakFlame` returns `null` at `streak <= 0` (line 29: "a flame labelled `0` reads as a failure indicator").
- **Day 1:** Flame pill appears with bounce-in animation. Identical visual treatment to all non-zero days.
- **Day 7:** Same pill, number reads `7`. No visual escalation. A separate `BadgeEarnedModal` fires for the `week_warrior` badge.
- **Day 30:** Same pill, number reads `30`. `month_master` badge modal fires.
- **Streak-at-risk (active streak, nothing today):** Pill still renders with yesterday's number. Additionally, at `streak >= 3`, an orange at-risk card appears in the main Home feed.
- **Streak-just-broken (N → 0):** Pill disappears entirely. No "you broke your streak" UI — silent transition.

**U4 — celebration moments.**

- **Badge earned** → `BadgeEarnedModal` with `canvas-confetti` (100-particle burst + 30-particle aftershock). Milestone flow for 1, 3, 7, 14, 30, 60, 100, 365-day badges all hit this path, plus category badges (first 5K, plate club, etc.).
- **Food hero daily-macros-complete** → `StreakFlame` receives `celebrate` prop → scale pops 1 → 1.2 → 1 over 300ms. Also fires haptic.
- **Streak increment** (without a badge) → only the mount bounce + `useCountUp` tween on the number. No confetti.
- **No streak-specific milestones independent of badges.** All milestone celebration is routed through the badge system.

---

## 4. Diagnosis summary

**Streak logic is correct and well-designed** — derived state from three source streams with a thoughtful today/yesterday grace rule, no midnight drop-off, loop-guarded persistence, 30 badges wired, silent-vs-loud award mode to avoid spamming on first load. The only friction is the double-subscription when Home and Food are both mounted (already TODO'd) and the stale `profile.currentStreak` field on `UserProfile`. Windowing at 400/500 docs is generous enough for launch.

**Notifications are existing-but-minimal** — local-only, two categories (meals × 3 times, workout × 1 time), wired to Settings and to Firestore persistence, IDs 3000+ reserved for future event-driven work. **Nothing streak-related is sent.** FCM infrastructure is entirely absent; adding server-sent push would be net-new work. Local streak-at-risk reminders are achievable by adding an entry to the existing pattern.

**UI is reasonable but single-note** — one visual treatment for all non-zero streaks. No milestone pride for 7/30/100 in the flame itself (milestones live in the badge modal, which is a disconnected surface — you see the modal once then it's gone). `longestStreak` and `totalActiveDays` are tracked server-side but never displayed. `StreakCounter` is a richer design that's been built but never used.

**Follow-up scope should split:**

1. **Streak notifications** — add `NOTIFICATION_IDS.streak_at_risk` (ID 3001), schedule at ~20:00 local when `currentStreak >= 2` and today is inactive. Needs `useStreakReminder` hook paralleling the existing pattern. Optional "streak reached N days" notifications for milestones.
2. **Streak UI depth** — surface `longestStreak` / `totalActiveDays` somewhere (Settings or a dedicated streak detail view), swap/upgrade the Home flame to a richer state at meaningful milestones, consider using `StreakCounter` instead of deleting it.
3. **Structural cleanups** (pair with Post-Launch) — hoist `useStreaks` to a context provider to halve Firestore reads; fix `UserProfile.tsx:68` to read from the subcollection.

---

## 5. Other observations

- `StreakCounter.tsx` is **dead code**. Defined but zero imports. Good candidate for either adoption (as a richer Home treatment) or deletion.
- `UserProfile.tsx:68` reads `profile.currentStreak`, which is only ever written to `0` by Onboarding. When viewing another user's profile, their displayed streak is wrong (always 0 unless they're mid-onboarding). Silent data bug — flag but not a diagnostic-scope fix.
- Streak Flame emits a subtle orange pulse animation every 2 seconds indefinitely. Attention-grabbing; may be worth throttling or disabling once streak > 30 to reduce visual noise for long-time users. Subjective.
- `initBadges()` runs on every hook mount, returning a fresh 30-element array. Minor memoisation miss; not perf-critical.
- Per-meal items guard (`items.length === 0`) correctly prevents empty-draft inflation, but doesn't check per-item validity — a single zero-calorie item still counts as an active day.
- `POST_LAUNCH.md` already exists (from the previous prompt). If we ship any deferred streak/notification work, it should land there for consistency.

Diagnosis complete. No changes made.
