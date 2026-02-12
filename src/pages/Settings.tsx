import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import {
  User,
  Ruler,
  Weight,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Shield,
  Target,
  Save,
  Check,
} from "lucide-react";

export default function Settings() {
  const { profile, updateProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.displayName || "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg || 70);
  const [heightCm, setHeightCm] = useState(profile?.heightCm || 170);
  const [workoutsTarget, setWorkoutsTarget] = useState(
    profile?.weeklyWorkoutsTarget || 4
  );
  const [mealsTarget, setMealsTarget] = useState(
    profile?.weeklyMealsTarget || 10
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({
      displayName: name,
      weightKg,
      heightCm,
      weeklyWorkoutsTarget: workoutsTarget,
      weeklyMealsTarget: mealsTarget,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleUnit = async (
    key: "preferredWeightUnit" | "preferredHeightUnit",
    current: string
  ) => {
    if (key === "preferredWeightUnit") {
      await updateProfile({
        preferredWeightUnit: current === "kg" ? "lbs" : "kg",
      });
    } else {
      await updateProfile({
        preferredHeightUnit: current === "cm" ? "ft" : "cm",
      });
    }
  };

  const toggleDark = async () => {
    await updateProfile({ darkMode: !profile?.darkMode });
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize your experience
        </p>
      </div>

      {/* Profile section */}
      <div className="bg-card rounded-xl border border-border/50 divide-y divide-border/50">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Profile</p>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                Weight (kg)
              </label>
              <input
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                Height (cm)
              </label>
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="bg-card rounded-xl border border-border/50 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Weekly Goals</p>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Workouts per week</span>
              <span className="font-medium text-foreground">
                {workoutsTarget}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={7}
              value={workoutsTarget}
              onChange={(e) => setWorkoutsTarget(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Protein meals per week</span>
              <span className="font-medium text-foreground">
                {mealsTarget}
              </span>
            </div>
            <input
              type="range"
              min={7}
              max={42}
              step={7}
              value={mealsTarget}
              onChange={(e) => setMealsTarget(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
          saved
            ? "bg-green-500 text-white"
            : "bg-primary text-primary-foreground hover:opacity-90",
          saving && "opacity-50 cursor-not-allowed"
        )}
      >
        {saved ? (
          <>
            <Check className="w-4 h-4" /> Saved!
          </>
        ) : saving ? (
          "Saving..."
        ) : (
          <>
            <Save className="w-4 h-4" /> Save Changes
          </>
        )}
      </button>

      {/* Preferences */}
      <div className="bg-card rounded-xl border border-border/50 divide-y divide-border/50">
        <button
          onClick={() =>
            toggleUnit("preferredWeightUnit", profile.preferredWeightUnit)
          }
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <Weight className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Weight Unit</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {profile.preferredWeightUnit.toUpperCase()}
          </span>
        </button>

        <button
          onClick={() =>
            toggleUnit("preferredHeightUnit", profile.preferredHeightUnit)
          }
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <Ruler className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Height Unit</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {profile.preferredHeightUnit.toUpperCase()}
          </span>
        </button>

        <button
          onClick={toggleDark}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            {profile.darkMode ? (
              <Moon className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Sun className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-sm text-foreground">Dark Mode</span>
          </div>
          <div
            className={cn(
              "w-12 h-7 rounded-full transition-all flex items-center",
              profile.darkMode
                ? "bg-primary justify-end"
                : "bg-muted justify-start"
            )}
          >
            <div className="w-5 h-5 bg-white rounded-full mx-1 shadow-sm" />
          </div>
        </button>
      </div>

      {/* Links */}
      <div className="bg-card rounded-xl border border-border/50 divide-y divide-border/50">
        <Link
          to="/privacy"
          className="flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Privacy Policy</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="w-full py-3 rounded-xl font-medium bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" /> Sign Out
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Adaptive Fitness v1.0.0
      </p>
    </div>
  );
}
