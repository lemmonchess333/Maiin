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

export interface UserProfile {
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
}

function getTrialExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

const DEFAULT_PROFILE: UserProfile = {
  displayName: "",
  email: "",
  athleteType: "Lifter",
  weightKg: 70,
  heightCm: 170,
  weeklyWorkoutsTarget: 4,
  weeklyMealsTarget: 10,
  preferredWeightUnit: "kg",
  preferredHeightUnit: "cm",
  darkMode: false,
  onboardingComplete: false,
  trialExpiresAt: null,
  subscriptionTier: "free",
  currentStreak: 0,
  lastLogDate: null,
};

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

function syncDarkMode(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    syncDarkMode(profile?.darkMode ?? false);
  }, [profile?.darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (profileDoc.exists()) {
          const data = profileDoc.data() as UserProfile;
          setProfile(data);
          syncDarkMode(data.darkMode ?? false);
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
    await setDoc(doc(db, "users", cred.user.uid), {
      ...DEFAULT_PROFILE,
      email: cred.user.email || email,
      trialExpiresAt: getTrialExpiresAt(),
      createdAt: serverTimestamp(),
    });
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const profileDoc = await getDoc(doc(db, "users", cred.user.uid));
    if (!profileDoc.exists()) {
      await setDoc(doc(db, "users", cred.user.uid), {
        ...DEFAULT_PROFILE,
        displayName: cred.user.displayName || "",
        email: cred.user.email || "",
        trialExpiresAt: getTrialExpiresAt(),
        createdAt: serverTimestamp(),
      });
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
