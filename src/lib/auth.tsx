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
  signInWithPopup,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

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
    goal: "cut" | "lean bulk" | "recomp";
    startWeight: number;
    currentPhase: string;
  };
  // Macro targets
  targetCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFat?: number;
  goal?: string;
  // Workout preferences
  autoRestTimer?: boolean;
  defaultRestSeconds?: number;
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));

        if (profileDoc.exists()) {
          const data = profileDoc.data();
          // Safe profile construction with fallback defaults
          const safeProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: data.displayName ?? "",
            email: data.email ?? firebaseUser.email ?? "",
            athleteType: data.athleteType ?? "Lifter",
            weightKg: data.weightKg ?? 70,
            heightCm: data.heightCm ?? 170,
            weeklyWorkoutsTarget: data.weeklyWorkoutsTarget ?? 4,
            weeklyMealsTarget: data.weeklyMealsTarget ?? 10,
            preferredWeightUnit: data.preferredWeightUnit ?? "kg",
            preferredHeightUnit: data.preferredHeightUnit ?? "cm",
            darkMode: data.darkMode ?? false,
            onboardingComplete: data.onboardingComplete ?? false,
            trialExpiresAt: data.trialExpiresAt ?? null,
            subscriptionTier: data.subscriptionTier ?? "free",
            stripeCustomerId: data.stripeCustomerId,
            stripeSubscriptionId: data.stripeSubscriptionId,
            currentStreak: data.currentStreak ?? 0,
            lastLogDate: data.lastLogDate ?? null,
            program: {
              goal: data.program?.goal ?? "recomp",
              startWeight: data.program?.startWeight ?? 0,
              currentPhase: data.program?.currentPhase ?? "base",
            },
          };
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

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    const newProfile: UserProfile = {
      uid: cred.user.uid,
      displayName: "",
      email: cred.user.email || "",
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
      const newProfile: UserProfile = {
        uid: cred.user.uid,
        displayName: cred.user.displayName || "",
        email: cred.user.email || "",
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

      await setDoc(doc(db, "users", cred.user.uid), {
        ...newProfile,
        createdAt: serverTimestamp(),
      });
      setProfile(newProfile);
    } else {
      const data = profileDoc.data();
      const safeProfile: UserProfile = {
        uid: cred.user.uid,
        displayName: data.displayName ?? cred.user.displayName ?? "",
        email: data.email ?? cred.user.email ?? "",
        athleteType: data.athleteType ?? "Lifter",
        weightKg: data.weightKg ?? 70,
        heightCm: data.heightCm ?? 170,
        weeklyWorkoutsTarget: data.weeklyWorkoutsTarget ?? 4,
        weeklyMealsTarget: data.weeklyMealsTarget ?? 10,
        preferredWeightUnit: data.preferredWeightUnit ?? "kg",
        preferredHeightUnit: data.preferredHeightUnit ?? "cm",
        darkMode: data.darkMode ?? false,
        onboardingComplete: data.onboardingComplete ?? false,
        trialExpiresAt: data.trialExpiresAt ?? null,
        subscriptionTier: data.subscriptionTier ?? "free",
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        currentStreak: data.currentStreak ?? 0,
        lastLogDate: data.lastLogDate ?? null,
        program: {
          goal: data.program?.goal ?? "recomp",
          startWeight: data.program?.startWeight ?? 0,
          currentPhase: data.program?.currentPhase ?? "base",
        },
      };
      setProfile(safeProfile);
    }
  };

  const signOutUser = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    syncDarkMode(false);
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
        signOut: signOutUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
