import { Camera, User } from "lucide-react";
import type { UserProfile } from "@/lib/auth";

export default function SettingsAvatar({ profile }: { profile: UserProfile }) {
  const name = profile.displayName || "";
  const initials = name
    ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "";

  return (
    <div className="relative w-14 h-14 shrink-0">
      <div className="w-full h-full rounded-full bg-primary/20 flex items-center justify-center">
        {initials ? (
          <span className="text-lg font-bold text-primary">{initials}</span>
        ) : (
          <User className="w-6 h-6 text-primary" />
        )}
      </div>
      <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-card">
        <Camera className="w-3 h-3 text-primary-foreground" />
      </div>
    </div>
  );
}
