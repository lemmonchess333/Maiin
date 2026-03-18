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
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Goal } from "./types";

/* ================================
   USER PROFILE TYPE
================================ */

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  athleteType: string;
  weightKg: number;
  heightCm: number;
  weeklyWorkoutsTarget: number;
  weeklyMealsTarget: number;
  preferredWeightUnit: "kg" | "lbs";
  preferredHeightUnit: "cm" | "ft";
  darkMode: boolean;
  onboardingComplete: boolean;
  // Trial & subscription
  trialExpiresAt: string | null;
  subscriptionTier: "free" | "pro";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  // Streak
  currentStreak: number;
  lastLogDate: string | null;
  // Goal-based program engine
  program?: {
    goal: Goal;
    startWeight: number;
    currentPhase: string;
  };
  // Macro targets
  tdeeBase?: number;
  aiCalorieAdjustment?: number;
  targetCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFat?: number;
  goal?: string;
  // Workout preferences
  autoRestTimer?: boolean;
  defaultRestSeconds?: number;
  // Social & privacy
  defaultVisibility?: "public" | "followers" | "private";
  autoPostRuns?: boolean;
  autoPostWorkouts?: boolean;
  audioCues?: boolean;
  // Run scheduling
  runMode?: "freeform" | "structured" | "race_prep";
  weeklyRunDaysTarget?: number;
  raceGoal?: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
  };
  // Weekly schedule
  weekSchedule?: { day: number; type: "lift" | "run" | "both" | "rest" }[];
  weeklyRunsTarget?: number;
  // TDEE computation persistence
  age?: number;
  sex?: "male" | "female";
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  // Macro targets (legacy)
  macroTargets?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  // Micronutrient targets
  targetFiber?: number;
  targetSugar?: number;
  targetSodium?: number;
  // Water tracking
  targetWaterGlasses?: number;
  // Rollover calories (Pro)
  enableRolloverCalories?: boolean;
  // Auto-post social
  autoPostBadges?: boolean;
  customCalorieTarget?: number;
  // Crew
  crewId?: string;
  // Onboarding quiz (program generation)
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
    lastLogDate: null,
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
    lastLogDate: (data.lastLogDate as string | null) ?? null,
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
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
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

      if (firebaseUser) {
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

  const signUp = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newProfile = createDefaultProfile(cred.user.uid, "", cred.user.email || "");
    await setDoc(doc(db, "users", cred.user.uid), {
      ...newProfile,
      createdAt: serverTimestamp(),
    });
    setProfile(newProfile);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const profileDoc = await getDoc(doc(db, "users", cred.user.uid));

    if (!profileDoc.exists()) {
      const newProfile = createDefaultProfile(cred.user.uid, cred.user.displayName || "", cred.user.email || "");
      await setDoc(doc(db, "users", cred.user.uid), {
        ...newProfile,
        createdAt: serverTimestamp(),
      });
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
      await setDoc(doc(db, "users", cred.user.uid), {
        ...newProfile,
        createdAt: serverTimestamp(),
      });
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

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), data, { merge: true });
    setProfile((prev) => {
      const updated = prev ? { ...prev, ...data } : null;
      if (updated && "darkMode" in data) {
        syncDarkMode(updated.darkMode);
      }
      return updated;
    });
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

