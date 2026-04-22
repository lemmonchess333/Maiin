import {
  createContext,
  useContext,
  useEffect,
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
  type User,
} from "firebase/auth";
import { toast } from "sonner";
import { setErrorReportingUid } from "./errorReporting";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
  Timestamp,
  type FieldValue,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { logger } from "./logger";
import type { Goal } from "./types";

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
  trialExpiryPromptShown?: boolean;
}

/** User preferences and settings */
export interface UserProfilePreferences {
  preferredWeightUnit: "kg" | "lbs";
  preferredHeightUnit: "cm" | "ft";
  darkMode: boolean;
  autoRestTimer?: boolean;
  defaultRestSeconds?: number;
  audioCues?: boolean;
  enableRolloverCalories?: boolean;
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
}

/** Social and privacy settings */
export interface UserProfileSocial {
  defaultVisibility?: "public" | "followers" | "private";
  autoPostRuns?: boolean;
  autoPostWorkouts?: boolean;
  autoPostBadges?: boolean;
  crewId?: string;
}

/** Run and schedule configuration */
export interface UserProfileRunning {
  runMode?: "freeform" | "structured" | "race_prep";
  weeklyRunDaysTarget?: number;
  weeklyRunsTarget?: number;
  raceGoal?: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
  };
  weekSchedule?: { day: number; type: "lift" | "run" | "both" | "rest" }[];
}

/** Onboarding quiz answers */
export interface UserProfileOnboarding {
  ageRange?: "16-24" | "25-34" | "35-44" | "45-54" | "55+";
  primaryGoal?: "hypertrophy" | "strength" | "fat_loss" | "general" | "running";
  experience?: "beginner" | "intermediate" | "advanced";
  daysPerWeek?: 2 | 3 | 4 | 5 | 6;
  equipment?: "full_gym" | "home_gym" | "minimal";
  preferredSplit?: "full_body" | "upper_lower" | "ppl" | "bro_split" | "auto";
  runFrequency?: "regular" | "occasional" | "none";
  injuries?: string[];
  gender?: "male" | "female" | "unspecified";
}

/** Full UserProfile — intersection of all sub-interfaces */
export interface UserProfile extends
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
  athleteType: string;
  currentStreak: number;
  longestStreak: number;
  createdAt: Timestamp | FieldValue;
  /** Optional — absent when the user has never earned a badge. */
  badgeSummary?: BadgeSummary;
}

/** Keys of PublicProfile — mirrors the rule allowlist. */
export const PUBLIC_PROFILE_FIELDS = [
  "uid",
  "displayName",
  "photoURL",
  "athleteType",
  "currentStreak",
  "longestStreak",
  "createdAt",
  "badgeSummary",
] as const satisfies ReadonlyArray<keyof PublicProfile>;

/* ================================
   HELPERS
================================ */

function getTrialExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

function syncDarkMode(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  localStorage.setItem('tropos-dark-mode', String(dark));
}

/* ================================
   DEFAULT PROFILE FACTORY
================================ */

function createDefaultProfile(
  uid: string,
  displayName: string,
  email: string,
): UserProfile {
  return {
    uid,
    displayName,
    email,
    photoURL: null,
    athleteType: "Lifter",
    weightKg: 70,
    heightCm: 170,
    weeklyWorkoutsTarget: 4,
    weeklyMealsTarget: 10,
    preferredWeightUnit: "kg",
    preferredHeightUnit: "cm",
    darkMode: false,
    onboardingComplete: false,
    trialExpiresAt: getTrialExpiresAt(),
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

function hydrateProfile(uid: string, data: Record<string, unknown>, fallbackName = "", fallbackEmail = ""): UserProfile {
  return {
    ...data as Partial<UserProfile>,
    uid,
    displayName: (data.displayName as string) ?? fallbackName,
    email: (data.email as string) ?? fallbackEmail,
    photoURL: (data.photoURL as string | null | undefined) ?? null,
    athleteType: (data.athleteType as string) ?? "Lifter",
    weightKg: (data.weightKg as number) ?? 70,
    heightCm: (data.heightCm as number) ?? 170,
    weeklyWorkoutsTarget: (data.weeklyWorkoutsTarget as number) ?? 4,
    weeklyMealsTarget: (data.weeklyMealsTarget as number) ?? 10,
    preferredWeightUnit: (data.preferredWeightUnit as UserProfile["preferredWeightUnit"]) ?? "kg",
    preferredHeightUnit: (data.preferredHeightUnit as UserProfile["preferredHeightUnit"]) ?? "cm",
    darkMode: (data.darkMode as boolean) ?? false,
    onboardingComplete: (data.onboardingComplete as boolean) ?? false,
    trialExpiresAt: (data.trialExpiresAt as string | null) ?? null,
    subscriptionTier: (data.subscriptionTier as UserProfile["subscriptionTier"]) ?? "free",
    currentStreak: (data.currentStreak as number) ?? 0,
    longestStreak: (data.longestStreak as number) ?? 0,
    lastLogDate: (data.lastLogDate as string | null) ?? null,
    // Training-aware calorie target — defaults to true for existing users who
    // don't have the field set yet.
    adjustCaloriesForTraining: (data.adjustCaloriesForTraining as boolean | undefined) ?? true,
    program: {
      goal: ((data.program as Record<string, unknown>)?.goal as UserProfile["program"] extends { goal: infer G } ? G : never) ?? "recomp",
      startWeight: ((data.program as Record<string, unknown>)?.startWeight as number) ?? 0,
      currentPhase: ((data.program as Record<string, unknown>)?.currentPhase as string) ?? "base",
    },
  } as UserProfile;
}

/* ================================
   AUTH CONTEXT
================================ */

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>, options?: { allowProtected?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Dark mode sync
  useEffect(() => {
    syncDarkMode(profile?.darkMode ?? false);
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
        try {
          const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (!isMounted) return;

          if (profileDoc.exists()) {
            const data = profileDoc.data();
            const safeProfile = hydrateProfile(firebaseUser.uid, data, "", firebaseUser.email ?? "");
            setProfile(safeProfile);
            syncDarkMode(safeProfile.darkMode);
          } else {
            setProfile(null);
          }
        } catch (err) {
          if (!isMounted) return;
          logger.error('[AuthProvider] Failed to load profile', err);
          setProfile(null);
        }
      } else {
        setProfile(null);
        syncDarkMode(false);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

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
      athleteType: newProfile.athleteType,
      currentStreak: newProfile.currentStreak,
      longestStreak: newProfile.longestStreak,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  };

  const signUp = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newProfile = createDefaultProfile(cred.user.uid, "", cred.user.email || "");
    await writeNewProfileDocs(cred.user.uid, newProfile);
    setProfile(newProfile);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const profileDoc = await getDoc(doc(db, "users", cred.user.uid));

    if (!profileDoc.exists()) {
      const newProfile = createDefaultProfile(cred.user.uid, cred.user.displayName || "", cred.user.email || "");
      await writeNewProfileDocs(cred.user.uid, newProfile);
      setProfile(newProfile);
    } else {
      const data = profileDoc.data();
      setProfile(hydrateProfile(cred.user.uid, data, cred.user.displayName ?? "", cred.user.email ?? ""));
    }
  };

  const signInWithApple = async () => {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const cred = await signInWithPopup(auth, provider);
    const profileDoc = await getDoc(doc(db, "users", cred.user.uid));

    if (!profileDoc.exists()) {
      const newProfile = createDefaultProfile(cred.user.uid, cred.user.displayName || "", cred.user.email || "");
      await writeNewProfileDocs(cred.user.uid, newProfile);
      setProfile(newProfile);
    } else {
      const data = profileDoc.data();
      setProfile(hydrateProfile(cred.user.uid, data, cred.user.displayName ?? "", cred.user.email ?? ""));
    }
  };

  const signOutUser = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    // Remove dark mode preference so next user gets their own setting from Firestore
    document.documentElement.classList.remove("dark");
    localStorage.removeItem('tropos-dark-mode');
  };

  const PROTECTED_FIELDS = ["subscriptionTier", "stripeCustomerId", "stripeSubscriptionId", "trialExpiresAt"] as const;

  // Subset of UserProfile fields that also need to be mirrored onto the
  // cross-user-readable public/profile doc when they change.
  const PUBLIC_MIRRORED_FIELDS = ["displayName", "photoURL", "athleteType"] as const;

  const updateProfile = async (data: Partial<UserProfile>, options?: { allowProtected?: boolean }) => {
    if (!user) return;
    let writeData = data;
    if (!options?.allowProtected) {
      writeData = Object.fromEntries(
        Object.entries(data).filter(([key]) => !(PROTECTED_FIELDS as readonly string[]).includes(key))
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

    // Wrap the write in try/catch so silent call sites (toggleDark, TDEE
     // auto-sync, dozens of Settings fire-and-forgets) surface a toast and
     // leave local state untouched on failure instead of silently diverging
     // from Firestore. We don't re-throw: no existing caller handles the
     // exception, and swallowing it keeps unhandled promise rejections out
     // of the console for this expected failure path.
    try {
      if (Object.keys(publicPatch).length > 0) {
        const batch = writeBatch(db);
        batch.set(doc(db, "users", user.uid), writeData, { merge: true });
        batch.set(doc(db, "users", user.uid, "public", "profile"), publicPatch, { merge: true });
        await batch.commit();
      } else {
        await setDoc(doc(db, "users", user.uid), writeData, { merge: true });
      }

      setProfile((prev) => {
        const updated = prev ? { ...prev, ...data } : null;
        if (updated && "darkMode" in data) {
          syncDarkMode(updated.darkMode);
        }
        return updated;
      });
    } catch (err) {
      logger.error("[auth] updateProfile failed", err);
      // Stable toast ID collapses bursts (e.g. rapid Settings toggles) into
      // a single visible message.
      toast.error("Couldn't save your settings. Please try again.", {
        id: "update-profile-error",
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithApple,
        signOut: signOutUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

