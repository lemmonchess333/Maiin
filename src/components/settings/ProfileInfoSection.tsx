import { User } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import type { UserProfile } from "@/lib/auth";

interface ProfileInfoSectionProps {
  name: string;
  setName: (v: string) => void;
  weightKg: number;
  setWeightKg: (v: number) => void;
  heightCm: number;
  setHeightCm: (v: number) => void;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

export default function ProfileInfoSection({
  name,
  setName,
  weightKg,
  setWeightKg,
  heightCm,
  setHeightCm,
  updateProfile,
}: ProfileInfoSectionProps) {
  return (
    <AccordionSection icon={<User className="w-5 h-5 text-primary" />} title="Profile" subtitle="Name, weight, height" defaultOpen>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => updateProfile({ displayName: name })}
        placeholder="Display name"
        className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="profile-weight" className="text-sm text-muted-foreground">Weight (kg)</label>
          <input
            id="profile-weight"
            type="number"
            value={weightKg}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            onBlur={() => updateProfile({ weightKg })}
            className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground/60 mt-1">For TDEE calc. Log daily weight from Home.</p>
        </div>
        <div>
          <label htmlFor="profile-height" className="text-sm text-muted-foreground">Height (cm)</label>
          <input
            id="profile-height"
            type="number"
            value={heightCm}
            onChange={(e) => setHeightCm(Number(e.target.value))}
            onBlur={() => updateProfile({ heightCm })}
            className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
          />
        </div>
      </div>
    </AccordionSection>
  );
}
