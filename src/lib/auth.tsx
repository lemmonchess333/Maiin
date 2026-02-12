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
import { auth, db, isDemoMode } from "./firebase";

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
}

const DEFAULT_PROFILE: UserProfile = {
  displayName: "",
  email: "demo@adaptivefit.app",
  athleteType: "Lifter",
  weightKg: 70,
  heightCm: 170,
  weeklyWorkoutsTarget: 4,
  weeklyMealsTarget: 10,
  preferredWeightUnit: "kg",
  preferredHeightUnit: "cm",
  darkMode: false,
  onboardingComplete: false,
};

// Fake user object for demo mode
const DEMO_USER = { uid: "demo-user", email: "demo@adaptivefit.app" } as User;

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  tryDemo: () => void;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// --- localStorage helpers for demo mode ---
const DEMO_PROFILE_KEY = "adaptfit_demo_profile";
const DEMO_LOGGED_IN_KEY = "adaptfit_demo_loggedin";

function loadDemoProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(DEMO_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDemoProfile(profile: UserProfile) {
  localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(profile));
}

// --- Provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      // Check if demo user was previously logged in
      const wasLoggedIn = localStorage.getItem(DEMO_LOGGED_IN_KEY) === "true";
      if (wasLoggedIn) {
        setUser(DEMO_USER);
        setProfile(loadDemoProfile() || { ...DEFAULT_PROFILE });
      }
      setLoading(false);
      return;
    }

    // Real Firebase auth
    const unsubscribe = onAuthStateChanged(auth!, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const profileDoc = await getDoc(doc(db!, "users", firebaseUser.uid));
        if (profileDoc.exists()) {
          setProfile(profileDoc.data() as UserProfile);
        } else {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    if (isDemoMode) {
      // In demo mode, any credentials work
      setUser(DEMO_USER);
      const existing = loadDemoProfile();
      setProfile(existing || { ...DEFAULT_PROFILE, email });
      if (!existing) saveDemoProfile({ ...DEFAULT_PROFILE, email });
      localStorage.setItem(DEMO_LOGGED_IN_KEY, "true");
      return;
    }
    await signInWithEmailAndPassword(auth!, email, password);
  };

  const signUp = async (email: string, password: string) => {
    if (isDemoMode) {
      const newProfile = { ...DEFAULT_PROFILE, email };
      setUser(DEMO_USER);
      setProfile(newProfile);
      saveDemoProfile(newProfile);
      localStorage.setItem(DEMO_LOGGED_IN_KEY, "true");
      return;
    }
    const cred = await createUserWithEmailAndPassword(auth!, email, password);
    await setDoc(doc(db!, "users", cred.user.uid), {
      ...DEFAULT_PROFILE,
      email: cred.user.email,
      createdAt: serverTimestamp(),
    });
  };

  const signInWithGoogle = async () => {
    if (isDemoMode) {
      // Treat as demo login
      tryDemo();
      return;
    }
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth!, provider);
    const profileDoc = await getDoc(doc(db!, "users", cred.user.uid));
    if (!profileDoc.exists()) {
      await setDoc(doc(db!, "users", cred.user.uid), {
        ...DEFAULT_PROFILE,
        displayName: cred.user.displayName || "",
        email: cred.user.email,
        createdAt: serverTimestamp(),
      });
    }
  };

  const tryDemo = () => {
    const existing = loadDemoProfile();
    const prof = existing || { ...DEFAULT_PROFILE };
    setUser(DEMO_USER);
    setProfile(prof);
    if (!existing) saveDemoProfile(prof);
    localStorage.setItem(DEMO_LOGGED_IN_KEY, "true");
  };

  const signOutUser = async () => {
    if (isDemoMode) {
      setUser(null);
      setProfile(null);
      localStorage.removeItem(DEMO_LOGGED_IN_KEY);
      return;
    }
    await firebaseSignOut(auth!);
    setProfile(null);
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (isDemoMode) {
      setProfile((prev) => {
        const updated = prev ? { ...prev, ...data } : null;
        if (updated) saveDemoProfile(updated);
        return updated;
      });
      return;
    }
    if (!user) return;
    await setDoc(doc(db!, "users", user.uid), data, { merge: true });
    setProfile((prev) => (prev ? { ...prev, ...data } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isDemo: isDemoMode,
        signIn,
        signUp,
        signInWithGoogle,
        tryDemo,
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
