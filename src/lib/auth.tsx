import {
  createContext,
  useCallback,
  useMemo,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  fetchSignInMethodsForEmail,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { toast } from "@/lib/toast";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import { isNativePlatform } from "@/lib/platform";
import {
  getGoogleCredentialNative,
  getAppleCredentialNative,
} from "@/lib/nativeAuth";
import { setErrorReportingUid } from "./errorReporting";
import {
  doc,
  getDoc,
  getDocFromCache,
  serverTimestamp,
  writeBatch,
  Timestamp,
  type FieldValue,
} from "firebase/firestore";
import { sendVerificationEmail } from "@/lib/accountSecurity";
import { getDeviceTimezone, shouldUpdateTimezone } from "@/lib/captureTimezone";
import { setDocGuarded, updateDocGuarded } from "@/lib/firestoreWrite";
import { unregisterDeviceToken } from "@/lib/pushNotifications";
import { clearStoredRun } from "@/lib/runResumeStorage";
import { clearWorkoutDraft } from "@/hooks/useWorkoutDraft";
import { stripUndefined } from "@/lib/firestoreGuards";
import { auth, db } from "./firebase";
import { logger } from "./logger";
import type { Goal } from "./types";
import type { PreferredSplit } from "@/features/program/programTypes";

/* ================================
   OAUTH TRANSPORT (popup vs redirect)
================================ */

/** True on mobile browsers, where signInWithPopup is unreliable (iOS Safari
 *  storage partitioning kills the popup→opener channel) so the OAuth flows
 *  redirect instead. Desktop keeps the popup. */
function preferAuthRedirect(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** A popup failure that should transparently retry as a redirect (blocked /
 *  unsupported / SDK internal-error), NOT a deliberate user cancel
 *  (popup-closed-by-user) which stays silent. */
function isRecoverablePopupError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  return (
    code === "auth/popup-blocked" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/internal-error" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
}

/* ================================
   USER PROFILE TYPE — decomposed into sub-interfaces
================================ */

/** Core identity fields */
export interface UserProfileCore {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  onboardingComplete: boolean;
  /**
   * Account-creation timestamp, set server-side by writeNewProfileDocs at
   * signup (never user-editable, so it's not a profileSanitizer field). A
   * serverTimestamp() sentinel until the first server round-trip resolves it
   * to a Timestamp. Read for the #972 cold-start activation window.
   */
  createdAt?: Timestamp | FieldValue;
}

/** Physical attributes and fitness metrics */
export interface UserProfileFitness {
  athleteType: string;
  weightKg: number;
  heightCm: number;
  weeklyWorkoutsTarget: number;
  weeklyMealsTarget: number;
  /**
   * Public streak summary mirrored from users/{uid}/streaks/data by useStreaks
   * on every streak mutation (atomic batch — both docs committed together).
   *
   * Initialised to 0 on profile creation. Intended to support cross-user reads
   * on UserProfile, but the users/{uid} rule is currently doc-level owner-only
   * — a rules relaxation is required before cross-user consumers can read this.
   * Until then the field is effectively only useful for the viewer's own
   * profile; the source of truth for live streak values remains useStreaks().
   */
  currentStreak: number;
  /**
   * Public longest-streak summary, mirrored alongside currentStreak. Same
   * constraints apply — see currentStreak for the rules-gating caveat.
   */
  longestStreak: number;
  lastLogDate: string | null;
  goal?: string;
  age?: number;
  sex?: "male" | "female";
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  program?: {
    goal: Goal;
    startWeight: number;
    currentPhase: string;
  };
}

/** Subscription and payment fields */
export interface UserProfileSubscription {
  trialExpiresAt: string | null;
  subscriptionTier: "free" | "pro";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Apple IAP — set on first IAP purchase by `functions/applePurchase.js`.
   *  Used by `AccountSection.tsx` to surface the pre-deletion Apple-cancel
   *  warning, since Apple has no admin-cancellation API for standard IAP
   *  subscriptions (Sub1 R1A pin b, P0b). */
  appleOriginalTransactionId?: string;
  /** Sub1 P2 — current platform of record for the user's active
   *  Pro subscription. One of "stripe" | "ios_iap" | "android_iap".
   *  Written server-side by `functions/lib/subscriptionReconciliation.js`
   *  alongside `subscriptionTier`. Null/undefined when user is free
   *  or when no Pro entitlement is active. Drives the Upgrade page's
   *  cross-platform paywall guard — a Stripe-Pro user opening the
   *  web Upgrade page sees the standard Manage flow, but an
   *  ios_iap-Pro user opening the web page sees a "Manage on App
   *  Store" message instead of a duplicate-charge checkout. */
  subscriptionSource?: "stripe" | "ios_iap" | "android_iap" | null;
  /** ISO timestamp of the current subscription period end. Written
   *  server-side (Stripe webhook for stripe-sourced subs, Apple IAP
   *  webhook + applySubscriptionToUser for ios_iap). The client uses
   *  this as a defence-in-depth expiry check — if `subscriptionTier`
   *  is `pro` but the timestamp has elapsed, the client falls back
   *  to free entitlement, which guards against a dropped Apple
   *  EXPIRED notification or a missed Stripe webhook leaving a
   *  user permanently Pro on stale data. */
  subscriptionExpiresAt?: string | null;
  /** Sub1a P1 — lifetime trial-shopping protection.
   *  Set to true by `functions/lib/checkoutTrial.js` when a trial
   *  Stripe checkout session is created, in the same Firestore txn
   *  as the user-doc read (race-safe). True = the user has consumed
   *  their lifetime free-trial slot and no further `withTrial`
   *  checkout will grant the 7-day intro. Abandoned trials still
   *  flip this flag — that's intentional (prevents
   *  click-trial-bail-retry-trial loops, Sub1a pin #1). Apple IAP
   *  introductory offers are enforced by the App Store side; this
   *  flag is the Stripe-pipeline equivalent. */
  hasUsedTrial?: boolean;
  trialExpiryPromptShown?: boolean;
}

/** User preferences and settings */
export interface UserProfilePreferences {
  preferredWeightUnit: "kg" | "lbs";
  preferredHeightUnit: "cm" | "ft";
  darkMode: boolean;
  /** #984 "Hide the number" anti-anxiety mode. When true, the raw
   *  body-weight figure is suppressed app-wide (home WeightStepsTiles
   *  tile + Progress TrendWeight chart) and replaced with
   *  direction/trend + goal-progress framing. Undefined / missing =
   *  OFF (default behaviour — the number shows). */
  hideWeightNumber?: boolean;
  autoRestTimer?: boolean;
  defaultRestSeconds?: number;
  audioCues?: boolean;
  /** F1 privacy toggle: user opt-out for Gemini-backed food analysis
   *  (image AI + NL text refinement). Undefined / missing = enabled
   *  (default behaviour). Set to false via Settings → Privacy to
   *  disable; AI CTAs hide and the underlying calls refuse. The
   *  manual parse / barcode paths are unaffected — only AI calls
   *  are gated. */
  aiAnalysisEnabled?: boolean;
  /** Device IANA timezone (e.g. "Europe/London"), captured on boot (#962).
   *  Read server-side for scan-quota day-keying + streak-nudge local-hour
   *  scheduling. null/absent → time-sensitive server pushes are skipped. */
  timezone?: string | null;
}

/** Nutrition targets */
export interface UserProfileNutrition {
  tdeeBase?: number;
  aiCalorieAdjustment?: number;
  targetCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFat?: number;
  customCalorieTarget?: number;
  macroTargets?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  targetFiber?: number;
  targetSugar?: number;
  targetSodium?: number;
  targetWaterGlasses?: number;
  /**
   * When true (default), the daily calorie target dynamically reflects the
   * greater of (a) the program's strategic day-type adjustment or (b) actual
   * calories burned via completed workouts and runs. When false, the target
   * uses the planned day type only. See useEffectiveTargets.
   */
  adjustCaloriesForTraining?: boolean;
  /**
   * Nutr2 (#982) — persisted state for the adaptive-TDEE weekly rate cap.
   * `lastApplied` is the calorie value last shown to the user; `lastAppliedAt`
   * is when it was applied. Drives the ±150/rolling-7-day smoothing so the
   * learned target never jumps. Client-managed (written via updateProfile).
   */
  adaptiveCapState?: {
    lastApplied: number;
    lastAppliedAt: string;
  } | null;
}

/** Social and privacy settings */
export interface UserProfileSocial {
  defaultVisibility?: "public" | "followers" | "private";
  autoPostRuns?: boolean;
  autoPostWorkouts?: boolean;
  autoPostBadges?: boolean;
  crewId?: string;
  /** Shared-run route privacy. When unset or true (the DEFAULT), the route
   *  preview on shared run activities is clipped ~200m off each end so the
   *  user's home/start isn't broadcast to followers. Explicit `false` opts
   *  out (shares the full route, subject to any explicit privacy zones). */
  hideSharedRouteEnds?: boolean;
}

/** Run and schedule configuration */
export interface UserProfileRunning {
  runMode?: "freeform" | "structured" | "race_prep";
  weeklyRunDaysTarget?: number;
  weeklyRunsTarget?: number;
  /**
   * Pgm6 run-plan tuning knobs (locked 2026-07-04: exactly these two,
   * no mileage-cap knob). `runVolume` sizes the long runs; `runDifficulty`
   * sets how much tempo/interval work a race-prep week carries. Missing →
   * `standard` (lazy default via runTuningFromProfile — no migration).
   * Written by configurePlan alongside the plan they shaped. Must stay in
   * sync with firestore.rules allowedUserFields() + profileSanitizer.js.
   */
  runVolume?: "lighter" | "standard" | "bigger";
  runDifficulty?: "gentler" | "standard" | "harder";
  // Run9 3a-ii: `null` is the explicit "no race" value so a freeform switch /
  // recovery exit can CLEAR a prior race (a merge write of `undefined` is
  // stripped and would leave the old goal stranded). Readers gate on
  // truthiness, so `null` reads the same as absent.
  raceGoal?: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
  } | null;
  weekSchedule?: { day: number; type: "lift" | "run" | "both" | "rest" }[];
  /**
   * Schema version for `weekSchedule` shape. v7 spec uses this for
   * read-side backfill: when missing, `backfillWeekScheduleIfMissing`
   * derives the structure from `weeklyWorkoutsTarget` +
   * `weeklyRunDaysTarget` via `generateSchedule()`. Bump when the
   * ScheduleDay shape changes incompatibly.
   */
  weekScheduleVersion?: number;
  /**
   * Adaptive Paces (design: docs/adaptive-paces-design.md). The user's run
   * fitness BENCHMARK — the single INPUT from which all training paces are
   * derived (we never persist the derived paces). `benchmark` is a
   * representative effort; `vdot` is a cached convenience (derivable from the
   * benchmark); `source` records how it was set. `null` = no benchmark yet →
   * paces fall back to the template defaults. Client-managed (written via
   * updateProfile). Must stay in sync with firestore.rules allowedUserFields()
   * + functions/profileSanitizer.js.
   */
  runFitness?: {
    benchmark: { distanceM: number; timeS: number } | null;
    vdot: number | null;
    source: "race" | "manual" | "estimate" | "derived";
    updatedAt: string;
  } | null;
  /**
   * Max heart rate (bpm) — the single INPUT for HR-zone math (see
   * src/lib/hrZones.ts). A user-measured max always beats the age estimate
   * (Tanaka 208−0.7·age). `null`/absent = fall back to the age estimate at
   * read time. Client-managed (written via updateProfile). Must stay in sync
   * with firestore.rules allowedUserFields() + functions/profileSanitizer.js.
   */
  maxHeartRate?: number | null;
}

/** Onboarding quiz answers */
export interface UserProfileOnboarding {
  ageRange?: "16-24" | "25-34" | "35-44" | "45-54" | "55+";
  primaryGoal?: "hypertrophy" | "strength" | "fat_loss" | "general" | "running";
  experience?: "beginner" | "intermediate" | "advanced";
  daysPerWeek?: 2 | 3 | 4 | 5 | 6;
  equipment?: "full_gym" | "home_gym" | "minimal";
  preferredSplit?: PreferredSplit;
  runFrequency?: "regular" | "occasional" | "none";
  injuries?: string[];
  gender?: "male" | "female" | "unspecified";
  /** Tier 2 — goal-weight onboarding. Target body weight (kg) and the
   *  desired (unsigned) weekly rate of change (kg/week). Target vs current
   *  weight owns the nutrition direction; rate sets the calorie offset
   *  magnitude. Absent for pre-Tier-2 profiles → legacy per-goal offset. */
  goalWeightKg?: number;
  weeklyRateKg?: number;
  /**
   * D16 — the personal "why" behind training. Optional, captured on the
   * onboarding confirmation step (a tap-chip that seeds the phrase, editable
   * as free text) and in Settings → Profile. Purely motivational: it drives
   * no engine, it's resurfaced back to the user (weekly review) to reconnect
   * them with their reason. Kept ≤120 chars (profileSanitizer). Sync with
   * firestore.rules allowedUserFields() + profileSanitizer.js + registry.
   */
  trainingWhy?: string;
}

/** Full UserProfile — intersection of all sub-interfaces */
export interface UserProfile
  extends
    UserProfileCore,
    UserProfileFitness,
    UserProfileSubscription,
    UserProfilePreferences,
    UserProfileNutrition,
    UserProfileSocial,
    UserProfileRunning,
    UserProfileOnboarding {}

/**
 * Compact summary of earned badges mirrored onto the public profile doc.
 *
 * The full `badges: EarnedBadge[]` array lives on the owner-only
 * `users/{uid}/streaks/data` doc. Only this summary is exposed cross-user —
 * just IDs and timestamps. The renderer joins `earnedMap` against the local
 * static `BADGE_DEFINITIONS` catalog to reconstruct display data.
 */
export interface BadgeSummary {
  /** badgeId → earnedAt as ISO 8601 string */
  earnedMap: Record<string, string>;
  /** Total number of entries in earnedMap (cached for display/sort without scanning). */
  count: number;
}

/**
 * Cross-user-readable projection of safe UserProfile fields.
 *
 * Stored at `users/{uid}/public/profile`. Every field here is also stored on
 * the main user doc (`users/{uid}`) — this doc is a deliberate mirror so that
 * a strict `allow read: if request.auth != null` can apply to it without
 * exposing the private fields that live on the user doc (email, billing IDs,
 * nutrition targets, etc.).
 *
 * Add a field here only together with (a) an allowlist extension in
 * firestore.rules match /users/{uid}/public/{doc} and (b) a mirror-write
 * extension at every site that writes to this doc (useStreaks, updateProfile,
 * createDefaultProfile, Onboarding, backfill script).
 */
export interface PublicProfile {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  /**
   * Storage path of the user's currently-active uploaded profile photo,
   * e.g. `profile-photos/{uid}/1714521600000.jpg`. Tracked separately
   * from `photoURL` because:
   *   1. The cleanup path on next upload needs the path to call
   *      `deleteObject(storageRef)` on the prior blob — without
   *      tracking it, orphans accumulate (the bug ProgressPhotos has).
   *   2. The download URL embeds a token; if we ever rotate tokens
   *      (admin-side), we keep the path as the authoritative pointer.
   * Null when the user has never uploaded a custom photo (empty, or
   * using an OAuth-provider photoURL).
   */
  photoStoragePath: string | null;
  athleteType: string;
  currentStreak: number;
  longestStreak: number;
  createdAt: Timestamp | FieldValue;
  /** Optional — absent when the user has never earned a badge. */
  badgeSummary?: BadgeSummary;
}

/* ================================
   HELPERS
================================ */

function syncDarkMode(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  localStorage.setItem("tropos-dark-mode", String(dark));
}

/* ================================
   DEFAULT PROFILE FACTORY
================================ */

function createDefaultProfile(
  uid: string,
  displayName: string,
  email: string,
  /* OAuth providers (Google, Apple) populate the auth user's photoURL
     at sign-in. Email/password signups don't. Accepting this as an
     optional 4th arg lets the OAuth flows seed a usable avatar
     without any additional UX. The user can override via the upload
     flow in Settings; this is just the default. The Firestore rule
     regex on photoURL already constrains the value to known-good
     hosts (Firebase Storage, lh3.googleusercontent.com,
     appleid.cdn-apple.com), so an unexpected value gets rejected at
     the rule layer rather than silently stored. */
  photoURL: string | null = null
): UserProfile {
  return {
    uid,
    displayName,
    email,
    photoURL,
    athleteType: "Lifter",
    weightKg: 70,
    heightCm: 170,
    weeklyWorkoutsTarget: 4,
    weeklyMealsTarget: 10,
    preferredWeightUnit: "kg",
    preferredHeightUnit: "cm",
    // Dark is the app default — new profiles start dark unless the user
    // later picks light in Settings (see public/init.js for the pre-React
    // boot default that mirrors this).
    darkMode: true,
    hideWeightNumber: false,
    timezone: null,
    onboardingComplete: false,
    // Sub1a P1 — new users start in true free tier. The 7-day free
    // trial is now opt-in (tapped from ProModal / Upgrade) and goes
    // through Stripe `trial_period_days: 7` or Apple IAP
    // introductory offer. The legacy "auto-grant trial at signup"
    // model was the audit's finding #2 (Sub1 STATUS 2026-05-24a).
    // Existing accounts keep their `trialExpiresAt` via the
    // `backfillTrialFlag` migration which sets `hasUsedTrial: true`
    // so they can't claim a second trial.
    trialExpiresAt: null,
    subscriptionTier: "free",
    currentStreak: 0,
    longestStreak: 0,
    lastLogDate: null,
    adjustCaloriesForTraining: true,
    program: {
      goal: "recomp",
      startWeight: 70,
      currentPhase: "base",
    },
  };
}

function hydrateProfile(
  uid: string,
  data: Record<string, unknown>,
  fallbackName = "",
  fallbackEmail = ""
): UserProfile {
  return {
    ...(data as Partial<UserProfile>),
    uid,
    displayName: (data.displayName as string) ?? fallbackName,
    email: (data.email as string) ?? fallbackEmail,
    photoURL: (data.photoURL as string | null | undefined) ?? null,
    athleteType: (data.athleteType as string) ?? "Lifter",
    weightKg: (data.weightKg as number) ?? 70,
    heightCm: (data.heightCm as number) ?? 170,
    weeklyWorkoutsTarget: (data.weeklyWorkoutsTarget as number) ?? 4,
    weeklyMealsTarget: (data.weeklyMealsTarget as number) ?? 10,
    preferredWeightUnit:
      (data.preferredWeightUnit as UserProfile["preferredWeightUnit"]) ?? "kg",
    preferredHeightUnit:
      (data.preferredHeightUnit as UserProfile["preferredHeightUnit"]) ?? "cm",
    // Default the theme to dark when the field is absent (legacy/partial
    // docs). Only an explicit stored `false` keeps a user on light.
    darkMode: (data.darkMode as boolean) ?? true,
    hideWeightNumber: (data.hideWeightNumber as boolean) ?? false,
    timezone: (data.timezone as string | null) ?? null,
    onboardingComplete: (data.onboardingComplete as boolean) ?? false,
    trialExpiresAt: (data.trialExpiresAt as string | null) ?? null,
    subscriptionTier:
      (data.subscriptionTier as UserProfile["subscriptionTier"]) ?? "free",
    currentStreak: (data.currentStreak as number) ?? 0,
    longestStreak: (data.longestStreak as number) ?? 0,
    lastLogDate: (data.lastLogDate as string | null) ?? null,
    // Training-aware calorie target — defaults to true for existing users who
    // don't have the field set yet.
    adjustCaloriesForTraining:
      (data.adjustCaloriesForTraining as boolean | undefined) ?? true,
    adaptiveCapState:
      (data.adaptiveCapState as UserProfile["adaptiveCapState"]) ?? null,
    runFitness: (data.runFitness as UserProfile["runFitness"]) ?? null,
    maxHeartRate: (data.maxHeartRate as number | undefined) ?? null,
    program: {
      goal:
        ((data.program as Record<string, unknown>)
          ?.goal as UserProfile["program"] extends { goal: infer G }
          ? G
          : never) ?? "recomp",
      startWeight:
        ((data.program as Record<string, unknown>)?.startWeight as number) ?? 0,
      currentPhase:
        ((data.program as Record<string, unknown>)?.currentPhase as string) ??
        "base",
    },
  } as UserProfile;
}

/* ================================
   AUTH CONTEXT
================================ */

/**
 * PR G (audit P1 #7): result shape for updateProfile. Settings
 * controls can now revert optimistic UI on failure rather than
 * silently lying after a swallowed error.
 */
export type UpdateProfileResult = { ok: true } | { ok: false; error: unknown };

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  /** Send a Firebase password-reset email. Resolves on send; the caller
   *  shows a neutral "if an account exists…" message so this can't be used
   *  to enumerate registered emails. */
  resetPassword: (email: string) => Promise<void>;
  /** Registered sign-in methods for an email (["google.com"] / ["password"]
   *  / …). Empty on error OR when Email-Enumeration-Protection is on — treat
   *  empty as "unknown", not "no account". */
  fetchSignInMethods: (email: string) => Promise<string[]>;
  signOut: () => Promise<void>;
  /**
   * Write a partial profile patch. Returns an `UpdateProfileResult`
   * so callers can revert optimistic UI on failure. Pre-PR-G this
   * returned `Promise<void>` and swallowed errors with a toast,
   * leaving Settings controls visually claiming a write succeeded
   * when Firestore rejected it. Existing fire-and-forget callers
   * still work — Promise<UpdateProfileResult> is still awaitable as
   * a Promise.
   */
  updateProfile: (
    data: Partial<UserProfile>,
    options?: { allowProtected?: boolean; throwOnError?: boolean }
  ) => Promise<UpdateProfileResult>;
  /**
   * Re-fetch the user's Firestore profile and update local state.
   * For mutations that go directly to Firestore (e.g. profile-photo
   * upload, which writes to `users/{uid}/public/profile` via its own
   * Storage-aware service rather than through `updateProfile`).
   */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Static field lists used by updateProfile. Module-scoped (not in-component)
// so they have a stable identity and don't need to appear in the
// updateProfile useCallback's dependency array.
const PROTECTED_FIELDS = [
  "subscriptionTier",
  "subscriptionSource",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "appleOriginalTransactionId",
  "hasUsedTrial",
  "trialExpiresAt",
] as const;

// Subset of UserProfile fields that also need to be mirrored onto the
// cross-user-readable public/profile doc when they change.
const PUBLIC_MIRRORED_FIELDS = [
  "displayName",
  "photoURL",
  "athleteType",
] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Guards the once-per-session boot reconciliation writes (timezone capture +
  // email mirror) so they don't re-fire on every onAuthStateChanged emission —
  // it fires several times per sign-in (session restore, token refresh, popup),
  // and without this each emission re-issued the same fire-and-forget writes.
  // Keyed by uid so an account switch on a shared device re-runs them for the
  // new user (the debounced-boot-side-effect class, cf. OneTimeMaintenance).
  const reconciledUidRef = useRef<string | null>(null);

  // Dark mode sync — dark is the default, so a null profile (signed out /
  // still loading) and a profile without an explicit choice both resolve dark.
  useEffect(() => {
    syncDarkMode(profile?.darkMode ?? true);
  }, [profile?.darkMode]);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;
      setUser(firebaseUser);
      // Track the current UID on errorReporting so the Firestore sink
      // writes critical errors under the correct user doc. Null clears it
      // on sign-out so orphaned errors don't leak to a stale UID.
      setErrorReportingUid(firebaseUser?.uid ?? null);

      if (firebaseUser) {
        // Cache-first paint (mirrors useProgram's programState read). A plain
        // getDoc is server-first when online — it only falls back to IndexedDB
        // when offline — so a returning user waits a full network round-trip to
        // boot the whole app even though their profile is already cached. Read
        // the cached profile first and unblock the app shell immediately, then
        // the authoritative server read below reconciles. Pure paint:
        // hydrateProfile does no writes, and the timezone-capture write stays
        // on the server branch only so it isn't double-fired.
        try {
          const cachedDoc = await getDocFromCache(
            doc(db, "users", firebaseUser.uid)
          );
          if (isMounted && cachedDoc.exists()) {
            const cachedProfile = hydrateProfile(
              firebaseUser.uid,
              cachedDoc.data(),
              "",
              firebaseUser.email ?? ""
            );
            setProfile(cachedProfile);
            syncDarkMode(cachedProfile.darkMode);
            setLoading(false);
          }
        } catch {
          // Cache miss / persistence unavailable — fall through to the server
          // read exactly as before. No regression on the fresh / cold path.
        }

        try {
          const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (!isMounted) return;

          if (profileDoc.exists()) {
            const data = profileDoc.data();
            const safeProfile = hydrateProfile(
              firebaseUser.uid,
              data,
              "",
              firebaseUser.email ?? ""
            );
            setProfile(safeProfile);
            syncDarkMode(safeProfile.darkMode);
            // Boot reconciliation writes — run at most once per uid per session
            // (onAuthStateChanged fires several times per sign-in; without the
            // guard each emission re-issued these).
            if (reconciledUidRef.current !== firebaseUser.uid) {
              reconciledUidRef.current = firebaseUser.uid;
              // #962 — capture the device timezone so the server has a non-null
              // tz to schedule time-sensitive pushes against (and to fix
              // scan-quota day-keying). Fire-and-forget; idempotent.
              const deviceTz = getDeviceTimezone();
              if (shouldUpdateTimezone(safeProfile.timezone, deviceTz)) {
                updateDocGuarded(doc(db, "users", firebaseUser.uid), {
                  timezone: deviceTz,
                }).catch((err) =>
                  logger.warn("[AuthProvider] timezone capture failed", err)
                );
              }
              // Email-mirror reconcile: a verifyBeforeUpdateEmail change lands
              // OUT-OF-BAND (the user clicks the confirm link, often on another
              // device), so the profile doc's `email` copy can't be mirrored at
              // write time. Reconcile it on boot instead — same
              // fire-and-forget shape as the timezone capture above.
              if (
                typeof data.email === "string" &&
                firebaseUser.email &&
                data.email !== firebaseUser.email
              ) {
                updateDocGuarded(doc(db, "users", firebaseUser.uid), {
                  email: firebaseUser.email,
                }).catch((err) =>
                  logger.warn("[AuthProvider] email reconcile failed", err)
                );
              }
            }
          } else {
            setProfile(null);
          }
        } catch (err) {
          if (!isMounted) return;
          logger.error("[AuthProvider] Failed to load profile", err);
          setProfile(null);
        }
      } else {
        // No signed-in user (Login screen) — apply the dark default.
        setProfile(null);
        syncDarkMode(true);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  // Create the main user doc AND the cross-user-readable public profile doc
  // in a single batch so a half-landed create can't leak a user with no
  // public projection. Shared by email signup, Google, and Apple flows.
  const writeNewProfileDocs = async (uid: string, newProfile: UserProfile) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "users", uid), {
      ...newProfile,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "users", uid, "public", "profile"), {
      uid,
      displayName: newProfile.displayName || null,
      photoURL: newProfile.photoURL ?? null,
      /* photoStoragePath tracks the user's currently-active
         self-uploaded photo path so the next upload can delete the
         prior blob. Null for new users (or OAuth users seeded with an
         external photoURL — Google/Apple host those, we don't track
         a path). The rule constrains this to `profile-photos/{uid}/.*`. */
      photoStoragePath: null,
      athleteType: newProfile.athleteType,
      currentStreak: newProfile.currentStreak,
      longestStreak: newProfile.longestStreak,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  };

  const signUp = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newProfile = createDefaultProfile(
      cred.user.uid,
      "",
      cred.user.email || ""
    );
    await writeNewProfileDocs(cred.user.uid, newProfile);
    setProfile(newProfile);
    trackLifecycle("signup_completed", { method: "email" });
    // Fire-and-forget verification email (branded, via the same Resend path
    // as password reset). Never blocks signup — an email hiccup shouldn't
    // stall onboarding, and Settings → Sign-in & security has a resend. A
    // typo'd signup email is unfixable by forgot-password (the reset goes to
    // an address the user doesn't own); verification catches it while the
    // user still remembers their password.
    sendVerificationEmail().catch((err) =>
      logger.warn("[AuthProvider] signup verification email failed", err)
    );
  }, []);

  /* Shared post-credential handling for the OAuth flows (Google, Apple).
     Identical for new + existing accounts across providers — the only
     per-platform difference is HOW the UserCredential is obtained (web
     popup vs native plugin), which the callers below handle. New accounts
     seed photoURL from the identity (Google CDN URLs / null for Apple — the
     Firestore rule gates which hosts it accepts); the user can override
     later via the Settings upload flow. */
  const finishOAuthSignIn = async (
    cred: UserCredential,
    method: "google" | "apple"
  ) => {
    const profileDoc = await getDoc(doc(db, "users", cred.user.uid));

    if (!profileDoc.exists()) {
      const newProfile = createDefaultProfile(
        cred.user.uid,
        cred.user.displayName || "",
        cred.user.email || "",
        cred.user.photoURL || null
      );
      await writeNewProfileDocs(cred.user.uid, newProfile);
      setProfile(newProfile);
      trackLifecycle("signup_completed", { method });
    } else {
      const data = profileDoc.data();
      setProfile(
        hydrateProfile(
          cred.user.uid,
          data,
          cred.user.displayName ?? "",
          cred.user.email ?? ""
        )
      );
    }
  };

  const signInWithGoogle = useCallback(async () => {
    /* Native (Capacitor) can't use the web popup — the redirect returns to
       capacitor://localhost, not a Firebase authorized domain — so it drives
       the native Google sheet and completes with the returned credential. */
    if (isNativePlatform()) {
      const cred = await signInWithCredential(
        auth,
        await getGoogleCredentialNative()
      );
      await finishOAuthSignIn(cred, "google");
      return;
    }
    const provider = new GoogleAuthProvider();
    /* Mobile browsers block signInWithPopup — iOS Safari's storage
       partitioning kills the popup→opener channel, so the popup throws
       auth/internal-error (what surfaced on phones as "Sign-in is
       temporarily unavailable"). Firebase's own guidance is redirect on
       mobile. Since the app is served from its own authDomain
       (…firebaseapp.com), the redirect handler is same-origin, so ITP
       doesn't break it. Desktop keeps the popup (no full reload). The
       redirect resolves on return via the getRedirectResult effect below. */
    if (preferAuthRedirect()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    try {
      const cred = await signInWithPopup(auth, provider);
      await finishOAuthSignIn(cred, "google");
    } catch (err) {
      if (isRecoverablePopupError(err)) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw err;
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    if (isNativePlatform()) {
      const cred = await signInWithCredential(
        auth,
        await getAppleCredentialNative()
      );
      await finishOAuthSignIn(cred, "apple");
      return;
    }
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    // Same mobile-popup problem as Google — redirect on mobile web.
    if (preferAuthRedirect()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    try {
      const cred = await signInWithPopup(auth, provider);
      await finishOAuthSignIn(cred, "apple");
    } catch (err) {
      if (isRecoverablePopupError(err)) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw err;
    }
  }, []);

  /* Complete a mobile-web OAuth redirect. signInWithRedirect navigates the
     page away; on return the SDK restores the pending credential here. New
     users get their profile doc created via finishOAuthSignIn exactly like
     the popup path (onAuthStateChanged only READS a profile — it would set
     null for a brand-new OAuth user whose doc doesn't exist yet). Runs once
     on mount; a null result means there was no pending redirect. */
  useEffect(() => {
    let cancelled = false;
    getRedirectResult(auth)
      .then((result) => {
        if (cancelled || !result) return;
        const method =
          result.providerId && result.providerId.includes("apple")
            ? "apple"
            : "google";
        return finishOAuthSignIn(result, method);
      })
      .catch((err) => {
        logger.error("[AuthProvider] OAuth redirect sign-in failed", err);
      });
    return () => {
      cancelled = true;
    };
    // finishOAuthSignIn is stable enough for a mount-only run (only closes
    // over stable setters); intentionally [] so it fires once per app boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    /* Routed through the server callable, NOT the client
       sendPasswordResetEmail: the client SDK refuses OAuth-only accounts
       (no Firebase password to reset) and fails SILENTLY under enumeration
       protection — the dead end a Google user hit. The callable mints the
       link via the Admin SDK (works for any account) and emails it via
       Resend, so a Google/Apple user can set a password. Matches Spotify /
       MyFitnessPal. Native uses the same callable. */
    const fn = httpsCallable<{ email: string }, { ok: boolean }>(
      getFunctions(),
      "sendPasswordResetLinkCallable"
    );
    await fn({ email: email.trim() });
  }, []);

  /* Which sign-in methods an email is registered with (e.g. ["google.com"]
     or ["password"]). Lets the UI steer a Google/Apple-only account to the
     right button instead of a doomed password attempt / reset. Returns []
     on any error — and NOTE Firebase's Email-Enumeration-Protection returns
     [] for every email when enabled, so callers must treat [] as "unknown",
     never "no account". */
  const fetchSignInMethods = useCallback(async (email: string) => {
    try {
      return await fetchSignInMethodsForEmail(auth, email.trim());
    } catch {
      return [];
    }
  }, []);

  const signOutUser = useCallback(async () => {
    // Push privacy invariant (#961 Q4 / PR #820 lineage): revoke this device's
    // FCM token BEFORE signing out, while we still have the uid + auth — so the
    // next account on this device never inherits the previous user's pushes.
    const uid = auth.currentUser?.uid;
    if (uid) await unregisterDeviceToken(uid).catch(() => {});
    // Cross-account leak defence (belt-and-braces on top of uid-scoped
    // keys): wipe THIS user's in-flight run snapshot + workout draft so
    // the next account on a shared device starts clean even if scoping
    // ever regresses.
    if (uid) {
      clearStoredRun(uid);
      clearWorkoutDraft(uid);
    }
    await firebaseSignOut(auth);
    setProfile(null);
    // Reset to the DARK default so the next user starts dark unless their
    // Firestore profile explicitly says light. (Clearing the stored key lets
    // init.js / the next profile load own the value; the signed-out auth
    // listener also re-applies the dark default.)
    document.documentElement.classList.add("dark");
    localStorage.removeItem("tropos-dark-mode");
  }, []);

  const updateProfile = useCallback(
    async (
      data: Partial<UserProfile>,
      options?: { allowProtected?: boolean; throwOnError?: boolean }
    ): Promise<UpdateProfileResult> => {
      if (!user) return { ok: false, error: new Error("not-authenticated") };
      let writeData = data;
      if (!options?.allowProtected) {
        writeData = Object.fromEntries(
          Object.entries(data).filter(
            ([key]) => !(PROTECTED_FIELDS as readonly string[]).includes(key)
          )
        ) as Partial<UserProfile>;
      }

      // If any publicly-mirrored field is in the patch, commit both writes in a
      // single batch so the main user doc and the public projection never drift.
      const publicPatch: Record<string, unknown> = {};
      for (const key of PUBLIC_MIRRORED_FIELDS) {
        if (key in writeData) {
          const value = (writeData as Record<string, unknown>)[key];
          publicPatch[key] = value ?? null;
        }
      }
      /* When displayName is in the patch, also write displayNameLower —
       a normalised lowercase mirror used by searchUsers for case-
       insensitive prefix matching. Without this field, searches like
       "myl" for "Myles" miss because Firestore's range queries are
       case-sensitive. The public profile gets the field written
       alongside displayName so the two are committed atomically. */
      if ("displayName" in writeData) {
        const dn = (writeData as Record<string, unknown>)["displayName"];
        publicPatch["displayNameLower"] =
          typeof dn === "string" ? dn.toLowerCase() : null;
      }

      // PR G (audit P1 #7): returns `{ ok }` so callers can revert
      // optimistic UI on failure. The toast is still surfaced by
      // default (most callers want it) — opt-in `throwOnError` for
      // call sites that want to handle the error themselves.
      try {
        if (Object.keys(publicPatch).length > 0) {
          // Strip undefined from both writes — Firestore rejects any doc
          // containing an explicit `undefined` outright. The non-batch
          // path below routes through setDocGuarded which strips for
          // free; the batch path has no guarded equivalent, so apply the
          // same firestoreWrite sanitiser (stripUndefined) by hand here.
          const batch = writeBatch(db);
          batch.set(doc(db, "users", user.uid), stripUndefined(writeData), {
            merge: true,
          });
          batch.set(
            doc(db, "users", user.uid, "public", "profile"),
            stripUndefined(publicPatch),
            { merge: true }
          );
          await batch.commit();
        } else {
          await setDocGuarded(doc(db, "users", user.uid), writeData, {
            merge: true,
          });
        }

        setProfile((prev) => {
          const updated = prev ? { ...prev, ...data } : null;
          if (updated && "darkMode" in data) {
            syncDarkMode(updated.darkMode);
          }
          return updated;
        });

        return { ok: true };
      } catch (err) {
        logger.error("[auth] updateProfile failed", err);
        if (options?.throwOnError) {
          throw err;
        }
        // Stable toast ID collapses bursts (e.g. rapid Settings toggles) into
        // a single visible message.
        toast.error("Couldn't save your settings. Please try again.", {
          id: "update-profile-error",
        });
        return { ok: false, error: err };
      }
    },
    [user]
  );

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (snap.exists()) {
      setProfile(
        hydrateProfile(
          auth.currentUser.uid,
          snap.data() as Record<string, unknown>,
          auth.currentUser.displayName ?? "",
          auth.currentUser.email ?? ""
        )
      );
    }
  }, []);

  // Stable identity for the Provider value — every consumer that
  // calls useAuth() depends on this. An inline object literal would
  // get a fresh reference on every AuthProvider render, forcing the
  // whole app subtree to re-render even when nothing observable
  // changed. The deps cover every field the value object exposes.
  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      resetPassword,
      fetchSignInMethods,
      signOut: signOutUser,
      updateProfile,
      refreshProfile,
    }),
    [
      user,
      profile,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      resetPassword,
      fetchSignInMethods,
      signOutUser,
      updateProfile,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
