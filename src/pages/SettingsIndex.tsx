/**
 * SettingsIndex — top-level Settings page (Set1.1).
 *
 * iOS-style nested-page IA. Renders the section list with
 * chevron-right affordances. Each section tap routes to a dedicated
 * sub-page (or to /settings/legacy for sections not yet migrated).
 *
 * Set1's locked decision: 14+ sub-areas don't fit a flat scrolling
 * list. Nested pages keep each surface focused and let new arcs
 * (S3/S4/S5/A2-A4/P1c/Sub1-2) slot in by adding new section pages
 * without touching the index layout.
 *
 * Migration strategy: as each section moves to its own nested route,
 * flip its row href from `/settings/legacy` to `/settings/<slug>`.
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronRight,
  User,
  Target,
  Apple,
  Dumbbell,
  Palette,
  Lock,
  Footprints,
  Bell,
  Crown,
  HelpCircle,
  Settings as Cog,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import SettingsAvatar from "@/components/settings/SettingsAvatar";
import { haptic } from "@/lib/haptic";

declare const __APP_VERSION__: string;

interface SectionRow {
  /** Slug-route segment under /settings. */
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Set to true once the section has its own nested page; false
   *  rows route to /settings/legacy with the section's anchor so the
   *  user can still reach it during the migration window. */
  migrated: boolean;
}

/** Section catalogue. Order matches the iOS Settings convention
 *  (identity → preferences → app → support → account at bottom). */
const SECTIONS: SectionRow[] = [
  {
    slug: "profile",
    label: "Profile",
    description: "Name, photo, body metrics",
    icon: User,
    migrated: true,
  },
  {
    slug: "training",
    label: "Training",
    description: "Programme, goals, weekly layout",
    icon: Target,
    migrated: true,
  },
  {
    slug: "nutrition",
    label: "Nutrition",
    description: "Calorie targets, activity level",
    icon: Apple,
    migrated: true,
  },
  {
    slug: "workout-prefs",
    label: "Workout preferences",
    description: "Rest timer, audio cues",
    icon: Dumbbell,
    migrated: true,
  },
  {
    slug: "units-appearance",
    label: "Units & Appearance",
    description: "Weight, height units, dark mode",
    icon: Palette,
    migrated: true,
  },
  {
    slug: "privacy",
    label: "Social & Privacy",
    description: "Visibility, crew, GPS zones",
    icon: Lock,
    migrated: true,
  },
  {
    slug: "shoes",
    label: "My Shoes",
    description: "Track mileage per pair",
    icon: Footprints,
    migrated: true,
  },
  {
    slug: "notifications",
    label: "Notifications",
    description: "Meal, workout, streak reminders",
    icon: Bell,
    migrated: true,
  },
  {
    slug: "subscription",
    label: "Subscription",
    description: "Plan, billing, restore",
    icon: Crown,
    migrated: true,
  },
  {
    slug: "support-legal",
    label: "Support & Legal",
    description: "Help, privacy policy, terms",
    icon: HelpCircle,
    migrated: true,
  },
  {
    slug: "account",
    label: "Account",
    description: "Sign out, delete account",
    icon: Cog,
    migrated: true,
  },
  // F5c — soft-delete archive. Sits under Account/Data semantically;
  // surfaces as its own index row so it's discoverable without
  // drilling through the Account page.
  {
    slug: "recently-deleted-meals",
    label: "Recently deleted meals",
    description: "Restore meals you deleted in the last 24 hours",
    icon: Trash2,
    migrated: true,
  },
];

export default function SettingsIndex() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isInTrial, trialDaysLeft, tier } = useSubscription();

  return (
    <motion.div
      className="space-y-4 pb-8"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04 } },
      }}
    >
      <motion.header
        variants={{
          hidden: { opacity: 0, y: 6 },
          visible: { opacity: 1, y: 0 },
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {profile ? <SettingsAvatar profile={profile} /> : null}
            <div>
              <h1 className="text-xl font-extrabold text-foreground">
                Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Customize your experience
              </p>
            </div>
          </div>
          {user && (
            <button
              type="button"
              onClick={() => {
                haptic();
                navigate(`/user/${user.uid}`);
              }}
              className="px-3 min-h-[44px] inline-flex items-center rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              View Profile
            </button>
          )}
        </div>
      </motion.header>

      {tier === "pro" || isInTrial ? (
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 6 },
            visible: { opacity: 1, y: 0 },
          }}
          className="rounded-xl bg-card border border-primary/20 p-3 flex items-center gap-3"
        >
          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Crown className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {isInTrial
                ? `Pro trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
                : "Pro"}
            </p>
            <p className="text-xs text-muted-foreground">
              All features unlocked
            </p>
          </div>
        </motion.div>
      ) : null}

      {/* Section list. Each row = nested-page navigation. The chevron
          on the right is the iOS Settings affordance for "tap to drill
          into this section." */}
      <motion.ul
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
        aria-label="Settings sections"
        className="rounded-xl bg-card overflow-hidden divide-y divide-border/40"
      >
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const href = section.migrated
            ? `/settings/${section.slug}`
            : `/settings/legacy#${section.slug}`;
          return (
            <li key={section.slug}>
              <button
                type="button"
                onClick={() => {
                  haptic();
                  navigate(href);
                }}
                className="w-full px-4 py-3 min-h-[56px] flex items-center gap-3 text-left motion-safe:transition-colors motion-safe:active:scale-[0.99] hover:bg-muted/30"
              >
                <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {section.label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {section.description}
                  </p>
                </div>
                <ChevronRight
                  className="size-4 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </motion.ul>

      <p className="text-center text-xs text-muted-foreground pt-2">
        Tropos v{__APP_VERSION__}
      </p>
    </motion.div>
  );
}
