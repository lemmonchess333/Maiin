/**
 * SettingsTraining — Training nested settings page (Set1.1 / A1c).
 *
 * The first concrete migration off the legacy flat Settings page.
 * Calls the same hooks the parent page used (useAuth + navigate),
 * renders the existing TrainingSection component inside the new
 * SettingsSection chrome.
 *
 * Why this section first: the locked decision behind /grill-me is
 * that the Programme page's "Change plan ›" link should deeplink
 * here rather than re-running a partial onboarding wizard. A1c
 * (Training preferences editable post-onboarding) lands its
 * additional fields — run-days/week, lift days+split, focus,
 * nutrition phase, week-schedule reorder — on this page in a
 * follow-up slice. Slice 1 is the route + wrapper; slice ≥3 adds
 * the new controls.
 */
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import TrainingSection from "@/components/settings/TrainingSection";

export default function SettingsTraining() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useAuth();

  if (!profile) {
    // Defensive: parent route guards already keep unauthenticated
    // users out of /settings/*, so this is the brief moment between
    // auth resolution and profile fetch. Show empty chrome rather
    // than flashing a broken section.
    return <SettingsSection title="Training" />;
  }

  return (
    <SettingsSection
      title="Training"
      subtitle="Programme structure, run mode, retake onboarding"
    >
      <TrainingSection
        profile={profile}
        updateProfile={updateProfile}
        navigate={navigate}
      />
    </SettingsSection>
  );
}
