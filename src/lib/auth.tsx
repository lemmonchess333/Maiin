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
  subscriptionTier: "free" | "pro";

  // ✅ Program Engine
  program: {
    currentWeek: number;
    mesoLength: number;
    startDate: number;
  };
}

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

  // 🔥 DARK MODE SYNC
  useEffect(() => {
    if (profile?.darkMode !== undefined) {
      if (profile.darkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [profile?.darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));

        if (profileDoc.exists()) {
          const data = profileDoc.data();

          // ✅ SAFE PROFILE ASSIGNMENT (prevents undefined crashes)
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
            subscriptionTier: data.subscriptionTier ?? "free",
            program: {
              currentWeek: data.program?.currentWeek ?? 1,
              mesoLength: data.program?.mesoLength ?? 4,
              startDate: data.program?.startDate ?? Date.now(),
            },
          };

          setProfile(safeProfile);
        } else {
          setProfile(null);
        }
      } else {
        setProfile(null);
        document.documentElement.classList.remove("dark");
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
      subscriptionTier: "free",
      program: {
        currentWeek: 1,
        mesoLength: 4,
        startDate: Date.now(),
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
        subscriptionTier: "free",
        program: {
          currentWeek: 1,
          mesoLength: 4,
          startDate: Date.now(),
        },
      };

      await setDoc(doc(db, "users", cred.user.uid), {
        ...newProfile,
        createdAt: serverTimestamp(),
      });

      setProfile(newProfile);
    } else {
      const data = profileDoc.data();

      setProfile({
        uid: cred.user.uid,
        ...data,
        program: {
          currentWeek: data.program?.currentWeek ?? 1,
          mesoLength: data.program?.mesoLength ?? 4,
          startDate: data.program?.startDate ?? Date.now(),
        },
      } as UserProfile);
    }
  };

  const signOutUser = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    document.documentElement.classList.remove("dark");
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), data, { merge: true });
    setProfile((prev) => (prev ? { ...prev, ...data } : null));
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