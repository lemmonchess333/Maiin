/**
 * SettingsSection — wrapper for nested settings pages (Set1.1).
 *
 * Provides the page chrome for an iOS-style nested settings screen:
 * back arrow → /settings, page title, content slot. Consumers render
 * their section-specific controls as children.
 *
 * Pattern (from Set1 locked decision — iOS Settings nested pages):
 *
 *   /settings              → SettingsIndex (top-level list with chevrons)
 *   /settings/<slug>       → SettingsSection wrapping the section UI
 *
 * The back-arrow always routes to /settings rather than browser back
 * so the user lands at the index regardless of how they navigated in
 * (e.g. deeplinks from Programme → /settings/training shouldn't pop
 * back to Programme, they should pop to Settings).
 */
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { haptic } from "@/lib/haptic";

interface SettingsSectionProps {
  title: string;
  /** Optional one-line description rendered under the title. */
  subtitle?: string;
  /** Optional. Empty when the consumer is rendering a defensive
   *  empty-chrome state (e.g. while the profile is still loading). */
  children?: ReactNode;
}

export default function SettingsSection({
  title,
  subtitle,
  children,
}: SettingsSectionProps) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4 pb-8">
      {/* Back-arrow row. Lives above the page title so a tall content
          block can scroll under the back affordance without obscuring
          it. Touch target meets the 44px floor. */}
      <button
        type="button"
        onClick={() => {
          haptic();
          navigate("/settings");
        }}
        aria-label="Back to Settings"
        className="inline-flex items-center gap-1 -ml-2 px-2 py-2 min-h-[44px] rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-95"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Settings</span>
      </button>

      <header className="space-y-1">
        <h1 className="text-h2 font-extrabold text-foreground">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>

      <div className="space-y-4">{children}</div>
    </div>
  );
}
